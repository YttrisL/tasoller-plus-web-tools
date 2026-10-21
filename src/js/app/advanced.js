// ------------------------------------------------------------------------------------------------
// Advanced: single sensor thresholds
// ------------------------------------------------------------------------------------------------
const RULES = [["4-1", "Any single pad above the threshold"], ["4-2", "Sum of any 2 pads above the threshold"], ["4-3", "Sum of any 3 pads above the threshold"], ["4-4", "Sum of all 4 pads above the threshold"]];
let advTimer = null;
(function buildAdv() {
  const rows = $("advRows");
  RULES.forEach((r, t) => {
    const div = document.createElement("div"); div.className = "thr-row";
    div.innerHTML = '<p class="desc"><b>' + r[0] + '</b>: ' + r[1] + '</p><div class="row"><input type="range" id="advR' + t + '" min="' + THR_MIN + '" max="' + THR_MAX + '" value="85"><input type="number" class="num" id="advN' + t + '" min="' + THR_MIN + '" max="' + THR_MAX + '" value="85"></div>';
    rows.appendChild(div);
    const rng = div.querySelector("input[type=range]"), num = div.querySelector("input[type=number]");
    rng.addEventListener("input", () => { setRange(rng, rng.value); num.value = rng.value; advEdit(t, Number(rng.value), false); });
    rng.addEventListener("change", () => advEdit(t, Number(rng.value), true));
    num.addEventListener("change", () => { const v = clamp(Number(num.value), THR_MIN, THR_MAX); num.value = v; setRange(rng, v); advEdit(t, v, true); });
  });
  for (let n = 0; n < 4; n++) { const p = document.createElement("div"); p.className = "pad"; p.innerHTML = "<div></div><span>-</span>"; $("advPads").appendChild(p); }
})();
function advEdit(t, v, commit) {
  const r = app.cfg; if (!r || !r.sensors) return;
  r.sensors[31 - app.sel][t] = v; renderBadges();
  if (commit) { clearTimeout(advTimer); advTimer = setTimeout(writeSensors, 350); }
}
async function writeSensors() {
  const r = app.cfg; if (!r || !r.sensors) return;
  await runOp("Setting the sensor thresholds", async c => { await c.api.setSensors(r.sensors); await c.api.save(); toast("Sensor thresholds saved", "ok"); });
}
function openAdvanced(d) {
  if (typeof d === "number") app.sel = d;
  $("advPanel").hidden = false;
  showPage("config");
  renderAdvanced();
  $("advPanel").scrollIntoView({ block: "nearest" });
  updateStream();
}
function renderAdvanced() {
  const r = app.cfg, d = app.sel;
  $("advTitle").textContent = "Sensor " + d + " thresholds";
  $("advNum").value = d;
  units.forEach(c => c.el.classList.toggle("sel", c.d === d && !$("advPanel").hidden));
  for (let t = 0; t < 4; t++) {
    const v = r && r.sensors ? r.sensors[31 - d][t] : 85;
    setRange($("advR" + t), clamp(v, THR_MIN, THR_MAX)); $("advN" + t).value = v;
  }
  renderAdvancedLive();
}
function renderAdvancedLive() {
  if ($("advPanel").hidden) return;
  const d = app.sel, L = app.live, pads = $("advPads").children;
  for (let n = 0; n < 4; n++) { const v = L.pads[d * 4 + n]; pads[n].firstChild.style.height = Math.min(100, v / 4) + "%"; pads[n].lastChild.textContent = v; }
  $("advVal").textContent = app.conn ? L.press[d] : "-"; $("advDiff").textContent = app.conn ? L.diff[d] : "-";
}
$("btnAdvanced").onclick = () => { const hidden = $("advPanel").hidden; if (hidden) openAdvanced(app.sel); else { $("advPanel").hidden = true; renderAdvanced(); updateStream(); } };
$("advClose").onclick = () => { $("advPanel").hidden = true; renderAdvanced(); updateStream(); };
$("advPrev").onclick = () => { app.sel = (app.sel + 31) % 32; renderAdvanced(); };
$("advNext").onclick = () => { app.sel = (app.sel + 1) % 32; renderAdvanced(); };
$("advNum").addEventListener("change", () => { app.sel = clamp(Number($("advNum").value), 0, 31); renderAdvanced(); });
$("advResetOne").onclick = async () => {
  const r = app.cfg; if (!r || !r.sensors || !r.global) return;
  r.sensors[31 - app.sel] = r.global.slice(); renderAdvanced(); renderBadges(); await writeSensors();
};
$("advResetAll").onclick = async () => {
  const r = app.cfg; if (!r || !r.sensors || !r.global) return;
  if (!confirm("Reset all sensors to the global thresholds?")) return;
  r.sensors = r.sensors.map(() => r.global.slice()); renderAdvanced(); renderBadges(); await writeSensors();
};


