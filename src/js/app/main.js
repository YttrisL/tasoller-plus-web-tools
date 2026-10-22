// ------------------------------------------------------------------------------------------------
// start
// ------------------------------------------------------------------------------------------------

// device details popup (click the device name in the top bar)
$("connInfo").addEventListener("click", e => { e.stopPropagation(); const pop = $("connPop"); pop.hidden = !pop.hidden; $("connInfo").setAttribute("aria-expanded", String(!pop.hidden)); });
document.addEventListener("click", e => { if (!$("connPop").hidden && !$("connPop").contains(e.target)) { $("connPop").hidden = true; $("connInfo").setAttribute("aria-expanded", "false"); } });
document.addEventListener("keydown", e => { if (e.key === "Escape") { $("connPop").hidden = true; $("connInfo").setAttribute("aria-expanded", "false"); } });
$("btnConnect").onclick = () => connectReal();
$("btnDisconnect").onclick = disconnect;
$("btnClearLog").onclick = () => { logLines.length = 0; renderLog(); };
$("detailLogs").onchange = () => { showDetail = $("detailLogs").checked; renderLog(); };
if (!hid()) $("unsupported").hidden = false;
if (hid()) {
  hid().addEventListener("disconnect", e => onDeviceGone(e.device));
  hid().addEventListener("connect", () => { if (!app.conn) setTimeout(() => { app.wasFlashed = false; autoConnect(); }, 600); });
}
app.hideDiff = load("hideDiff") === "1"; app.hideThr = load("hideThr") === "1"; applyView();
selfTest().then(() => { $("stSelf").textContent = "passed"; $("stSelf").className = "ok"; },
  e => { $("stSelf").textContent = "FAILED"; $("stSelf").className = "bad"; log("self-test failed: " + e.message); toast("Self-test failed: " + e.message, "bad"); });
// Download: a copy of the page. A page served over the web is fetched again as it is; one opened from a file cannot be, so the page as it was loaded is saved.
$("footDownload").onclick = async e => {
  e.preventDefault();
  let source = null;
  if (/^https?:$/.test(location.protocol)) {
    try { const r = await fetch(location.href.split("#")[0], { cache: "no-cache" }); if (r.ok) source = await r.text(); } catch (err) {}
  }
  saveBlob("index.html", new Blob([source !== null ? source : PAGE_SOURCE], { type: "text/html" }));
};
setConnUI("off");
showPage((location.hash || "#test").slice(1));
buildGrid(0); renderConfig(); updateButtons(); updateStream();
requestAnimationFrame(frameLoop);
autoConnect();
