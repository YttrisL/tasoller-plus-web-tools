"use strict";

// ---------------------------------------------------------------------------------------------
// Constants (from the official tool, the stock firmware and the .skystar format)
// ---------------------------------------------------------------------------------------------
const SHARED_KEY = Uint8Array.from([0x07, 0x08, 0x0C, 0x43, 0x36, 0x57, 0x59, 0x36, 0x20, 0x0C, 0x09, 0x00, 0x00, 0x00, 0x00, 0x00]);
const PKG_SIZE = 0x4B000, HEADER_SIZE = 0x19000, SLOT_SIZE = 0x19000, APP_BASE = 0x4000;
const RAM_BASE = 0x20000000, RAM_END = 0x20028000, VERSION_OFFSET = 0x400, VERSION_SIZE = 0x28;
const OFFICIAL_VERSION = "SS321_APP_050_20250102";
const FRAME = 64, CHUNK = 52;
const VID = 0x0E8F, PID_UPDATE = 0x1201;
const PID_MODE = { 0x1231: 0, 0x1235: 1, 0x1234: 2, 0x1233: 3, 0x1232: 4 };   // PID -> mode byte of the stock firmware
const MODE_NAMES = ["WINUSB mode", "4K keyboard mode", "8K keyboard mode", "16K keyboard mode", "32K keyboard mode"];
const USAGE_PAGE_CMD = 0xFF00, USAGE_PAGE_STREAM = 0xFF11;

// Command channel commands of the stock firmware (see README)
const CMD = { HANDSHAKE: 1, VERSION: 2, UPDATE: 4, MODE: 0x27, SENSOR_THR: 0x29, SAVE: 0x2C, GLOBAL_THR: 0x2D, RESTORE: 0x2E,
              DELAY: 0x32, RESTART_USB: 0x2F, KEYMAP: 0x2A, TOUCH_INFO: 0x08, HW_MAIN: 0x25, HW_TOUCH: 0x26, RESET_BASELINE: 0x35, BRIGHTNESS: 0x36, TUNING: 0x37, FINGER_CAP: 0x09, FINGER_CAP_SET: 0x0A, ERROR: 5 };
const FINGER_CAP_MIN = 100, FINGER_CAP_MAX = 999;
const TUNING_COUNT = 18, TUNING_BR_INDEX = 2;          // 18 u16 "tuning" block; the BR slider of the official tool is entry 2
const THR_MIN = 20, THR_MAX = 130, BR_MIN = 7, BR_MAX = 25, DELAY_MAX = 50, BRIGHT_MIN = 1, BRIGHT_MAX = 100;

