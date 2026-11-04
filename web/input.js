/* Keyboard mapping. Action ids mirror enum FlAction in core/flight.h. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitInput = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ACTION = { PITCH_UP: 0, PITCH_DOWN: 1, YAW_LEFT: 2, YAW_RIGHT: 3,
                 THROTTLE_UP: 4, THROTTLE_DOWN: 5, FIRE: 6, AUTOPILOT: 7 };
  var KEYS = {
    ArrowUp: ACTION.PITCH_UP, KeyW: ACTION.PITCH_UP,
    ArrowDown: ACTION.PITCH_DOWN, KeyS: ACTION.PITCH_DOWN,
    ArrowLeft: ACTION.YAW_LEFT, KeyA: ACTION.YAW_LEFT,
    ArrowRight: ACTION.YAW_RIGHT, KeyD: ACTION.YAW_RIGHT,
    KeyX: ACTION.THROTTLE_UP, KeyE: ACTION.THROTTLE_UP,
    KeyZ: ACTION.THROTTLE_DOWN, KeyQ: ACTION.THROTTLE_DOWN,
    Space: ACTION.FIRE, KeyP: ACTION.AUTOPILOT
  };
  function actionForCode(code) {
    return Object.prototype.hasOwnProperty.call(KEYS, code) ? KEYS[code] : -1;
  }
  return { ACTION: ACTION, KEYS: KEYS, actionForCode: actionForCode };
});
