// ---------------------------------------------------------------------------------------------
// Chip dump (Supernova only): read the whole microcontroller over the command channel and pack the
// result like the dump tool of the dump-and-restore project does (one .bin per section, a manifest, info.txt).
// ---------------------------------------------------------------------------------------------
const DUMP_PROTOCOL = 1, DUMP_CHUNK = 48, DUMP_RETRIES = 4;
class DumpAborted extends Error {}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes, prev = 0) {          // zlib CRC-32; pass the previous result to continue
  let c = (prev ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const CRC16_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let n = 0; n < 256; n++) { let c = n << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; t[n] = c; }
  return t;
})();
function crc16(bytes, crc = 0xFFFF) {      // CRC-16/CCITT-FALSE
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) & 0xFFFF) ^ CRC16_TABLE[((crc >> 8) ^ bytes[i]) & 0xFF];
  return crc;
}
const hex8 = n => (n >>> 0).toString(16).toUpperCase().padStart(8, "0");

// The info items and the list of the sections, without any data. The sections are objects { name, addr, length, mode } until they are read.
async function dumpList(dev) {
  const hello = await dev.dumpHello();
  if (hello.protocol !== DUMP_PROTOCOL) throw new FlashError("the firmware speaks dump protocol " + hello.protocol + ", this page speaks " + DUMP_PROTOCOL);
  const info = [], sections = [];
  for (let i = 0; i < hello.infos; i++) info.push(await dev.dumpInfo(i));
  for (let i = 0; i < hello.sections; i++) sections.push(await dev.dumpSection(i));
  return { hello, info, sections };
}

// Read one section. A piece that arrives damaged is asked for again; a piece the chip refuses (the key store always is) stays zero and is listed in
// `refused`. The section gets { data, refused, retries, verified, crc32, sha256 }. `base` and `total` place it in a longer progress (a whole dump).
async function dumpSectionRead(dev, s, { onProgress = () => {}, shouldAbort = () => false, log = () => {}, base = 0, total = s.length } = {}) {
  s.data = new Uint8Array(s.length); s.refused = []; s.retries = 0;
  for (let off = 0; off < s.length; off += DUMP_CHUNK) {
    if (shouldAbort()) { s.data = undefined; throw new DumpAborted("aborted"); }
    const n = Math.min(DUMP_CHUNK, s.length - off), addr = s.addr + off;
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await dev.dumpRead(s.mode, addr, n);
        if (r.refused) s.refused.push(addr); else s.data.set(r.data, off);
        break;
      } catch (e) {
        if (!(e instanceof FlashError) || attempt === DUMP_RETRIES) { s.data = undefined; throw e; }
        s.retries++; log("dump: " + e.message + " (attempt " + attempt + " of " + DUMP_RETRIES + ")");
      }
    }
    if ((off / DUMP_CHUNK) % 8 === 0) onProgress(base + off + n, total, s.name);
  }
  s.crc32 = crc32(s.data); s.sha256 = (await sha256Hex(s.data)) || "";
  s.verified = s.refused.length === 0;
  log("dump: " + s.name + " " + s.length + " bytes, " + (s.verified ? "ok" : s.refused.length + " pieces refused by the chip") + (s.retries ? ", " + s.retries + " retries" : ""));
}

// Read the info items and every section.
async function runDump(dev, { onProgress = () => {}, shouldAbort = () => false, log = () => {}, version = "" } = {}) {
  const { hello, info, sections } = await dumpList(dev);
  const total = sections.reduce((n, x) => n + x.length, 0);
  let done = 0;
  for (const s of sections) {
    await dumpSectionRead(dev, s, { onProgress, shouldAbort, log, base: done, total });
    done += s.length;
  }
  onProgress(total, total, "");
  return { version, hello, info, sections, bytes: total };
}

// info.txt: one "NAME value" line per item. The unique chip ID can be replaced so that the file can be shared.
function dumpInfoLines(result, hideUid) {
  const lines = result.version ? ["VERSION " + result.version] : [];
  for (const it of result.info) lines.push(it.name + " " + (!it.ok ? "ERROR" : hideUid && /^UID[0-9]$/.test(it.name) ? "XXXXXXXX" : hex8(it.value)));
  return lines;
}

function makeZip(files) {                  // stored (no compression)
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  let cdSize = 0; for (const c of central) cdSize += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

function dumpZip(result, hideUid) {
  const enc = new TextEncoder(), files = [];
  const manifest = { tool: "tasoller-plus-toolkit", protocol: DUMP_PROTOCOL, firmware: result.version, sections: [] };
  for (const s of result.sections.filter(x => x.data)) {                    // the ones that were read
    const file = s.name.toLowerCase() + ".bin";
    files.push({ name: file, data: s.data });
    manifest.sections.push({ name: s.name, file, address: "0x" + hex8(s.addr), length: s.length, mode: s.mode, verified: s.verified,
      crc32: s.crc32.toString(16).padStart(8, "0"), sha256: s.sha256, unreadable_lines: s.refused.map(a => "0x" + hex8(a)) });
  }
  files.push({ name: "manifest.json", data: enc.encode(JSON.stringify(manifest, null, 2)) });
  files.push({ name: "info.txt", data: enc.encode(dumpInfoLines(result, hideUid).join("\n") + "\n") });
  return makeZip(files);
}
