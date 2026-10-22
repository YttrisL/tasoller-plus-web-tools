// ------------------------------------------------------------------------------------------------
// pages
// ------------------------------------------------------------------------------------------------
function showPage(name) {
  if (!["test", "led", "config", "flasher", "dump", "io4cfg", "links"].includes(name) || ((name === "dump" || name === "io4cfg") && !dumpAvailable())) name = "test";      // the Supernova pages need Supernova
  app.page = name;
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + name));
  document.querySelectorAll(".tab").forEach(t => { if (t.dataset.page === name) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
  try { history.replaceState(null, "", "#" + name); } catch (e) {}
  updateStream();
  if (name !== "led" && typeof ledStop === "function" && led.timer) ledStop();
  if (name !== "led" && typeof ledDisconnect === "function" && led.dev && led.dev.io4) ledDisconnect();      // the Input test needs the slider port
  if (name === "config" && app.conn && !app.conn.update) refreshConfig();
  if (name === "dump") updateDump();
  if (name === "led") { if (led.dev) ledStart(); else ledAutoConnect(); }
}
document.querySelectorAll(".tab").forEach(t => t.onclick = () => showPage(t.dataset.page));

