// ---------------------------------------------------------------------------------------------
// LED packet (WINUSB mode, USB interface 0, bulk OUT endpoint 3), 114 bytes: "DL", protocol 2, 31 slider LEDs
// (right to left), 3 LEDs of the left tower, 3 LEDs of the right tower, every LED as R, G, B.
// ---------------------------------------------------------------------------------------------
const LED_ENDPOINT = 3, LED_PROTOCOL = 2, LED_PACKET_SIZE = 114;
// Supernova only: the individual tower LEDs. An extended packet is always 64 bytes: "DX", version, tower (0 left, 1 right),
// first LED (counted from the bottom of the tower), count, then the colors as R, G, B. The official 114-byte packet is
// unchanged and is still sent with it (see led_ext.c of the firmware). Ask the firmware first: ledExtInfo().
const LED_EXT_VERSION = 1, LED_EXT_CHUNK = 12, LED_TOWER_LEDS = 24;
function buildLedExtPackets(colors) {            // colors[tower * 24 + led from the bottom] = [r, g, b]
  const out = [];
  for (let t = 0; t < 2; t++) for (let first = 0; first < LED_TOWER_LEDS; first += LED_EXT_CHUNK) {
    const p = new Uint8Array(64); p.set([0x44, 0x58, LED_EXT_VERSION, t, first, LED_EXT_CHUNK]);
    for (let i = 0; i < LED_EXT_CHUNK; i++) p.set(colors[t * LED_TOWER_LEDS + first + i], 6 + 3 * i);
    out.push(p);
  }
  return out;
}
// IO4-Emulation mode (Supernova): the LEDs are set the way the game does it. The slider gets the command 2 of its serial protocol
// (brightness, then 32 colors as blue, red, green; the game and the official packet both count from the right), the
// towers are set on the command channel (the game uses two LED boards on two more serial ports, which the Toolkit does not need).
function buildSliderLedFrame(packet) {
  const body = [2, 97, 63];                                      // command, length, brightness
  for (let i = 0; i < 32; i++) {
    const k = i, c = i < 31 ? [packet[3 + 3 * k], packet[4 + 3 * k], packet[5 + 3 * k]] : [0, 0, 0];   // r, g, b
    body.push(c[2], c[0], c[1]);
  }
  let sum = 0xFF; body.forEach(b => { sum = (sum + b) & 255; });
  const out = [0xFF];
  for (const b of [...body, (256 - sum) & 255]) { if (b === 0xFF || b === 0xFD) { out.push(0xFD, b - 1); } else out.push(b); }
  return Uint8Array.from(out);
}
function buildLedPacket(slider, left, right) {
  const p = new Uint8Array(LED_PACKET_SIZE); p[0] = 0x44; p[1] = 0x4C; p[2] = LED_PROTOCOL;
  slider.forEach((c, i) => p.set(c, 3 + 3 * i)); left.forEach((c, i) => p.set(c, 96 + 3 * i)); right.forEach((c, i) => p.set(c, 105 + 3 * i));
  return p;
}

