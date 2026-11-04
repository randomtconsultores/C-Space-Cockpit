/* Settings persisted in localStorage.
   Pure, testable functions; no browser globals except an injected storage. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitSettings = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var STORAGE_KEY = "cockpit.invertPitch";
  var PITCH_UP = 0;
  var PITCH_DOWN = 1;
  var storage = null;

  function useStorage(s) { storage = s; }

  function tryRead() {
    if (!storage) return false;
    try { return storage.getItem(STORAGE_KEY) === "1"; }
    catch (e) { return false; }
  }

  function tryWrite(value) {
    if (!storage) return;
    try { storage.setItem(STORAGE_KEY, value ? "1" : "0"); }
    catch (e) { /* localStorage unavailable or quota exceeded: keep default */ }
  }

  function isInverted() { return tryRead(); }
  function setInverted(value) { tryWrite(!!value); }

  /* Pure: maps an action, swapping PITCH_UP/PITCH_DOWN when inverted. */
  function mapAction(action) {
    if (!isInverted()) return action;
    if (action === PITCH_UP) return PITCH_DOWN;
    if (action === PITCH_DOWN) return PITCH_UP;
    return action;
  }

  return {
    PITCH_UP: PITCH_UP,
    PITCH_DOWN: PITCH_DOWN,
    useStorage: useStorage,
    isInverted: isInverted,
    setInverted: setInverted,
    mapAction: mapAction
  };
});
