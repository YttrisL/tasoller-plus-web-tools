// ---------------------------------------------------------------------------------------------
// TasollerDevice: typed access to the settings of the stock firmware (read from the official tool
// and the stock firmware's command handler). Sensor thresholds are kept in firmware order "p";
// the Test page and the official tool number the sensors "d" = 31 - p.
// ---------------------------------------------------------------------------------------------
function need(p, n, what) { if (!p || p.length < n) throw new FlashError(what + ": short reply (" + (p ? p.length : 0) + " bytes, expected " + n + ")"); return p; }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v | 0));

class TasollerDevice {
  constructor(link) { this.link = link; }
  c(cmd, payload, timeout, what) { return this.link.command(cmd, payload, timeout, what); }

  // The 0xA5 after the read asks Supernova for the real mode (5 is IO4-Emulation); the official firmware ignores it, and the
  // official tool, which does not send it, sees IO4-Emulation as WINUSB.
  async getMode() { const p = need(await this.c(CMD.MODE, [0, 0xA5], 2000, "read mode"), 2, "mode"); return p[1]; }
  async setMode(m) { await this.c(CMD.MODE, [1, clamp(m, 0, MODE_NAMES.length - 1)], 5000, "set mode"); }
  // Re-enumerates USB with the stored mode. The device may drop off the bus before it answers.
  async restartUsb() { try { await this.c(CMD.RESTART_USB, [], 2000, "restart USB"); } catch (e) { this.link.log("restart USB: " + e.message + " (normal if the device already re-enumerated)"); } }
  // Key map of mode 1..4: 48 bytes, HID usage codes. Entry [p] is the key of firmware sensor p (sensor = 31 - p),
  // entries 32 and 33 are FN1 and FN2, entries 34 to 39 are the air keys 1 to 6.
  async getKeymap(mode) {
    const p = need(await this.c(CMD.KEYMAP, [0, mode], 2000, "read key map"), 50, "key map"); return Array.from(p.subarray(2, 50));
  }
  async setKeymap(mode, bytes) { await this.c(CMD.KEYMAP, [1, mode, ...bytes.slice(0, 48)], 3000, "set key map"); }
  restoreKeymap(mode) { return this.c(CMD.RESTORE, [mode], 8000, "restore the keys"); }      // the device saves it by itself
  // Finger capacitance (in 0.01 pF, 330 = 3.3 pF) and a second value the official tool sends back unchanged.
  async getFingerCap() { const p = need(await this.c(CMD.FINGER_CAP, [], 2000, "read finger capacitance"), 4, "finger capacitance"); return { cap: be16(p, 0), other: be16(p, 2) }; }
  async setFingerCap(cap, other) { await this.c(CMD.FINGER_CAP_SET, [...u16be(clamp(cap, FINGER_CAP_MIN, FINGER_CAP_MAX)), ...u16be(other)], 5000, "set finger capacitance"); }
  // The four version fields of the official tool's Firmware box (the main firmware version is the plain version command).
  async getInfo() {
    const text = p => { let t = ""; for (let i = 0; i < p.length && p[i] !== 0; i++) t += String.fromCharCode(p[i]); return t.trim(); };
    const hwMain = text(await this.c(CMD.HW_MAIN, [], 2000, "read main hardware version"));
    const hwTouch = text(await this.c(CMD.HW_TOUCH, [], 2000, "read touch hardware version"));
    const t = need(await this.c(CMD.TOUCH_INFO, [], 2000, "read touch firmware version"), 7, "touch version");
    const touchFw = Array.from(t.subarray(1, 7), b => b.toString(16).padStart(2, "0")).join("") + text(t.subarray(7));   // 6 BCD bytes, e.g. 202501021038
    return { hwMain, hwTouch, touchFw };
  }
  async getDelay() { const p = need(await this.c(CMD.DELAY, [0], 2000, "read delay"), 3, "delay"); return be16(p, 1); }
  async setDelay(v) { await this.c(CMD.DELAY, [1, ...u16be(clamp(v, 0, DELAY_MAX))], 5000, "set delay"); }
  async getBrightness() { const p = need(await this.c(CMD.BRIGHTNESS, [0], 2000, "read brightness"), 3, "brightness"); return { air: p[1], ground: p[2] }; }
  async setBrightness(air, ground) { await this.c(CMD.BRIGHTNESS, [1, clamp(air, BRIGHT_MIN, BRIGHT_MAX), clamp(ground, BRIGHT_MIN, BRIGHT_MAX)], 3000, "set brightness"); }
  async getGlobal() { const p = need(await this.c(CMD.GLOBAL_THR, [0], 2000, "read global thresholds"), 9, "global thresholds"); return [0, 1, 2, 3].map(i => be16(p, 1 + 2 * i)); }
  async setGlobal(g) { await this.c(CMD.GLOBAL_THR, [1, ...g.flatMap(u16be)], 3000, "set global thresholds"); }
  async getSensors() {                             // 32 x [t41,t42,t43,t44], firmware order
    const out = Array.from({ length: 32 }, () => [0, 0, 0, 0]);
    for (let g = 0; g < 8; g++) {
      const p = need(await this.c(CMD.SENSOR_THR, [0, g], 2000, "read sensor thresholds"), 34, "sensor thresholds");
      for (let j = 0; j < 4; j++) for (let t = 0; t < 4; t++) out[g * 4 + j][t] = be16(p, 2 + (j * 4 + t) * 2);
    }
    return out;
  }
  // The firmware recomputes its tables only after group 7 arrives, so all 8 groups are always written, in order.
  async setSensors(sensors) {
    for (let g = 0; g < 8; g++) {
      const payload = [1, g];
      for (let j = 0; j < 4; j++) for (let t = 0; t < 4; t++) payload.push(...u16be(clamp(sensors[g * 4 + j][t], 0, 0xFFFF)));
      await this.c(CMD.SENSOR_THR, payload, 3000, "set sensor thresholds " + g);
    }
  }
  async getTuning() { const p = need(await this.c(CMD.TUNING, [0], 2000, "read tuning"), 2 * TUNING_COUNT, "tuning"); return Array.from({ length: TUNING_COUNT }, (_, i) => be16(p, 2 * i)); }
  async setTuning(a) { await this.c(CMD.TUNING, [1, ...a.flatMap(u16be)], 5000, "set tuning"); }
  save() { return this.c(CMD.SAVE, [], 5000, "save settings"); }
  restoreFactoryThresholds() { return this.c(CMD.RESTORE, [0], 8000, "restore factory thresholds"); }
  resetBaseline() { return this.c(CMD.RESET_BASELINE, [1, 0], 5000, "reset baseline"); }

  // ---- individual tower LEDs (Supernova only, see led_ext.c of the firmware) ----
  // The three colors (9 bytes: red, green, blue each) of an air tower, 0 left and 1 right: the way the Toolkit lights them in the IO4-Emulation mode.
  async ledTowers(tower, colors) { await this.c(CMD.LED, [1, tower, ...colors], 2000, "set the tower colors"); }
  // The LED mode of the IO4-Emulation mode (Supernova): the air towers show the LED boards of the game, or one static color. The mode is read by the
  // device at its start, the color is shown at once; save writes both to the flash.
  async io4LedConfig() { const p = need(await this.c(CMD.LED, [2], 2000, "IO4 LED mode"), 5, "IO4 LED mode"); return { static: p[1] === 1, rgb: [p[2], p[3], p[4]] }; }
  async setIo4LedConfig(isStatic, rgb, save) { await this.c(CMD.LED, [3, isStatic ? 1 : 0, ...rgb, save ? 1 : 0], 5000, "set the IO4 LED mode"); }
  // The signals of the two function buttons in the IO4-Emulation mode (Supernova): FN1, FN2 and both pressed together, a list of signal numbers each (see
  // IO4_SIGNALS). The device keeps each as a mask of the 32 buttons of the board (4 bytes, little endian) and the coin (1 byte).
  async io4Buttons() {
    const p = need(await this.c(CMD.IO4_BUTTONS, [0], 2000, "function buttons"), 16, "function buttons"), out = [];
    for (let w = 0; w < 3; w++) {
      const codes = [], mask = (p[1 + 5 * w] | (p[2 + 5 * w] << 8) | (p[3 + 5 * w] << 16) | (p[4 + 5 * w] << 24)) >>> 0;
      for (let bit = 0; bit < 32; bit++) if ((mask >>> bit) & 1) codes.push(bit);
      if (p[5 + 5 * w] === 1) codes.push(IO4_SIGNAL_COIN);
      out.push(codes);
    }
    return out;
  }
  async setIo4Buttons(lists, save) {
    const bytes = [];
    for (const codes of lists) {
      let mask = 0; for (const c of codes) if (c < 32) mask = (mask | (1 << c)) >>> 0;
      bytes.push(mask & 255, (mask >>> 8) & 255, (mask >>> 16) & 255, (mask >>> 24) & 255, codes.includes(IO4_SIGNAL_COIN) ? 1 : 0);
    }
    await this.c(CMD.IO4_BUTTONS, [1, ...bytes, save ? 1 : 0], 5000, "set the function buttons");
  }
  async ledExtInfo() { const p = need(await this.c(CMD.LED, [0], 2000, "LED info"), 3, "LED info"); return { protocol: p[1], towerLeds: p[2] }; }

  // ---- settings backup (Supernova only, see settings_transfer.c of the firmware). Numbers are little endian. ----
  async settingsInfo() { const p = need(await this.c(CMD.SETTINGS, [0], 2000, "settings info"), 4, "settings info"); return { protocol: p[1], size: p[2] | (p[3] << 8) }; }
  async settingsRead(offset, n) {
    const p = need(await this.c(CMD.SETTINGS, [1, offset & 255, offset >> 8, n], 2000, "read settings"), 4 + n, "read settings");
    if (p[0] !== 1 || (p[1] | (p[2] << 8)) !== offset || p[3] !== n) throw new FlashError("read settings: the reply is for another request");
    return p.slice(4, 4 + n);
  }
  async settingsStage(offset, data) { await this.c(CMD.SETTINGS, [2, offset & 255, offset >> 8, data.length, ...data], 2000, "send settings"); }
  async settingsCommit(crc) { const p = need(await this.c(CMD.SETTINGS, [3, ...u32le(crc)], 5000, "apply settings"), 2, "apply settings"); return p[1]; }   // 0 done, 1 bad CRC-32, 2 not a settings block
  saveAndReset() { return this.link.sendNoReply(CMD.SAVE_AND_RESET, []); }

  // ---- chip dump (Supernova only, see dump.c of the firmware). Numbers are little endian. ----
  async dumpHello() { const p = need(await this.c(CMD.DUMP, [0], 2000, "dump hello"), 4, "dump hello"); return { protocol: p[1], sections: p[2], infos: p[3] }; }
  async dumpSection(i) {
    const p = need(await this.c(CMD.DUMP, [1, i], 2000, "dump section " + i), 11, "dump section");
    return { index: i, mode: String.fromCharCode(p[2]), addr: le32(p, 3), length: le32(p, 7), name: String.fromCharCode(...p.subarray(11)) };
  }
  async dumpInfo(i) {
    const p = need(await this.c(CMD.DUMP, [2, i], 2000, "dump info " + i), 7, "dump info");
    return { index: i, ok: p[2] === 0, value: le32(p, 3), name: String.fromCharCode(...p.subarray(7)) };
  }
  // Up to DUMP_CHUNK bytes of the chip. { refused: true } when the chip will not give them, else { data }.
  async dumpRead(mode, addr, n) {
    const p = need(await this.c(CMD.DUMP, [3, mode.charCodeAt(0), ...u32le(addr), n], 2000, "dump read"), 7, "dump read");
    const where = "0x" + addr.toString(16).toUpperCase().padStart(8, "0");
    if (p[0] !== 3 || le32(p, 2) !== addr || p[6] !== n) throw new FlashError("dump read at " + where + ": the reply is for another request");
    if (p[1] !== 0) return { refused: true };
    need(p, 9 + n, "dump read");
    const data = p.slice(7, 7 + n);
    if (crc16(data, crc16(Uint8Array.from(u32le(addr)))) !== (p[7 + n] | (p[8 + n] << 8))) throw new FlashError("dump read at " + where + ": bad checksum");
    return { data };
  }

  // Read everything the UI shows. A setting that fails to read is left null (and logged by the caller).
  async readAll(onError = () => {}) {
    const r = { fingerCap: null, info: null, keymap: null, mode: null, delay: null, air: null, ground: null, global: null, sensors: null, tuning: null };
    const t = async (key, fn) => { try { r[key] = await fn(); } catch (e) { onError(key, e); } };
    await t("mode", () => this.getMode());
    await t("key map", async () => { r.keymap = r.mode >= 1 && r.mode <= 4 ? await this.getKeymap(r.mode) : null; });
    await t("versions", async () => { r.info = await this.getInfo(); });
    await t("delay", () => this.getDelay());
    await t("brightness", async () => { const b = await this.getBrightness(); r.air = b.air; r.ground = b.ground; });
    await t("global", () => this.getGlobal());
    await t("sensors", () => this.getSensors());
    await t("tuning", () => this.getTuning());
    await t("finger capacitance", async () => { r.fingerCap = await this.getFingerCap(); });
    delete r["finger capacitance"]; delete r.brightness; delete r["key map"]; delete r.versions;
    return r;
  }
}

