// ------------------------------------------------------------------------------------------------
// Flasher page
// ------------------------------------------------------------------------------------------------
app.pkg = null; app.fileHash = null;
function setProgress(done, total, text) { $("bar").value = total ? Math.min(100, (100 * done) / total) : 0; $("progressText").textContent = text || String.fromCharCode(160); }

async function doFlash() {
  const c = app.conn, pkg = app.pkg; if (!c || !pkg) return;
  $("confirm").checked = false;
  app.flashing = true; app.busy++; updateButtons();
  await stopStream();
  const names = { erase: "Erasing the update area...", write: "Writing", check: "Checking...", reboot: "Restarting..." };
  const t0 = performance.now();
  try {
    const version = await c.link.update(pkg.image, pkg.version, (phase, done, total) => {
      setProgress(done, total, names[phase] + (phase === "write" ? " " + done + " of " + total + " bytes" : ""));
    });
    log("update sent in " + ((performance.now() - t0) / 1000).toFixed(1) + " s (device was " + version + ")");
    app.wasFlashed = !c.demo;
    app.installCfw = !c.demo && !c.cfw && String(pkg.version).startsWith(CFW_VERSION_PREFIX);
    store("installCfw", app.installCfw ? "1" : "0");                            // kept if the page is reloaded while the device restarts
    if (app.installCfw) log("Supernova is being installed: the device will be switched to the IO4-Emulation mode when it is back");      // Supernova goes on a device that did not run it: it starts in the IO4-Emulation mode
    setProgress(100, 100, "Done. The Tasoller restarts and its bootloader installs the new firmware. Wait about 10 seconds: the page reconnects by itself, or use Connect.");
    toast("Update sent. The device is restarting.", "ok");
  } catch (e) {
    log("ERROR: " + e.message); setProgress(0, 0, "Error: " + e.message); toast("Flash failed: " + e.message, "bad");
  } finally { app.flashing = false; app.busy--; updateButtons(); updateStream(); }
}

// The icons of the top bar: the green shield of the official firmware, the purple flame of Supernova.
const FW_SHIELD = "<svg viewBox='0 0 16 16' fill='currentColor' aria-hidden='true'><path d='M8 1l6 2v4.5c0 3.4-2.5 6.1-6 7.5-3.5-1.4-6-4.1-6-7.5V3l6-2zm-1.2 9.6l4-4.2-1-1-3 3.1-1.3-1.3-1 1 2.3 2.4z'/></svg>";
const FW_FLAME = "<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'><path d='M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14.37c.38 5.6 5.11 7.32 6.81 7.54 2.43.31 5.06-.14 6.95-1.87 2.08-1.93 2.84-5.01 1.72-7.69zM10.2 17.38c1.44-.35 2.18-1.39 2.38-2.31.33-1.43-.96-2.83-.09-5.09.33 1.87 3.27 3.04 3.27 5.08 0 2.53-2.74 4.7-5.56 2.32z'/></svg>";
const FW_WARNING = "<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'><path d='M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'/></svg>";
function renderPackage() {
  const p = app.pkg;
  if (!p) { $("pkgBox").innerHTML = "<p class='muted'>No package loaded.</p>"; return; }
  let h = "";
  const known = findKnownPackage(app.fileHash);
  // What the package is, by its hash: the official firmware (green, shield), Supernova (purple, flame), another listed package, or unknown (orange).
  const type = !app.fileHash ? p.header && p.header.Type
    : known && known.official ? { html: "<b class='ok'>" + FW_SHIELD + "Official firmware</b>, unmodified." }
    : known && known.supernova ? { html: "<b class='cfw-note'>" + FW_FLAME + "Supernova</b>, unmodified." }
    : known ? "Known package, " + (known.label || known.name) + ", unmodified."
    : { html: "<b class='warn'>Unknown</b>" };
  if (p.header) {
    const rows = [["Version", p.version], ["Type", type], ["Image size", p.image ? p.image.length + " bytes" : p.header.bin_len],
      ["Version inside the image", p.embeddedVersion], ["Image 8-bit sum", p.sum8 === undefined ? "" : "0x" + p.sum8.toString(16).toUpperCase().padStart(2, "0")],
      ["File SHA-256", app.fileHash || "(not available in this context)"]];
    h += "<table class='kv'>" + rows.filter(r => r[1] !== undefined && r[1] !== "").map(r => "<tr><td>" + r[0] + "</td><td class='mono'>" + (r[1].html || esc(r[1])) + "</td></tr>").join("") + "</table>";
  }
  if (isOldSupernova(known)) h += "<p class='fw-outdated'>" + FW_WARNING + "This is an official version of Supernova, but not the latest one. You can still flash it.</p>";
  if (!known && p.header && !p.errors.length) h += "<p class='warn'>The SHA-256 hash doesn't match the official 2.8 firmware. This is fine if you are flashing a custom firmware.</p>";
  if (p.errors.length) h += "<ul class='bad'>" + p.errors.map(e => "<li>" + esc(e) + "</li>").join("") + "</ul>";
  if (p.warnings.length) h += "<ul class='warn'>" + p.warnings.map(e => "<li>" + esc(e) + "</li>").join("") + "</ul>";
  if (!p.errors.length) h = "<p class='ok'>Package accepted by the same checks as the official tool.</p>" + h;
  $("pkgBox").innerHTML = h;
}
async function onFile() {
  const f = $("file").files[0]; app.pkg = null; app.fileHash = null;
  if (f) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    app.fileHash = await sha256Hex(bytes);
    app.pkg = parsePackage(bytes);
    log("package " + f.name + ": " + (app.pkg.errors.length ? "rejected" : "ok (" + app.pkg.version + ")"));
  }
  renderPackage(); updateButtons();
}
$("btnFlash").onclick = doFlash; $("file").onchange = onFile; $("confirm").onchange = updateButtons;

