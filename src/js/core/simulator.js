// ---------------------------------------------------------------------------------------------
// Simulated device (self-test). It implements the device side of the protocol as
// derived from the stock firmware: same frames, same encryption, same command layouts.
// ---------------------------------------------------------------------------------------------
// Factory key map of entry 1..4 (4K, 8K, 16K, 32K): 32 sensor keys, FN1, FN2, then the 6 air keys.
function simDefaultKeymap(entry) {
  const sets = [[], [14, 13, 9, 7], [51, 15, 14, 13, 9, 7, 22, 4], [12, 24, 14, 11, 13, 7, 9, 21, 10, 8, 22, 6, 20, 26, 27, 29], []];
  const e = Array(48).fill(0), set = sets[entry] || [];
  [0x2A, 0x29, 0x38, 0x34, 0x37, 0x33, 0x30, 0x2F].forEach((k, n) => { e[32 + n] = k; });
  for (let i = 0; i < 32; i++) e[i] = entry === 4 ? 4 + (i % 26) : (set.length ? set[Math.floor(i * set.length / 32)] : 0);
  return e;
}

class SimDevice {
  constructor(version = "SS321_APP_050_20250102") {
    this.key = SHARED_RK; this.version = version;
    this.keymaps = [0, 1, 2, 3, 4, 5].map(simDefaultKeymap); this.fingerCap = 330; this.fingerOther = 22;
    this.mode = 0; this.delay = 2; this.air = 100; this.ground = 100;
    this.global = [85, 85, 85, 85]; this.sensors = Array.from({ length: 32 }, () => [85, 85, 85, 85]);
    this.tuning = [10, 20, 22, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170];
    this.saves = 0; this.baselineResets = 0; this.groupsWritten = [];
    this.slot = new Uint8Array(SLOT_SIZE).fill(0xFF); this.size = 0; this.started = false; this.trigger = false; this.rebooted = false;
    this.streaming = false; this.t = 0;
  }
  handle(frame) {
    let f = frame;
    if (!(frameChecksumOk(f) && f[1] === 1)) f = AES.ecb(this.key, f, false);
    const reply = (cmd, nonce, payload) => AES.ecb(this.key, buildFrame(cmd, nonce, payload), true);
    if (!frameChecksumOk(f)) return reply(5, f[2], [1]);
    const cmd = f[1], nonce = f[2], p = f.subarray(3, 1 + f[0]);
    switch (cmd) {
      case 1: this.key = AES.expandKey(AES.ecb(SHARED_RK, p.slice(0, 16), true)); return reply(1, nonce, []);
      case 2: return reply(2, nonce, Array.from(this.version, c => c.charCodeAt(0)));
      case CMD.MODE:
        if (p[0] === 0) return reply(cmd, nonce, [0, this.mode]);
        if (p[0] === 1) { if (p[1] > 4) return reply(5, nonce, [1]); this.mode = p[1]; this.saves++; return reply(cmd, nonce, []); }
        return reply(5, nonce, [1]);
      case CMD.KEYMAP:
        if (p[1] > 5) return reply(5, nonce, [1]);
        if (p[0] === 0) return reply(cmd, nonce, [0, p[1], ...this.keymaps[p[1]]]);
        if (p[0] === 1) { this.keymaps[p[1]] = Array.from(p.subarray(2, 50)); return reply(cmd, nonce, []); }
        return reply(5, nonce, [1]);
      case CMD.FINGER_CAP: return reply(cmd, nonce, [...u16be(this.fingerCap), ...u16be(this.fingerOther)]);
      case CMD.FINGER_CAP_SET: this.fingerCap = be16(p, 0); this.fingerOther = be16(p, 2); this.saves++; return reply(cmd, nonce, []);
      case CMD.HW_MAIN: return reply(cmd, nonce, [...Array.from("SS321-V02", c => c.charCodeAt(0)), 0]);
      case CMD.HW_TOUCH: return reply(cmd, nonce, [...Array.from("C-64X4PAD-V02", c => c.charCodeAt(0)), 0]);
      case CMD.TOUCH_INFO: return reply(cmd, nonce, [0x01, 0x20, 0x25, 0x01, 0x02, 0x10, 0x38, 0]);
      case CMD.RESTART_USB: this.restarted = (this.restarted || 0) + 1; return reply(cmd, nonce, []);
      case CMD.DELAY:
        if (p[0] === 0) return reply(cmd, nonce, [0, ...u16be(this.delay)]);
        if (p[0] === 1) { const v = be16(p, 1); if (v > 0x400) return reply(5, nonce, [1]); this.delay = v; this.saves++; return reply(cmd, nonce, []); }
        return reply(5, nonce, [1]);
      case CMD.BRIGHTNESS:
        if (p[0] === 0) return reply(cmd, nonce, [0, this.air, this.ground]);
        if (p[0] === 1) { this.air = p[1]; this.ground = p[2]; return reply(cmd, nonce, []); }
        return reply(5, nonce, [1]);
      case CMD.GLOBAL_THR:
        if (p[0] === 0) return reply(cmd, nonce, [0, ...this.global.flatMap(u16be)]);
        if (p[0] === 1) { this.global = [0, 1, 2, 3].map(i => be16(p, 1 + 2 * i)); return reply(cmd, nonce, []); }
        return reply(5, nonce, [1]);
      case CMD.SENSOR_THR: {
        const g = p[1];
        if (g > 7) return reply(5, nonce, [1]);
        if (p[0] === 0) { const out = [0, g]; for (let j = 0; j < 4; j++) for (let t = 0; t < 4; t++) out.push(...u16be(this.sensors[g * 4 + j][t])); return reply(cmd, nonce, out); }
        if (p[0] === 1) {
          for (let j = 0; j < 4; j++) for (let t = 0; t < 4; t++) this.sensors[g * 4 + j][t] = be16(p, 2 + (j * 4 + t) * 2);
          this.groupsWritten.push(g); return reply(cmd, nonce, []);
        }
        return reply(5, nonce, [1]);
      }
      case CMD.TUNING:
        if (p[0] === 0) return reply(cmd, nonce, this.tuning.flatMap(u16be));
        if (p[0] === 1) { this.tuning = Array.from({ length: TUNING_COUNT }, (_, i) => be16(p, 1 + 2 * i)); this.saves++; return reply(cmd, nonce, []); }
        return reply(5, nonce, [1]);
      case CMD.SAVE: this.saves++; return reply(cmd, nonce, []);
      case CMD.RESTORE:
        if (p[0] >= 1 && p[0] <= 4) { this.keymaps[p[0]] = simDefaultKeymap(p[0]); this.saves++; return reply(cmd, nonce, []); }
        if (p[0] !== 0) return reply(5, nonce, [1]);
        this.global = [85, 85, 85, 85]; this.sensors = Array.from({ length: 32 }, () => [85, 85, 85, 85]); this.saves++; return reply(cmd, nonce, []);
      case CMD.RESET_BASELINE: this.baselineResets++; return reply(cmd, nonce, []);
      case 4:
        if (p[0] === 1) { this.size = le32(p, 1); this.slot.fill(0xFF); this.started = true; return reply(4, nonce, []); }
        if (p[0] === 2) {
          const off = le32(p, 1);
          if (!this.started || off + p.length - 5 > this.size) return reply(5, nonce, [3]);
          this.slot.set(p.subarray(5), off); return reply(4, nonce, []);
        }
        if (p[0] === 3) return sum8(this.slot, 0, this.size) === p[1] ? (this.trigger = true, reply(4, nonce, [])) : reply(5, nonce, [5]);
        if (p[0] === 4) { this.rebooted = true; return null; }
        return reply(5, nonce, [1]);
      default: return reply(5, nonce, [1]);
    }
  }
  // Streams: one burst of 5 packets (4 chips + DBT). A moving "finger" and a cycling air beam.
  streamPackets() {
    this.t += 1;
    const t = this.t, press = new Uint8Array(32);
    const x = 15.5 + 15 * Math.sin(t / 22);                      // finger position in cells along the strip
    for (let d = 0; d < 32; d++) {
      const col = 15 - (d >> 1);                                 // d 0/1 are the rightmost column
      press[d] = Math.max(0, Math.round(220 * Math.exp(-Math.pow((col - x / 2) / 1.2, 2)))) | 0;
      if (press[d] < 12) press[d] = 0;
    }
    const diffs = Array.from(press, v => (v ? 160 + v * 3 : 0));
    const bits = ((t >> 4) % 8 === 7) ? 0 : (1 << (5 - ((t >> 4) % 6)));
    const buttons = (((t >> 6) & 1) ? 0x80 : 0) | (((t >> 7) & 1) ? 0x40 : 0) | bits;
    const split = [0.4, 0.3, 0.2, 0.1], pads = d => { const a = split.map(s => Math.floor(diffs[d] * s)); a[0] += diffs[d] - a.reduce((s, v) => s + v, 0); return a; };
    const out = [];
    for (let chip = 0; chip < 4; chip++) {
      const c = new Uint8Array(FRAME), put = (i, v) => { c[2 * i] = v >> 8; c[2 * i + 1] = v & 255; };
      for (let k = 0; k < 4; k++) {
        const b = 8 * k, dA = 31 - 8 * chip - 2 * k, dB = dA - 1, A = pads(dA), B = pads(dB);
        [0, 1, 4, 5].forEach((o, n) => put(b + o, A[n])); [2, 3, 6, 7].forEach((o, n) => put(b + o, B[n]));
      }
      c[0] = (c[0] & 0x0F) | (0xC0 + 0x10 * chip);
      out.push(c);
    }
    const dbt = new Uint8Array(FRAME); dbt.set([0x44, 0x42, 0x54, buttons]); dbt.set(press, 4);
    out.push(dbt);
    return out;
  }
}

// A fake WebHID device wrapping SimDevice (kind "cmd" or "stream"), same surface as HIDDevice.
class SimHID {
  constructor(kind, sim) {
    this.kind = kind; this.sim = sim; this.opened = false; this.vendorId = VID; this.productId = 0x1231;
    this.productName = "Tasoller Plus (simulated)"; this.listeners = new Set(); this.timer = null;
    this.collections = [{ usagePage: kind === "cmd" ? USAGE_PAGE_CMD : USAGE_PAGE_STREAM, usage: 1, inputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] }], outputReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] }] }];
  }
  async open() { this.opened = true; }
  async close() { this.opened = false; clearInterval(this.timer); this.timer = null; }
  addEventListener(n, fn) { if (n === "inputreport") this.listeners.add(fn); }
  removeEventListener(n, fn) { this.listeners.delete(fn); }
  emit(bytes) { const ev = { data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), reportId: 0 }; this.listeners.forEach(fn => fn(ev)); }
  async sendReport(id, data) {
    const d = new Uint8Array(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data);
    if (this.kind === "cmd") {
      const rep = this.sim.handle(d);
      if (rep) setTimeout(() => this.emit(rep), 2);
      return;
    }
    if (d[0] === 0x68 && (d[1] === 0xDD || d[1] === 0xCC)) {
      if (!this.timer) this.timer = setInterval(() => { this.sim.streamPackets().forEach(p => this.emit(p)); }, 25);
    } else if (d[0] === 0x68 && (d[1] === 0xBB || d[1] === 0xAA)) { clearInterval(this.timer); this.timer = null; }
  }
}

