// ------------------------------------------------------------------------------------------------
// settings: read from the device, show, write
// ------------------------------------------------------------------------------------------------
async function refreshConfig(quietIfBusy) {
  const c = app.conn; if (!c || c.update) return;
  if (app.busy && quietIfBusy) return;
  app.busy++; updateButtons();
  try {
    const missing = [];
    const r = await c.api.readAll((key, e) => { missing.push(key); log("could not read " + key + ": " + e.message); });
    if (app.conn !== c) return;
    r.missing = missing;
    app.cfg = r;
    if (r.mode != null) c.mode = r.mode;
    c.info = r.info; setConnUI("on");
  } catch (e) { log("ERROR: " + e.message); toast("Could not read the settings: " + e.message, "bad"); }
  finally { app.busy--; }
  renderConfig(); applyLayout(); renderBadges(); renderAdvanced(); updateButtons();
}

function setRange(el, v) { el.value = v; el.style.setProperty("--p", ((el.value - el.min) / (el.max - el.min) * 100) + "%"); }

function renderConfig() {
  const r = app.cfg;
  const off = !r;
  const ok = key => r && r[key] != null;
  if (ok("global")) { const v = clamp(r.global[0], THR_MIN, THR_MAX); setRange($("sliderAll"), v); $("numAll").value = r.global[0]; }
  if (ok("tuning")) { const v = r.tuning[TUNING_BR_INDEX]; setRange($("sliderBR"), clamp(v, BR_MIN, BR_MAX)); $("valBR").textContent = v; }
  if (ok("delay")) { setRange($("sliderDelay"), clamp(r.delay, 0, DELAY_MAX)); $("numDelay").value = r.delay; }
  if (ok("ground")) { setRange($("sliderGround"), clamp(r.ground, BRIGHT_MIN, BRIGHT_MAX)); $("valGround").textContent = r.ground; }
  if (ok("air")) { setRange($("sliderAir"), clamp(r.air, BRIGHT_MIN, BRIGHT_MAX)); $("valAir").textContent = r.air; }
  if (ok("mode")) { setRange($("sliderMode"), clamp(r.mode, 0, 4)); $("modeName").textContent = MODE_NAMES[clamp(r.mode, 0, 4)]; $("modeCur").textContent = "(current)"; $("btnMode").disabled = true; }
  disableMissing();
  renderKeyCard(); renderDebug();
}

// Controls whose value the device did not give stay disabled (updateButtons calls this after it enabled the others).
function disableMissing() {
  const r = app.cfg; if (!r) return;
  const dis = (id, key) => { if (r[key] == null) $(id).disabled = true; };
  dis("sliderMode", "mode"); dis("sliderAll", "global"); dis("numAll", "global"); dis("sliderBR", "tuning"); dis("sliderDelay", "delay"); dis("numDelay", "delay");
  dis("sliderGround", "ground"); dis("sliderAir", "air"); dis("btnAdvanced", "sensors"); dis("btnRestore", "sensors");
  dis("dbgFinger", "fingerCap"); dis("dbgFingerApply", "fingerCap"); dis("dbgBaseline", "tuning"); dis("dbgNoise", "tuning"); dis("dbgIir", "tuning");
}

// Run one device operation with busy tracking and error reporting.
async function runOp(what, fn) {
  const c = app.conn;
  if (!c || c.update || app.flashing) { toast("Not available right now", "bad"); return false; }
  app.busy++; updateButtons();
  try { await fn(c); return true; }
  catch (e) { log("ERROR (" + what + "): " + e.message); toast(what + " failed: " + e.message, "bad"); return false; }
  finally { app.busy--; updateButtons(); }
}

// Sensors that still equal the old global value follow the new one (as the official tool does).
async function applyGlobalThreshold(n) {
  n = clamp(n, THR_MIN, THR_MAX);
  const r = app.cfg; if (!r || !r.global || !r.sensors) return;
  const oldG = r.global.slice(), newG = [n, n, n, n];
  const follows = a => a.every((v, i) => v === oldG[i]);
  const sensors = r.sensors.map(a => follows(a) ? newG.slice() : a.slice());
  await runOp("Setting the thresholds", async c => {
    await c.api.setSensors(sensors);
    await c.api.setGlobal(newG);
    await c.api.save();
    r.global = newG; r.sensors = sensors;
    const back = await c.api.getGlobal(); r.global = back;
    toast(back.every(v => v === n) ? "Thresholds saved (" + n + ")" : "Device reports " + back.join("/") + " instead", back.every(v => v === n) ? "ok" : "bad");
  });
  renderConfig(); renderBadges(); renderAdvanced();
}

async function applyTuningBR(v) {
  const r = app.cfg; if (!r || !r.tuning) return;
  v = clamp(v, BR_MIN, BR_MAX);
  const tuning = r.tuning.slice(); tuning[TUNING_BR_INDEX] = v;
  await runOp("Setting BR", async c => {
    await c.api.setTuning(tuning);          // the device stores it by itself
    await c.api.resetBaseline();            // restarts the touch controllers with the new block, as the official tool does
    r.tuning = await c.api.getTuning();
    toast(r.tuning[TUNING_BR_INDEX] === v ? "BR saved (" + v + ")" : "Device reports BR " + r.tuning[TUNING_BR_INDEX], r.tuning[TUNING_BR_INDEX] === v ? "ok" : "bad");
  });
  renderConfig();
}

async function applyDelay(v) {
  const r = app.cfg; if (!r) return;
  v = clamp(v, 0, DELAY_MAX);
  await runOp("Setting the delay", async c => {
    await c.api.setDelay(v);
    r.delay = await c.api.getDelay();
    toast(r.delay === v ? "Delay saved (" + v + ")" : "Device reports delay " + r.delay, r.delay === v ? "ok" : "bad");
  });
  renderConfig();
}

async function applyBrightness() {
  const r = app.cfg; if (!r) return;
  const air = Number($("sliderAir").value), ground = Number($("sliderGround").value);
  await runOp("Setting the brightness", async c => {
    await c.api.setBrightness(air, ground);
    await c.api.save();
    const b = await c.api.getBrightness(); r.air = b.air; r.ground = b.ground;
    const ok = b.air === air && b.ground === ground;
    toast(ok ? "Brightness saved" : "Device reports " + b.ground + "/" + b.air, ok ? "ok" : "bad");
  });
  renderConfig();
}

async function restoreFactory() {
  if (!confirm("Restore the factory thresholds?\n\nAll sensors and the global thresholds go back to the factory values. Your per-sensor changes are lost.")) return;
  await runOp("Restoring the factory thresholds", async c => {
    await c.api.restoreFactoryThresholds();
    const sensors = await c.api.getSensors();
    await c.api.setSensors(sensors);        // makes the firmware rebuild its tables (it does so after group 7)
    const r = await c.api.readAll((k, e) => log("could not read " + k + ": " + e.message));
    r.missing = app.cfg ? app.cfg.missing : []; app.cfg = r;
    toast("Factory thresholds restored", "ok");
  });
  renderConfig(); renderBadges(); renderAdvanced();
}

// ---- slider wiring: label follows while dragging, the device is written on release ----
function wireRange(id, onInput, onCommit) {
  const el = $(id);
  el.addEventListener("input", () => { setRange(el, el.value); onInput && onInput(Number(el.value)); });
  el.addEventListener("change", () => { onCommit(Number(el.value)); });
}
function wireNumber(id, rangeId, min, max, onCommit) {
  const el = $(id);
  el.addEventListener("change", () => { const v = clamp(Number(el.value), min, max); el.value = v; setRange($(rangeId), v); onCommit(v); });
}
wireRange("sliderAll", v => { $("numAll").value = v; }, applyGlobalThreshold);
wireNumber("numAll", "sliderAll", THR_MIN, THR_MAX, applyGlobalThreshold);
wireRange("sliderBR", v => { $("valBR").textContent = v; }, applyTuningBR);
wireRange("sliderDelay", v => { $("numDelay").value = v; }, applyDelay);
wireNumber("numDelay", "sliderDelay", 0, DELAY_MAX, applyDelay);
wireRange("sliderGround", v => { $("valGround").textContent = v; }, applyBrightness);
wireRange("sliderAir", v => { $("valAir").textContent = v; }, applyBrightness);
$("btnRestore").onclick = restoreFactory;
$("sliderMode").addEventListener("input", () => {
  const m = Number($("sliderMode").value), cur = app.cfg && app.cfg.mode;
  setRange($("sliderMode"), m); $("modeName").textContent = MODE_NAMES[m];
  $("modeCur").textContent = m === cur ? "(current)" : "(not applied)"; $("btnMode").disabled = !app.cfg || m === cur;
});
const NL = String.fromCharCode(10);
$("btnMode").onclick = async () => {
  const m = Number($("sliderMode").value), r = app.cfg; if (!r || m === r.mode) return;
  if (!confirm("Switch to " + MODE_NAMES[m] + "?" + NL + NL + "The device restarts its USB connection and comes back with another USB ID." + NL + "A keyboard mode makes the ground slider type keys on this PC.")) return;
  await runOp("Switching the mode", async c => {
    await c.api.setMode(m);
    const back = await c.api.getMode();
    if (back !== m) throw new Error("the device reports mode " + back);
    r.mode = back;
    if (c.demo) { await c.api.restartUsb(); c.mode = back; setConnUI("on"); await refreshConfig(); toast("Mode switched (simulated)", "ok"); return; }
    app.switching = true; app.switchPid = MODE_PID[m];
    toast("Mode saved. Restarting USB...", "ok");
    await c.api.restartUsb();
  });
  renderConfig();
};

// ---- view toggles (shared with the Test page) ----
function applyView() {
  document.body.classList.toggle("hide-diff", app.hideDiff); document.body.classList.toggle("hide-thr", app.hideThr);
  $("btnHideDiff").textContent = app.hideDiff ? "Show DIFF" : "Hide DIFF";
  $("btnHideThr").textContent = app.hideThr ? "Show thresholds" : "Hide thresholds";
}
$("btnHideDiff").onclick = () => { app.hideDiff = !app.hideDiff; store("hideDiff", app.hideDiff ? "1" : "0"); applyView(); };
$("btnHideThr").onclick = () => { app.hideThr = !app.hideThr; store("hideThr", app.hideThr ? "1" : "0"); applyView(); };

