"use strict";
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
const isCfw = () => !!(app.conn && app.conn.cfw);
function detectCfw(version, productName, demo) {
  return !demo && (String(version || "").startsWith(CFW_VERSION_PREFIX) || String(productName || "").startsWith(CFW_NAME));
}

