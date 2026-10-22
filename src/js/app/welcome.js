// ------------------------------------------------------------------------------------------------
// The welcome page: shown (with no tab) while no device is connected, and while a connected device still needs permissions of the browser:
//  - in the IO4-Emulation mode (Supernova): its serial ports and its I/O board (live data and LED test),
//  - in WINUSB mode (the official firmware too): WebUSB for the LED test.
// ------------------------------------------------------------------------------------------------
let gateWas = null;

const WINUSB_PID = 0x1231;
// The LED output needs WebUSB to be allowed to open the device: in WINUSB mode, and in the IO4-Emulation mode with the static light (the LED
// packets then go to a WinUSB interface of the device).
const usbLedWanted = c => !!(c && !c.demo && !c.update && navigator.usb && (isIo4() ? !!(c.io4Led && c.io4Led.static) : c.pid === WINUSB_PID));
const usbLedTarget = c => isIo4() ? { vendorId: IO4_VID, productId: IO4_PID } : { vendorId: VID, productId: WINUSB_PID };

function gateNeeded() {
  const c = app.conn;
  if (!c) return true;
  if (isIo4()) return !(c.serialPort && c.io4Hid) || (usbLedWanted(c) && !c.usbLed);
  return usbLedWanted(c) && !c.usbLed;
}

function updateGate() {
  const c = app.conn, on = gateNeeded(), io4 = isIo4();
  document.body.classList.toggle("gate", on);
  document.body.classList.toggle("nodevice", !c);
  if (!c && app.page !== "links" && app.page !== "home") showPage("home");
  const checking = !!(c && on && !c.probed);                // what the browser allowed earlier is still being looked for: no request until it is known
  $("welcomeOff").hidden = !!c; $("welcomeChecking").hidden = !checking; $("welcomeSetup").hidden = !c || checking;
  $("welcomeHint").textContent = hid() ? "" : "This browser has no WebHID. Use a recent Chrome or Edge on desktop.";
  $("welcomeConnect").disabled = !hid();
  if (c && on) {
    $("welcomeSetup").classList.toggle("io4", io4);
    $("setupUsb").hidden = !usbLedWanted(c); $("setupSerial").hidden = !io4; $("setupHid").hidden = !io4;
    $("setupUsbState").textContent = c.usbLed ? "Allowed" : "Not allowed";
    $("setupUsbState").className = "setup-state " + (c.usbLed ? "ok" : "warn");
    $("setupUsbBtn").hidden = !!c.usbLed;
    if (io4) {
      $("setupTitle").innerHTML = "<span class='cfw-note'>IO4-Emulation mode</span>";
      $("setupIntro").innerHTML = "The device behaves like the arcade hardware.<br>The Toolkit needs your permission for each part of it: the browser asks for them one at a time.<br>Close the game first, it uses the same ports.";
      const serialOk = !!c.serialPort, n = c.serialCount || 0, hidOk = !!c.io4Hid;
      $("setupSerialText").innerHTML = serialAvailable()
        ? (io4Static() ? "The slider has one." : "The slider and the two LED boards each have one.<br>They are listed under the same name: allow all three, in any order.")
        : "Web Serial is not available in this browser: use Chrome or Edge on desktop.";
      $("setupSerialState").textContent = serialOk ? "Allowed" : n + " of " + io4SerialPorts();
      $("setupSerialState").className = "setup-state " + (serialOk ? "ok" : "warn");
      $("setupSerialBtn").hidden = serialOk || !serialAvailable();
      if (!serialOk && c.serialError && n >= io4SerialPorts()) $("setupSerialText").innerHTML += "<br>" + esc(c.serialError);
      $("setupHidText").innerHTML = "The air beams and the TEST and SERVICE buttons.";
      $("setupHidState").textContent = hidOk ? "Allowed" : "Not allowed";
      $("setupHidState").className = "setup-state " + (hidOk ? "ok" : "warn");
      $("setupHidBtn").hidden = hidOk;
    } else {
      $("setupTitle").textContent = "One more permission";
      $("setupIntro").innerHTML = "The Toolkit needs your permission to reach the device in WINUSB mode.";
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
      try { const t = usbLedTarget(c); c.usbLed = (await navigator.usb.getDevices()).some(d => d.vendorId === t.vendorId && d.productId === t.productId); } catch (e) {}
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
  try { await navigator.usb.requestDevice({ filters: [usbLedTarget(c)] }); c.usbLed = true; }
  catch (e) { if (e.name !== "NotFoundError") toast("Could not allow the LED output: " + e.message, "bad"); }
  updateGate();
}

$("welcomeConnect").onclick = () => connectReal();
$("setupSerialBtn").onclick = io4AllowSerial;
$("setupHidBtn").onclick = io4AllowHid;
$("setupUsbBtn").onclick = allowUsbLed;
