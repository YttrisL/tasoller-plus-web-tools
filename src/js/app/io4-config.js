// ------------------------------------------------------------------------------------------------
// IO4 mode config (Supernova): the LED mode of the IO4-Emulation mode. "LED driver emulation" is what the device does by default, the game
// lights the air towers through two LED boards on two more COM ports. "Static light" removes the boards (and their COM ports) and lights the
// air towers with one color kept by the device; the setup tool then lights the LEDs through a WinUSB interface of the device.
// ------------------------------------------------------------------------------------------------
const io4cfg = { conn: null, pendingStatic: false, rgb: [255, 255, 255], live: null };

const io4cfgAvailable = () => !!(isCfw() && isIo4() && app.conn.io4Led && !app.conn.update);

function io4cfgHsv(c) {                          // the pickers' hue, saturation and brightness that give the color c
  const mx = Math.max(...c);
  if (mx === 0) return { hue: Number($("io4Hue").value), sat: 0, bright: 0 };
  const [r, g, b] = c.map(x => x / 255), top = mx / 255, d = top - Math.min(r, g, b);
  let h = 0;
  if (d > 0) { h = top === r ? ((g - b) / d) % 6 : top === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(((h * 60) + 360) % 360); }
  else h = Number($("io4Hue").value);               // a gray has no hue: keep the one the picker has
  return { hue: h, sat: Math.round(d / top * 100), bright: Math.round(top * 100) };
}

// ---- The function buttons: each sends any number of signals of the I/O board
const io4fn = { conn: null, sel: [[IO4_SIGNAL_TEST], [IO4_SIGNAL_SERVICE], []] };
const io4fnIds = ["io4Fn1", "io4Fn2", "io4FnBoth"];
for (const [i, id] of io4fnIds.entries()) {
  const list = $(id).querySelector(".multi-list"), add = ([code, name]) => {
    const label = document.createElement("label"), box = document.createElement("input"), text = document.createElement("span");
    box.type = "checkbox"; box.value = code; text.textContent = name;
    if (code === IO4_SIGNAL_COIN) label.title = "Adds one credit each time the button is pressed";
    if (IO4_AIR_BEAM_SIGNALS[code]) label.title = "The button interrupts this air beam while it is pressed";
    box.addEventListener("change", () => {
      const set = new Set(io4fn.sel[i]); if (box.checked) set.add(code); else set.delete(code);
      io4fn.sel[i] = [...set].sort((x, y) => x - y); io4fnRender();
    });
    label.appendChild(box); label.appendChild(text); list.appendChild(label);
  };
  IO4_SIGNALS.forEach(add);
  const group = document.createElement("div"); group.className = "multi-group"; group.textContent = "Unused"; list.appendChild(group);
  IO4_SIGNALS_UNUSED.forEach(add);
}
document.addEventListener("click", e => { for (const id of io4fnIds) if (!$(id).contains(e.target)) $(id).open = false; });      // a list closes when the click is elsewhere
function io4fnRender() {
  const c = app.conn, ok = io4cfgAvailable(), known = ok && !!c.io4Fn;
  $("io4fnBox").hidden = !ok;
  $("io4fnOld").hidden = !ok || known;                  // an older Supernova does not have the setting: the block stays, but cannot be used
  if (!ok) { io4fn.conn = null; return; }
  const saved = known ? c.io4Fn : [[IO4_SIGNAL_TEST], [IO4_SIGNAL_SERVICE], []];
  if (io4fn.conn !== c) io4fn.conn = c, io4fn.sel = saved.map(l => l.slice());
  const idle = !app.busy && !app.flashing && known;
  io4fnIds.forEach((id, i) => {
    $(id).querySelector("summary").textContent = io4SignalsText(io4fn.sel[i]);
    for (const box of $(id).querySelectorAll("input")) { box.checked = io4fn.sel[i].includes(Number(box.value)); box.disabled = !idle; }
  });
  $("btnIo4Fn").disabled = !idle || JSON.stringify(io4fn.sel) === JSON.stringify(saved);
}
$("btnIo4Fn").onclick = async () => {
  const lists = io4fn.sel.map(l => l.slice());
  await runOp("Saving the function buttons", async c => {
    await c.api.setIo4Buttons(lists, true);
    c.io4Fn = lists;
    toast("Function buttons saved", "ok");
  });
  renderFnLabels(); io4fnRender();
};

function io4cfgRender() {
  io4fnRender();
  const c = app.conn, ok = io4cfgAvailable();
  $("io4cfgOff").hidden = ok || !isCfw();
  $("io4cfgBox").hidden = !ok; $("segatoolsBox").hidden = !ok;
  if (!ok) { io4cfg.conn = null; return; }
  if (io4cfg.conn !== c) {                       // a new connection: start from what the device says
    io4cfg.conn = c; io4cfg.pendingStatic = c.io4Led.static; io4cfg.rgb = c.io4Led.rgb.slice();
    const hsv = io4cfgHsv(io4cfg.rgb);
    $("io4Hue").value = hsv.hue; $("io4Sat").value = hsv.sat; $("io4Bright").value = hsv.bright; $("io4LedMode").checked = !io4cfg.pendingStatic;
  }
  const cur = c.io4Led.static, pending = io4cfg.pendingStatic, idle = !app.busy && !app.flashing;
  const colorChanged = pending && cur && io4cfg.rgb.join() !== c.io4Led.rgb.join();          // the color is shown on the towers, Apply keeps it
  $("io4LedName").textContent = pending ? "Static light" : "LED driver emulation";
  $("io4LedCur").textContent = pending !== cur ? "(not applied)" : colorChanged ? "(color not saved)" : "(current)";
  $("io4StaticBox").hidden = !pending;
  $("io4LblStatic").classList.toggle("on", pending); $("io4LblEmu").classList.toggle("on", !pending);
  $("io4LedMode").disabled = !idle; $("io4Hue").disabled = !idle; $("io4Sat").disabled = !idle; $("io4Bright").disabled = !idle;
  $("btnIo4Led").disabled = !idle || (pending === cur && !colorChanged);
  io4cfgIni(pending);
  $("io4Swatch").style.setProperty("--led-pick", ledHex(io4cfg.rgb)); $("io4SatVal").textContent = $("io4Sat").value; $("io4BrightVal").textContent = $("io4Bright").value;
}

// The blocks of segatools.ini for the LED mode the switch shows. The device is the I/O board and the slider, so segatools emulates neither. The
// LED boards are the device's too with the LED driver emulation; with the static light it has none, so segatools emulates them.
function io4cfgIni(isStatic) {
  $("segatoolsIni").textContent = ["[io4]", "enable=0", "", "[slider]", "enable=0", "", "[led15093]", "enable=" + (isStatic ? 1 : 0)].join("\n");
  $("segatoolsWhy").textContent = isStatic
    ? "The device has no LED boards in the static light: segatools emulates them, so [led15093] is enabled. The I/O board and the slider are the device's. The slider port has to be COM1."
    : "The device is the I/O board, the slider and the two LED boards: segatools emulates none of them.";
  $("segatoolsPorts").hidden = isStatic;                // the COM numbers matter when the device has the LED boards
}
async function io4cfgCopyIni() {
  try { await navigator.clipboard.writeText($("segatoolsIni").textContent); toast("Copied", "ok"); }
  catch (e) { toast("Could not copy: select the text and copy it", "bad"); }
}

function io4cfgColor() {
  const c = app.conn; if (!io4cfgAvailable()) return;
  io4cfg.rgb = ledHsv(Number($("io4Hue").value), Number($("io4Sat").value) / 100, Number($("io4Bright").value) / 100);
  io4cfgRender();
  if (!c.io4Led.static) return;                   // the device is not in the static light yet: the color goes with the switch
  clearTimeout(io4cfg.live);
  io4cfg.live = setTimeout(() => c.api.setIo4LedConfig(true, io4cfg.rgb, false).catch(e => log("static light: " + e.message)), 120);      // shown at once, kept with Apply
}

async function io4cfgApply() {
  if (!io4cfgAvailable()) return;
  const toStatic = io4cfg.pendingStatic, c0 = app.conn;
  if (toStatic === c0.io4Led.static) {            // only the color: it is kept, the device does not restart
    await runOp("Saving the color", async c => {
      clearTimeout(io4cfg.live);
      await c.api.setIo4LedConfig(true, io4cfg.rgb, true);
      c.io4Led.rgb = io4cfg.rgb.slice();
      toast("Color saved", "ok");
    });
    io4cfgRender();
    return;
  }
  if (!confirm("Switch to " + (toStatic ? "the static light" : "the LED driver emulation") + "?" + NL + NL + (toStatic
    ? "The device restarts without the two LED boards: their COM ports go away, and the air towers show the color you picked."
    : "The device restarts with the two LED boards: two more COM ports appear, which the game needs to find on the right numbers."))) return;
  clearTimeout(io4cfg.live);
  const done = await runOp("Changing the LED mode", async c => {
    await c.api.setIo4LedConfig(toStatic, io4cfg.rgb, true);
    app.wasFlashed = !c.demo;                     // makes the page say that the device is restarting and offer Reconnect
    toast("LED mode saved. The device is restarting.", "ok");
    await c.api.saveAndReset();
  });
  if (done === false) app.wasFlashed = false;
}

$("io4LedMode").addEventListener("change", () => { io4cfg.pendingStatic = !$("io4LedMode").checked; io4cfgRender(); });         // checked: LED driver emulation
$("io4Hue").addEventListener("input", io4cfgColor); $("io4Sat").addEventListener("input", io4cfgColor); $("io4Bright").addEventListener("input", io4cfgColor);
$("btnIo4Led").onclick = io4cfgApply;
$("btnCopyIni").onclick = io4cfgCopyIni;
