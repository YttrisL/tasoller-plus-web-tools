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

function renderPackage() {
  const p = app.pkg;
  if (!p) { $("pkgBox").innerHTML = "<p class='muted'>No package loaded.</p>"; return; }
  let h = "";
  if (p.header) {
    const rows = [["Version", p.version], ["Type", p.header.Type], ["Image size", p.image ? p.image.length + " bytes" : p.header.bin_len],
      ["Version inside the image", p.embeddedVersion], ["Image 8-bit sum", p.sum8 === undefined ? "" : "0x" + p.sum8.toString(16).toUpperCase().padStart(2, "0")],
      ["File SHA-256", app.fileHash || "(not available in this context)"]];
    h += "<table class='kv'>" + rows.filter(r => r[1] !== undefined && r[1] !== "").map(r => "<tr><td>" + r[0] + "</td><td class='mono'>" + esc(r[1]) + "</td></tr>").join("") + "</table>";
  }
  const known = findKnownPackage(app.fileHash);
  if (known && known.official) h += "<p class='ok'>This is the official stock package " + esc(known.name) + ", unmodified.</p>";
  else if (known) h += "<p class='ok'>This is a known package: " + esc(known.name) + ".</p>";
  else if (p.header && !p.errors.length) h += "<p class='warn'>The SHA-256 hash doesn't match the official 2.8 firmware. This is fine if you are flashing a custom firmware.</p>";
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

