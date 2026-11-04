/* Gamepad input: standard mapping, polled once per frame, edge-triggered.
   Only calls press() when the state of an action changes. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitGamepad = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var ACTION = { PITCH_UP: 0, PITCH_DOWN: 1, YAW_LEFT: 2, YAW_RIGHT: 3,
                 THROTTLE_UP: 4, THROTTLE_DOWN: 5, FIRE: 6, AUTOPILOT: 7 };
  var DEADZONE = 0.2;
  var PRESS = 0.5;
  /* Standard mapping: A=FIRE, Y=AUTOPILOT, LT=THROTTLE_DOWN, RT=THROTTLE_UP, Start=pause. */
  var BUTTON_ACTION = { 0: ACTION.FIRE, 3: ACTION.AUTOPILOT,
                        6: ACTION.THROTTLE_DOWN, 7: ACTION.THROTTLE_UP,
                        9: null };
  var START_BUTTON = 9;
  /* Left stick: axis 0 = yaw, axis 1 = pitch (up is negative). */
  var AXIS_ACTION = {
    0: { neg: ACTION.YAW_LEFT, pos: ACTION.YAW_RIGHT },
    1: { neg: ACTION.PITCH_UP, pos: ACTION.PITCH_DOWN }
  };

  var getGamepads = function () {
    if (typeof navigator === "undefined" ||
        typeof navigator.getGamepads !== "function") return [];
    return navigator.getGamepads();
  };
  function setGetGamepads(fn) { getGamepads = fn; }

  // holder[action] = gamepad index currently pressing it, -1 = none.
  var holder = {};
  for (var a = 0; a < 8; a++) holder[a] = -1;
  var pads = {}; // gamepad index -> last state {buttons:[], axes:[]}

  function initPadState(pad) {
    var buttons = [], axes = [];
    for (var i = 0; i < pad.buttons.length; i++) buttons.push(pad.buttons[i].value);
    for (var i = 0; i < pad.axes.length; i++) axes.push(pad.axes[i]);
    return { buttons: buttons, axes: axes };
  }
  function active(value) { return value > PRESS; }
  function released(value) { return value < DEADZONE; }

  function update(pressFn, pauseFn) {
    var list = getGamepads();
    var present = {};
    for (var i = 0; i < list.length; i++) {
      var pad = list[i]; if (!pad) continue;
      present[pad.index] = true;
      var idx = pad.index;
      var prev = pads[idx];
      if (!prev) prev = { buttons: [], axes: [] };
      var cur = initPadState(pad);

      for (var b in BUTTON_ACTION) {
        var bi = Number(b);
        var act = BUTTON_ACTION[bi];
        var down = active(cur.buttons[bi] !== undefined ? cur.buttons[bi] : 0);
        var pdown = active(prev.buttons[bi] !== undefined ? prev.buttons[bi] : 0);
        if (bi === START_BUTTON) {
          if (down && !pdown && typeof pauseFn === "function") pauseFn();
        } else {
          if (down && !pdown) {
            if (holder[act] === -1) { holder[act] = idx; pressFn(act, true); }
          } else if (!down && pdown) {
            if (holder[act] === idx) { holder[act] = -1; pressFn(act, false); }
          }
        }
      }

      for (var ai in AXIS_ACTION) {
        var aisi = Number(ai);
        var spec = AXIS_ACTION[ai];
        var val = cur.axes[aisi] !== undefined ? cur.axes[aisi] : 0;
        var pval = prev.axes[aisi] !== undefined ? prev.axes[aisi] : 0;
        var negAct = spec.neg, posAct = spec.pos;
        var negDown = active(-val), posDown = active(val);
        var pNegDown = active(-pval), pPosDown = active(pval);
        var negRel = released(-val), posRel = released(val);
        if (negDown && !pNegDown) {
          if (holder[negAct] === -1) { holder[negAct] = idx; pressFn(negAct, true); }
        } else if ((!negDown && pNegDown) || negRel) {
          if (holder[negAct] === idx) { holder[negAct] = -1; pressFn(negAct, false); }
        }
        if (posDown && !pPosDown) {
          if (holder[posAct] === -1) { holder[posAct] = idx; pressFn(posAct, true); }
        } else if ((!posDown && pPosDown) || posRel) {
          if (holder[posAct] === idx) { holder[posAct] = -1; pressFn(posAct, false); }
        }
      }
      pads[idx] = cur;
    }

    // Disconnected pads: release everything they were holding.
    for (var k in holder) {
      var act = Number(k);
      var idx = holder[act];
      if (idx !== -1 && !present[idx]) {
        holder[act] = -1;
        pressFn(act, false);
        delete pads[idx];
      }
    }
  }

  function reset() {
    for (var a = 0; a < 8; a++) holder[a] = -1;
    pads = {};
  }

  return { ACTION: ACTION, setGetGamepads: setGetGamepads, update: update, reset: reset };
});
