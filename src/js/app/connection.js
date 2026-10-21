// ------------------------------------------------------------------------------------------------
// transport: WebHID (or the simulator) wrapped as io objects for Link
// ------------------------------------------------------------------------------------------------
function makeIO(dev, reportId) {
  const q = []; let waiter = null;
  const handler = e => {
    const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const f = new Uint8Array(FRAME); f.set(d.subarray(0, FRAME));
    if (waiter) { const w = waiter; waiter = null; w(f); } else q.push(f);
  };
  dev.addEventListener("inputreport", handler);
  const wait = ms => new Promise(resolve => {
    if (q.length) { resolve(q.shift()); return; }
    const t = setTimeout(() => { waiter = null; resolve(null); }, ms);
    waiter = f => { clearTimeout(t); resolve(f); };
  });
  return {
    async exchange(frame, ms) {
      q.length = 0;
      const answer = wait(ms);
      try { await dev.sendReport(reportId, frame); }
      catch (e) { if (waiter) { const w = waiter; waiter = null; w(null); } throw new FlashError("could not send to the device: " + e.message); }
      return answer;
    },
    recv: ms => wait(ms),
    send: frame => dev.sendReport(reportId, frame),
    close() { dev.removeEventListener("inputreport", handler); },
  };
}

function describeCollections(dev) {
  const out = []; let rid = null;
  for (const c of dev.collections || []) {
    const outs = (c.outputReports || []).map(r => {
      const bits = (r.items || []).reduce((a, i) => a + i.reportSize * i.reportCount, 0);
      if (rid === null) rid = r.reportId || 0;
      return "out id " + (r.reportId || 0) + ", " + bits / 8 + " bytes";
    });
    const ins = (c.inputReports || []).map(r => "in id " + (r.reportId || 0) + ", " + (r.items || []).reduce((a, i) => a + i.reportSize * i.reportCount, 0) / 8 + " bytes");
    out.push("usage page 0x" + c.usagePage.toString(16) + " usage 0x" + c.usage.toString(16) + ": " + ([...ins, ...outs].join("; ") || "no reports"));
  }
  return { text: out, reportId: rid === null ? 0 : rid };
}
const hasOutput = d => (d.collections || []).some(c => (c.outputReports || []).length);
const hexId = d => "0x" + d.vendorId.toString(16).toUpperCase().padStart(4, "0") + ":0x" + d.productId.toString(16).toUpperCase().padStart(4, "0");

function connectFilters(all) {
  if (all) return [];
  return [...Object.keys(PID_MODE).map(p => ({ vendorId: VID, productId: Number(p) })), { vendorId: VID, productId: PID_UPDATE }];
}

const MODE_PID = { 0: 0x1231, 1: 0x1235, 2: 0x1234, 3: 0x1233, 4: 0x1232 };

// The browser only reconnects by itself to devices it already has permission for. After a mode switch the
// device comes back with another USB ID, which is a new device for the browser: one click on Reconnect
// (the chooser then only offers that device) grants it, and the page continues from there.
function showReconnect(msg, pid) { app.reconnectPid = pid || null; $("reconnectMsg").textContent = msg; $("reconnectBar").hidden = false; updateButtons(); updateStream(); }
$("btnReconnect").onclick = () => connectReal(app.reconnectPid);

async function connectReal(pid) {
  if (!hid()) { toast("This browser has no WebHID", "bad"); return; }
  let devs;
  try { devs = await hid().requestDevice({ filters: pid ? [{ vendorId: VID, productId: pid }] : connectFilters(false) }); }
  catch (e) { log("not connected: " + e.message); return; }
  if (!devs.length) { log("no device chosen"); return; }
  // Other interfaces of the same device that were authorised earlier (for example the live data one)
  let known = []; try { known = await hid().getDevices(); } catch (e) {}
  const set = new Set(devs); known.forEach(d => { if (d.vendorId === devs[0].vendorId && d.productId === devs[0].productId) set.add(d); });
  await adopt([...set]);
}

async function autoConnect() {
  if (!hid() || app.conn) return;
  let known = []; try { known = await hid().getDevices(); } catch (e) { return; }
  known = known.filter(d => d.vendorId === VID && (d.productId === PID_UPDATE || d.productId in PID_MODE));
  if (known.length) { log("reconnecting to an authorised device"); await adopt(known); }
}


// The two vendor interfaces of the device (command channel and live data) can look identical to the browser
// (same usage page, same report sizes), so the command channel is found by asking: the one that answers the
// handshake is the command channel, another one is taken for the live data.
async function adopt(devs, demo) {
  if (app.adopting) { log("a connection attempt is already running"); return; }
  app.adopting = true;
  try { await adoptInner([...new Set(devs)], demo); } finally { app.adopting = false; }
}
async function openDev(d) {
  for (let i = 0; i < 4; i++) {
    try { if (!d.opened) await d.open(); return; }
    catch (e) { if (i === 3) throw e; await sleep(300); }
  }
}
async function adoptInner(devs, demo) {
  if (app.conn) await teardown(true);
  for (const d of devs) log("HID interface " + hexId(d) + ": " + describeCollections(d).text.join(" | "));
  const cands = devs.filter(hasOutput);
  if (!cands.length) { toast("No usable HID interface on that device.", "bad"); log("no HID interface with an output report among: " + devs.map(hexId).join(", ")); return; }
  try { for (const d of cands) await openDev(d); }
  catch (e) {
    log("could not open the device: " + e.message);
    $("hint").textContent = "Another program (the official tool?) may be using the device. Close it and try again.";
    toast("Could not open the device. Is the official tool still running?", "bad"); return;
  }
  setConnUI("busy");
  let cmdDev = null, io = null, link = null, version = "", lastErr = null;
  const multi = cands.length > 1;
  for (const d of cands) {
    const c = describeCollections(d);
    const tio = makeIO(d, c.reportId), tl = new Link(tio, log);  tl.logDetail = logDetail;
    try { version = await tl.probe(multi); cmdDev = d; io = tio; link = tl; log("command channel found: " + hexId(d) + " (" + c.text.join(" | ") + ")"); break; }
    catch (e) { lastErr = e; tio.close(); log("interface " + hexId(d) + " is not the command channel: " + e.message); }
  }
  if (!cmdDev) {
    log("ERROR: " + (lastErr ? lastErr.message : "no answer"));
    $("hint").textContent = "No valid answer. Is the official tool closed? Is this the right device entry?";
    toast("No answer from the device: " + (lastErr ? lastErr.message : ""), "bad");
    for (const d of cands) { try { await d.close(); } catch (e) {} }
    setConnUI("off"); return;
  }
  const update = cmdDev.productId === PID_UPDATE;
  const streamDev = update ? null : (cands.find(d => d !== cmdDev) || null);
  for (const d of cands) if (d !== cmdDev && d !== streamDev) { try { await d.close(); } catch (e) {} }
  const conn = { cmdDev, streamDev, io, link, api: new TasollerDevice(link), demo: !!demo, pid: cmdDev.productId, version, mode: null, update };
  if (streamDev) conn.streamIo = makeStreamListener(streamDev);
  app.conn = conn;
  log("opened " + (demo ? "simulated device" : hexId(cmdDev) + " " + (cmdDev.productName || "")) + (streamDev ? " + live data interface" : " (no live data interface)"));
  log("handshake ok, version: " + version);
  if (conn.pid in PID_MODE) conn.mode = PID_MODE[conn.pid];
  setConnUI("on"); $("reconnectBar").hidden = true; app.wasFlashed = false;
  if (!conn.update) { await refreshConfig(true); }
  updateStream();
  updateButtons();
}

function makeStreamListener(dev) {
  const handler = e => {
    const d = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    app.live.feed(d);
  };
  dev.addEventListener("inputreport", handler);
  return { close() { dev.removeEventListener("inputreport", handler); } };
}

async function teardown(quiet) {
  const c = app.conn; if (!c) return;
  await stopStream();
  app.conn = null; app.cfg = null; app.live.reset();
  try { c.io.close(); } catch (e) {}
  try { c.streamIo && c.streamIo.close(); } catch (e) {}
  for (const d of [c.cmdDev, c.streamDev]) { if (d) { try { await d.close(); } catch (e) {} } }
  setConnUI("off");
  buildGrid(0); updateButtons(); renderConfig();
  if (!quiet) log("disconnected");
}

async function disconnect() { if (app.busy || app.flashing) return; await teardown(); }

function onDeviceGone(dev) {
  const c = app.conn; if (!c || c.demo) return;
  if (dev !== c.cmdDev && dev !== c.streamDev) return;
  log("device disconnected");
  teardown(true).then(() => {
    if (app.switching) showReconnect("The device is restarting in the new mode. When it is back (a few seconds), click Reconnect and pick it.", app.switchPid);
    else if (app.wasFlashed) showReconnect("The device is restarting. When it is back (about 10 seconds), click Reconnect and pick it.", null);
    else toast("Device disconnected", "bad");
    app.switching = false;
  });
}

