// ---------------------------------------------------------------------------------------------
// Self-test: an AES known-answer test, the settings round trip, the live decoder and a whole
// update, all against the simulated device.
// ---------------------------------------------------------------------------------------------
async function selfTest() {
  const key = Uint8Array.from({ length: 16 }, (_, i) => i), pt = Uint8Array.from({ length: 16 }, (_, i) => i * 17);   // FIPS-197 C.1
  const ct = AES.ecb(AES.expandKey(key), pt, true);
  if (hex(ct) !== "69 c4 e0 d8 6a 7b 04 30 d8 cd b7 80 70 b4 c5 5a") throw new Error("AES known-answer test failed");
  if (hex(AES.ecb(AES.expandKey(key), ct, false)) !== hex(pt)) throw new Error("AES decryption test failed");

  for (const k of KNOWN_PACKAGES) if (!/^[0-9a-f]{64}$/.test(k.sha256) || !k.name) throw new Error("bad entry in the known hashes: " + k.name);
  if (!findKnownPackage(KNOWN_PACKAGES[0].sha256.toUpperCase())) throw new Error("known hash lookup failed");

  const mkLink = sim => { const q = []; const io = {
    exchange: async f => { const r = sim.handle(f); q.length = 0; if (r) q.push(r); return q.shift() || null; },
    recv: async () => q.shift() || null, send: async f => { sim.handle(f); } }; return new Link(io); };

  // settings round trip
  const sim = new SimDevice(), link = mkLink(sim), dev = new TasollerDevice(link);
  await link.handshake();
  if ((await link.version()) !== "SS321_APP_050_20250102") throw new Error("version read failed");
  let all = await dev.readAll(); if (all.delay !== 2 || all.air !== 100 || all.global[0] !== 85 || all.sensors[31][3] !== 85 || all.tuning[2] !== 22) throw new Error("settings read failed");
  await dev.setDelay(7); await dev.setBrightness(40, 60); await dev.setGlobal([30, 31, 32, 33]);
  const s = all.sensors.map(a => a.slice()); s[5] = [20, 21, 22, 23]; s[31] = [130, 129, 128, 127]; await dev.setSensors(s);
  const tn = all.tuning.slice(); tn[TUNING_BR_INDEX] = 9; await dev.setTuning(tn);
  all = await dev.readAll();
  if (all.delay !== 7 || all.air !== 40 || all.ground !== 60 || hex(Uint8Array.from(all.global)) !== hex(Uint8Array.from([30, 31, 32, 33])) || all.sensors[5][2] !== 22 || all.sensors[31][0] !== 130 || all.tuning[2] !== 9) throw new Error("settings write/readback failed");
  if (sim.groupsWritten.join() !== "0,1,2,3,4,5,6,7") throw new Error("sensor groups not written 0..7 in order");
  await dev.setMode(3); await dev.restartUsb(); if ((await dev.getMode()) !== 3 || sim.restarted !== 1) throw new Error("mode switch failed");
  await dev.restoreFactoryThresholds(); all = await dev.readAll();
  if (all.global[0] !== 85 || all.sensors[5][2] !== 85) throw new Error("factory restore failed");

  // key map and finger capacitance
  if (all.keymap.length !== 48 || all.keymap[34] !== 0x38 || all.fingerCap.cap !== 330) throw new Error("key map read failed");
  const km = all.keymap.slice(); km[0] = 0x2C; km[33] = 0x29; await dev.setKeymap(3, km);
  if ((await dev.getKeymap(3))[0] !== 0x2C) throw new Error("key map write failed");
  await dev.restoreKeymap(3); if ((await dev.getKeymap(3))[0] === 0x2C) throw new Error("key map restore failed");
  await dev.setFingerCap(400, all.fingerCap.other); const fc = await dev.getFingerCap(); if (fc.cap !== 400 || fc.other !== all.fingerCap.other) throw new Error("finger capacitance failed");
  if (codeToHid("KeyA") !== 4 || codeToHid("Digit0") !== 0x27 || codeToHid("Escape") !== 0x29 || codeToHid("F12") !== 0x45 || codeToHid("ShiftRight") !== 0xE5 || codeToHid("Nope") !== null) throw new Error("key code table failed");

  // live decoder: 512-byte report made of 8 packets must decode the same as separate ones
  const sim2 = new SimDevice(), pk = sim2.streamPackets(), dec = new LiveDecoder(), cat = new Uint8Array(512);
  pk.forEach((p, i) => cat.set(p, i * 64)); dec.feed(cat);
  const dec2 = new LiveDecoder(); pk.forEach(p => dec2.feed(p));
  if (hex(dec.press) !== hex(dec2.press) || dec.buttons !== dec2.buttons || dec.chipSeen.join() !== "1,1,1,1" || dec.dbtSeen !== 1) throw new Error("live decoder failed");
  for (let d = 0; d < 32; d++) { const v = dec.press[d]; if (v && dec.diff[d] !== 160 + v * 3) throw new Error("live decoder diff mismatch at " + d); }

  const lp = buildLedPacket(Array.from({ length: 31 }, (_, i) => [i, 1, 2]), [[10, 11, 12], [13, 14, 15], [16, 17, 18]], [[20, 21, 22], [23, 24, 25], [26, 27, 28]]);
  if (lp.length !== 114 || lp[0] !== 0x44 || lp[1] !== 0x4C || lp[2] !== 2 || lp[3 + 3 * 30] !== 30 || lp[96] !== 10 || lp[105] !== 20 || lp[113] !== 28) throw new Error("LED packet layout failed");

  // the chip dump of the custom firmware: a damaged piece is asked for again, a refused one is listed
  const sim4 = new SimDevice(CFW_VERSION_PREFIX + "TEST"), dev4 = new TasollerDevice(mkLink(sim4));
  sim4.dumpCorrupt = 2;
  const dump = await runDump(dev4, { version: CFW_VERSION_PREFIX + "TEST" });
  const kprom = dump.sections.find(s => s.name === "KPROM"), apr = dump.sections.find(s => s.name === "APROM");
  if (dump.sections.length !== SIM_DUMP_SECTIONS.length || dump.bytes !== SIM_DUMP_SECTIONS.reduce((n, s) => n + s.length, 0)) throw new Error("dump sections failed");
  if (!kprom || kprom.verified || kprom.refused.length !== 1 || !apr.verified || apr.data[0x1001 & 0x1FFF] !== simChipByte(0x1001) || dump.sections.reduce((n, s) => n + s.retries, 0) !== 2) throw new Error("dump content failed");
  if (dumpInfoLines(dump, true).join() !== "VERSION " + CFW_VERSION_PREFIX + "TEST,CFG0 FFFFFFFD,UID0 XXXXXXXX,UID1 XXXXXXXX,UCID0 ERROR" || dumpInfoLines(dump, false)[2] !== "UID0 11223344") throw new Error("dump info failed");
  if (crc32(new TextEncoder().encode("123456789")) !== 0xCBF43926 || crc16(new TextEncoder().encode("123456789")) !== 0x29B1) throw new Error("dump checksums failed");
  if ((await dumpZip(dump, true).arrayBuffer()).byteLength < dump.bytes) throw new Error("dump zip failed");
  let noDump = false;
  try { await new TasollerDevice(mkLink(new SimDevice())).dumpHello(); } catch (e) { noDump = e instanceof FlashError; }
  if (!noDump) throw new Error("the stock firmware must not answer the dump command");

  // the settings backup: export, damage and refusal of a file, import
  const dev5 = new TasollerDevice(mkLink(sim4));
  const saved = await readSettingsBlock(dev5), file = settingsFile(saved);
  if (saved.length !== 0x2DB || hex(parseSettingsFile(file)) !== hex(saved)) throw new Error("settings export failed");
  const changed = saved.slice(); changed[100] ^= 0xFF; changed[SETTINGS_MARKER_OFFSET] = SETTINGS_MARKER;
  await writeSettingsBlock(dev5, changed);
  if (hex(await readSettingsBlock(dev5)) !== hex(changed)) throw new Error("settings import failed");
  await writeSettingsBlock(dev5, saved); if (hex(await readSettingsBlock(dev5)) !== hex(saved)) throw new Error("settings restore failed");
  const bad = [file.slice(0, 20), file.map((b, i) => i === 50 ? b ^ 1 : b), file.map((b, i) => i === 0 ? 0x58 : b), settingsFile(saved.map((b, i) => i === SETTINGS_MARKER_OFFSET ? 0 : b))];
  for (const b of bad) { let refused = false; try { parseSettingsFile(b); } catch (e) { refused = e instanceof FlashError; } if (!refused) throw new Error("a bad settings file was accepted"); }
  let noSettings = false;
  try { await new TasollerDevice(mkLink(new SimDevice())).settingsInfo(); } catch (e) { noSettings = e instanceof FlashError; }
  if (!noSettings) throw new Error("the stock firmware must not answer the settings command");

  // the IO4-Emulation mode: only Supernova accepts it, and the official tool's plain read sees WINUSB
  const sim6 = new SimDevice(CFW_VERSION_PREFIX + "TEST"), l6 = mkLink(sim6), dev6 = new TasollerDevice(l6);
  await dev6.setMode(5);
  if ((await dev6.getMode()) !== 5 || (await l6.command(CMD.MODE, [0], 2000))[1] !== 0 || MODE_USB[5].vendorId !== 0x0CA3 || MODE_USB[5].productId !== 0x0021) throw new Error("IO4-Emulation mode failed");
  let stock5 = false;
  try { await new TasollerDevice(mkLink(new SimDevice())).setMode(5); } catch (e) { stock5 = e instanceof FlashError; }
  if (!stock5) throw new Error("the stock firmware must refuse the IO4-Emulation mode");

  // the LEDs in the IO4-Emulation mode: the slider frame is what the firmware's parser takes, colors land on the right LED
  const dl = buildLedPacket(Array.from({ length: 31 }, (_, k) => [k === 0 ? 0xFF : k, k === 1 ? 0xFD : 100 + k, 7]), [[9, 8, 7], [9, 8, 7], [9, 8, 7]], [[9, 8, 7], [9, 8, 7], [9, 8, 7]]);
  const frame = buildSliderLedFrame(dl), raw = []; let esc = false;
  for (const b of frame) { if (b === 0xFD) { esc = true; continue; } raw.push(esc ? b + 1 : b); esc = false; }
  if (raw[0] !== 0xFF || raw[1] !== 2 || raw[2] !== 97 || raw.length !== 3 + 97 + 1 || raw.reduce((a, b) => (a + b) & 255, 0) !== 0) throw new Error("slider LED frame failed");
  if (raw[3 + 1] !== 7 || raw[3 + 1 + 1] !== 0xFF || raw[3 + 1 + 2] !== 100 || raw[3 + 1 + 3 + 2] !== 0xFD) throw new Error("slider LED colors failed");     // k = 0 is the first color of the frame, the rightmost LED: blue, red, green
  await dev4.ledTowers(1, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  if (sim4.towers[1].join() !== "1,2,3,4,5,6,7,8,9") throw new Error("tower colors failed");

  // the individual tower LEDs: the packets cover every LED once, keep the 64 byte size that sets them apart from the official packet
  const towerColors = Array.from({ length: 48 }, (_, i) => [i + 1, 100 + i, 200 - i]), ext = buildLedExtPackets(towerColors), seen = new Set();
  if (ext.length !== 4 || ext.some(p => p.length !== 64 || p[0] !== 0x44 || p[1] !== 0x58 || p[2] !== LED_EXT_VERSION)) throw new Error("extended LED packet layout failed");
  for (const p of ext) for (let i = 0; i < p[5]; i++) { const key = p[3] * 24 + p[4] + i; if (seen.has(key) || hex(p.subarray(6 + 3 * i, 9 + 3 * i)) !== hex(Uint8Array.from(towerColors[key]))) throw new Error("extended LED packet content failed"); seen.add(key); }
  if (seen.size !== 48) throw new Error("extended LED packets do not cover every LED");
  if ((await dev4.ledExtInfo()).towerLeds !== 24) throw new Error("LED info failed");
  const fn0 = await dev4.io4Buttons();
  if (fn0.length !== 3 || fn0[0].join() !== String(IO4_SIGNAL_TEST) || fn0[1].join() !== String(IO4_SIGNAL_SERVICE) || fn0[2].length) throw new Error("function buttons default failed");
  await dev4.setIo4Buttons([[0, 11, 32], [29], [16, 31]], true);        // several signals, an air beam, the coin
  const fn1 = await dev4.io4Buttons();
  if (fn1[0].join() !== "0,11,32" || fn1[1].join() !== "29" || fn1[2].join() !== "16,31") throw new Error("function buttons round trip failed");
  if (io4SignalsText([9]) !== "TEST" || io4SignalsText([]) !== "Nothing" || io4SignalsText([0, 11, 32]) !== "1P START + 2 more") throw new Error("function buttons text failed");
  const led0 = await dev4.io4LedConfig();
  if (!led0.static || led0.rgb.join() !== "255,255,255") throw new Error("IO4 LED mode default failed");
  await dev4.setIo4LedConfig(true, [10, 20, 30], true);
  const led1 = await dev4.io4LedConfig();
  if (!led1.static || led1.rgb.join() !== "10,20,30") throw new Error("IO4 LED mode round trip failed");
  let noLedExt = false;
  try { await new TasollerDevice(mkLink(new SimDevice())).ledExtInfo(); } catch (e) { noLedExt = e instanceof FlashError; }
  if (!noLedExt) throw new Error("the stock firmware must not answer the LED command");

  // a whole update against a simulated device, and a version mismatch is refused
  const image = new Uint8Array(3001).map((_, i) => (i * 7 + 3) & 255);
  const sim3 = new SimDevice("SS321_APP_TEST"), l3 = mkLink(sim3);
  await l3.update(image, "SS321_APP_X");
  if (!sim3.trigger || !sim3.rebooted || hex(sim3.slot.subarray(0, image.length)) !== hex(image)) throw new Error("simulated update failed");
  let refused = false;
  try { await mkLink(new SimDevice("OTHER_APP")).update(image, "SS321_APP_X"); } catch (e) { refused = e instanceof FlashError; }
  if (!refused) throw new Error("version mismatch was not refused");
  return true;
}
