// ---------------------------------------------------------------------------------------------
// Keyboard keys as the device stores them: USB HID usage codes (keyboard page). A key map byte of 0 means "no key".
// ---------------------------------------------------------------------------------------------
const KEY_NAMES = { 0x28: "Enter", 0x29: "Esc", 0x2A: "BackSpace", 0x2B: "Tab", 0x2C: "Space", 0x2D: "-", 0x2E: "=", 0x2F: "[", 0x30: "]", 0x31: "\\", 0x33: ";", 0x34: "'", 0x35: "`", 0x36: ",", 0x37: ".", 0x38: "/", 0x39: "Caps",
  0x46: "PrtSc", 0x47: "ScrollLock", 0x48: "Pause", 0x49: "Insert", 0x4A: "Home", 0x4B: "PageUp", 0x4C: "Del", 0x4D: "End", 0x4E: "PageDown", 0x4F: "Right", 0x50: "Left", 0x51: "Down", 0x52: "Up",
  0x53: "NumLock", 0x54: "Num /", 0x55: "Num *", 0x56: "Num -", 0x57: "Num +", 0x58: "Num Enter", 0x62: "Num 0", 0x63: "Num .", 0x64: "\\ (ISO)", 0x65: "Menu",
  0xE0: "L-Ctrl", 0xE1: "L-Shift", 0xE2: "L-Alt", 0xE3: "L-Windows", 0xE4: "R-Ctrl", 0xE5: "R-Shift", 0xE6: "R-Alt", 0xE7: "R-Windows" };
function keyName(code) {
  if (!code) return "NULL";
  if (code >= 0x04 && code <= 0x1D) return String.fromCharCode(65 + code - 4);
  if (code >= 0x1E && code <= 0x26) return String(code - 0x1D);
  if (code === 0x27) return "0";
  if (code >= 0x3A && code <= 0x45) return "F" + (code - 0x39);
  if (code >= 0x59 && code <= 0x61) return "Num " + (code - 0x58);
  return KEY_NAMES[code] || "0x" + code.toString(16).toUpperCase();
}

// KeyboardEvent.code (the physical key, whatever the layout) -> HID usage. null for a key the device cannot send.
const CODE_TO_HID = (() => {
  const t = { Enter: 0x28, Escape: 0x29, Backspace: 0x2A, Tab: 0x2B, Space: 0x2C, Minus: 0x2D, Equal: 0x2E, BracketLeft: 0x2F, BracketRight: 0x30, Backslash: 0x31,
    Semicolon: 0x33, Quote: 0x34, Backquote: 0x35, Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
    Insert: 0x49, Home: 0x4A, PageUp: 0x4B, Delete: 0x4C, End: 0x4D, PageDown: 0x4E, ArrowRight: 0x4F, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52,
    NumLock: 0x53, NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58, Numpad0: 0x62, NumpadDecimal: 0x63,
    IntlBackslash: 0x64, ContextMenu: 0x65, ControlLeft: 0xE0, ShiftLeft: 0xE1, AltLeft: 0xE2, MetaLeft: 0xE3, ControlRight: 0xE4, ShiftRight: 0xE5, AltRight: 0xE6, MetaRight: 0xE7 };
  for (let i = 0; i < 26; i++) t["Key" + String.fromCharCode(65 + i)] = 0x04 + i;
  for (let i = 1; i <= 9; i++) { t["Digit" + i] = 0x1D + i; t["Numpad" + i] = 0x58 + i; }
  t.Digit0 = 0x27;
  for (let i = 1; i <= 12; i++) t["F" + i] = 0x39 + i;
  return t;
})();
const codeToHid = code => (code in CODE_TO_HID) ? CODE_TO_HID[code] : null;
