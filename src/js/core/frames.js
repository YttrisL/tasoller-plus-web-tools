// ---------------------------------------------------------------------------------------------
// Frames: [L][cmd][nonce][payload...][zero padding][sum8 at 63], L = 2 + payload length,
// the sum covers bytes 1..L. Every frame but the handshake request is AES-ECB encrypted.
// ---------------------------------------------------------------------------------------------
function sum8(b, from = 0, to = b.length) { let n = 0; for (let i = from; i < to; i++) n = (n + b[i]) & 0xFF; return n; }
function buildFrame(cmd, nonce, payload) {
  if (payload.length > 60 || payload.length + 2 > 62) throw new Error("payload too long");
  const f = new Uint8Array(FRAME);
  f[0] = 2 + payload.length; f[1] = cmd; f[2] = nonce; f.set(payload, 3);
  f[FRAME - 1] = sum8(f, 1, 1 + f[0]);
  return f;
}
const frameChecksumOk = f => f[0] >= 2 && f[0] <= 62 && sum8(f, 1, 1 + f[0]) === f[FRAME - 1];
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const be16 = (b, o) => (b[o] << 8) | b[o + 1];
function u32le(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
const u16be = v => [(v >> 8) & 255, v & 255];
const hex = (b, n = b.length) => Array.from(b.subarray(0, n), x => x.toString(16).padStart(2, "0")).join(" ");
async function sha256Hex(bytes) {
  if (!(typeof crypto !== "undefined" && crypto.subtle)) return null;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
}
function versionPrefix(v) { const i = v.indexOf("_"); return i < 0 ? null : v.slice(0, i); }

