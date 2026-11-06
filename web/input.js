/* Keyboard: maps event.code to an action (ids mirror enum FlAction of
   core/flight.h). The keymap lives in CockpitKeymap; this module tracks the
   held-key state (up to 2 keys per action) and reports press/release via
   callback. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitInput = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ACTION = { PITCH_UP: 0, PITCH_DOWN: 1, YAW_LEFT: 2, YAW_RIGHT: 3,
                 THROTTLE_UP: 4, THROTTLE_DOWN: 5, FIRE: 6, AUTOPILOT: 7 };
  var ACTION_COUNT = 8;
  var onPress = null;
  var keymap = null;
  var downCount = new Int32Array(ACTION_COUNT);
  var downCodes = Object.create(null);

  function bind(pressCb) { onPress = pressCb; }
  function setKeymap(km) { keymap = km; }

  function actionForCode(code) {
    var km = keymap || (typeof CockpitKeymap !== "undefined" ? CockpitKeymap : null);
    return km ? km.actionForCode(code) : -1;
  }

  /* Key pressed. Ignores repeats (key already physically held down). */
  function keydown(code, repeat) {
    if (downCodes[code]) return;
    var a = actionForCode(code);
    if (a < 0 || a >= ACTION_COUNT) return;
    downCodes[code] = true;
    if (downCount[a]++ === 0 && onPress) onPress(a, true);
  }

  /* Key released. Releases the action only when all its keys are released. */
  function keyup(code) {
    if (!downCodes[code]) return;
    delete downCodes[code];
    var a = actionForCode(code);
    if (a >= 0 && a < ACTION_COUNT && --downCount[a] === 0 && onPress) onPress(a, false);
  }

  function releaseAll() {
    downCodes = Object.create(null);
    downCount = new Int32Array(ACTION_COUNT);
  }

  return {
    ACTION: ACTION,
    ACTION_COUNT: ACTION_COUNT,
    bind: bind,
    setKeymap: setKeymap,
    actionForCode: actionForCode,
    keydown: keydown,
    keyup: keyup,
    releaseAll: releaseAll
  };
});
