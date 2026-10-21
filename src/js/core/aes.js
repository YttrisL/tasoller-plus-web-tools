// ---------------------------------------------------------------------------------------------
// AES-128, ECB (the browser's WebCrypto has no ECB mode)
// ---------------------------------------------------------------------------------------------
const AES = (() => {
  const rotl8 = (x, n) => ((x << n) | (x >> (8 - n))) & 0xFF;
  const xtime = a => (a & 0x80 ? ((a << 1) ^ 0x1B) & 0xFF : a << 1);
  const mul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xtime(a); b >>= 1; } return r; };
  const SBOX = new Uint8Array(256), INV = new Uint8Array(256);
  let p = 1, q = 1;
  do {
    p = (p ^ ((p << 1) & 0xFF) ^ (p & 0x80 ? 0x1B : 0)) & 0xFF;
    q ^= (q << 1) & 0xFF; q ^= (q << 2) & 0xFF; q ^= (q << 4) & 0xFF;
    if (q & 0x80) q ^= 0x09;
    SBOX[p] = (q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4) ^ 0x63) & 0xFF;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
  const table = k => Uint8Array.from({ length: 256 }, (_, i) => mul(i, k));
  const M2 = table(2), M3 = table(3), M9 = table(9), M11 = table(11), M13 = table(13), M14 = table(14);

  function expandKey(key) {                       // 11 round keys of 16 bytes, in data order
    const w = [];
    for (let i = 0; i < 4; i++) w.push(Array.from(key.subarray(4 * i, 4 * i + 4)));
    let rcon = 1;
    for (let i = 4; i < 44; i++) {
      let t = w[i - 1].slice();
      if (i % 4 === 0) { t = [t[1], t[2], t[3], t[0]].map(b => SBOX[b]); t[0] ^= rcon; rcon = xtime(rcon); }
      w.push(w[i - 4].map((b, j) => b ^ t[j]));
    }
    const rk = new Uint8Array(176);
    for (let i = 0; i < 44; i++) rk.set(w[i], 4 * i);
    return rk;
  }

  const s = new Uint8Array(16), t = new Uint8Array(16);
  function encryptBlock(rk, src, so, dst, d0) {
    for (let i = 0; i < 16; i++) s[i] = src[so + i] ^ rk[i];
    for (let rnd = 1; rnd <= 10; rnd++) {
      for (let i = 0; i < 16; i++) t[i] = SBOX[s[(i + 4 * (i & 3)) & 15]];     // SubBytes + ShiftRows
      if (rnd !== 10) {
        for (let c = 0; c < 16; c += 4) {
          const a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3];
          s[c] = M2[a0] ^ M3[a1] ^ a2 ^ a3; s[c + 1] = a0 ^ M2[a1] ^ M3[a2] ^ a3;
          s[c + 2] = a0 ^ a1 ^ M2[a2] ^ M3[a3]; s[c + 3] = M3[a0] ^ a1 ^ a2 ^ M2[a3];
        }
      } else s.set(t);
      for (let i = 0; i < 16; i++) s[i] ^= rk[rnd * 16 + i];
    }
    dst.set(s, d0);
  }
  function decryptBlock(rk, src, so, dst, d0) {
    for (let i = 0; i < 16; i++) s[i] = src[so + i] ^ rk[160 + i];
    for (let rnd = 9; rnd >= 0; rnd--) {
      for (let i = 0; i < 16; i++) t[(i + 4 * (i & 3)) & 15] = INV[s[i]];       // InvShiftRows + InvSubBytes
      for (let i = 0; i < 16; i++) s[i] = t[i] ^ rk[rnd * 16 + i];
      if (rnd !== 0) {
        for (let c = 0; c < 16; c += 4) {
          const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
          s[c] = M14[a0] ^ M11[a1] ^ M13[a2] ^ M9[a3]; s[c + 1] = M9[a0] ^ M14[a1] ^ M11[a2] ^ M13[a3];
          s[c + 2] = M13[a0] ^ M9[a1] ^ M14[a2] ^ M11[a3]; s[c + 3] = M11[a0] ^ M13[a1] ^ M9[a2] ^ M14[a3];
        }
      }
    }
    dst.set(s, d0);
  }
  function ecb(rk, data, encrypt) {               // data length must be a multiple of 16
    const out = new Uint8Array(data.length), f = encrypt ? encryptBlock : decryptBlock;
    for (let o = 0; o < data.length; o += 16) f(rk, data, o, out, o);
    return out;
  }
  return { expandKey, ecb };
})();

const SHARED_RK = AES.expandKey(SHARED_KEY);

