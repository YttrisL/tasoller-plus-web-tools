"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const app = {
  page: "test", conn: null, cfg: null, busy: 0, flashing: false, sel: 0,
  live: new LiveDecoder(), streaming: false, streamTimer: null, lastStreamKick: 0,
  hideDiff: false, hideThr: false, wasFlashed: false, switching: false,
};
// conn = { cmdDev, streamDev, io, streamIo, link, api, demo, pid, version, mode, update }

