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
