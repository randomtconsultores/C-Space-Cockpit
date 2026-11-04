/* Contract tests between the JS shell and the C core headers. */
const fs = require("fs"), assert = require("assert"), path = require("path");
const Input = require("./input.js"), Events = require("./events.js"), Hud = require("./hud.js");
const header = fs.readFileSync(path.join(__dirname, "../core/flight.h"), "utf8");
function enumOf(name) {
  const m = header.match(new RegExp("enum " + name + " \\{([^}]*)\\}"));
  assert(m, "enum " + name);
  const out = []; let cur = -1;
  for (const raw of m[1].split(",")) {
    const t = raw.replace(/\/\*.*?\*\//g, "").trim(); if (!t) continue;
    const [n, v] = t.split("=").map(s => s.trim());
    cur = v !== undefined ? Number(v) : cur + 1; out.push([n, cur]);
  }
  return out;
}
// actions: keyboard map ids must equal FlAction
const actions = Object.fromEntries(enumOf("FlAction").map(([n, v]) => [n.replace("FL_", "").replace("AUTOPILOT_TOGGLE", "AUTOPILOT"), v]));
for (const [k, v] of Object.entries(Input.ACTION)) assert.strictEqual(actions[k], v, "action " + k);
assert.strictEqual(Input.actionForCode("Space"), Input.ACTION.FIRE);
assert.strictEqual(Input.actionForCode("constructor"), -1);
assert.strictEqual(Input.actionForCode("KeyP"), Input.ACTION.AUTOPILOT);
// stats: HUD ids must equal FlStat
for (const [n, v] of enumOf("FlStat")) {
  const key = n.replace("FS_", "");
  if (key === "COUNT") { assert.strictEqual(Object.keys(Hud.STAT).length, v); continue; }
  assert.strictEqual(Hud.STAT[key], v, "stat " + key);
}
// events: every semantic event has a sound, ids match FlEvent
const evs = Object.fromEntries(enumOf("FlEvent").map(([n, v]) => [n.replace("FL_EV_", ""), v]));
for (const [k, v] of Object.entries(Events.EV)) assert.strictEqual(evs[k], v, "event " + k);
for (const v of Object.values(Events.EV)) { const s = Events.soundFor(v); assert(s >= 1 && s <= 16, "sound for " + v); }
assert.strictEqual(Events.soundFor(0), 0); assert.strictEqual(Events.soundFor(99), 0);
assert.deepStrictEqual(Events.vibrationFor(Events.EV.HIT), [80, 40, 80]);
assert.strictEqual(Events.vibrationFor(Events.EV.FIRE), null);
// text tables cover every mode and alert
for (const [n, v] of enumOf("FlMode")) assert(Hud.endText(v) !== undefined, n);
assert.strictEqual(Hud.fmtTime(125), "2:05"); assert.strictEqual(Hud.fmtTime(-3), "0:00");
console.log("js contract tests ok");
