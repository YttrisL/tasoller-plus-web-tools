// ---------------------------------------------------------------------------------------------
// LED packet (WINUSB mode, USB interface 0, bulk OUT endpoint 3), 114 bytes: "DL", protocol 2, 31 slider LEDs
// (right to left), 3 LEDs of the left tower, 3 LEDs of the right tower, every LED as R, G, B.
// ---------------------------------------------------------------------------------------------
const LED_ENDPOINT = 3, LED_PROTOCOL = 2, LED_PACKET_SIZE = 114;
function buildLedPacket(slider, left, right) {
  const p = new Uint8Array(LED_PACKET_SIZE); p[0] = 0x44; p[1] = 0x4C; p[2] = LED_PROTOCOL;
  slider.forEach((c, i) => p.set(c, 3 + 3 * i)); left.forEach((c, i) => p.set(c, 96 + 3 * i)); right.forEach((c, i) => p.set(c, 105 + 3 * i));
  return p;
}

