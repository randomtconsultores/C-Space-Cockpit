/* Tests for web/story.js (pure, Node-testable). */
"use strict";
const assert = require("assert");
const Story = require("./story.js");

/* --- textForPhase: every phase id returns a string --- */
for (const p of [Story.LV_ASCENT, Story.LV_ATMO_EXIT, Story.LV_TRANSIT, Story.LV_MOON, Story.LV_BELT, Story.LV_EXIT, Story.LV_DONE]) {
  const t = Story.textForPhase(p);
  assert.strictEqual(typeof t, "string", "textForPhase(" + p + ") not a string");
}
assert(Story.textForPhase(Story.LV_ASCENT).indexOf("subida") >= 0, "ascent text");
assert(Story.textForPhase(Story.LV_ATMO_EXIT).indexOf("atmosfera") >= 0, "atmo exit text");
assert(Story.textForPhase(Story.LV_TRANSIT).indexOf("Lua") >= 0, "transit text");
assert(Story.textForPhase(Story.LV_MOON).indexOf("Lua") >= 0, "moon text");
assert(Story.textForPhase(Story.LV_BELT) === "", "belt phase empty");
assert(Story.textForPhase(Story.LV_EXIT) === "", "exit phase empty");
assert(Story.textForPhase(Story.LV_DONE) === "", "done phase empty");

/* --- textForEvent: every event id returns a string --- */
for (const ev of [13, 14, 15, 16, 17, 18]) {
  const t = Story.textForEvent(ev);
  assert.strictEqual(typeof t, "string", "textForEvent(" + ev + ") not a string");
}
assert(Story.textForEvent(13).indexOf("atmosfera") >= 0, "atmo exit event");
assert(Story.textForEvent(14).indexOf("Lua") >= 0, "moon event");
assert(Story.textForEvent(15).indexOf("Fisga") >= 0, "sling good event");
assert(Story.textForEvent(16).indexOf("Fisga") >= 0, "sling ok event");
assert(Story.textForEvent(17).indexOf("Fisga") >= 0, "sling miss event");
assert(Story.textForEvent(18).indexOf("Inclina") >= 0, "tilt warning event");
assert(Story.textForEvent(0) === "", "unknown event empty");
assert(Story.textForEvent(99) === "", "invalid event empty");

/* --- accents in expected strings --- */
assert(Story.textForPhase(Story.LV_ASCENT).indexOf("inclina\u00e7\u00e3o") >= 0, "inclina\u00e7\u00e3o accent");
assert(Story.textForEvent(18).indexOf("combust\u00edvel") >= 0, "combust\u00edvel accent");
assert(Story.textForPhase(Story.LV_MOON).indexOf("cientistas terrestres") >= 0, "moon text");
assert(Story.textForEvent(15).indexOf("perfeita") >= 0, "sling good text");
assert(Story.textForEvent(17).indexOf("falhada") >= 0, "sling miss text");

/* --- no invalid characters: every string is valid UTF-8 --- */
function checkValid(s) {
  for (let i = 0; i < s.length; i++) {
    assert(s.charCodeAt(i) !== 0xFFFD, "replacement char in: " + s);
  }
}
const allTexts = [
  Story.textForPhase(Story.LV_ASCENT), Story.textForPhase(Story.LV_ATMO_EXIT),
  Story.textForPhase(Story.LV_TRANSIT), Story.textForPhase(Story.LV_MOON),
  Story.textForEvent(13), Story.textForEvent(14), Story.textForEvent(15),
  Story.textForEvent(16), Story.textForEvent(17), Story.textForEvent(18)
];
for (const t of allTexts) checkValid(t);

/* --- hintForState: priority-based --- */
function makeStats(values) {
  return function (id) { return values[id] === undefined ? 0 : values[id]; };
}

/* Platform: speed 0, altitude 0 -> START */
let s = makeStats({ 0: 0, 24: 0, 26: Math.PI / 2 });
assert.strictEqual(Story.hintForState(s), "Plataforma de lan\u00e7amento. Aumente o acelerador (X) para descolar.", "platform hint");
assert(Story.hintForState(s).indexOf("Plataforma") >= 0, "platform text");

/* Ascent: phase 0 -> ASCENT */
s = makeStats({ 23: 0, 24: 1250, 0: 10, 26: Math.PI / 4 });
assert.strictEqual(Story.hintForState(s), Story.textForPhase(0), "ascent hint");
assert(Story.hintForState(s).indexOf("subida") >= 0, "ascent text");

/* Tilt warning: phase 0, tilt outside window -> TILT_WARNING */
s = makeStats({ 23: 0, 24: 100, 0: 10, 26: 0.5 });
assert.strictEqual(Story.hintForState(s), Story.textForEvent(18), "tilt warning hint");
assert(Story.hintForState(s).indexOf("Inclina\u00e7\u00e3o") >= 0, "tilt warning text");

/* Atmo exit: phase 1 -> ATMO_EXIT */
s = makeStats({ 23: 1, 24: 700, 0: 50 });
assert.strictEqual(Story.hintForState(s), Story.textForEvent(13), "atmo exit hint");

/* Transit: phase 2 -> TRANSIT */
s = makeStats({ 23: 2, 24: 700, 0: 50 });
assert.strictEqual(Story.hintForState(s), Story.textForPhase(2), "transit hint");
assert(Story.hintForState(s).indexOf("Lua") >= 0, "transit text");

/* Moon: phase 3 -> MOON */
s = makeStats({ 23: 3, 24: 700, 0: 50 });
assert.strictEqual(Story.hintForState(s), Story.textForEvent(14), "moon hint");
assert(Story.hintForState(s).indexOf("Lua") >= 0, "moon text");

/* Belt: phase 4 -> empty */
s = makeStats({ 23: 4, 24: 700, 0: 50 });
assert.strictEqual(Story.hintForState(s), "", "belt hint empty");

/* Unknown phase -> empty */
s = makeStats({ 23: 99, 24: 0, 0: 0 });
assert.strictEqual(Story.hintForState(s), "", "unknown phase empty");

console.log("story tests ok");
