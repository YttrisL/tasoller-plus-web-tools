// ------------------------------------------------------------------------------------------------
// pages
// ------------------------------------------------------------------------------------------------
function showPage(name) {
  if (!["test", "led", "config", "flasher"].includes(name)) name = "test";
  app.page = name;
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + name));
  document.querySelectorAll(".tab").forEach(t => { if (t.dataset.page === name) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
  try { history.replaceState(null, "", "#" + name); } catch (e) {}
  updateStream();
  if (name !== "led" && typeof ledStop === "function" && led.timer) ledStop();
  if (name === "config" && app.conn && !app.conn.update) refreshConfig();
}
document.querySelectorAll(".tab").forEach(t => t.onclick = () => showPage(t.dataset.page));

