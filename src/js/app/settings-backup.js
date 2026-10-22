// ------------------------------------------------------------------------------------------------
// Settings backup card of the Config page (Supernova only)
// ------------------------------------------------------------------------------------------------
async function exportSettings() {
  await runOp("Reading the settings", async c => {
    const block = await readSettingsBlock(c.api);
    const d = new Date(), p = n => String(n).padStart(2, "0");
    saveBlob("supernova-settings-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".snvset",
      new Blob([settingsFile(block)], { type: "application/octet-stream" }));
    toast("Settings exported", "ok");
  });
}

async function importSettings() {
  const f = $("setImportFile").files[0]; $("setImportFile").value = "";
  if (!f) return;
  let block;
  try { block = parseSettingsFile(new Uint8Array(await f.arrayBuffer())); }
  catch (e) { log("ERROR: " + e.message); toast(e.message, "bad"); return; }
  if (!confirm("Import the settings of " + f.name + "?" + NL + NL + "They replace ALL the settings of the device: thresholds, key maps, USB mode, brightness, delay and touch tuning." + NL + "The device restarts afterwards.")) return;
  const done = await runOp("Importing the settings", async c => {
    await writeSettingsBlock(c.api, block);
    log("settings imported, restarting the device");
    app.wasFlashed = !c.demo;          // makes the page say that the device is restarting and offer Reconnect
    toast("Settings imported. The device is restarting.", "ok");
    await c.api.saveAndReset();
  });
  if (done === false) app.wasFlashed = false;
}

$("btnSetExport").onclick = exportSettings;
$("btnSetImport").onclick = () => $("setImportFile").click();
$("setImportFile").onchange = importSettings;
