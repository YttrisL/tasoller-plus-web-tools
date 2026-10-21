// ------------------------------------------------------------------------------------------------
// Keyboard mapping (keyboard modes only): pick a ground key, an air line or FN, then press the key to assign
// ------------------------------------------------------------------------------------------------
const keymap = { target: null, mode: -1, btns: [] };      // target = { label, ps: [key map indexes] }

// Targets in the order of the Input test page: ground keys left to right, then air 6 to 1, then FN1 and FN2.
function keyTargets(mode) {
  const size = groupSize(mode), cols = Math.max(1, size / 2), out = { ground: [], air: [], fn: [] };
  if (size > 1) {
    for (let g = 0; g < 32 / size; g++) {
      const ps = []; for (let d = g * size; d < (g + 1) * size; d++) ps.push(31 - d);
      out.ground.push({ label: "Zone " + (g + 1), ps });
    }
  } else {
    for (const r of [0, 1]) for (let i = 0; i < 16; i++) { const d = 2 * i + r; out.ground.push({ label: "Sensor " + d, ps: [31 - d] }); }
  }
  for (let n = 6; n >= 1; n--) out.air.push({ label: "Air " + n, ps: [33 + n] });
  out.fn.push({ label: "FN1", ps: [32] }, { label: "FN2", ps: [33] });
  return out;
}

function renderKeyCard() {
  const r = app.cfg, card = $("keyCard");
  const show = !!(r && r.mode >= 1 && r.mode <= 4 && r.keymap);
  card.hidden = !show;
  if (!show) { keymap.target = null; keymap.mode = -1; return; }
  if (keymap.mode !== r.mode) {          // another mode: new list of buttons
    keymap.mode = r.mode; keymap.target = null; keymap.btns = [];
    const rows = $("keyRows"); rows.textContent = "";
    const t = keyTargets(r.mode);
    for (const [title, list] of [["Ground", t.ground], ["Air", t.air], ["Function", t.fn]]) {
      const row = document.createElement("div"); row.className = "keyrow";
      row.innerHTML = '<span class="keyrow-title">' + title + '</span><div class="keybtns"></div>';
      for (const tg of list) {
        const b = document.createElement("button"); b.type = "button"; b.className = "keybtn";
        b.innerHTML = '<span class="kb-label"></span><span class="kb-key"></span>'; b.firstChild.textContent = tg.label;
        b.onclick = () => selectKeyTarget(tg);
        row.lastChild.appendChild(b); keymap.btns.push({ tg, el: b, key: b.lastChild });
      }
      rows.appendChild(row);
    }
  }
  $("keyMode").textContent = MODE_NAMES[r.mode];
  for (const b of keymap.btns) {
    b.key.textContent = keyName(r.keymap[b.tg.ps[0]]);
    b.el.classList.toggle("sel", keymap.target === b.tg);
  }
  $("keyClear").disabled = !keymap.target || app.busy > 0;
  $("keyHint").textContent = keymap.target ? "Press the key to assign to " + keymap.target.label + ". Click it again when you are done." : "Select a key, an air line or FN, then press the key to assign to it.";
}

function selectKeyTarget(tg) { keymap.target = keymap.target === tg ? null : tg; renderKeyCard(); }

async function applyKey(code) {
  const r = app.cfg, t = keymap.target; if (!r || !t || !r.keymap) return;
  const mode = r.mode, km = r.keymap.slice(); t.ps.forEach(p => { km[p] = code; });
  await runOp("Setting the key", async c => {
    await c.api.setKeymap(mode, km);
    await c.api.save();
    r.keymap = await c.api.getKeymap(mode);
    const ok = t.ps.every(p => r.keymap[p] === code);
    toast(ok ? t.label + ": " + keyName(code) : "Device reports " + keyName(r.keymap[t.ps[0]]) + " for " + t.label, ok ? "ok" : "bad");
  });
  renderKeyCard(); renderKeys();
}

document.addEventListener("keydown", e => {
  if (!keymap.target || $("keyCard").hidden || e.repeat) return;
  if (e.target && /^(input|textarea|select)$/i.test(e.target.tagName)) return;
  e.preventDefault();
  const code = codeToHid(e.code);
  if (code === null) { toast("This key cannot be assigned", "bad"); return; }
  applyKey(code);
});
$("keyClear").onclick = () => { if (keymap.target) applyKey(0); };
$("keyRestore").onclick = async () => {
  const r = app.cfg; if (!r || !(r.mode >= 1 && r.mode <= 4)) return;
  if (!confirm("Restore the keys of the " + MODE_NAMES[r.mode] + " to the factory keys?")) return;
  await runOp("Restoring the keys", async c => {
    await c.api.restoreKeymap(r.mode);
    r.keymap = await c.api.getKeymap(r.mode);
    toast("Keys restored", "ok");
  });
  renderKeyCard(); renderKeys();
};
