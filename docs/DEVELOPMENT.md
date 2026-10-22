# Tasoller Plus Toolkit - notes for developers

This page is for people who work on the Toolkit. The user documentation is in the [README](../README.md); this file records the protocol and the layout of the sources. Paths below are relative to the folder of the project.

The result is one file, [`release/index.html`](../release/index.html): no libraries, no network access of any kind. It re-creates the useful parts of
the official `TASOLLER_Options_V2.8.exe` for the Tasoller Plus, in English, using **WebHID** (Chrome or Edge on desktop).
Nothing is uploaded and no firmware is built into the page.

Top menu: **Input test**, **LED test**, **Config**, **Flasher**, **Memory dump** and **IO4 mode config**, which only appear when the device runs the Supernova custom firmware (the top bar then shows a purple flame and "Custom firmware" instead of the green shield). **Useful links** is the last tab in every case.

| Page | What it does |
| --- | --- |
| Test | Live view like the official tool: 6 air beams, FN1/FN2, and the 32 touch sensors in two rows of 16. Big number = sensor value sent to the game (0-255), small number = DIFF (sum of the 4 pads), the 4 circles = the 4 thresholds of that sensor (yellow when customised). Click a sensor to edit its thresholds. In the keyboard modes the cells merge like in the official tool (4K = 4 cells, 8K = 8, 16K = 16, 32K = 32) and show the key assigned to each. |
| LED test | Drawing of the device and a color picker. **Connect LED output** opens the device's USB interface 0 with WebUSB (separate permission prompt the first time, then the page connects by itself; WINUSB mode and WinUSB driver needed, close the game first); the colors are then sent to the LEDs about 25 times a second for as long as the page is shown. All zones are selected when the page loads. The border of a tower or of the slider selects all of it (what is inside the border is clicked zone by zone). The device returns to its own lighting a few seconds after you leave the page. The LEDs only light when the device's second USB port is also connected. In the IO4-Emulation mode (Supernova) there is no connect button: the page opens the output by itself, with the permissions given on the welcome page. |
| Config | USB mode slider (WINUSB, 4K, 8K, 16K, 32K, and IO4-Emulation with Supernova; in that mode the device has the USB ID of the arcade I/O board, the Toolkit finds it all the same; the Input test reads the pads on the slider serial port (Web Serial; the browser lists the device's three serial ports under one name, so the page asks you to allow all three, in any order, and finds the slider among them by what it answers) and the air beams and buttons from the I/O board (WebHID), with the game closed, and shows no DIFF values; the LED test page sends the slider colors on the serial port and the three groups of each of the two air towers on the command channel) and the settings of the second screenshot: All thresholds, BR, Ground Slider delay, Ground Slider brightness, AIR brightness, Hide DIFF, Hide thresholds, Advanced (single sensor thresholds), Restore factory global thresholds. In the keyboard modes a **Keyboard mapping** card assigns a key to each zone, air line, FN1 and FN2 (select it, press the key). **Show touch tuning (debug)** opens the hidden panel of the official tool (finger capacitance, baseline, noise threshold, IIR filter). Values are written when you release a slider and read back to confirm. |
| LED test (Supernova) | With the Supernova firmware (device connected in the top bar) the 24 LEDs of each tower can always be selected and colored one by one (shift-click selects a range, the bar beside a group of 8 selects the whole group, like a zone of the official packet). The official 114-byte LED packet is still sent as before; the individual LEDs travel in extra 64-byte packets that the stock firmware never receives, because the towers stay in three zones unless the firmware answers the LED command. |
| Flasher | The firmware update of the official tool (`.skystar` package), unchanged in behaviour from the earlier flasher page. |
| Config, Settings backup | Supernova only (purple border). **Export settings** saves the settings page of the device to a `.snvset` file, **Import settings** puts one back (the device then restarts). |
| Useful links | Links to resources about the device and Supernova, in a plain tab for every firmware. |
| IO4 mode config | Supernova only (purple border), IO4-Emulation mode. **Function buttons**: a list for FN1, one for FN2 and one for both pressed together, each a multiple choice of the signals the I/O board can send to the game (TEST, SERVICE and COIN on top, then every other button of the board, the six air beams included, under "Unused"; TEST by default for FN1, SERVICE for FN2, nothing for both together, so each sends its own; **Apply** saves, no restart; the Input test names the two buttons after their signals); command `0x43`. **Air towers**: a toggle switch chooses the LED mode, **Static light** first and **LED driver emulation** second: **LED driver emulation** (the device emulates the two LED boards of the game, on two more COM ports) or **Static light** (the default, in white: no LED boards, so only the slider COM port; the air towers show one color picked with the hue, saturation and brightness sliders (white is a saturation of 0), shown on the towers as you pick, and kept in the device with **Apply**, which does not restart it when only the color changed). Changing the mode restarts the device. With the static light the welcome page asks for one serial port instead of three, and for the WebUSB permission, and the LED test goes through WebUSB to the WinUSB interface 4 (endpoint 2) of the device, like the WINUSB mode. A block "Your segatools.ini configuration" floats at the right of a wide screen (1500 px and more) and goes under the settings on a narrower one: it shows the `[io4]`, `[slider]` and `[led15093]` blocks for the mode the switch shows (`enable=0`, `enable=0`, and `enable=1` with the static light, since segatools then emulates the LED boards the device does not have), with a Copy button. With the LED driver emulation a table also gives the COM numbers of the slider and of the two LED boards by `dipsw3` of `[system]` (CHUNITHM NEW only: 1 is CVT, COM1, COM2 and COM3; 0 is SP, COM1, COM20 and COM21). The device reports the mode with command `0x42` sub-command 2 and takes it with sub-command 3. |
| Memory dump | Supernova only (purple border). Reads the whole microcontroller (registers as the bootloader left them, RAM, configuration words, OTP, bootloader and both firmware slots) through the command channel, with a progress bar and an Abort button, then downloads a zip with one `.bin` per section, `manifest.json` and `info.txt`. The unique chip ID can be hidden in the download. |

The page runs a self-test at load (AES, settings round trip, live decoder, a full update, all against the simulator).

## Notes

The protocol was derived from the official exe and the stock firmware `SS321_APP_050_20250102` and has been used on a real
Tasoller: connection, live view, settings, mode switching and firmware flashing work.

Writes use exactly the commands the stock firmware implements for the official tool, and the ranges of the official tool's
sliders (thresholds 20-130, BR 7-25, delay 0-50, brightness 1-100). **Restore factory global thresholds** returns every
threshold to the firmware's factory value (85). Sensor 0 is the top left cell, 1 the bottom left one, even numbers on the top row.

## How it talks to the device (from the analysis)

USB `0E8F:1231` (WINUSB mode) or `1232`..`1235` (keyboard modes), `1201` (update mode). The device has up to three interfaces:

1. vendor interface 0 (WinUSB in normal mode, or the keyboard) - not used here;
2. HID interface 1, usage page `0xFF00`: the **command channel**, 64-byte reports, AES-128-ECB frames
   `[L][cmd][nonce][payload][sum8 at byte 63]`, session key from a handshake (same as the flasher);
3. HID interface 2, usage page `0xFF11`: the **live data** stream.

LED data (WebUSB, interface 0, bulk OUT endpoint 3): 114-byte packets `44 4C 02`, then 31 slider LEDs (right to left), 3 left tower LEDs and 3 right tower LEDs, each as R, G, B. The stock firmware has no LED command on the command channel.

Live data: the host sends `68 DD C8 00...` (start) or `68 BB F8 00...` (stop) on interface 2. The device then sends 64-byte packets,
about 40 bursts per second:

- tag `0xC0 | 0xD0 | 0xE0 | 0xF0` in the high nibble of byte 0 = touch chip 0..3. 32 big-endian 16-bit pad values (the tag
  replaces the top nibble of the first value). Each 16 bytes hold 2 sensors x 4 pads; sensor index = `31 - 8*chip - 2*block`
  (first set: values 0,1,4,5) and one less (second set: values 2,3,6,7). DIFF = sum of the 4 pads.
- `44 42 54 <buttons>` ("DBT") then 32 sensor values. Buttons, MSB first: FN1 FN2 then 6 beam bits: the bottom beam is bit 0 and the top beam is bit 5.

Settings commands (reply payload after `[L][cmd][nonce]`; `sub` 0 reads, 1 writes):

| Cmd | Meaning | Payload |
| --- | --- | --- |
| `0x32` | Ground Slider delay | read `[0]` -> `[0, hi, lo]`; write `[1, hi, lo]` (device keeps it, stored in flash) |
| `0x36` | brightness | read `[0]` -> `[0, air, ground]`; write `[1, air, ground]` |
| `0x2D` | the 4 global thresholds (types 4-1..4-4) | read `[0]` -> `[0, 4 x u16]`; write `[1, 4 x u16]` |
| `0x29` | per-sensor thresholds, 8 groups of 4 sensors | read `[0, g]` -> `[0, g, 16 x u16]`; write `[1, g, 16 x u16]`. Firmware order p = 31 - sensor. The firmware rebuilds its tables only after group 7, so all 8 groups are always written in order |
| `0x2C` | save settings to flash | no payload |
| `0x2E` | restore factory thresholds | `[0]` |
| `0x37` | 18 x u16 touch tuning block, entry 2 is the **BR** slider (range 7-25); the debug panel also edits entries 0 (Reset BaseLine, 1-255), 1 (Noise threshold, 1-255) and 3 (IIR filter, 1-100) | read `[0]` -> 18 x u16; write `[1, 18 x u16]`, then `0x35 [1, 0]` (baseline reset, restarts the touch controllers) |
| `0x2A` | key map | read `[0, mode]` (mode 1..4) -> `[0, mode, 48 bytes]`; write `[1, mode, 48 bytes]`, then `0x2C`. Bytes 0..31 are the HID keys of firmware sensor p (sensor = 31 - p), 32/33 FN1/FN2, 34..39 air lines 1..6. Modifiers are 0xE0..0xE7 |
| `0x2E` sub 1..4 | restore the factory key map of that mode | `[mode]` |
| `0x09` / `0x0A` | finger capacitance (debug panel) | read -> `[cap hi, lo, other hi, lo]` (330 = 3.3 pF, range 100..999); write the same, then `0x35 [1, 0]` |
| `0x27` | USB mode (0 WINUSB, 1 4K, 2 8K, 3 16K, 4 32K) | read `[0]` -> `[0, mode]`; write `[1, mode]` (stored in flash), then `0x2F` (no payload) re-enumerates USB with the new mode and PID |

A sensor "follows the global value" when its 4 thresholds equal the old global ones; **All thresholds** moves those sensors and
leaves customised ones alone, like the official tool.

**BR**: the official tool labels the slider only "BR". It writes entry 2 of the 18-value tuning block and then resets the
baseline. What the touch controllers do with that entry is not documented; the page offers it with the official range only.

## Use

1. Close the official tool (only one program can open the device).
2. Open `release/index.html` in Chrome or Edge. If the browser refuses a local file, run `python -m http.server 8000` in
   `release/` and open `http://localhost:8000/`.
3. **Connect** and pick the Tasoller (a device authorised earlier reconnects by itself). If the Test page says the live data
   interface is not authorised, press **Allow live data** and pick the same device again.
   While no device is connected the page only shows a welcome page with a Connect button, and no tab. With a Supernova device in
   the IO4-Emulation mode the welcome page then asks for the permissions the live data needs (the three serial ports, one click each, and
   the I/O board); the tabs appear once they are all allowed. A device in WINUSB mode (the official firmware too) is asked for the WebUSB
   permission of the LED test the same way, once; the LED test then connects by itself. There is no way past that page without them.
   With the official firmware the top bar also shows a purple button, "Unlock new features by installing Supernova", which opens the
   page of the custom firmware (github.com/YttrisL/tasoller-plus-custom-firmware) in a new tab.
   The page follows the light or dark theme of the system. The three buttons at the right of the top bar (system, light, dark) override
   it; the choice is kept in the browser, and "system" forgets it.
4. After flashing Supernova on a device that did not run it, the page switches the device to the IO4-Emulation mode once it is back.
   After flashing, the device restarts and the page reconnects by itself when it comes back.

## Project layout and build

The page is developed as separate files in `src/` and assembled by a small script into the single file in `release/`.

```
src/
  index.html          template: the page skeleton with @include markers
  styles/             CSS, one file per area (base, topbar, controls, input-test, config, led-test, flasher, welcome, theme, log, toasts)
  views/              HTML, one file per tab (input-test, led-test, config, flasher, dump, io4-config) plus welcome, topbar, banners and log
  data/known-hashes.js  list of known firmware packages (SHA-256, name, official or not): add a line to have the
                      Flasher recognise another package
  js/core/            device protocol, no DOM: constants, aes, frames, link (command channel), device (settings),
                      live-decoder, keys (key names, HID codes), package (.skystar), led-packet, simulator, self-test
  js/app/             the page: state, logging, helpers, pages, connection, connection-ui, config, input-test,
                      advanced, key-mapping, debug-panel, led-test, flasher, main (event wiring and start-up)
build.py              builds release/index.html          (build.cmd runs it on Windows)
release/index.html    generated, the file to open or share; commit it together with the sources
```

Build with `python build.py` (Python 3, no packages). `python build.py --check` only reports whether `release/index.html`
is up to date. An include marker is a line holding only `<!-- @include views/config.html -->` (HTML),
`/* @include styles/base.css */` (CSS) or `// @include js/app/main.js` (JavaScript). The files are inserted unchanged, so the
build is a plain concatenation, the order of the includes in `src/index.html` is the order in the page. The build fails on
a missing include, a file without a final newline, or a non-ASCII character. The scripts are classic scripts sharing one
scope per block (`core`, then `app`), not modules: a function defined in one file is visible from the files after it.

## Not implemented

- **Touch-controller update (`.cyacd2`).** The official tool can also reflash the four PSoC touch controllers through the
  `0xA0/0xA2/0xA1/0xA3` pass-through, using the Cypress bootloader protocol. It is deliberately left out: the exact sequence
  could not be confirmed from the exe alone and cannot be tested here without hardware, and a wrong write could leave a touch
  controller unusable until the official tool repairs it. Use the official tool for that update.
- The labels of the debug panel (Reset BaseLine, Noise threshold, IIR filter) are inferred from the position of the controls in
  the official tool, not from documentation. The finger capacitance and key map commands were checked against the stock firmware
  and the simulator only, not on a real device.
