// ---------------------------------------------------------------------------------------------
// Live data decoder: the stream interface (usage page 0xFF11) sends 64-byte packets.
//   chip packet: first byte high nibble 0xC,0xD,0xE,0xF = chip 0..3, then 32 big-endian pad values
//                (the tag replaces the top nibble of the first value). 8 values = 2 sensors x 4 pads.
//   "DBT" packet: 'D','B','T', button byte (FN1 FN2 IR1..IR6, MSB first), then 32 sensor values.
// Sensor index d = 0..31 as on the Test page (0 = top right cell).
// ---------------------------------------------------------------------------------------------
class LiveDecoder {
  constructor() { this.reset(); }
  reset() {
    this.press = new Uint8Array(32); this.diff = new Uint16Array(32); this.pads = new Uint16Array(128);
    this.buttons = 0; this.rev = 0; this.packets = 0; this.chipSeen = [0, 0, 0, 0]; this.dbtSeen = 0; this.lastAt = 0;
  }
  // Nothing is coming in any more: show nothing rather than the last values.
  clear() { this.press.fill(0); this.diff.fill(0); this.buttons = 0; this.rev++; }
  feed(data) {
    const u = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    for (let off = 0; off + FRAME <= u.length; off += FRAME) this._chunk(u.subarray(off, off + FRAME));
  }
  _chunk(c) {
    if (c[0] === 0x44 && c[1] === 0x42 && c[2] === 0x54) {                    // "DBT"
      this.buttons = c[3];
      for (let d = 0; d < 32; d++) this.press[d] = c[4 + d];
      this.dbtSeen++;
    } else if ((c[0] & 0xF0) >= 0xC0) {
      const chip = ((c[0] & 0xF0) - 0xC0) >> 4;
      const w = i => (i === 0 ? ((c[0] & 0x0F) << 8) | c[1] : (c[2 * i] << 8) | c[2 * i + 1]);
      for (let k = 0; k < 4; k++) {
        const b = 8 * k, dA = 31 - 8 * chip - 2 * k, dB = dA - 1;
        const A = [w(b), w(b + 1), w(b + 4), w(b + 5)], B = [w(b + 2), w(b + 3), w(b + 6), w(b + 7)];
        for (let n = 0; n < 4; n++) { this.pads[dA * 4 + n] = A[n]; this.pads[dB * 4 + n] = B[n]; }
        this.diff[dA] = (A[0] + A[1] + A[2] + A[3]) & 0xFFFF; this.diff[dB] = (B[0] + B[1] + B[2] + B[3]) & 0xFFFF;
      }
      this.chipSeen[chip]++;
    } else return;
    this.packets++; this.rev++; this.lastAt = performance.now();
  }
}

