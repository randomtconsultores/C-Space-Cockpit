/* Contract tests between the JS shell and the C core headers. */
const fs = require("fs"), assert = require("assert"), path = require("path");
const Input = require("./input.js"), Events = require("./events.js"), Hud = require("./hud.js");
const Settings = require("./settings.js");
const Gamepad = require("./gamepad.js");
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
// all mapped actions are in 0..7
for (const v of Object.values(Input.ACTION)) assert(v >= 0 && v <= 7, "action range " + v);
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

// --- settings: pitch inversion ---
function makeStorage(map) {
  return { _m: map || {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = String(v); } };
}
Settings.useStorage(null);   // no storage: default false, no crash
assert.strictEqual(Settings.isInverted(), false);
assert.strictEqual(Settings.mapAction(Settings.PITCH_UP), Settings.PITCH_UP);
assert.strictEqual(Settings.mapAction(Settings.PITCH_DOWN), Settings.PITCH_DOWN);
assert.strictEqual(Settings.mapAction(Input.ACTION.FIRE), Input.ACTION.FIRE);

Settings.useStorage(makeStorage({}));
assert.strictEqual(Settings.isInverted(), false);
Settings.setInverted(true);
assert.strictEqual(Settings.isInverted(), true);
assert.strictEqual(Settings.mapAction(Settings.PITCH_UP), Settings.PITCH_DOWN);
assert.strictEqual(Settings.mapAction(Settings.PITCH_DOWN), Settings.PITCH_UP);
assert.strictEqual(Settings.mapAction(Input.ACTION.FIRE), Input.ACTION.FIRE);
assert.strictEqual(Settings.mapAction(Input.ACTION.YAW_LEFT), Input.ACTION.YAW_LEFT);
Settings.setInverted(false);
assert.strictEqual(Settings.isInverted(), false);

// persistence round trip through the injected storage
var store = makeStorage({});
Settings.useStorage(store);
Settings.setInverted(true);
assert.strictEqual(store._m["cockpit.invertPitch"], "1");
assert.strictEqual(Settings.isInverted(), true);
Settings.setInverted(false);
assert.strictEqual(store._m["cockpit.invertPitch"], "0");

// storage that throws: no crash, keeps default
Settings.useStorage({ getItem() { throw new Error("boom"); }, setItem() { throw new Error("boom"); } });
assert.strictEqual(Settings.isInverted(), false);
assert.strictEqual(Settings.mapAction(Settings.PITCH_UP), Settings.PITCH_UP);

// restore a neutral storage for other modules
Settings.useStorage(makeStorage({}));

// --- gamepad: deadzone and thresholds with simulated gamepads ---
const calls = [];
function pressFn(act, down) { calls.push([act, down]); }
function pauseFn() { calls.push(["pause", true]); }

function makePad(buttons, axes) {
  return { index: 0, buttons: buttons.map(v => ({ value: v })), axes: axes };
}
function scenario(buttons, axes, expected) {
  Gamepad.reset();
  Gamepad.setGetGamepads(() => [makePad(buttons, axes)]);
  calls.length = 0;
  Gamepad.update(pressFn, pauseFn);
  assert.deepStrictEqual(calls, expected, JSON.stringify(buttons) + " " + JSON.stringify(axes));
}

// no gamepad connected: nothing happens
Gamepad.setGetGamepads(() => []);
Gamepad.reset();
calls.length = 0;
Gamepad.update(pressFn, pauseFn);
assert.strictEqual(calls.length, 0);

// button A (index 0) pressed -> FIRE down; held again: no repeat; release -> up
scenario([1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0], [[Input.ACTION.FIRE, true]]);
// held again: edge-triggered, no repeat (holder persists across frames)
Gamepad.setGetGamepads(() => [makePad([1, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])]);
calls.length = 0;
Gamepad.update(pressFn, pauseFn);
assert.deepStrictEqual(calls, []);
Gamepad.setGetGamepads(() => [makePad([0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0])]);
calls.length = 0;
Gamepad.update(pressFn, pauseFn);
assert.deepStrictEqual(calls, [[Input.ACTION.FIRE, false]]);

// button Y (index 3) -> AUTOPILOT
scenario([0, 0, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0], [[Input.ACTION.AUTOPILOT, true]]);

// triggers RT (7) -> THROTTLE_UP, LT (6) -> THROTTLE_DOWN (analog > 0.5)
// different gamepad index to avoid holder cross-talk
scenario([0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0], [[Input.ACTION.THROTTLE_UP, true]]);
Gamepad.reset();
Gamepad.setGetGamepads(() => [makePad([0, 0, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0])]);
// index 1: no auto-release of index 0's action
Gamepad.setGetGamepads(() => [makePad([0, 0, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0])]);
makePad.index = 1;
calls.length = 0;
Gamepad.update(pressFn, pauseFn);
assert.deepStrictEqual(calls, [[Input.ACTION.THROTTLE_DOWN, true]]);

// deadzone: axis values within +/-0.2 produce nothing
scenario([0, 0, 0, 0, 0, 0, 0, 0], [0.15, -0.15, 0, 0], []);

// left stick X above 0.5 -> YAW_RIGHT; below -0.5 -> YAW_LEFT
scenario([0, 0, 0, 0, 0, 0, 0, 0], [0.8, 0, 0, 0], [[Input.ACTION.YAW_RIGHT, true]]);
scenario([0, 0, 0, 0, 0, 0, 0, 0], [-0.8, 0, 0, 0], [[Input.ACTION.YAW_LEFT, true]]);

// left stick Y: up (negative) -> PITCH_UP; down (positive) -> PITCH_DOWN
scenario([0, 0, 0, 0, 0, 0, 0, 0], [0, -0.8, 0, 0], [[Input.ACTION.PITCH_UP, true]]);
scenario([0, 0, 0, 0, 0, 0, 0, 0], [0, 0.8, 0, 0], [[Input.ACTION.PITCH_DOWN, true]]);

// Start (index 9) -> pause
scenario([0, 0, 0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0], [["pause", true]]);

// disconnect releases held actions
Gamepad.reset();
Gamepad.setGetGamepads(() => [makePad([1, 0, 0, 1, 0, 0, 0, 0], [0.8, -0.8, 0, 0])]);
calls.length = 0;
Gamepad.update(pressFn, pauseFn);
assert(calls.some(c => c[0] === Input.ACTION.FIRE && c[1] === true));
assert(calls.some(c => c[0] === Input.ACTION.AUTOPILOT && c[1] === true));
assert(calls.some(c => c[0] === Input.ACTION.YAW_RIGHT && c[1] === true));
assert(calls.some(c => c[0] === Input.ACTION.PITCH_UP && c[1] === true));
// disconnect
Gamepad.setGetGamepads(() => []);
calls.length = 0;
Gamepad.update(pressFn, pauseFn);
assert(calls.some(c => c[0] === Input.ACTION.FIRE && c[1] === false));
assert(calls.some(c => c[0] === Input.ACTION.AUTOPILOT && c[1] === false));
assert(calls.some(c => c[0] === Input.ACTION.YAW_RIGHT && c[1] === false));
assert(calls.some(c => c[0] === Input.ACTION.PITCH_UP && c[1] === false));

Gamepad.setGetGamepads(() => []);
Gamepad.reset();
Settings.useStorage(null);

console.log("js contract tests ok");
