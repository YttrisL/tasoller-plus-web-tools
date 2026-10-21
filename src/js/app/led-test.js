// ------------------------------------------------------------------------------------------------
// LED test: drawing of the device, a color picker, and WebUSB output to the LED endpoint
// ------------------------------------------------------------------------------------------------
// Zones: 0..30 slider LEDs (0 is the rightmost pad, then a divider, alternating), 31..33 left tower, 34..36 right tower.
const led = { dev: null, timer: null, busy: false, rgb: [0, 0, 0], packets: 0, colors: Array.from({ length: 37 }, () => [0, 0, 0]), sel: new Set(), els: [] };
const ledHsv = (h, s, v) => { const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)].map(x => Math.round(x * 255)); };
const ledHex = a => "#" + a.map(x => x.toString(16).padStart(2, "0")).join("");
function ledZoneName(z) { return z < 31 ? (z % 2 ? "Divider " + ((z + 1) / 2) : "Pad " + (z / 2 + 1)) + " (counted from the right)" : (z < 34 ? "Left tower group " + (z - 30) : "Right tower group " + (z - 33)) + " (8 LEDs, one color)"; }
function ledRenderZone(z) {
  const e = led.els[z], c = led.colors[z], on = c[0] + c[1] + c[2] > 0, mx = Math.max(c[0], c[1], c[2]) / 255;
  e.style.setProperty("--led", on ? "rgb(" + c.join(",") + ")" : "#222");
  e.style.setProperty("--glow", on ? Math.round(4 + 10 * mx) + "px" : "0px");
  e.classList.toggle("sel", led.sel.has(z));
}
function ledRenderCount() {
  const n = led.sel.size;
  $("ledCount").textContent = n ? n + " of 37 zones selected. The color sliders change the selected zones." : "Click a zone to select it, click it again to deselect it. Several zones can be selected at once.";
}
// Sliders -> color; the sliders show the color of a single selected zone
function ledPicked() { const h = Number($("ledHue").value), b = Number($("ledBright").value) / 100; return ledHsv(h, 1, b); }
function ledUpdatePicker() {
  const shown = ledPicked(); led.rgb = shown;
  $("ledSwatch").style.setProperty("--led-pick", ledHex(shown)); $("ledHex").textContent = ledHex(shown); $("ledBrightVal").textContent = $("ledBright").value;
}
function ledToggle(z) {
  if (led.sel.has(z)) led.sel.delete(z); else led.sel.add(z);
  ledRenderZone(z); ledRenderCount();
  if (led.sel.size === 1) {          // show the color of that zone on the sliders
    const c = led.colors[[...led.sel][0]], mx = Math.max(...c);
    if (mx > 0) {
      const [r, g, b] = c.map(x => x / 255), mn = Math.min(r, g, b), d = mx / 255 - mn; let h = 0;
      if (d > 0) { const m = mx / 255; h = m === r ? ((g - b) / d) % 6 : m === g ? (b - r) / d + 2 : (r - g) / d + 4; h = Math.round(((h * 60) + 360) % 360); }
      $("ledHue").value = h; $("ledBright").value = Math.round(mx / 255 * 100); ledUpdatePicker();
    }
  }
}
function ledSelect(all) { for (let z = 0; z < 37; z++) { if (all) led.sel.add(z); else led.sel.delete(z); ledRenderZone(z); } ledRenderCount(); }
function ledApplyPicker() {
  ledUpdatePicker();
  for (const z of led.sel) { led.colors[z] = led.rgb.slice(); ledRenderZone(z); }
}
(function ledTest() {
  const strip = $("ledStrip");
  const mk = (tag, z) => { const e = document.createElement(tag); e.className = (tag === "span" ? (z % 2 ? "div" : "pad") + " " : "") + "led-zone"; e.title = ledZoneName(z); e.dataset.z = z; e.onclick = () => ledToggle(z); led.els[z] = e; return e; };
  for (let pos = 0; pos < 31; pos++) strip.appendChild(mk("span", 30 - pos));   // left to right on screen
  const mkGroup = z => { const e = mk("div", z); e.classList.add("led-group"); for (let i = 0; i < 8; i++) e.appendChild(document.createElement("b")); return e; };
  for (const [id, first] of [["ledTowerL", 31], ["ledTowerR", 34]]) { const label = $(id).firstChild; for (let k = 2; k >= 0; k--) $(id).insertBefore(mkGroup(first + k), label); }   // group 1 is the bottom one
  $("ledHue").addEventListener("input", ledApplyPicker); $("ledBright").addEventListener("input", ledApplyPicker);
  $("ledSelAll").onclick = () => ledSelect(true); $("ledSelNone").onclick = () => ledSelect(false);
  $("ledOff").onclick = () => { for (let z = 0; z < 37; z++) { led.colors[z] = [0, 0, 0]; ledRenderZone(z); } };
  for (let z = 0; z < 37; z++) ledRenderZone(z);
  ledUpdatePicker(); ledRenderCount();
})();

function ledStatus(text, bad) { $("ledStatus").textContent = text; $("ledStatus").className = "tips" + (bad ? " bad" : ""); }
function ledButtons() {
  $("ledConnect").hidden = !!led.dev; $("ledApply").hidden = !led.dev;
  $("ledApply").textContent = led.timer ? "Stop" : "Show on device";
}
async function ledConnect() {
  if (!navigator.usb) { ledStatus("This browser has no WebUSB. Use Chrome or Edge.", true); return; }
  let dev;
  try { dev = await navigator.usb.requestDevice({ filters: [{ vendorId: VID, productId: 0x1231 }] }); }
  catch (e) { ledStatus(e.name === "NotFoundError" ? "No device chosen. The LED output needs the device in WINUSB mode with the WinUSB driver." : "LED output: " + e.message, e.name !== "NotFoundError"); return; }
  try {
    await dev.open();
    if (dev.configuration === null) await dev.selectConfiguration(1);
    await dev.claimInterface(0);
  } catch (e) {
    try { await dev.close(); } catch (x) {}
    ledStatus("Could not use the LED interface (" + e.message + "). Close the game or any program using the Tasoller, and check that Windows uses the WinUSB driver for it.", true); log("LED output: " + e.name + ": " + e.message); return;
  }
  const itf = (dev.configuration ? dev.configuration.interfaces : []).map(i => "interface " + i.interfaceNumber + ": " + i.alternate.endpoints.map(e => "ep " + e.endpointNumber + " " + e.direction + " " + e.type).join(", ")).join(" | ");
  log("LED output: " + itf);
  const ep = (dev.configuration ? dev.configuration.interfaces : []).filter(i => i.interfaceNumber === 0).flatMap(i => i.alternate.endpoints).find(e => e.endpointNumber === LED_ENDPOINT && e.direction === "out");
  if (!ep) { try { await dev.releaseInterface(0); await dev.close(); } catch (x) {} ledStatus("The device has no LED endpoint (endpoint 3, OUT) on interface 0. Found: " + (itf || "nothing") + ". Is it in WINUSB mode?", true); return; }
  led.dev = dev; log("LED output opened (WebUSB, interface 0)");
  ledStatus("LED output: ready"); ledButtons();
}
async function ledTick() {
  if (!led.dev || led.busy) return;
  led.busy = true;
  try {
    const c = led.colors, r = await led.dev.transferOut(LED_ENDPOINT, buildLedPacket(c.slice(0, 31), c.slice(31, 34), c.slice(34, 37)));
    if (r.status !== "ok") throw new Error("transfer status " + r.status);
    led.packets++; if (led.packets === 1) log("LED output: first packet sent, " + r.bytesWritten + " bytes, status " + r.status + ", colors sent");
    if (led.packets % 25 === 1) ledStatus("LED output: sending (" + led.packets + " packets)");
  } catch (e) { log("LED output: " + e.message); ledStatus("LED output stopped: " + e.message, true); ledStop(); }
  finally { led.busy = false; }
}
function ledStart() { if (!led.dev || led.timer) return; led.packets = 0; led.timer = setInterval(ledTick, 40); ledTick(); ledButtons(); }
// The device falls back to its own lighting about 3 seconds after the last packet.
function ledStop() { clearInterval(led.timer); led.timer = null; if (led.dev) ledStatus("LED output: ready (the device returns to its own lighting in a few seconds)"); ledButtons(); }
async function ledDisconnect() { ledStop(); const d = led.dev; led.dev = null; if (d) { try { await d.close(); } catch (e) {} } ledStatus("LED output: not connected"); ledButtons(); }
$("ledConnect").onclick = ledConnect;
$("ledApply").onclick = () => { if (led.timer) ledStop(); else ledStart(); };
if (navigator.usb) navigator.usb.addEventListener("disconnect", e => { if (led.dev && e.device === led.dev) { log("LED output: device disconnected"); led.dev = null; ledStop(); ledStatus("LED output: not connected"); ledButtons(); } });

