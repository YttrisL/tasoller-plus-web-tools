// ------------------------------------------------------------------------------------------------
// Test page
// ------------------------------------------------------------------------------------------------
const airRows = [], airKeys = []; // by beam 1..6
let units = [], groups = [], layoutMode = -1;   // units: the 32 sensor cells; groups: the key frames of the keyboard modes

// In the keyboard modes the official tool frames the sensors by key: 4K = 4 keys of 8 sensors, 8K = 8 keys of 4,
// 16K = 16 keys of 2 (a full column), 32K = 32 keys of 1. The key name is written on top of each frame.
const groupSize = mode => (mode >= 1 && mode <= 4) ? 8 >> (mode - 1) : 1;

function buildGrid(mode) {
  mode = (mode >= 1 && mode <= 4) ? mode : 0;
  const size = groupSize(mode), kb = mode >= 1, framed = size > 1;
  layoutMode = mode; units = []; groups = [];
  $("gridTop").textContent = ""; $("gridBottom").textContent = "";
  $("gridBottom").hidden = framed;
  document.body.classList.toggle("kb-mode", kb);
  $("legend").textContent = kb ? "Each frame is a keyboard key of the " + MODE_NAMES[mode] + " (" + (32 / size) + " keys), its name is written on top. Big number: sensor value (0-255). Small number: DIFF."
    : "Big number: sensor value sent to the game (0-255). Small number: DIFF (sum of the 4 pads). Circles: the 4 thresholds of the sensor (yellow = customised).";
  const cell = d => {
    const b = document.createElement("button"); b.type = "button"; b.className = "cell";
    b.title = "Sensor " + d + " - click to edit its thresholds";
    b.innerHTML = '<span class="fill"></span><span class="badges"><i title="4-1: any single pad"></i><i title="4-2: sum of any 2 pads"></i><i title="4-3: sum of any 3 pads"></i><i title="4-4: sum of all 4 pads"></i></span><span class="val">0</span><span class="diff">0</span>';
    b.onclick = () => openAdvanced(d);
    units[d] = { d, el: b, fill: b.querySelector(".fill"), val: b.querySelector(".val"), diff: b.querySelector(".diff"), badges: [...b.querySelectorAll("i")], on: false, v: -1, f: -1 };
    return b;
  };
  const frame = (members, body, span) => {
    const g = document.createElement("div"); g.className = "grp"; if (span) g.style.gridColumn = "span " + span;
    const head = document.createElement("div"); head.className = "grp-head"; g.appendChild(head); g.appendChild(body);
    groups.push({ members, el: g, head, on: false, k: null });
    return g;
  };
  if (!kb) {
    for (let i = 0; i < 16; i++) { $("gridTop").appendChild(cell(2 * i)); $("gridBottom").appendChild(cell(2 * i + 1)); }
  } else if (framed) {
    const cols = size / 2;
    for (let g = 0; g < 32 / size; g++) {
      const body = document.createElement("div"); body.className = "grp-body"; body.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
      const members = [];
      for (let r = 0; r < 2; r++) for (let n = 0; n < cols; n++) { const d = (g * cols + n) * 2 + r; members.push(d); body.appendChild(cell(d)); }
      $("gridTop").appendChild(frame(members, body, cols));
    }
  } else {
    for (let i = 0; i < 16; i++) for (const r of [0, 1]) {
      const body = document.createElement("div"); body.className = "grp-body"; body.style.gridTemplateColumns = "minmax(0, 1fr)";
      const d = 2 * i + r; body.appendChild(cell(d));
      $(r ? "gridBottom" : "gridTop").appendChild(frame([d], body, 0));
    }
  }
  renderBadges(); renderKeys(); renderLive(true); renderAdvanced();
}
// key names: frames, air lines and FN buttons (entries 32 and 33 of the key map are FN1 and FN2, then the 6 air keys)
function renderKeys() {
  const km = app.cfg && app.cfg.keymap, kb = layoutMode > 0;
  for (const g of groups) {
    const name = km ? keyName(km[31 - g.members[0]]) : "";
    if (g.k !== name) { g.k = name; g.head.textContent = name; }
  }
  for (let n = 1; n <= 6; n++) airKeys[n].textContent = kb && km ? keyName(km[33 + n]) : "";
  $("fnKey1").textContent = kb && km ? keyName(km[32]) : ""; $("fnKey2").textContent = kb && km ? keyName(km[33]) : "";
}
function applyLayout() { const m = app.cfg && app.cfg.mode != null ? app.cfg.mode : 0; if (m !== layoutMode) buildGrid(m); else renderKeys(); }

(function buildAir() {
  for (let n = 6; n >= 1; n--) {
    const row = document.createElement("div"); row.className = "air-row"; row.style.setProperty("--a", (0.28 + 0.72 * (n - 1) / 5).toFixed(2));
    row.innerHTML = '<span class="air-key"></span><span class="air-num">' + n + '</span><span class="air-line"></span>'; $("airRows").appendChild(row);
    airRows[n] = row; airKeys[n] = row.firstChild;
  }
})();

function renderBadges() {
  const r = app.cfg, have = r && r.sensors && r.global;
  for (const u of units) {
    u.badges.forEach((b, t) => {
      const v = have ? r.sensors[31 - u.d][t] : "";
      b.textContent = have ? v : "";
      b.classList.toggle("custom", !!(have && v !== r.global[t]));
    });
  }
}

let lastRev = -1;
function renderLive(force) {
  const L = app.live;
  if (!force && L.rev === lastRev) return;
  lastRev = L.rev;
  for (const c of units) {
    const v = L.press[c.d], f = L.diff[c.d];
    if (c.v !== v) { c.v = v; c.val.textContent = v; c.fill.style.height = Math.min(100, v * 100 / 255) + "%"; }
    if (c.f !== f) { c.f = f; c.diff.textContent = f; }
    const on = v > 0; if (c.on !== on) { c.on = on; c.el.classList.toggle("on", on); }
  }
  for (const g of groups) {
    let on = false; for (const d of g.members) if (L.press[d] > 0) { on = true; break; }
    if (g.on !== on) { g.on = on; g.el.classList.toggle("on", on); }
  }
  const b = L.buttons;
  $("fn1").classList.toggle("on", !!(b & 0x80)); $("fn2").classList.toggle("on", !!(b & 0x40));
  for (let n = 1; n <= 6; n++) airRows[n].classList.toggle("on", !!(b & (1 << (n - 1))));   // confirmed on hardware: beam 1 (bottom line) = bit 0 ... beam 6 = bit 5
  renderAdvancedLive();
}
function frameLoop() { renderLive(false); requestAnimationFrame(frameLoop); }

// ---- starting and stopping the stream ----
const START_FRAME = () => { const f = new Uint8Array(64); f.set([0x68, 0xDD, 0xC8]); return f; };
const STOP_FRAME = () => { const f = new Uint8Array(64); f.set([0x68, 0xBB, 0xF8]); return f; };

function wantStream() { const c = app.conn; return !!(c && !document.body.classList.contains("gate") && (c.streamDev || (isIo4() && c.serialPort)) && !c.update && !app.flashing && !app.dumping && (app.page === "test" || (app.page === "config" && !$("advPanel").hidden))); }
async function updateStream() {
  const c = app.conn, notice = $("testNotice");
  notice.classList.remove("cfw-banner");
  if (!c) { notice.hidden = !$("reconnectBar").hidden; notice.innerHTML = "Not connected. Use <b>Connect</b> in the top bar to see the live sensors."; $("streamInfo").textContent = "Live data: not connected"; return; }
  if (c.update) { notice.hidden = false; notice.textContent = "The device is in update mode: there is no live data. Restart it normally or use the Flasher."; $("streamInfo").textContent = "Live data: unavailable"; return; }
  if (isIo4()) {                      // no stream interface: the slider serial port and the I/O board instead
    if (!(await io4UpdateStream(c, notice))) return;
    if (wantStream()) await startStream(); else await stopStream();
    return;
  }
  if (!c.streamDev) {
    notice.hidden = false;
    notice.innerHTML = 'The live data interface of the device is not authorised yet. <button class="btn" id="btnAllowLive">Allow live data</button>';
    $("btnAllowLive").onclick = allowLive; $("streamInfo").textContent = "Live data: interface not available"; return;
  }
  notice.hidden = true;
  if (wantStream()) await startStream(); else await stopStream();
}
async function allowLive() {
  const c = app.conn; if (!c || c.demo) return;
  let devs = [];
  try { devs = await hid().requestDevice({ filters: [{ vendorId: VID, productId: c.pid }] }); }
  catch (e) { log("live interface not added: " + e.message); return; }
  devs.forEach(x => log("HID interface " + hexId(x) + ": " + describeCollections(x).text.join(" | ")));
  const d = devs.find(x => x !== c.cmdDev && hasOutput(x));
  if (!d) { toast("That entry has no live data interface", "bad"); return; }
  try { if (!d.opened) await d.open(); } catch (e) { toast("Could not open it: " + e.message, "bad"); return; }
  c.streamDev = d; c.streamIo = makeStreamListener(d);
  setConnUI("on"); updateStream();
}
async function startStream() {
  const c = app.conn; if (!c || (!c.streamDev && !(isIo4() && c.serialPort)) || app.streaming) return;
  app.streaming = true; app.lastStreamKick = performance.now();
  if (isIo4()) {
    if (!(await io4StartSerial())) { app.streaming = false; return; }
    log("live data started (slider serial port)");
    clearInterval(app.streamTimer); app.streamTimer = setInterval(streamWatch, 500);
    return;
  }
  try { await c.streamDev.sendReport(0, START_FRAME()); log("live data started"); }
  catch (e) { app.streaming = false; log("could not start live data: " + e.message); toast("Could not start live data: " + e.message, "bad"); return; }
  clearInterval(app.streamTimer);
  app.streamTimer = setInterval(streamWatch, 500);
}
async function stopStream() {
  clearInterval(app.streamTimer); app.streamTimer = null;
  const c = app.conn;
  if (!app.streaming) return;
  app.streaming = false; $("streamInfo").textContent = "Live data: stopped";
  if (isIo4()) { await io4StopSerial(); log("live data stopped"); app.live.clear(); return; }
  if (c && c.streamDev) { try { await c.streamDev.sendReport(0, STOP_FRAME()); log("live data stopped"); } catch (e) {} }
  app.live.clear();
}
let lastCount = 0, lastTick = 0;
function streamWatch() {
  const now = performance.now(), L = app.live;
  const rate = (L.packets - lastCount) * 1000 / Math.max(1, now - lastTick); lastCount = L.packets; lastTick = now;
  const info = $("streamInfo");
  if (!app.streaming) { info.textContent = "Live data: stopped"; return; }
  if (L.packets === 0 || now - L.lastAt > 1500) {
    info.textContent = "Live data: waiting for packets...";
    if (L.packets > 0) L.clear();                       // the last values would only look like a state of the device
    if (now - app.lastStreamKick > 3000 && app.conn && app.conn.streamDev) {   // ask again, in case the first request was lost
      app.lastStreamKick = now; app.conn.streamDev.sendReport(0, START_FRAME()).catch(() => {});
    }
    return;
  }
  if (isIo4()) { info.textContent = "Live data: receiving from the slider port (" + Math.round(rate) + " reports/s" + (app.conn.io4Hid ? ", air beams and buttons from the I/O board)" : ")"); return; }
  info.textContent = "Live data: receiving (" + Math.round(rate) + " packets/s, chips " + L.chipSeen.map(x => x > 0 ? "ok" : "-").join(" ") + ", buttons " + (L.dbtSeen ? "ok" : "-") + ")";
}

