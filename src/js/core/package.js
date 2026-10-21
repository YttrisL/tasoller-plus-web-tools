// ---------------------------------------------------------------------------------------------
// .skystar packages: 0x4B000 bytes of AES-ECB; plaintext = JSON header (padded to 0x19000) + image
// ---------------------------------------------------------------------------------------------
function parsePackage(file) {
  const r = { errors: [], warnings: [], header: null, image: null, version: "", size: file.length };
  if (file.length !== PKG_SIZE) { r.errors.push("The file is " + file.length + " bytes; a .skystar package is exactly " + PKG_SIZE + " bytes (0x4B000)."); return r; }
  const plain = AES.ecb(SHARED_RK, file, false);
  let end = 0; while (end < HEADER_SIZE && plain[end] !== 0) end++;
  let h;
  try { h = JSON.parse(new TextDecoder("latin1").decode(plain.subarray(0, end))); }
  catch (e) { r.errors.push("The file decrypts, but its header is not valid JSON: this is not a .skystar package for this tool."); return r; }
  if (!h || typeof h !== "object") { r.errors.push("The package header is not a JSON object."); return r; }
  r.header = h; r.version = String(h.Version === undefined ? "" : h.Version);
  const binLen = Number(h.bin_len);
  if (!Number.isInteger(binLen) || binLen < VERSION_OFFSET + VERSION_SIZE || binLen > SLOT_SIZE) {
    r.errors.push("bin_len in the header (" + h.bin_len + ") is not a valid image size (up to " + SLOT_SIZE + " bytes)."); return r;
  }
  if (h.CLog !== undefined && String(h.CLog) !== "") r.errors.push("The package is restricted to specific devices (CLog is not empty); this page cannot check the device identifier.");
  if (h.Num !== undefined && Number(h.Num) !== 1) r.errors.push("The header has Num = " + h.Num + "; the official tool only accepts 1.");
  if (h.Type !== undefined && h.Type !== "APP") r.warnings.push("Package type is '" + h.Type + "', not 'APP'.");
  if (!r.version) r.errors.push("The package has no Version.");
  else if (versionPrefix(r.version) === null) r.errors.push("The package version '" + r.version + "' has no underscore, so it can never match a device.");

  const image = plain.slice(HEADER_SIZE, HEADER_SIZE + binLen);
  r.image = image; r.sum8 = sum8(image);
  const sp = le32(image, 0), reset = le32(image, 4), entry = reset & ~1;
  if (sp <= RAM_BASE || sp > RAM_END || !(reset & 1) || entry < APP_BASE || entry >= APP_BASE + binLen)
    r.errors.push("The image does not look like firmware linked for 0x4000 (initial stack 0x" + sp.toString(16) + ", reset vector 0x" + reset.toString(16) + "). Refusing to flash it.");
  let v = ""; for (let i = 0; i < VERSION_SIZE && image[VERSION_OFFSET + i] !== 0; i++) v += String.fromCharCode(image[VERSION_OFFSET + i]);
  r.embeddedVersion = v;
  if (v !== r.version) r.warnings.push("The version string inside the image ('" + v + "') differs from the header's ('" + r.version + "').");
  return r;
}

