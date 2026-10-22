"use strict";

// ---------------------------------------------------------------------------------------------
// Constants (from the official tool, the stock firmware and the .skystar format)
// ---------------------------------------------------------------------------------------------
const SHARED_KEY = Uint8Array.from([0x07, 0x08, 0x0C, 0x43, 0x36, 0x57, 0x59, 0x36, 0x20, 0x0C, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00]);
const PKG_SIZE = 0x4B000, HEADER_SIZE = 0x19000, SLOT_SIZE = 0x19000, APP_BASE = 0x4000;
const RAM_BASE = 0x20000000, RAM_END = 0x20028000, VERSION_OFFSET = 0x400, VERSION_SIZE = 0x28;
const OFFICIAL_VERSION = "SS321_APP_050_20250102";
const CFW_VERSION_PREFIX = "SS321_CFW_SNV_";            // version string of the Supernova custom firmware (build-tools/build.py)
const CFW_NAME = "Supernova";                           // its USB product name
const FRAME = 64, CHUNK = 52;
const VID = 0x0E8F, PID_UPDATE = 0x1201;
const IO4_VID = 0x0CA3, IO4_PID = 0x0021;          // the IO4-Emulation mode (Supernova) has the USB ID of the arcade I/O board
const PID_MODE = { 0x1231: 0, 0x1235: 1, 0x1234: 2, 0x1233: 3, 0x1232: 4 };   // PID -> mode byte of the stock firmware
const MODE_NAMES = ["WINUSB mode", "4K keyboard mode", "8K keyboard mode", "16K keyboard mode", "32K keyboard mode", "IO4-Emulation mode"];   // the last one is Supernova only, a WinUSB device under another name
const USAGE_PAGE_CMD = 0xFF00, USAGE_PAGE_STREAM = 0xFF11;

// Command channel commands of the stock firmware (see README)
const CMD = { HANDSHAKE: 1, VERSION: 2, UPDATE: 4, MODE: 0x27, SENSOR_THR: 0x29, SAVE: 0x2C, GLOBAL_THR: 0x2D, RESTORE: 0x2E,
              DELAY: 0x32, RESTART_USB: 0x2F, KEYMAP: 0x2A, TOUCH_INFO: 0x08, HW_MAIN: 0x25, HW_TOUCH: 0x26, RESET_BASELINE: 0x35, BRIGHTNESS: 0x36, TUNING: 0x37, FINGER_CAP: 0x09, FINGER_CAP_SET: 0x0A, ERROR: 5,
              SAVE_AND_RESET: 0x28,
              DUMP: 0x40, SETTINGS: 0x41, LED: 0x42, IO4_BUTTONS: 0x43 /* Supernova only */ };
// The signals a function button can send to the game in the IO4-Emulation mode (io4.c of the firmware): every one of the 32 buttons of the I/O board,
// by its bit (the first player in the low word, the second 16 higher), and 32 for the coin (each press adds a credit). The air beams are PUSH 3, 4 and 5
// of both players; a function button that sends one interrupts that beam. A function button sends any number of them.
const IO4_SIGNAL_COIN = 32, IO4_SIGNAL_TEST = 9, IO4_SIGNAL_SERVICE = 6;
const IO4_AIR_BEAM_SIGNALS = { 13: 1, 29: 2, 12: 3, 28: 4, 11: 5, 27: 6 };      // the bit of each air beam, with its number (1 is the bottom one)
const IO4_PUSH_NAMES = { 0: "START", 1: "RIGHT", 2: "LEFT", 3: "UP", 4: "DOWN", 5: "PUSH 1", 10: "PUSH 2", 11: "PUSH 3", 12: "PUSH 4", 13: "PUSH 5", 14: "PUSH 6", 15: "PUSH 7" };
const IO4_SIGNALS = [[IO4_SIGNAL_TEST, "TEST"], [IO4_SIGNAL_SERVICE, "SERVICE"], [IO4_SIGNAL_COIN, "COIN"]];      // the first group of the lists
const IO4_SIGNALS_UNUSED = [];                                                                                      // the others, in the group "Unused"
for (let bit = 0; bit < 32; bit++) {
  if (bit === IO4_SIGNAL_TEST || bit === IO4_SIGNAL_SERVICE) continue;
  const player = bit < 16 ? "1P" : "2P", n = bit & 15, push = IO4_PUSH_NAMES[n];
  const air = IO4_AIR_BEAM_SIGNALS[bit];
  IO4_SIGNALS_UNUSED.push([bit, push ? player + " " + push + (air ? " (air beam " + air + ")" : "") : player + " bit " + n + " (not wired)"]);
}
const io4SignalName = code => { const s = IO4_SIGNALS.concat(IO4_SIGNALS_UNUSED).find(x => x[0] === code); return s ? s[1] : "-"; };
// The signals of a button as a short text: its name, or the first one and how many more.
const io4SignalsText = codes => codes.length === 0 ? "Nothing" : codes.length === 1 ? io4SignalName(codes[0]) : io4SignalName(codes[0]) + " + " + (codes.length - 1) + " more";
const FINGER_CAP_MIN = 100, FINGER_CAP_MAX = 999;
const TUNING_COUNT = 18, TUNING_BR_INDEX = 2;          // 18 u16 "tuning" block; the BR slider of the official tool is entry 2
const THR_MIN = 20, THR_MAX = 130, BR_MIN = 7, BR_MAX = 25, DELAY_MAX = 50, BRIGHT_MIN = 1, BRIGHT_MAX = 100;

