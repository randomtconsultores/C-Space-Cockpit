/* Contract tests between the JS shell and the C core headers. */
const fs = require("fs"), assert = require("assert"), path = require("path");
const Input = require("./input.js"), Events = require("./events.js"), Hud = require("./hud.js");
const Settings = require("./settings.js");
const Gamepad = require("./gamepad.js");
const Keymap = require("./keymap.js");
const Renderer = require("./render_gl.js");
Keymap.useStorage(null);
Keymap.load();
Input.setKeymap(Keymap);
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

// --- keymap: teclas reconfiguraveis (slots duplos) ---
(function () {
  function makeStorage(map) {
    return { _m: map || {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = String(v); } };
  }
  var FIRE = Input.ACTION.FIRE, PITCH_UP = Input.ACTION.PITCH_UP, AUTOPILOT = Input.ACTION.AUTOPILOT;

  Keymap.useStorage(null); Keymap.load(); Input.setKeymap(Keymap);

  // keyLabel: letras, digitos, setas, espaco, enter, modificadores, fallback
  assert.strictEqual(Keymap.keyLabel("KeyA"), "A");
  assert.strictEqual(Keymap.keyLabel("KeyZ"), "Z");
  assert.strictEqual(Keymap.keyLabel("Digit0"), "0");
  assert.strictEqual(Keymap.keyLabel("Digit9"), "9");
  assert.strictEqual(Keymap.keyLabel("ArrowUp"), "Seta cima");
  assert.strictEqual(Keymap.keyLabel("ArrowDown"), "Seta baixo");
  assert.strictEqual(Keymap.keyLabel("ArrowLeft"), "Seta esquerda");
  assert.strictEqual(Keymap.keyLabel("ArrowRight"), "Seta direita");
  assert.strictEqual(Keymap.keyLabel("Space"), "Espaço");
  assert.strictEqual(Keymap.keyLabel("Enter"), "Enter");
  assert.strictEqual(Keymap.keyLabel("Shift"), "Shift");
  assert.strictEqual(Keymap.keyLabel("Control"), "Control");
  assert.strictEqual(Keymap.keyLabel("Alt"), "Alt");
  assert.strictEqual(Keymap.keyLabel("Tab"), "Tab");
  assert.strictEqual(Keymap.keyLabel("F5"), "F5");
  assert.strictEqual(Keymap.keyLabel(""), "");

  // nomes de acao em portugues
  assert.deepStrictEqual(Keymap.ACTION_NAMES, ["CIMA", "BAIXO", "ESQUERDA", "DIREITA", "ACELERAR", "TRAVAR", "LASER", "PILOTO AUTOMÁTICO"]);

  // valores por defeito
  assert.deepStrictEqual(Keymap.getKeys(PITCH_UP), ["ArrowUp", "KeyW"]);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space"]);
  assert.deepStrictEqual(Keymap.getKeys(AUTOPILOT), ["KeyP"]);
  assert.strictEqual(Input.actionForCode("Space"), FIRE);
  assert.strictEqual(Input.actionForCode("KeyP"), AUTOPILOT);
  assert.strictEqual(Input.actionForCode("constructor"), -1);

  // substituir uma das duas teclas (slot 0 de FIRE)
  var rAdd = Keymap.assign(FIRE, "KeyK");
  assert.strictEqual(rAdd.ok, true);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space", "KeyK"]);
  var rSlot = Keymap.setSlot(FIRE, 0, "KeyJ");
  assert.strictEqual(rSlot.ok, true);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["KeyJ", "KeyK"]);
  assert.strictEqual(Input.actionForCode("Space"), -1);
  assert.strictEqual(Input.actionForCode("KeyJ"), FIRE);
  assert.strictEqual(Input.actionForCode("KeyK"), FIRE);

  // conflito com outra acao: KeyW pertence a PITCH_UP; muda para FIRE slot 0
  Keymap.useStorage(null); Keymap.load(); Input.setKeymap(Keymap);
  Keymap.assign(FIRE, "KeyK"); // FIRE = [Space, KeyK]
  var rConf = Keymap.setSlot(FIRE, 0, "KeyW"); // KeyW sai de PITCH_UP
  assert.strictEqual(rConf.ok, true);
  assert.strictEqual(Input.actionForCode("KeyW"), FIRE);
  assert.deepStrictEqual(Keymap.getKeys(PITCH_UP), ["ArrowUp"]); // nao ficou sem tecla
  assert.ok(rConf.message.indexOf("Substitui") >= 0, "mensagem de conflito: " + rConf.message);
  assert.ok(rConf.message.indexOf("W") >= 0 && rConf.message.indexOf("CIMA") >= 0, "mensagem usa nomes legiveis: " + rConf.message);

  // tecla reservada nao e atribuivel
  Keymap.useStorage(null); Keymap.load(); Input.setKeymap(Keymap);
  var rr = Keymap.setSlot(FIRE, 0, "Escape");
  assert.strictEqual(rr.ok, false);
  assert.strictEqual(rr.message, "Tecla reservada.");
  assert.strictEqual(Input.actionForCode("Escape"), -1);
  var rr2 = Keymap.setSlot(FIRE, 0, "F12");
  assert.strictEqual(rr2.ok, false);
  var rr3 = Keymap.setSlot(FIRE, 0, "Enter");
  assert.strictEqual(rr3.ok, false);

  // acao que fica sem teclas volta ao valor por defeito ao carregar
  Keymap.useStorage(makeStorage({ "6": [] })); // FIRE sem teclas
  Keymap.load(); Input.setKeymap(Keymap);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space"]); // defeito reposto
  assert.strictEqual(Input.actionForCode("Space"), FIRE);

  // JSON corrompido: usa defeito sem rebentar
  Keymap.useStorage(null); Keymap.load();
  Keymap.useStorage({ getItem() { return "{not json"; }, setItem() {} });
  Keymap.load();
  assert.strictEqual(Input.actionForCode("Space"), FIRE);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space"]);

  // localStorage que lanc: nao rebenta, mantem defeito
  Keymap.useStorage({ getItem() { throw new Error("boom"); }, setItem() { throw new Error("boom"); } });
  Keymap.load();
  assert.strictEqual(Input.actionForCode("Space"), FIRE);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space"]);

  // persistência: grava, recarrega o modulo com o mesmo localStorage falso, obtem o mesmo mapa
  Keymap.useStorage(null); Keymap.load(); Input.setKeymap(Keymap);
  Keymap.assign(FIRE, "KeyM");
  Keymap.assign(AUTOPILOT, "KeyO");
  var store = makeStorage({});
  Keymap.useStorage(store);
  Keymap.save();
  var persisted = JSON.parse(store._m["cockpit.keys"]);
  assert.strictEqual(persisted[6][0], "Space");
  assert.strictEqual(persisted[6][1], "KeyM");
  assert.strictEqual(persisted[7][0], "KeyP");
  assert.strictEqual(persisted[7][1], "KeyO");
  // recarrega com mesmo conteudo
  var store2 = makeStorage(JSON.parse(JSON.stringify(store._m)));
  Keymap.useStorage(store2);
  Keymap.load(); Input.setKeymap(Keymap);
  assert.strictEqual(Input.actionForCode("KeyM"), FIRE);
  assert.strictEqual(Input.actionForCode("KeyO"), AUTOPILOT);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space", "KeyM"]);

  // repor tudo
  Keymap.resetAll();
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space"]);
  assert.strictEqual(Input.actionForCode("KeyM"), -1);
  assert.strictEqual(Input.actionForCode("KeyO"), -1);

  // modelo de captura: startCapture + handleCaptureKey + cancelCapture
  Keymap.useStorage(null); Keymap.load(); Input.setKeymap(Keymap);
  var cap = Keymap.startCapture(FIRE, 1);
  assert.strictEqual(cap.state.active, true);
  assert.strictEqual(cap.state.action, FIRE);
  assert.strictEqual(cap.state.slot, 1);
  var cap2 = Keymap.handleCaptureKey("KeyB");
  assert.strictEqual(cap2.state.active, false); // captura encerrou
  assert.strictEqual(Input.actionForCode("KeyB"), FIRE);
  assert.deepStrictEqual(Keymap.getKeys(FIRE), ["Space", "KeyB"]);

  // captura com Escape cancela
  var cap3 = Keymap.startCapture(FIRE, 0);
  assert.strictEqual(cap3.state.active, true);
  var cap4 = Keymap.handleCaptureKey("Escape");
  assert.strictEqual(cap4.state.active, false);

  // deixa input num estado coerente
  Keymap.useStorage(null); Keymap.load(); Input.setKeymap(Keymap);
})();

// --- heatLevel: flame glow only in the orange/red stage ---
(function () {
  var h = require("./render_gl.js").heatLevel;
  assert(h(1.0) === 0 && h(0.0) === 0, "heat zero on ground and in space");
  assert(h(0.28) > 0.9, "heat peak near orange/red stage: " + h(0.28));
  for (var d = 0; d <= 1.0001; d += 0.01) assert(h(d) >= 0 && h(d) <= 1, "heat range");
})();

// --- skyColor: gradient from density to RGB (pure, Node-testable) ---
(function () {
  var sky = Renderer.skyColor;
  /* Extremes. */
  var c0 = sky(0.0);
  assert.strictEqual(c0.length, 3);
  assert(Math.abs(c0[0] - 0.0) < 1e-6 && Math.abs(c0[1] - 0.015) < 1e-6 && Math.abs(c0[2] - 0.02) < 1e-6, "sky(0) black");
  var c1 = sky(1.0);
  assert(Math.abs(c1[0] - 0.35) < 1e-6 && Math.abs(c1[1] - 0.60) < 1e-6 && Math.abs(c1[2] - 0.95) < 1e-6, "sky(1) light blue");
  /* Intermediate stops. */
  var c6 = sky(0.6);
  assert(Math.abs(c6[0] - 0.20) < 1e-6 && Math.abs(c6[1] - 0.40) < 1e-6 && Math.abs(c6[2] - 0.75) < 1e-6, "sky(0.6)");
  var c35 = sky(0.35);
  assert(Math.abs(c35[0] - 0.90) < 1e-6 && Math.abs(c35[1] - 0.45) < 1e-6 && Math.abs(c35[2] - 0.15) < 1e-6, "sky(0.35) orange");
  var c2 = sky(0.2);
  assert(Math.abs(c2[0] - 0.55) < 1e-6 && Math.abs(c2[1] - 0.12) < 1e-6 && Math.abs(c2[2] - 0.10) < 1e-6, "sky(0.2) dark red");
  var c08 = sky(0.08);
  assert(Math.abs(c08[0] - 0.15) < 1e-6 && Math.abs(c08[1] - 0.04) < 1e-6 && Math.abs(c08[2] - 0.20) < 1e-6, "sky(0.08) violet");
  /* Clamping. */
  var cNeg = sky(-0.5); assert.deepStrictEqual(cNeg, c0, "clamp negative");
  var cPos = sky(1.5); assert.deepStrictEqual(cPos, c1, "clamp >1");
  /* Continuity: max difference between consecutive samples of 0.01 in d. */
  var maxDiff = 0.0;
  for (var d = 0.0; d < 1.0; d += 0.01) {
    var ca = sky(d), cb = sky(d + 0.01);
    var diff = Math.abs(ca[0] - cb[0]) + Math.abs(ca[1] - cb[1]) + Math.abs(ca[2] - cb[2]);
    if (diff > maxDiff) maxDiff = diff;
  }
  assert(maxDiff < 0.1, "skyColor continuity: max step " + maxDiff);
  /* No NaN. */
  for (var d = 0.0; d <= 1.0; d += 0.001) {
    var c = sky(d);
    assert(!isNaN(c[0]) && !isNaN(c[1]) && !isNaN(c[2]), "no NaN at d=" + d);
  }
})();

console.log("js contract tests ok");
