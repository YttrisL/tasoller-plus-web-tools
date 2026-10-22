// ------------------------------------------------------------------------------------------------
// connection status UI
// ------------------------------------------------------------------------------------------------
function setConnUI(state) {
  const c = app.conn, dot = $("connDot"), txt = $("connText");
  $("connHelp").hidden = !!(c && state !== "off");
  dot.className = "dot"; $("connOfficial").hidden = true; $("connCfw").hidden = true; $("connUpdate").hidden = true; dot.hidden = false;
  document.body.classList.toggle("cfw", !!(c && state !== "off" && c.cfw));
  const updating = !!(c && state !== "off" && c.update);
  document.body.classList.toggle("update-mode", updating);
  $("flashUpdateNote").hidden = !updating;
  if (updating && app.page !== "flasher" && app.page !== "links") showPage("flasher");        // in update mode the device only offers the Flasher
  document.body.classList.toggle("fw-official", !!(c && state !== "off" && c.version === OFFICIAL_VERSION && !c.demo));
  if (state === "off" || !c) {
    txt.textContent = "Not connected"; $("connInfo").disabled = true; $("connPop").hidden = true; $("btnConnect").hidden = false; $("btnDisconnect").hidden = true;
    $("stDev").textContent = "not connected"; $("stDev").className = "muted"; $("stVer").textContent = "-"; $("stVer").className = "muted";
    document.body.classList.add("test-off"); updateGate(); return;
  }
  $("btnConnect").hidden = true; $("btnDisconnect").hidden = false;
  const name = c.demo ? "Simulated Tasoller Plus" : (c.cmdDev.productName || "Tasoller Plus") + " (" + hexId(c.cmdDev) + ")";
  if (state === "busy") { txt.textContent = "Connecting to " + name + "..."; dot.classList.add("warn"); $("connInfo").disabled = true; return; }
  dot.classList.add(c.demo ? "demo" : "on");
  if (c.update) { dot.hidden = true; $("connUpdate").hidden = false; }                       // update mode: a yellow badge instead of the name of the device
  else if (c.version === OFFICIAL_VERSION && !c.demo) { dot.hidden = true; $("connOfficial").hidden = false; }
  else if (c.cfw) { dot.hidden = true; $("connCfw").hidden = false; }
  const mode = c.update ? "update mode" : (c.mode != null ? MODE_NAMES[c.mode] : "");
  const shortName = c.demo ? "Demo (simulated)" : (c.cmdDev.productName || "Tasoller Plus");
  txt.textContent = c.update ? "" : shortName; $("connInfo").disabled = false;
  const official = c.version === OFFICIAL_VERSION && !c.demo;
  const inf = c.info || {}, none = "-";
  const rows = [["Main hardware version:", inf.hwMain || none], ["Main firmware version:", c.version || none], ["Touch hardware version:", inf.hwTouch || none], ["Touch firmware version:", inf.touchFw || none]];
  const pop = $("connPop"); pop.textContent = "";
  const top = document.createElement("div"); top.className = "pop-mode"; top.textContent = mode || "Unknown mode"; pop.appendChild(top);
  for (const [label, value] of rows) {
    const row = document.createElement("div"); row.className = "pop-row";
    const l = document.createElement("div"); l.className = "pop-label"; l.textContent = label;
    const v = document.createElement("div"); v.className = "pop-value"; v.textContent = value;
    row.appendChild(l); row.appendChild(v); pop.appendChild(row);
  }
  $("stDev").textContent = name + (c.update ? " - update mode" : ""); $("stDev").className = "ok";
  $("stVer").textContent = c.version || "(empty)"; $("stVer").className = c.version.includes("SS321") ? "ok" : "warn";
  document.body.classList.toggle("test-off", !c.streamDev || c.update);
  updateGate();
}

function updateButtons() {
  const c = app.conn, idle = c && !app.busy && !app.flashing;
  $("btnFlash").disabled = !(idle && app.pkg && !app.pkg.errors.length && $("confirm").checked);
  $("file").disabled = !!app.flashing;
  $("btnDisconnect").disabled = !!(app.busy || app.flashing);
  const upd = !!(c && c.update), cfgOn = !!(c && !c.update && app.cfg && !app.flashing);
  // update mode: nothing on the Config page is clickable, and the LED test is unavailable
  ["btnHideDiff", "btnHideThr"].forEach(id => { $(id).disabled = upd; });
  $("advClose").disabled = upd;
  if (upd) { $("btnMode").disabled = true; $("advPanel").hidden = true; }
  $("flashUpdateNote").hidden = !upd; $("ledUpdateNote").hidden = !upd; $("ledConnect").disabled = upd; $("ledOff").disabled = upd;
  if (upd && led.timer) ledStop();
  ["sliderAll", "numAll", "sliderMode", "sliderBR", "sliderDelay", "numDelay", "sliderGround", "sliderAir", "btnRestore", "btnAdvanced",
    "btnSetExport", "btnSetImport", "dbgFinger", "dbgFingerApply", "dbgBaseline", "dbgNoise", "dbgIir", "dbgReset", "keyRestore"].forEach(id => { $(id).disabled = !cfgOn; });
  $("btnDebug").disabled = upd; if (upd) { $("debugCard").hidden = true; $("keyCard").hidden = true; }
  document.querySelectorAll("#keyRows button").forEach(b => { b.disabled = !cfgOn; });
  $("keyClear").disabled = !cfgOn || !keymap.target;
  disableMissing();
  updateDump();
  updateLedExt();
  io4cfgRender();
  renderFnLabels();
  document.querySelectorAll("#advPanel input, #advPanel button").forEach(el => { if (el.id !== "advClose") el.disabled = !cfgOn; });
  const notice = $("cfgNotice");
  if (!c) { notice.hidden = !$("reconnectBar").hidden; notice.textContent = "Not connected. Use Connect in the top bar to read and change the settings."; }
  else if (c.update) { notice.hidden = false; notice.textContent = "The device is in update mode: it only offers the Flasher. Restart it normally to change settings."; }
  else if (!app.cfg) { notice.hidden = false; notice.textContent = "Reading the settings from the device..."; }
  else if (app.cfg.missing && app.cfg.missing.length) { notice.hidden = false; notice.textContent = "This firmware did not answer for: " + app.cfg.missing.join(", ") + ". Those controls stay disabled."; }
  else notice.hidden = true;
}

