// ------------------------------------------------------------------------------------------------
// Dump page (Supernova only)
// ------------------------------------------------------------------------------------------------
app.dump = null; app.dumping = false; app.dumpAbort = false;
const dumpAvailable = () => { const c = app.conn; return !!(c && c.cfw && !c.update); };

function setDumpProgress(done, total, text) { $("dumpBar").value = total ? Math.min(100, (100 * done) / total) : 0; $("dumpProgress").textContent = text || String.fromCharCode(160); }

const DL_ICON = "<svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'><path d='M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z'/></svg>";
function renderDump() {
  const r = app.dump, idle = dumpAvailable() && !app.busy && !app.flashing;
  if (!r) { $("dumpResult").innerHTML = "<p class='muted'>" + (app.dumpListing ? "Reading the list of the sections..." : dumpAvailable() ? "The list of the sections is not available." : "Connect a device with the Supernova firmware to see the sections.") + "</p>"; return; }
  const hide = $("dumpHideUid").checked;
  const rows = r.sections.map(s => {
    const expected = s.name === "KPROM";    // the chip always refuses the key store
    const status = !s.data ? "<span class='muted'>not dumped</span>" : s.verified ? "<span class='ok'>read</span>" : "<span class='" + (expected ? "ok" : "warn") + " hint' title='" + (expected ? "The chip always refuses the key protection store (KPROM): that is normal." : "The chip refused to give some of this section.") + "'>refused by the chip <i>i</i></span>";
    const name = esc(s.name), file = esc(s.name.toLowerCase()) + ".bin";
    return "<tr><td>" + name + "</td><td class='mono'>0x" + hex8(s.addr) + "</td><td>" + s.length + " bytes</td><td>" + status + "</td><td class='mono'>" + (s.data ? hex8(s.crc32).toLowerCase() : "-") + "</td>" +
      "<td class='acts'><button class='btn plain dump-one' data-read='" + name + "'" + (idle ? "" : " disabled") + " title='Dump only " + name + "'>Dump</button>" +
      "<button class='btn plain dl' data-section='" + name + "'" + (s.data ? "" : " disabled") + " title='Download " + file + "' aria-label='Download " + file + "'>" + DL_ICON + "</button></td></tr>";
  }).join("");
  let h = "<table class='kv dump-sections'><tr><th>Section</th><th>Address</th><th>Size</th><th>Status</th><th>CRC-32</th><th></th></tr>" + rows + "</table>";
  h += "<p class='muted dump-info-title'>Chip information, read from the device when this tab opened. It is also saved as <code>info.txt</code> in the zip.</p>";
  h += "<div class='box dump-info mono'>" + dumpInfoLines(r, hide).map(esc).join("<br>") + "</div>";
  $("dumpResult").innerHTML = h;
}

// The list of the sections (without data), as soon as the page is shown for a Supernova device.
async function loadDumpList() {
  const c = app.conn;
  if (!dumpAvailable() || app.dump || app.dumpListing || app.busy) return;
  app.dumpListing = true; renderDump();
  try {
    const list = await dumpList(c.api);
    if (app.conn === c && !app.dump) app.dump = { version: c.version, hello: list.hello, info: list.info, sections: list.sections, bytes: 0 };
  } catch (e) {
    const old = /reported an error/.test(e.message) && /dump (hello|section|info)/.test(e.message);
    const msg = old ? "this firmware does not have the dump feature: update Supernova" : e.message;
    log("dump list: " + msg); $("dumpProgress").textContent = "Error: " + msg;
  } finally { app.dumpListing = false; renderDump(); updateDump(); }
}

function updateDump() {
  const c = app.conn, ok = dumpAvailable(), idle = ok && !app.busy && !app.flashing;
  $("dpDev").textContent = c ? (c.demo ? "Simulated Tasoller Plus" : (c.cmdDev.productName || "Tasoller Plus")) : "not connected"; $("dpDev").className = c ? "ok" : "muted";
  $("dpVer").textContent = c ? (c.version || "(empty)") : "-"; $("dpVer").className = ok ? "ok" : "muted";
  $("dpHint").textContent = !c ? "Use Connect in the top bar." : c.update ? "The device is in update mode: restart it normally to dump it." : !c.cfw ? "This is not the Supernova firmware: it cannot be dumped from here." : "";
  $("btnDump").disabled = !idle; $("btnDumpAbort").disabled = !app.dumping; $("dumpHideUid").disabled = app.dumping;
  $("btnDumpZip").disabled = !app.dump || !app.dump.sections.some(x => x.data) || app.dumping;
  if (app.page === "dump" && !ok) showPage("test");
  if (app.page === "dump" && ok) loadDumpList();
  renderDump();
}

async function doDump() {
  const c = app.conn; if (!dumpAvailable() || app.dumping) return;
  app.dumping = true; app.dumpAbort = false; app.busy++; updateButtons();
  await stopStream();
  const t0 = performance.now();
  setDumpProgress(0, 0, "Reading the device...");
  try {
    const result = await runDump(c.api, {
      version: c.version, log,
      shouldAbort: () => app.dumpAbort,
      onProgress: (done, total, name) => setDumpProgress(done, total, name ? "Reading " + name + ": " + done + " of " + total + " bytes" : "Done"),
    });
    app.dump = result;
    const s = ((performance.now() - t0) / 1000).toFixed(1);
    log("dump finished in " + s + " s");
    setDumpProgress(100, 100, "Done in " + s + " s: " + result.bytes + " bytes in " + result.sections.length + " sections.");
    toast("Dump finished", "ok");
  } catch (e) {
    if (e instanceof DumpAborted) { setDumpProgress(0, 0, "Aborted."); log("dump aborted"); }
    else {
      const old = /reported an error/.test(e.message) && /dump (hello|section|info)/.test(e.message);
      const msg = old ? "this firmware does not have the dump feature: update Supernova" : e.message;
      log("ERROR: " + msg); setDumpProgress(0, 0, "Error: " + msg); toast("Dump failed: " + msg, "bad");
    }
  } finally { app.dumping = false; app.busy--; updateButtons(); updateStream(); renderDump(); }
}

// Only one section: read it and keep it with the others that were read.
async function dumpOne(name) {
  const c = app.conn; if (!dumpAvailable() || app.dumping || !app.dump) return;
  const s = app.dump.sections.find(x => x.name === name); if (!s) return;
  app.dumping = true; app.dumpAbort = false; app.busy++; updateButtons();
  await stopStream();
  const t0 = performance.now();
  setDumpProgress(0, 0, "Reading " + s.name + "...");
  try {
    await dumpSectionRead(c.api, s, {
      log, shouldAbort: () => app.dumpAbort,
      onProgress: (done, total, n) => setDumpProgress(done, total, "Reading " + n + ": " + done + " of " + total + " bytes"),
    });
    app.dump.bytes = app.dump.sections.reduce((n, x) => n + (x.data ? x.length : 0), 0);
    setDumpProgress(100, 100, s.name + " done in " + ((performance.now() - t0) / 1000).toFixed(1) + " s: " + s.length + " bytes.");
    toast(s.name + " dumped", "ok");
  } catch (e) {
    if (e instanceof DumpAborted) { setDumpProgress(0, 0, "Aborted."); log("dump aborted"); }
    else { log("ERROR: " + e.message); setDumpProgress(0, 0, "Error: " + e.message); toast("Dump failed: " + e.message, "bad"); }
  } finally { app.dumping = false; app.busy--; updateButtons(); updateStream(); renderDump(); }
}

function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function downloadDump() {
  const r = app.dump; if (!r) return;
  const d = new Date(), p = n => String(n).padStart(2, "0");
  saveBlob("ss321-dump-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".zip", dumpZip(r, $("dumpHideUid").checked));
}
$("dumpResult").addEventListener("click", e => {
  const one = e.target.closest("button[data-read]");
  if (one) { dumpOne(one.dataset.read); return; }
  const b = e.target.closest("button[data-section]"), s = b && app.dump && app.dump.sections.find(x => x.name === b.dataset.section);
  if (s) saveBlob(s.name.toLowerCase() + ".bin", new Blob([s.data], { type: "application/octet-stream" }));
});

$("btnDump").onclick = doDump; $("btnDumpAbort").onclick = () => { app.dumpAbort = true; };
$("btnDumpZip").onclick = downloadDump; $("dumpHideUid").onchange = renderDump;
