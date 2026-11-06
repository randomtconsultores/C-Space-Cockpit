/* Keymap: teclas reconfiguraveis para as 8 acoes (0..7).
   Modulo UMD, puro e testavel em Node. Guarda o mapa em localStorage
   (chave "cockpit.keys") como JSON de event.code por acao. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitKeymap = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ACTION = { PITCH_UP: 0, PITCH_DOWN: 1, YAW_LEFT: 2, YAW_RIGHT: 3,
                 THROTTLE_UP: 4, THROTTLE_DOWN: 5, FIRE: 6, AUTOPILOT: 7 };
  var ACTION_COUNT = 8;
  var ACTION_NAMES = ["PITCH UP", "PITCH DOWN", "YAW ESQ.", "YAW DIR.",
                      "ACELERAR", "TRAVAR", "LASER", "PILOTO"];
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
    try { parsed = JSON.parse(raw); } catch (e) { return; } /* JSON corrupto: defeito */
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

  function assign(action, code) {
    var res = { ok: false, message: "" };
    if (action < 0 || action >= ACTION_COUNT) { res.message = "Acao invalida."; return res; }
    if (!validCode(code)) { res.message = "Tecla reservada."; return res; }
    if (map[action].indexOf(code) >= 0) { res.ok = true; res.message = "Ja atribuida a esta acao."; return res; }
    if (map[action].length >= MAX_KEYS) { res.message = "Limite de 2 teclas atingido."; return res; }
    var owner = actionForCode(code);
    var conflict = owner >= 0 && owner !== action;
    if (conflict) {
      map[owner] = map[owner].filter(function (c) { return c !== code; });
      res.message = "Substitui " + code + " da acao " + owner + ".";
    }
    map[action].push(code);
    /* se o dono ficou sem teclas, repoe o defeito sem duplicar teclas agora
       noutra acao (pode ficar vazio so no caso extremo de so-uma-tecla movida) */
    if (conflict && map[owner].length === 0) {
      var def = DEFAULTS[owner].slice();
      map[owner] = def.filter(function (d) {
        var od = actionForCode(d); return od < 0 || od === owner;
      });
    }
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

  load();

  return {
    ACTION: ACTION,
    ACTION_NAMES: ACTION_NAMES,
    ACTION_COUNT: ACTION_COUNT,
    useStorage: useStorage,
    load: load,
    save: save,
    getKeys: getKeys,
    actionForCode: actionForCode,
    isReserved: isReserved,
    assign: assign,
    resetAction: resetAction,
    resetAll: resetAll
  };
});
