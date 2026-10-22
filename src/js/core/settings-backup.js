// ---------------------------------------------------------------------------------------------
// Settings backup (Supernova only): save the settings block of the device to a file and put it back.
// The file is: "SNVSET01", the block length (16 bits, little endian), the block, and the CRC-32 of all
// that comes before it. The block is the one the firmware keeps in flash (see settings_transfer.c).
// ---------------------------------------------------------------------------------------------
const SETTINGS_MAGIC = "SNVSET01", SETTINGS_PROTOCOL = 1, SETTINGS_CHUNK = 48;
const SETTINGS_MARKER_OFFSET = 0x12B, SETTINGS_MARKER = 0x22;     // the byte that tells a valid settings page

async function readSettingsBlock(dev, onProgress = () => {}) {
  const info = await dev.settingsInfo();
  if (info.protocol !== SETTINGS_PROTOCOL) throw new FlashError("the firmware speaks settings protocol " + info.protocol + ", this page speaks " + SETTINGS_PROTOCOL);
  const block = new Uint8Array(info.size);
  for (let off = 0; off < info.size; off += SETTINGS_CHUNK) {
    block.set(await dev.settingsRead(off, Math.min(SETTINGS_CHUNK, info.size - off)), off);
    onProgress(off, info.size);
  }
  return block;
}

function settingsFile(block) {
  const f = new Uint8Array(8 + 2 + block.length + 4);
  f.set(Array.from(SETTINGS_MAGIC, c => c.charCodeAt(0)), 0);
  f[8] = block.length & 255; f[9] = block.length >> 8;
  f.set(block, 10);
  f.set(u32le(crc32(f.subarray(0, 10 + block.length))), 10 + block.length);
  return f;
}

// The block inside a settings file; throws a FlashError that says what is wrong with the file.
function parseSettingsFile(bytes) {
  if (bytes.length < 14 || String.fromCharCode(...bytes.subarray(0, 8)) !== SETTINGS_MAGIC) throw new FlashError("this is not a Supernova settings file");
  const n = bytes[8] | (bytes[9] << 8);
  if (bytes.length !== 14 + n) throw new FlashError("the settings file is truncated or has extra data");
  if (le32(bytes, 10 + n) !== crc32(bytes.subarray(0, 10 + n))) throw new FlashError("the settings file is damaged (its CRC-32 does not match)");
  const block = bytes.slice(10, 10 + n);
  if (block[SETTINGS_MARKER_OFFSET] !== SETTINGS_MARKER) throw new FlashError("the file does not hold a valid settings page");
  return block;
}

// Send `block` to the device and have it replace the settings. The device still has to be restarted.
async function writeSettingsBlock(dev, block, onProgress = () => {}) {
  const info = await dev.settingsInfo();
  if (info.protocol !== SETTINGS_PROTOCOL) throw new FlashError("the firmware speaks settings protocol " + info.protocol + ", this page speaks " + SETTINGS_PROTOCOL);
  if (info.size !== block.length) throw new FlashError("the file holds " + block.length + " bytes of settings, this firmware keeps " + info.size + ": it is from another version");
  for (let off = 0; off < block.length; off += SETTINGS_CHUNK) {
    await dev.settingsStage(off, block.subarray(off, Math.min(off + SETTINGS_CHUNK, block.length)));
    onProgress(off, block.length);
  }
  const status = await dev.settingsCommit(crc32(block));
  if (status === 1) throw new FlashError("the device received the settings damaged: nothing was changed");
  if (status !== 0) throw new FlashError("the device refused the settings: nothing was changed");
}
