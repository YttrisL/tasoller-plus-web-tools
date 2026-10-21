// ------------------------------------------------------------------------------------------------
// Touch tuning (the hidden debug panel of the official tool): finger capacitance and tuning values 0, 1 and 3.
// Value 2 is the BR slider of the Config page. Every change restarts the touch controllers (baseline reset).
// ------------------------------------------------------------------------------------------------
const DEBUG_TUNING = [
  { id: "dbgBaseline", val: "dbgBaselineVal", index: 0, min: 1, max: 255, what: "Reset BaseLine" },
  { id: "dbgNoise", val: "dbgNoiseVal", index: 1, min: 1, max: 255, what: "Noise threshold" },
  { id: "dbgIir", val: "dbgIirVal", index: 3, min: 1, max: 100, what: "IIR filter" },
];
let debugOpen = false;

function renderDebug() {
  const r = app.cfg;
  $("debugCard").hidden = !(debugOpen && app.conn && !app.conn.update);
  $("btnDebug").textContent = debugOpen ? "Hide touch tuning (debug)" : "Show touch tuning (debug)";
  $("btnDebug").setAttribute("aria-expanded", String(debugOpen));
  if (!r) return;
  if (r.fingerCap) $("dbgFinger").value = r.fingerCap.cap;
  if (r.tuning) for (const d of DEBUG_TUNING) { const v = r.tuning[d.index]; setRange($(d.id), clamp(v, d.min, d.max)); $(d.val).textContent = v; }
}

async function applyTuningEntry(d, v) {
  const r = app.cfg; if (!r || !r.tuning) return;
  v = clamp(v, d.min, d.max);
  const tuning = r.tuning.slice(); tuning[d.index] = v;
  await runOp("Setting " + d.what, async c => {
    await c.api.setTuning(tuning);
    await c.api.resetBaseline();
    r.tuning = await c.api.getTuning();
    const ok = r.tuning[d.index] === v;
    toast(ok ? d.what + " saved (" + v + ")" : "Device reports " + r.tuning[d.index], ok ? "ok" : "bad");
  });
  renderConfig(); renderDebug();
}

async function applyFingerCap() {
  const r = app.cfg; if (!r || !r.fingerCap) return;
  const cap = clamp(Number($("dbgFinger").value), FINGER_CAP_MIN, FINGER_CAP_MAX);
  $("dbgFinger").value = cap;
  await runOp("Setting the finger capacitance", async c => {
    await c.api.setFingerCap(cap, r.fingerCap.other);
    await c.api.resetBaseline();
    r.fingerCap = await c.api.getFingerCap();
    toast(r.fingerCap.cap === cap ? "Finger capacitance saved (" + cap + ")" : "Device reports " + r.fingerCap.cap, r.fingerCap.cap === cap ? "ok" : "bad");
  });
  renderDebug();
}

for (const d of DEBUG_TUNING) wireRange(d.id, v => { $(d.val).textContent = v; }, v => applyTuningEntry(d, v));
$("dbgFingerApply").onclick = applyFingerCap;
$("dbgFinger").addEventListener("keydown", e => { if (e.key === "Enter") applyFingerCap(); });
$("dbgReset").onclick = () => runOp("Resetting the baseline", async c => { await c.api.resetBaseline(); toast("Baseline reset", "ok"); });
$("btnDebug").onclick = () => { debugOpen = !debugOpen; renderDebug(); };
