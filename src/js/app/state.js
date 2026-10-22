"use strict";
// The page as it was loaded, before the script changes anything: what the Download link of the footer saves when the page cannot be fetched again
// (a page opened from a file, which the browser does not let it read).
const PAGE_SOURCE = "<!doctype html>\n" + document.documentElement.outerHTML.replace(/^<html([^>]*?) data-theme="[a-z]*"/, "<html$1");
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const app = {
  page: "test", conn: null, cfg: null, busy: 0, flashing: false, sel: 0,
  live: new LiveDecoder(), streaming: false, streamTimer: null, lastStreamKick: 0,
  hideDiff: false, hideThr: false, wasFlashed: false, switching: false, installCfw: false,
};
// conn = { cmdDev, streamDev, io, streamIo, link, api, demo, pid, version, mode, update, cfw }
// conn.cfw is true when the device runs the Supernova custom firmware. Use isCfw() to test it; while the
// device is connected the page also has the "cfw" class on <body>, so CSS can show CFW-only menus.
const isIo4 = () => !!(app.conn && app.conn.cmdDev && app.conn.cmdDev.vendorId === IO4_VID);
// IO4-Emulation with the static light of the air towers: the device has no LED boards (one serial port, the slider) and the LEDs of the setup
// tool go through a WinUSB interface of the device. conn.io4Led is { static, rgb } as the device reported it when it was connected.
const io4Static = () => !!(app.conn && isIo4() && app.conn.io4Led && app.conn.io4Led.static);
const io4SerialPorts = () => io4Static() ? 1 : 3;
const isCfw = () => !!(app.conn && app.conn.cfw);
function detectCfw(version, productName, demo) {
  return !demo && (String(version || "").startsWith(CFW_VERSION_PREFIX) || String(productName || "").startsWith(CFW_NAME));
}

