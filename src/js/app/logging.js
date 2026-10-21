const logLines = []; let showDetail = false;
function renderLog() {
  const el = $("log"), stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  el.textContent = logLines.filter(l => showDetail || !l.d).slice(-800).map(l => l.t).join(String.fromCharCode(10));
  if (stick) el.scrollTop = el.scrollHeight;
}
function addLog(text, d) { logLines.push({ t: text, d }); if (logLines.length > 6000) logLines.splice(0, 1000); renderLog(); }
function log(text) { addLog(text, false); }
function logDetail(text) { addLog(text, true); }
function toast(msg, kind) {
  const t = document.createElement("div"); t.className = "toast " + (kind || ""); t.textContent = msg; $("toasts").appendChild(t);
  setTimeout(() => t.remove(), kind === "bad" ? 6000 : 2600);
}
