// ------------------------------------------------------------------------------------------------
// Live data in the IO4-Emulation mode (Supernova). The stream interface of the other modes is not there; the pads are what the
// game reads on the serial port of the slider (Web Serial), the air beams and the buttons what it reads from the I/O board
// (WebHID). Both can only be opened while the game is closed.
// ------------------------------------------------------------------------------------------------
const SLIDER_ENABLE = Uint8Array.from([0xFF, 0x03, 0x00, 0xFE]);              // report every 15 ms
const SLIDER_DISABLE = Uint8Array.from([0xFF, 0x04, 0x00, 0xFD, 0xFC]);       // the checksum FD is escaped
const io4Serial = { reader: null, loop: null, state: 0, mark: false, cmd: 0, length: 0, data: [], sum: 0 };

const serialAvailable = () => "serial" in navigator;

// The device has three serial ports (the slider and the two LED boards) and the browser lists them all under the same name. The slider is the one that
// answers its hardware information request: true for it, false for the others, null when the port cannot be opened (the game has it).
async function io4IsSliderPort(port) {
  try { await port.open({ baudRate: 115200 }); } catch (e) { return null; }
  let found = false;
  try {
    const w = port.writable.getWriter();
    try { await w.write(Uint8Array.from([0xFF, 0xF0, 0x00, 0x11])); } finally { w.releaseLock(); }      // the hardware information request
    const r = port.readable.getReader(), timer = setTimeout(() => { r.cancel().catch(() => {}); }, 500);
    let before = 0;
    try {
      while (!found) {
        const res = await r.read();
        if (res.done) break;
        for (const b of res.value) { if (before === 0xFF && b === 0xF0) found = true; before = b; }      // its answer starts with FF F0
      }
    } finally { clearTimeout(timer); try { await r.cancel(); } catch (e) {} try { r.releaseLock(); } catch (e) {} }
  } catch (e) {}
  try { await port.close(); } catch (e) {}
  return found;
}

// The device has three serial ports (the slider and the two LED boards). The browser lists them all under the same name, so the user
// is asked to allow all three, in any order, and the page then finds the slider among them by what it answers.
const IO4_SERIAL_PORTS = 3;

async function io4GrantedPorts() {
  if (!serialAvailable()) return [];
  try { return (await navigator.serial.getPorts()).filter(p => { const i = p.getInfo(); return i.usbVendorId === IO4_VID && i.usbProductId === IO4_PID; }); }
  catch (e) { return []; }
}

// The slider among the ports that were allowed. With `ask` the browser's chooser is shown first (it needs a click of the user).
// { port } when found, else { count, error }: count is how many of the three ports are allowed.
// The probes open the ports, so they run one after the other: two at once (the page starts the live data and looks for the permissions
// when the device connects) would find each other's port busy and report that the game has it.
let io4ProbeQueue = Promise.resolve();
async function io4EnsureSliderPort(ask) {
  if (ask) {                                       // right away: the browser only shows its chooser for a click that is still recent
    try { await navigator.serial.requestPort({ filters: [{ usbVendorId: IO4_VID, usbProductId: IO4_PID }] }); }
    catch (e) { if (e.name !== "NotFoundError") log("serial port not added: " + e.message); }
  }
  const run = io4ProbeQueue.then(io4FindSliderPort);
  io4ProbeQueue = run.catch(() => {});
  return run;
}
async function io4FindSliderPort() {
  const known = app.conn && app.conn.serialPort;
  if (known) return { port: known, count: IO4_SERIAL_PORTS };                          // an earlier probe found it
  const granted = await io4GrantedPorts();
  if (granted.length < IO4_SERIAL_PORTS) return { count: granted.length, error: granted.length + " of " + IO4_SERIAL_PORTS + " serial ports allowed: allow the next one." };
  let busy = false;
  for (let attempt = 0; attempt < 2; attempt++) {                                      // a port that is still closing is busy for a moment
    busy = false;
    for (const p of granted) {
      const slider = await io4IsSliderPort(p);
      if (slider === true) return { port: p, count: granted.length };
      if (slider === null) busy = true;
    }
    if (!busy) break;
    await sleep(400);
  }
  return { count: granted.length, error: busy ? "Could not open the serial ports. Close the game, it uses them." : "None of the serial ports answers like the slider." };
}

async function io4AllowSerial() {
  const c = app.conn; if (!c) return;
  const r = await io4EnsureSliderPort(true);
  if (r.port) c.serialPort = r.port; else if (r.error) toast(r.error, r.count < IO4_SERIAL_PORTS ? "ok" : "bad");
  c.serialCount = r.count; c.serialError = r.port ? "" : (r.error || "");
  updateStream(); updateGate();
}

// The I/O board: the air beams and FN1 / FN2 in the buttons byte of the live decoder (bit 0 is beam 1).
function io4HidReport(e) {
  const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
  if (e.reportId !== 1 || d.length < 32) return;
  const words = [d[28] | (d[29] << 8), d[30] | (d[31] << 8)];           // the report without its ID: buttons at 28 and 30
  let b = 0;
  for (let beam = 0; beam < 6; beam++) if (!(words[beam & 1] & (1 << (13 - (beam >> 1))))) b |= 1 << beam;   // the bit of a beam is set while it is free
  if (words[0] & (1 << 9)) b |= 0x80;                                    // TEST (FN1)
  if (words[0] & (1 << 6)) b |= 0x40;                                    // SERVICE (FN2)
  app.live.buttons = b; app.live.rev++;
}
async function io4AllowHid() {
  const c = app.conn; if (!c) return;
  let devs = [];
  try { devs = await hid().requestDevice({ filters: [{ vendorId: IO4_VID, productId: IO4_PID, usagePage: 0x01, usage: 0x04 }] }); }
  catch (e) { log("I/O board not added: " + e.message); return; }
  if (devs[0]) await io4AttachHid(devs[0], false);
}
async function io4AttachHid(d, silent) {
  const c = app.conn; if (!c) return false;
  try { if (!d.opened) await d.open(); }
  catch (e) { log("I/O board: " + e.message); if (!silent) toast("Could not open the I/O board: " + e.message + " (is the game running?)", "bad"); return false; }
  d.addEventListener("inputreport", io4HidReport);
  c.io4Hid = d; updateStream(); updateGate();
  return true;
}

// The bytes of the slider, unescaped; a report of 32 pressure values updates the live data.
function io4SerialByte(byte) {
  const s = io4Serial;
  if (byte === 0xFD) { s.mark = true; return; }
  if (s.mark) { s.mark = false; if (byte === 0xFE || byte === 0xFC) byte++; }
  s.sum = (s.sum + byte) & 255;
  if (s.state === 0) { s.sum = 0xFF; if (byte === 0xFF) s.state = 1; }
  else if (s.state === 1) { s.cmd = byte; s.state = 2; }
  else if (s.state === 2) { s.length = byte; s.data = []; s.state = byte ? 3 : 4; }
  else if (s.state === 3) { s.data.push(byte); if (s.data.length === s.length) s.state = 4; }
  else {
    if (s.sum === 0 && s.cmd === 0x01 && s.length === 32) {
      const L = app.live;
      for (let d = 0; d < 32; d++) L.press[d] = s.data[31 - d];      // the report has the cells the other way round, the game's way
      L.dbtSeen++; L.packets++; L.rev++; L.lastAt = performance.now();
    }
    s.state = 0;
  }
}

async function io4StartSerial() {
  const c = app.conn, port = c && c.serialPort;
  if (!port) return false;
  if (led.dev && led.dev.io4) await ledDisconnect();       // the LED test has the port
  if (led.closing) await led.closing;
  try { await port.open({ baudRate: 115200 }); }
  catch (e) { toast("Could not open the slider port: " + e.message + ". Close the game, it uses that port.", "bad"); log("slider port: " + e.message); return false; }
  Object.assign(io4Serial, { state: 0, mark: false, sum: 0 });
  io4Serial.reader = port.readable.getReader();
  io4Serial.loop = (async () => {
    try { for (;;) { const r = await io4Serial.reader.read(); if (r.done) break; for (const b of r.value) io4SerialByte(b); } }
    catch (e) { log("slider port: " + e.message); }
  })();
  const w = port.writable.getWriter();
  try { await w.write(SLIDER_ENABLE); } finally { w.releaseLock(); }
  return true;
}
async function io4StopSerial() {
  const c = app.conn, port = c && c.serialPort;
  if (!port || !io4Serial.reader) return;
  try { const w = port.writable.getWriter(); try { await w.write(SLIDER_DISABLE); } finally { w.releaseLock(); } } catch (e) {}
  try { await io4Serial.reader.cancel(); } catch (e) {}
  try { await io4Serial.loop; } catch (e) {}
  try { io4Serial.reader.releaseLock(); } catch (e) {}
  io4Serial.reader = null;
  try { await port.close(); } catch (e) {}
}

// In the IO4-Emulation mode the two buttons are what the game sees: TEST (FN1) and SERVICE (FN2).
function renderFnLabels() {
  document.body.classList.toggle("io4", isIo4());      // square, they stand for the features and not for the buttons
  $("fnLabel1").textContent = isIo4() ? "TEST" : "fn1";
  $("fnLabel2").textContent = isIo4() ? "SERVICE" : "fn2";
}

// What updateStream shows in the IO4-Emulation mode; true when the data can be streamed.
async function io4UpdateStream(c, notice) {
  notice.classList.add("cfw-banner");
  if (!serialAvailable()) {
    notice.hidden = false; notice.innerHTML = "<b class='cfw-note'>IO4-Emulation mode:</b> live data needs Web Serial (Chrome or Edge on desktop). Or switch to WINUSB in Config.";
    $("streamInfo").textContent = "Live data: unavailable"; return false;
  }
  if (!c.serialPort) { const r = await io4EnsureSliderPort(false); c.serialPort = r.port || null; c.serialCount = r.count || 0; }
  const parts = [];
  if (!c.serialPort) parts.push('The pads are read on the slider serial port. The device has three serial ports, listed under the same name: allow all three, in any order, and keep accepting until the count says 3 of 3.<br><button class="btn" id="btnAllowSerial">Allow a serial port (' + (c.serialCount || 0) + ' of ' + IO4_SERIAL_PORTS + ' allowed)</button>');
  if (!c.io4Hid) parts.push('The air beams and buttons are read from the I/O board. <button class="btn plain" id="btnAllowIo4">Allow the I/O board</button>');
  notice.hidden = !parts.length;
  if (parts.length) {
    notice.innerHTML = "<b class='cfw-note'>IO4-Emulation mode:</b> close the game, it uses the same ports.<br>" + parts.join("<br>");
    if ($("btnAllowSerial")) $("btnAllowSerial").onclick = io4AllowSerial;
    if ($("btnAllowIo4")) $("btnAllowIo4").onclick = io4AllowHid;
  }
  if (!c.serialPort) { $("streamInfo").textContent = "Live data: slider port not allowed"; return false; }
  return true;
}
