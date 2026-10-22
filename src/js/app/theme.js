// ------------------------------------------------------------------------------------------------
// Theme: the page follows the light or dark choice of the system (the CSS listens to it by itself) until the user picks one with the
// buttons of the top bar. The pick is kept in this browser; "system" forgets it.
// ------------------------------------------------------------------------------------------------
function applyTheme(choice) {
  if (choice === "light" || choice === "dark") document.documentElement.setAttribute("data-theme", choice);
  else { choice = "auto"; document.documentElement.removeAttribute("data-theme"); }
  document.querySelectorAll("[data-theme-choice]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === choice)));
}
document.querySelectorAll("[data-theme-choice]").forEach(b => b.onclick = () => { store("theme", b.dataset.themeChoice); applyTheme(b.dataset.themeChoice); });
applyTheme(load("theme"));
