// ------------------------------------------------------------------------------------------------
// LED test: drawing of the device, a color picker, and WebUSB output to the LED endpoint
// ------------------------------------------------------------------------------------------------
// Zones: 0..30 slider LEDs (0 is the rightmost pad, then a divider, alternating), 31..33 left tower, 34..36 right tower.
// With the Supernova firmware each tower LED can also be set on its own: zones 37..84, 37 + tower * 24 + LED counted from the bottom.
const LED_ZONES = 37, LED_ALL_ZONES = LED_ZONES + 2 * LED_TOWER_LEDS;
const led = { dev: null, timer: null, busy: false, rgb: [0, 0, 0], packets: 0, colors: Array.from({ length: LED_ALL_ZONES }, () => [0, 0, 0]), sel: new Set(), els: [], ind: false, last: null };
const ledVisible = z => z < 31 || (led.ind ? z >= LED_ZONES : z < LED_ZONES);
const ledHsv = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)].map(x => Math.round(x * 255)); };
const ledHex = a => "#" + a.map(x => x.toString(16).padStart(2, "0")).join("");
function ledZoneName(z) { if (z >= LED_ZONES) { const t = Math.floor((z - LED_ZONES) / LED_TOWER_LEDS); return (t ? "Right" : "Left") + " tower LED " + ((z - LED_ZONES) % LED_TOWER_LEDS + 1) + " (counted from the bottom)"; } return z < 31 ? (z % 2 ? "Divider " + ((z + 1) / 2) : "Pad " + (z / 2 + 1)) + " (counted from the right)" : (z < 34 ? "Left tower group " + (z - 30) : "Right tower group " + (z - 33)) + " (8 LEDs, one color)"; }
function ledRenderZone(z) {
  const e = led.els[z], c = led.colors[z], on = c[0] + c[1] + c[2] > 0, mx = Math.max(c[0], c[1], c[2]) / 255;
  e.style.setProperty("--led", on ? "rgb(" + c.join(",") + ")" : "#222");
  e.style.setProperty("--glow", on ? Math.round(4 + 10 * mx) + "px" : "0px");
  e.classList.toggle("sel", led.sel.has(z));
}
function ledRenderCount() {
  ledRenderBars();
  $("ledTowerL").classList.toggle("sel", ledWhole() && ledTowerZones(0).every(z => led.sel.has(z)));      // a border that is lit: all of it is selected
  $("ledTowerR").classList.toggle("sel", ledWhole() && ledTowerZones(1).every(z => led.sel.has(z)));
  $("ledStrip").classList.toggle("sel", ledWhole() && LED_SLIDER_ZONES.every(z => led.sel.has(z)));
  const n = led.sel.size;
  const total = led.ind ? 31 + 2 * LED_TOWER_LEDS : LED_ZONES, unit = led.ind ? "LEDs" : "zones";
  $("ledCount").textContent = n ? n + " of " + total + " " + unit + " selected. The color sliders change the selected " + unit + "." : "Click a " + (led.ind ? "LED" : "zone") + " to select it, click it again to deselect it. Several can be selected at once." + (led.ind ? " Shift-click selects a range of tower LEDs, the bar beside a group of 8 selects the whole group." : "") + " Click the border of a tower or of the slider to select all of it.";
}
// Sliders -> color; the sliders show the color of a single selected zone
function ledPicked() { const h = Number($("ledHue").value), b = Number($("ledBright").value) / 100; return ledHsv(h, 1, b); }
function ledUpdatePicker() {
  const shown = ledPicked(); led.rgb = shown;
  $("ledSwatch").style.setProperty("--led-pick", ledHex(shown)); $("ledHex").textContent = ledHex(shown); $("ledBrightVal").textContent = $("ledBright").value;
}
// The frame of a tower or of the slider selects all of it (or deselects it when it all is selected).
function ledToggleMany(zones) {
  const on = !zones.every(z => led.sel.has(z));
  for (const z of zones) { if (on) led.sel.add(z); else led.sel.delete(z); ledRenderZone(z); }
  led.last = zones[0]; ledRenderCount();
}
const ledWhole = () => true;            // the border of a tower or of the slider selects all of it, in every mode
const LED_FRAME_RING = 14;                                           // how far from its edge the border of a tower or of the slider reaches (px)
const LED_SLIDER_ZONES = Array.from({ length: 31 }, (_, z) => z);
const ledTowerZones = t => led.ind ? Array.from({ length: LED_TOWER_LEDS }, (_, n) => LED_ZONES + t * LED_TOWER_LEDS + n) : [31 + 3 * t, 32 + 3 * t, 33 + 3 * t];
function ledToggleTower(t) {
  ledToggleMany(ledTowerZones(t));
}
function ledToggle(z, range) {
  if (range && z >= LED_ZONES && led.last !== null && led.last >= LED_ZONES && Math.floor((led.last - LED_ZONES) / LED_TOWER_LEDS) === Math.floor((z - LED_ZONES) / LED_TOWER_LEDS)) {
    const on = !led.sel.has(z);     // a range follows what the clicked LED becomes
    for (let k = Math.min(led.last, z); k <= Math.max(led.last, z); k++) { if (on) led.sel.add(k); else led.sel.delete(k); ledRenderZone(k); }
  } else {
    if (led.sel.has(z)) led.sel.delete(z); else led.sel.add(z);
    ledRenderZone(z);
  }
  led.last = z; ledRenderCount();
  if (led.sel.size === 1) {          // show the color of that zone on the sliders
    const c = led.colors[[...led.sel][0]], mx = Math.max(...c);
    if (mx > 0) {
      const [r, g, b] = c.map(x => x / 255), mn = Math.min(r, g, b), d = mx / 255 - mn; let h = 0;
      if (d > 0) { const m = mx / 255; h = m === r ? ((g - b) / d) % 6 : m === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(((h * 60) + 360) % 360); }
      $("ledHue").value = h; $("ledBright").value = Math.round(mx / 255 * 100); ledUpdatePicker();
    }
  }
}
// The bar beside a group of eight: select its LEDs, or deselect them when all are selected.
function ledGroupZones(t, g) { return Array.from({ length: 8 }, (_, n) => LED_ZONES + t * LED_TOWER_LEDS + g * 8 + n); }
function ledRenderBars() { document.querySelectorAll(".led-bar").forEach(b => { const t = Math.floor(b.dataset.group / 3), g = b.dataset.group % 3; b.classList.toggle("sel", ledGroupZones(t, g).every(z => led.sel.has(z))); }); }
function ledToggleGroup(t, g) {
  const zones = ledGroupZones(t, g), all = zones.every(z => led.sel.has(z));
  for (const z of zones) { if (all) led.sel.delete(z); else led.sel.add(z); ledRenderZone(z); }
  led.last = zones[7]; ledRenderCount();
}
function ledSelect(all) { for (let z = 0; z < LED_ALL_ZONES; z++) { if (all && ledVisible(z)) led.sel.add(z); else led.sel.delete(z); ledRenderZone(z); } ledRenderCount(); }
function ledApplyPicker() {
  ledUpdatePicker();
  for (const z of led.sel) { led.colors[z] = led.rgb.slice(); ledRenderZone(z); }
}
(function ledTest() {
  const strip = $("ledStrip");
  const mk = (tag, z) => { const e = document.createElement(tag); e.className = (tag === "span" ? (z % 2 ? "div" : "pad") + " " : "") + "led-zone"; e.title = ledZoneName(z); e.dataset.z = z; e.onclick = ev => { ev.stopPropagation(); ledToggle(z, ev.shiftKey); }; led.els[z] = e; return e; };
  for (let pos = 0; pos < 31; pos++) strip.appendChild(mk("span", 30 - pos));   // left to right on screen
  const mkGroup = z => { const e = mk("div", z); e.classList.add("led-group"); for (let i = 0; i < 8; i++) e.appendChild(document.createElement("b")); return e; };
  for (const [id, first] of [["ledTowerL", 31], ["ledTowerR", 34]]) { const label = $(id).firstChild; for (let k = 2; k >= 0; k--) $(id).insertBefore(mkGroup(first + k), label); }   // group 1 is the bottom one
  for (let t = 0; t < 2; t++) {         // the individual LEDs of a tower: three groups of eight, the top one first
    const lines = document.createElement("div"), tower = $(t ? "ledTowerR" : "ledTowerL"); lines.className = "led-lines";
    for (let g = 2; g >= 0; g--) {
      const sub = document.createElement("div"), col = document.createElement("div"), bar = document.createElement("i");
      sub.className = "led-sub"; col.className = "col"; bar.className = "led-bar"; bar.dataset.group = t * 3 + g;
      bar.title = "Select the 8 LEDs of this group (a zone of the official LED packet)"; bar.onclick = () => ledToggleGroup(t, g);
      for (let n = 7; n >= 0; n--) col.appendChild(mk("b", LED_ZONES + t * LED_TOWER_LEDS + g * 8 + n));
      sub.appendChild(col); sub.appendChild(bar); lines.appendChild(sub);
    }
    tower.insertBefore(lines, tower.lastChild);
  }
  // The border of a tower or of the slider selects all of it. Only the border: what is inside it is made of zones that are clicked one by one.
  const frame = (el, action) => {
    const near = ev => { const r = el.getBoundingClientRect(); return Math.min(ev.clientX - r.left, r.right - ev.clientX, ev.clientY - r.top, r.bottom - ev.clientY) <= LED_FRAME_RING; };
    const onBorder = ev => ledWhole() && (ev.target === el || ev.target.classList.contains("led-label")) && near(ev);
    el.addEventListener("mousemove", ev => el.classList.toggle("edge", onBorder(ev)));
    el.addEventListener("mouseleave", () => el.classList.remove("edge"));
    el.addEventListener("click", ev => { if (onBorder(ev)) action(); });
  };
  frame($("ledTowerL"), () => ledToggleTower(0));
  frame($("ledTowerR"), () => ledToggleTower(1));
  frame($("ledStrip"), () => ledToggleMany(LED_SLIDER_ZONES));
  $("ledHue").addEventListener("input", ledApplyPicker); $("ledBright").addEventListener("input", ledApplyPicker);
  $("ledSelAll").onclick = () => ledSelect(true); $("ledSelNone").onclick = () => ledSelect(false);
  $("ledOff").onclick = () => { for (let z = 0; z < LED_ALL_ZONES; z++) { led.colors[z] = [0, 0, 0]; ledRenderZone(z); } };
  for (let z = 0; z < LED_ALL_ZONES; z++) ledRenderZone(z);
  ledUpdatePicker(); ledSelect(true);
})();

// Supernova: each tower LED on its own, always, as soon as the device is connected in the top bar and its firmware says it knows the
// extended LED packet (an older Supernova or the official firmware would take it for garbage). Without it the three groups stay.
function ledSetIndividual(on) {
  const all = Array.from({ length: LED_ALL_ZONES }, (_, z) => z).filter(ledVisible).every(z => led.sel.has(z));
  led.ind = on && ledIndividualAvailable();
  $("ledDevice").classList.toggle("ind", led.ind);
  for (const z of [...led.sel]) if (!ledVisible(z)) { led.sel.delete(z); ledRenderZone(z); }
  if (led.ind) for (let t = 0; t < 2; t++) for (let n = 0; n < LED_TOWER_LEDS; n++) { led.colors[LED_ZONES + t * LED_TOWER_LEDS + n] = led.colors[31 + 3 * t + Math.floor(n / 8)].slice(); ledRenderZone(LED_ZONES + t * LED_TOWER_LEDS + n); }   // start from the group colors
  if (all) ledSelect(true); else ledRenderCount();
}
const ledIndividualAvailable = () => !!(app.conn && app.conn.cfw && !app.conn.update && app.conn.ledExt);
async function updateLedExt() {
  const c = app.conn;
  if (c && c.cfw && !c.update && c.ledExt === undefined) {
    c.ledExt = null;                    // asking
    try { c.ledExt = (await c.api.ledExtInfo()).protocol === LED_EXT_VERSION; }
    catch (e) { c.ledExt = false; log("individual LEDs: " + e.message); }
    if (app.conn !== c) return;
  }
  const ok = ledIndividualAvailable();
  if (isIo4()) $("ledNote").innerHTML = ledNoteIo4; else $("ledNote").textContent = ledNoteUsb;
  $("ledNote").classList.toggle("cfw-banner", isIo4());
  if (isIo4()) {
    $("ledConnect").disabled = !serialAvailable() || !!(c && c.update);
    $("ledIndNote").innerHTML = "<b class='cfw-note'>IO4-Emulation mode:</b> The game sends three static color signals for each of the two air towers (SIDE DEVICE LED L and R), one for each group of eight LEDs.";
    if (led.ind) ledSetIndividual(false);
    return;
  }
  $("ledIndNote").innerHTML = ok ? "<b class='cfw-note'>Supernova:</b> allows you to test every LED independently. The official firmware only allows you to light up groups." : c && c.cfw && c.ledExt === false ? "<b class='cfw-note'>Supernova:</b> this firmware cannot set the tower LEDs one by one yet, update it." : "";
  if (ok !== led.ind) ledSetIndividual(ok);
 
}
const ledNoteUsb = $("ledNote").textContent;
const ledNoteIo4 = "<b class='cfw-note'>IO4-Emulation mode:</b> the slider LEDs are sent on the slider serial port (Web Serial) and the colors of the two air towers on the command channel. Close the game first.";

// The output of the IO4-Emulation mode: it takes the official LED packet the page makes and sends the slider and the tower colors.
class Io4LedOut {
  constructor(port, c) { this.io4 = true; this.port = port; this.c = c; this.writer = port.writable.getWriter(); this.towers = ["", ""]; }
  async transferOut(endpoint, p) {
    await this.writer.write(buildSliderLedFrame(p));
    for (let t = 0; t < 2; t++) {                               // the three groups of each tower, as the packet has them
      const colors = Array.from(p.subarray(96 + 9 * t, 105 + 9 * t));
      if (colors.join() !== this.towers[t]) { this.towers[t] = colors.join(); await this.c.api.ledTowers(t, colors); }
    }
    return { status: "ok", bytesWritten: p.length };
  }
  async close() { try { this.writer.releaseLock(); } catch (e) {} try { await this.port.close(); } catch (e) {} }
}
async function ledConnectIo4() {
  const c = app.conn;
  if (!serialAvailable()) { ledStatus("This browser has no Web Serial. Use Chrome or Edge.", true); return; }
  let port = c.serialPort;
  if (!port) {                                              // the three serial ports have to be allowed first
    let r = await io4EnsureSliderPort(false);
    if (!r.port) r = await io4EnsureSliderPort(true);
    c.serialCount = r.count;
    if (!r.port) { ledStatus(r.error, r.count >= IO4_SERIAL_PORTS); updateStream(); return; }
    port = r.port;
  }
  c.serialPort = port;
  if (app.streaming) await stopStream();                   // the Input test has the port
  try { await port.open({ baudRate: 115200 }); }
  catch (e) { led.failed = true; ledStatus("Could not open the slider port (" + e.message + "). Close the game, it uses that port.", true); log("LED output: " + e.message); ledButtons(); return; }
  led.failed = false;
  led.dev = new Io4LedOut(port, c);
  log("LED output opened (slider serial port)");
  ledStatus("LED output: ready"); ledButtons(); updateLedExt(); ledOpened();
}

// The LED page opens the output of the IO4-Emulation mode by itself: the permissions were given on the welcome page.
async function ledAutoConnect() {
  if (!app.conn || led.dev || led.connecting) return;
  if (isIo4()) {
    if (!app.conn.serialPort) return;
    led.connecting = true; led.failed = false; ledButtons(); ledStatus("LED output: connecting...");
    ledConnectIo4().finally(() => { led.connecting = false; ledButtons(); });
    return;
  }
  if (!navigator.usb) return;                                   // the device in WINUSB mode, allowed on an earlier visit: no click needed
  led.connecting = true;
  try {
    const dev = (await navigator.usb.getDevices()).find(d => d.vendorId === VID && d.productId === 0x1231);
    led.granted = !!dev;
    if (dev && app.page === "led" && !led.dev) { ledStatus("LED output: connecting..."); ledButtons(); led.failed = false; await ledOpenUsb(dev); }
  } catch (e) { log("LED output: " + e.message); }
  led.connecting = false; ledButtons();
}
// The output sends while the LED page is shown and stops when the user leaves it.
function ledOpened() { if (app.page === "led") ledStart(); else if (led.dev && led.dev.io4) ledDisconnect(); }
// Only what needs the user's attention is shown: the progress ("LED output: ready", "connecting"...) is not.
function ledStatus(text, bad) { $("ledStatus").textContent = bad || !text.startsWith("LED output: ") ? text : ""; $("ledStatus").className = "tips" + (bad ? " bad" : ""); }
function ledButtons() {
  const auto = (isIo4() ? !!(app.conn && app.conn.serialPort) : led.granted) && !led.failed;      // it connects by itself when the permission is there
  $("ledConnect").hidden = !!led.dev || auto;
  $("ledConnect").textContent = led.failed ? "Try again" : "Connect LED output";
}
async function ledConnect() {
  if (isIo4()) return ledConnectIo4();
  if (!navigator.usb) { ledStatus("This browser has no WebUSB. Use Chrome or Edge.", true); return; }
  let dev;
  try { dev = await navigator.usb.requestDevice({ filters: [{ vendorId: VID, productId: 0x1231 }] }); }
  catch (e) { ledStatus(e.name === "NotFoundError" ? "No device chosen. The LED output needs the device in WINUSB mode with the WinUSB driver." : "LED output: " + e.message, e.name !== "NotFoundError"); return; }
  await ledOpenUsb(dev);
}
async function ledOpenUsb(dev) {
  try {
    await dev.open();
    if (dev.configuration === null) await dev.selectConfiguration(1);
    await dev.claimInterface(0);
  } catch (e) {
    try { await dev.close(); } catch (x) {}
    led.failed = true; ledButtons();
    ledStatus("Could not use the LED interface (" + e.message + "). Close the game or any program using the Tasoller, and check that Windows uses the WinUSB driver for it.", true); log("LED output: " + e.name + ": " + e.message); return;
  }
  const itf = (dev.configuration ? dev.configuration.interfaces : []).map(i => "interface " + i.interfaceNumber + ": " + i.alternate.endpoints.map(e => "ep " + e.endpointNumber + " " + e.direction + " " + e.type).join(", ")).join(" | ");
  log("LED output: " + itf);
  const ep = (dev.configuration ? dev.configuration.interfaces : []).filter(i => i.interfaceNumber === 0).flatMap(i => i.alternate.endpoints).find(e => e.endpointNumber === LED_ENDPOINT && e.direction === "out");
  if (!ep) { try { await dev.releaseInterface(0); await dev.close(); } catch (x) {} led.failed = true; ledButtons(); ledStatus("The device has no LED endpoint (endpoint 3, OUT) on interface 0. Found: " + (itf || "nothing") + ". Is it in WINUSB mode?", true); return; }
  led.dev = dev; led.granted = true; led.failed = false; log("LED output opened (WebUSB, interface 0)");
  ledStatus("LED output: ready"); ledButtons(); ledOpened();
}
async function ledTick() {
  if (!led.dev || led.busy) return;
  led.busy = true;
  try {
    const c = led.colors, r = await led.dev.transferOut(LED_ENDPOINT, buildLedPacket(c.slice(0, 31), c.slice(31, 34), c.slice(34, 37)));
    if (r.status !== "ok") throw new Error("transfer status " + r.status);
    if (led.ind) for (const p of buildLedExtPackets(c.slice(LED_ZONES))) {      // Supernova: the towers LED by LED, after the official packet
      const x = await led.dev.transferOut(LED_ENDPOINT, p);
      if (x.status !== "ok") throw new Error("transfer status " + x.status);
    }
    led.packets++; if (led.packets === 1) log("LED output: first packet sent, " + r.bytesWritten + " bytes, status " + r.status + ", colors sent");
  } catch (e) { log("LED output: " + e.message); ledStatus("LED output stopped: " + e.message, true); ledStop(); }
  finally { led.busy = false; }
}
function ledStart() { if (!led.dev || led.timer) return; led.packets = 0; led.timer = setInterval(ledTick, 40); ledTick(); ledButtons(); }
// The device falls back to its own lighting about 3 seconds after the last packet.
function ledStop() { clearInterval(led.timer); led.timer = null; ledButtons(); }
async function ledDisconnect() {
  ledStop(); const d = led.dev; led.dev = null;
  if (d) { led.closing = d.close().catch(() => {}); await led.closing; led.closing = null; }
  ledStatus("LED output: not connected"); ledButtons();
}
$("ledConnect").onclick = ledConnect;
if (navigator.usb) navigator.usb.addEventListener("disconnect", e => { if (led.dev && e.device === led.dev) { log("LED output: device disconnected"); led.dev = null; ledStop(); ledStatus("LED output: not connected"); ledButtons(); } });

