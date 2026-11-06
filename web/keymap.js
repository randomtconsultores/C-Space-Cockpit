/* Keymap: teclas reconfiguraveis para as 8 acoes (0..7, ids iguais a
   FlAction de core/flight.h). Objeto JS puro, UMD, testavel em Node.
   Guarda o mapa em localStorage (chave "cockpit.keys") como JSON de
   event.code por acao. Cada acao tem ate 2 slots (tecla 1 e tecla 2). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitKeymap = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Identificadores de acao (ingles, espelham FlAction). */
  var ACTION = { PITCH_UP: 0, PITCH_DOWN: 1, YAW_LEFT: 2, YAW_RIGHT: 3,
                 THROTTLE_UP: 4, THROTTLE_DOWN: 5, FIRE: 6, AUTOPILOT: 7 };
  var ACTION_COUNT = 8;
  /* Nomes visiveis ao jogador (portugues). */
  var ACTION_NAMES = ["CIMA", "BAIXO", "ESQUERDA", "DIREITA",
                      "ACELERAR", "TRAVAR", "LASER", "PILOTO AUTOMÁTICO"];
  var DEFAULTS = {
    0: ["ArrowUp", "KeyW"],
    1: ["ArrowDown", "KeyS"],
    2: ["ArrowLeft", "KeyA"],
    3: ["ArrowRight", "KeyD"],
    4: ["KeyX", "KeyE"],
    5: ["KeyZ", "KeyQ"],
    6: ["Space"],
    7: ["KeyP"]
  };
  var STORAGE_KEY = "cockpit.keys";
  var MAX_KEYS = 2;
  var storage = null;
  var map = cloneDefaults();

  function cloneDefaults() {
    var out = {};
    for (var a = 0; a < ACTION_COUNT; a++) out[a] = DEFAULTS[a].slice();
    return out;
  }

  /* ----- label legível para o jogador ----- */
  function keyLabel(code) {
    if (typeof code !== "string" || code.length === 0) return code;
    var m = code.match(/^Key([A-Z])$/);
    if (m) return m[1];
    m = code.match(/^Digit(\d)$/);
    if (m) return m[1];
    switch (code) {
      case "ArrowUp": return "Seta cima";
      case "ArrowDown": return "Seta baixo";
      case "ArrowLeft": return "Seta esquerda";
      case "ArrowRight": return "Seta direita";
      case "Space": return "Espaço";
      case "Enter": return "Enter";
      case "Shift": return "Shift";
      case "Control": return "Control";
      case "Alt": return "Alt";
      case "Tab": return "Tab";
      default: return code;
    }
  }

  function isReserved(code) {
    if (code === "Escape" || code === "Enter" || code === "F3" || code === "KeyI") return true;
    if (/^F(?:[1-9]|1[0-2])$/.test(code)) return true;
    return false;
  }

  function validCode(code) {
    return typeof code === "string" && code.length > 0 && !isReserved(code);
  }

  function useStorage(s) { storage = s; }

  function load() {
    map = cloneDefaults();
    if (!storage) return;
    var raw;
    try { raw = storage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (raw === null || raw === undefined) return;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return; } /* JSON corrompido: defeito */
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    for (var a = 0; a < ACTION_COUNT; a++) {
      var keys = parsed[a];
      var acc = [];
      if (Array.isArray(keys)) {
        for (var i = 0; i < keys.length && acc.length < MAX_KEYS; i++) {
          var c = keys[i];
          if (validCode(c) && acc.indexOf(c) < 0) acc.push(c);
        }
      }
      if (acc.length === 0) acc = DEFAULTS[a].slice();
      map[a] = acc;
    }
  }

  function save() {
    if (!storage) return;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch (e) { /* bloqueado/quota */ }
  }

  function getKeys(action) {
    if (action < 0 || action >= ACTION_COUNT) return [];
    return map[action].slice();
  }

  function actionForCode(code) {
    for (var a = 0; a < ACTION_COUNT; a++) {
      for (var i = 0; i < map[a].length; i++) {
        if (map[a][i] === code) return a;
      }
    }
    return -1;
  }

  function removeCodeFrom(code, exceptAction) {
    var owner = actionForCode(code);
    if (owner < 0 || owner === exceptAction) return;
    map[owner] = map[owner].filter(function (c) { return c !== code; });
    if (map[owner].length === 0) map[owner] = DEFAULTS[owner].slice();
  }

  function assign(action, code) {
    var res = { ok: false, message: "" };
    if (action < 0 || action >= ACTION_COUNT) { res.message = "Acao invalida."; return res; }
    if (!validCode(code)) { res.message = "Tecla reservada."; return res; }
    if (map[action].indexOf(code) >= 0) { res.ok = true; res.message = "Já atribuída a esta ação."; return res; }
    if (map[action].length >= MAX_KEYS) { res.message = "Limite de 2 teclas atingido."; return res; }
    removeCodeFrom(code, action);
    map[action].push(code);
    res.ok = true;
    save();
    return res;
  }

  /* Substitui o slot (0 ou 1) de uma acao por um novo codigo. */
  function setSlot(action, slot, code) {
    var res = { ok: false, message: "" };
    if (action < 0 || action >= ACTION_COUNT) { res.message = "Acao invalida."; return res; }
    if (slot !== 0 && slot !== 1) { res.message = "Slot inválido."; return res; }
    if (!validCode(code)) { res.message = "Tecla reservada."; return res; }
    var keys = map[action];
    if (keys.indexOf(code) >= 0) { res.ok = true; res.message = "Já atribuída a esta ação."; return res; }
    var owner = actionForCode(code);
    if (owner >= 0 && owner !== action) {
      removeCodeFrom(code, action);
      res.message = "Substitui " + keyLabel(code) + " da ação " + ACTION_NAMES[owner] + ".";
    }
    if (slot < keys.length) keys[slot] = code;
    else keys.push(code);
    /* compensa buracos */
    map[action] = keys.filter(function (c) { return c !== undefined; });
    res.ok = true;
    save();
    return res;
  }

  function resetAction(action) {
    if (action < 0 || action >= ACTION_COUNT) return;
    map[action] = DEFAULTS[action].slice();
    save();
  }

  function resetAll() {
    map = cloneDefaults();
    save();
  }

  /* ----- modelo de captura (estado + transicao pura por tecla) ----- */
  var capture = { active: false, action: -1, slot: 0 };

  function captureState() {
    return { active: capture.active, action: capture.action, slot: capture.slot };
  }

  function startCapture(action, slot) {
    capture.active = true;
    capture.action = action;
    capture.slot = slot;
    return { state: captureState(), message: "" };
  }

  function cancelCapture() {
    capture.active = false;
    capture.action = -1;
    capture.slot = 0;
    return { state: captureState(), message: "" };
  }

  function handleCaptureKey(code) {
    if (!capture.active) return { state: captureState(), message: "" };
    if (code === "Escape") { return cancelCapture(); }
    var res = setSlot(capture.action, capture.slot, code);
    if (res.ok) {
      cancelCapture();
      return { state: captureState(), message: res.message || "" };
    }
    return { state: captureState(), message: res.message || "" };
  }

  load();

  return {
    ACTION: ACTION,
    ACTION_NAMES: ACTION_NAMES,
    ACTION_COUNT: ACTION_COUNT,
    keyLabel: keyLabel,
    useStorage: useStorage,
    load: load,
    save: save,
    getKeys: getKeys,
    actionForCode: actionForCode,
    isReserved: isReserved,
    assign: assign,
    setSlot: setSlot,
    resetAction: resetAction,
    resetAll: resetAll,
    /* captura */
    captureState: captureState,
    startCapture: startCapture,
    cancelCapture: cancelCapture,
    handleCaptureKey: handleCaptureKey
  };
});
