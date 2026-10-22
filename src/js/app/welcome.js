// ------------------------------------------------------------------------------------------------
// The welcome page: shown (with no tab) while no device is connected, and while a connected device still needs permissions of the browser:
//  - in the IO4-Emulation mode (Supernova): its serial ports and its I/O board (live data and LED test),
//  - in WINUSB mode (the official firmware too): WebUSB for the LED test.
// ------------------------------------------------------------------------------------------------
let gateWas = null;

const WINUSB_PID = 0x1231;
// The LED output of the other modes needs the device in WINUSB mode, which WebUSB has to be allowed to open.
const usbLedWanted = c => !!(c && !c.demo && !c.update && !isIo4() && c.pid === WINUSB_PID && navigator.usb);

function gateNeeded() {
  const c = app.conn;
  if (!c) return true;
  if (isIo4()) return !(c.serialPort && c.io4Hid);
  return usbLedWanted(c) && !c.usbLed;
}

function updateGate() {
  const c = app.conn, on = gateNeeded(), io4 = isIo4();
  document.body.classList.toggle("gate", on);
  const checking = !!(c && on && !c.probed);                // what the browser allowed earlier is still being looked for: no request until it is known
  $("welcomeOff").hidden = !!c; $("welcomeChecking").hidden = !checking; $("welcomeSetup").hidden = !c || checking;
  $("welcomeHint").textContent = hid() ? "" : "This browser has no WebHID. Use a recent Chrome or Edge on desktop.";
  $("welcomeConnect").disabled = !hid();
  if (c && on) {
    $("welcomeSetup").classList.toggle("io4", io4);
    $("setupUsb").hidden = io4; $("setupSerial").hidden = !io4; $("setupHid").hidden = !io4;
    if (io4) {
      $("setupTitle").innerHTML = "<span class='cfw-note'>IO4-Emulation mode</span>";
      $("setupIntro").innerHTML = "The device behaves like the arcade hardware.<br>The Toolkit needs your permission for each part of it: the browser asks for them one at a time.<br>Close the game first, it uses the same ports.";
      const serialOk = !!c.serialPort, n = c.serialCount || 0, hidOk = !!c.io4Hid;
      $("setupSerialText").innerHTML = serialAvailable()
        ? "The slider and the two LED boards each have one.<br>They are listed under the same name: allow all three, in any order."
        : "Web Serial is not available in this browser: use Chrome or Edge on desktop.";
      $("setupSerialState").textContent = serialOk ? "Allowed" : n + " of " + IO4_SERIAL_PORTS;
      $("setupSerialState").className = "setup-state " + (serialOk ? "ok" : "warn");
      $("setupSerialBtn").hidden = serialOk || !serialAvailable();
      if (!serialOk && c.serialError && n >= IO4_SERIAL_PORTS) $("setupSerialText").innerHTML += "<br>" + esc(c.serialError);
      $("setupHidText").innerHTML = "The air beams and the TEST and SERVICE buttons.";
      $("setupHidState").textContent = hidOk ? "Allowed" : "Not allowed";
      $("setupHidState").className = "setup-state " + (hidOk ? "ok" : "warn");
      $("setupHidBtn").hidden = hidOk;
    } else {
      $("setupTitle").textContent = "One more permission";
      $("setupIntro").innerHTML = "The Toolkit needs your permission to reach the device in WINUSB mode.";
      $("setupUsbState").textContent = c.usbLed ? "Allowed" : "Not allowed";
      $("setupUsbState").className = "setup-state " + (c.usbLed ? "ok" : "warn");
      $("setupUsbBtn").hidden = !!c.usbLed;
    }
  }
  // ports that could not be opened (the game has them): look again by itself, so the page moves on when they are free
  if (c && on && io4 && !c.serialPort && /^Could not open/.test(c.serialError || "") && !app.gateRetry) app.gateRetry = setTimeout(() => { app.gateRetry = null; gateProbe(); }, 2000);
  if (gateWas && !on) showPage(app.page);                // the permissions are there: the tabs come back
  if (gateWas !== on) updateStream();
  gateWas = on;
}

// Find the permissions that were given earlier, without asking.
async function gateProbe() {
  const c = app.conn;
  if (!c || app.gateProbing) return;
  app.gateProbing = true;
  try {
    if (usbLedWanted(c)) {
      try { c.usbLed = (await navigator.usb.getDevices()).some(d => d.vendorId === VID && d.productId === WINUSB_PID); } catch (e) {}
    }
    if (isIo4()) {
      if (!c.serialPort && serialAvailable()) {
        const r = await io4EnsureSliderPort(false);
        if (app.conn === c) { c.serialPort = r.port || null; c.serialCount = r.count || 0; c.serialError = r.port ? "" : (r.error || ""); }
      }
      if (!c.io4Hid && hid()) {
        let devs = [];
        try { devs = (await hid().getDevices()).filter(d => d.vendorId === IO4_VID && d.productId === IO4_PID && (d.collections || []).some(x => x.usagePage === 0x01 && x.usage === 0x04)); } catch (e) {}
        if (devs[0] && app.conn === c) await io4AttachHid(devs[0], true);
      }
    }
  } finally { app.gateProbing = false; c.probed = true; }
  updateGate();
}

async function allowUsbLed() {
  const c = app.conn; if (!c) return;
  try { await navigator.usb.requestDevice({ filters: [{ vendorId: VID, productId: WINUSB_PID }] }); c.usbLed = true; }
  catch (e) { if (e.name !== "NotFoundError") toast("Could not allow the LED output: " + e.message, "bad"); }
  updateGate();
}

$("welcomeConnect").onclick = () => connectReal();
$("setupSerialBtn").onclick = io4AllowSerial;
$("setupHidBtn").onclick = io4AllowHid;
$("setupUsbBtn").onclick = allowUsbLed;
