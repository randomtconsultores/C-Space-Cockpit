/* Music tests: Node only, no browser, no real AudioContext. A fake synth with
   a controllable AudioContext.currentTime clock drives the director. */
const fs = require("fs"), assert = require("assert"), path = require("path");
const Data = require("./music_data.js");
global.CockpitMusicData = Data.DATA;
const Music = require("./music.js");
const Director = require("./music_director.js");

const STAT = Music.STAT;
const pairing = Music.selectPairing({ galaxy: 0, culture: "corredor", pace: "calm", seed: 1 });

/* Stat functions: receive a Hud.STAT id and return its value. */
function calmStats() {
  return function (id) {
    if (id === STAT.MODE) return 0;
    if (id === STAT.IN_BELT) return 0;
    if (id === STAT.LASER_FLASH) return 0;
    if (id === STAT.ALERT) return 0;
    return 0;
  };
}
function combatStats() {
  return function (id) {
    if (id === STAT.MODE) return 1;
    if (id === STAT.IN_BELT) return 1;
    if (id === STAT.LASER_FLASH) return 1;
    if (id === STAT.ALERT) return 0;
    return 0;
  };
}

function makeFakeSynth(opts) {
  opts = opts || {};
  var notes = [];
  var keys = new Set();
  var now = 0;
  return {
    notes: notes,
    keys: keys,
    calls: 0,
    now: function () { return now; },
    setNow: function (n) { now = n; },
    advance: function (dt) { now += dt; },
    available: function () { return true; },
    playNote: function (ev) {
      this.calls++;
      if (opts.storeNotes) notes.push(ev);
      keys.add(ev.time.toFixed(6) + "|" + ev.note + "|" + ev.inst);
    },
    suspend: function () {}, resume: function () {}, start: function () {}, setSound: function () {}
  };
}

// --- 1. determinism ---
(function () {
  var a = Music.scheduleEvents(pairing, 0, 24, ["pad", "motif"]);
  var b = Music.scheduleEvents(pairing, 0, 24, ["pad", "motif"]);
  assert.deepStrictEqual(a, b, "determinism");
  assert.ok(a.length > 0, "determinism: non-empty");
})();

// --- 2. fast beat is exactly half of calm beat ---
(function () {
  var calm = Music.beatSeconds(1, pairing.calm_bpm);
  var fast = Music.beatSeconds(1, pairing.calm_bpm * pairing.fast_ratio);
  assert.strictEqual(fast, calm / 2, "fast beat = half calm beat");
})();

// --- 3. no duplicates over 60 seconds at 120 FPS ---
(function () {
  var synth = makeFakeSynth();
  var dir = Director.create(synth, Music, pairing);
  var now = 0;
  var frame = 1.0 / 120.0;
  var end = 60.0;
  dir.update(calmStats(), 0);
  synth.setNow(0);
  while (now < end) {
    dir.update(calmStats(), now);
    now += frame;
    synth.setNow(now);
  }
  assert.strictEqual(synth.keys.size, synth.calls, "no duplicates over 60 s (" + synth.calls + " calls, " + synth.keys.size + " unique keys)");
})();

// --- 4. no gaps: scheduled events match scheduleEvents for same interval ---
(function () {
  var synth = makeFakeSynth({ storeNotes: true });
  var dir = Director.create(synth, Music, pairing);
  var now = 0;
  var frame = 1.0 / 60.0;
  var endBeat = 24;
  dir.update(calmStats(), 0);
  synth.setNow(0);
  var endTime = endBeat * Music.secondsPerBeat(pairing.calm_bpm);
  while (synth.now() < endTime) {
    dir.update(calmStats(), synth.now());
    synth.advance(frame);
  }
  var expected = Music.scheduleEvents(pairing, 0, endBeat, ["pad", "motif"]);
  var got = synth.notes;
  assert.strictEqual(got.length, expected.length, "no gaps: count (" + got.length + " vs " + expected.length + ")");
  var spb = Music.secondsPerBeat(pairing.calm_bpm);
  for (var i = 0; i < expected.length; i++) {
    assert.strictEqual((got[i].time / spb).toFixed(4), expected[i].t.toFixed(4), "no gaps: t");
    assert.strictEqual(got[i].note, expected[i].note, "no gaps: note");
    assert.strictEqual(got[i].inst, expected[i].inst, "no gaps: inst");
  }
})();

// --- 5. clock jump: jumping 5 s does not flush late events ---
(function () {
  var synth = makeFakeSynth({ storeNotes: true });
  var dir = Director.create(synth, Music, pairing);
  dir.update(calmStats(), 0);
  synth.setNow(0);
  for (var i = 0; i < 10; i++) { dir.update(calmStats(), synth.now()); synth.advance(1.0 / 60.0); }
  var before = synth.notes.length;
  synth.setNow(synth.now() + 5.0);
  dir.update(calmStats(), synth.now());
  var after = synth.notes.length;
  var spb = Music.secondsPerBeat(pairing.calm_bpm);
  var lookaheadBeats = 0.25 / spb;
  var maxExpected = Math.ceil(lookaheadBeats * 8) + 5;
  assert.ok(after - before <= maxExpected, "clock jump: no late burst (" + (after - before) + " new notes)");
})();

// --- 6. bar limits: pace changes only at bar boundaries, min 2 bars between ---
(function () {
  var synth = makeFakeSynth();
  var dir = Director.create(synth, Music, pairing);
  var now = 0;
  dir.update(calmStats(), 0);
  synth.setNow(0);
  var spb = Music.secondsPerBeat(pairing.calm_bpm);
  var bpb = 3;
  var barSec = bpb * spb;
  var changes = [];
  var lastPace = null;
  var frame = barSec / 4;
  for (var i = 0; i < 60; i++) {
    var desired = (i % 2 === 0) ? calmStats() : combatStats();
    dir.update(desired, synth.now());
    var st = dir.state();
    if (st.currentPace !== lastPace && lastPace !== null) {
      changes.push({ t: synth.now(), pace: st.currentPace });
    }
    lastPace = st.currentPace;
    synth.advance(frame);
  }
  for (var c = 0; c < changes.length; c++) {
    var rem = changes[c].t % barSec;
    assert.ok(rem < 0.01 || rem > barSec - 0.01, "bar limit: change at non-boundary t=" + changes[c].t);
  }
  for (var c = 1; c < changes.length; c++) {
    assert.ok(changes[c].t - changes[c - 1].t >= barSec * 2 - 0.01, "bar limit: < 2 bars between changes");
  }
  assert.ok(changes.length > 0, "bar limits: at least one pace change occurred");
})();

// --- 7. transitions: calm->combat: 2 transition bars then full fast; combat->calm: no kick/bass after ---
(function () {
  var synth = makeFakeSynth();
  var dir = Director.create(synth, Music, pairing);
  var now = 0;
  dir.update(calmStats(), 0);
  synth.setNow(0);
  var spb = Music.secondsPerBeat(pairing.calm_bpm);
  var bpb = 3;
  var barSec = bpb * spb;
  var frame = barSec / 8;
  var layersByBar = {};
  var combatReached = false;
  var backToCalm = false;
  for (var i = 0; i < 90; i++) {
    var desired = (i < 22) ? calmStats() : (i < 66 ? combatStats() : calmStats());
    dir.update(desired, synth.now());
    var st = dir.state();
    var bar = Math.floor(synth.now() / barSec);
    if (!(bar in layersByBar)) layersByBar[bar] = { pace: st.currentPace, layers: st.currentLayers.slice() };
    if (st.currentPace === "combat") combatReached = true;
    if (combatReached && st.currentPace === "calm" && i >= 66) backToCalm = true;
    synth.advance(frame);
  }
  assert.ok(combatReached, "transition: combat reached");
  assert.ok(backToCalm, "transition: back to calm");
  var bars = Object.keys(layersByBar).map(Number).sort(function (a, b) { return a - b; });
  var firstFast = null;
  for (var b = 0; b < bars.length; b++) {
    var lay = layersByBar[bars[b]].layers;
    if (lay.indexOf("kick") >= 0 || lay.indexOf("bass") >= 0) { firstFast = bars[b]; break; }
  }
  assert.ok(firstFast !== null && firstFast >= 1, "transition: first fast bar exists after calm");
  var transBar0 = false, transBar1 = false, fullCombat = false;
  for (var b = 0; b < bars.length; b++) {
    var lay = layersByBar[bars[b]].layers;
    if (lay.indexOf("bass") >= 0 && lay.indexOf("kick") < 0 && lay.indexOf("arp") < 0) transBar0 = true;
    if (lay.indexOf("kick") >= 0 && lay.indexOf("clap") >= 0 && lay.indexOf("arp") < 0 && lay.indexOf("lead") < 0) transBar1 = true;
    if (lay.indexOf("arp") >= 0 && lay.indexOf("lead") >= 0) fullCombat = true;
  }
  assert.ok(transBar0, "transition: bar 0 = bass+hats only");
  assert.ok(transBar1, "transition: bar 1 = kick+clap+hats+riser (no arp/lead)");
  assert.ok(fullCombat, "transition: full combat has arp+lead");
  var calmNoFast = false;
  for (var b = 0; b < bars.length; b++) {
    var entry = layersByBar[bars[b]];
    if (entry.pace === "calm" && entry.layers.indexOf("kick") < 0 && entry.layers.indexOf("bass") < 0 && entry.layers.indexOf("pad") >= 0) {
      var idx = bars.indexOf(bars[b]);
      var hadCombat = false;
      for (var j = 0; j < idx; j++) if (layersByBar[bars[j]].pace === "combat") hadCombat = true;
      if (hadCombat) calmNoFast = true;
    }
  }
  assert.ok(calmNoFast, "transition: combat->calm removes kick/bass, keeps pad");
})();

// --- 8. pause/resume: suspend/resume no dups or gaps ---
(function () {
  var synth = makeFakeSynth({ storeNotes: true });
  var dir = Director.create(synth, Music, pairing);
  var now = 0;
  dir.update(calmStats(), 0);
  synth.setNow(0);
  var spb = Music.secondsPerBeat(pairing.calm_bpm);
  var frame = 1.0 / 60.0;
  for (var i = 0; i < 30; i++) { dir.update(calmStats(), synth.now()); synth.advance(frame); }
  var before = synth.notes.length;
  var cursorBefore = dir.state().cursorBeat;
  // Pausa: o relógio do AudioContext fica congelado (suspend), então chamar
  // update duas vezes com o mesmo now não deve gerar notas nem mover o cursor
  // além do primeiro ajuste de lookahead.
  dir.update(calmStats(), synth.now());
  cursorBefore = dir.state().cursorBeat;
  dir.update(calmStats(), synth.now());
  assert.strictEqual(dir.state().cursorBeat, cursorBefore, "pause: cursor estável sem disparar notas");
  assert.strictEqual(synth.notes.length, before, "pause: sem novas notas enquanto suspenso");
  // Retoma: avança o relógio por 2s; o cursor avança normalmente (2s de batidas)
  // sem despacho de notas atrasadas (não houve backlog durante a pausa).
  synth.setNow(synth.now() + 2.0);
  dir.update(calmStats(), synth.now());
  var cursorAfter = dir.state().cursorBeat;
  assert.ok(cursorAfter > cursorBefore, "resume: cursor avançou");
  var expectedCursor = cursorBefore + 2.0 / spb;
  assert.ok(Math.abs(cursorAfter - expectedCursor) < 0.05, "resume: cursor avançou 2s de batidas (" + cursorAfter + " vs " + expectedCursor + ")");
  // Sem duplicados no geral
  var seen = {};
  var dups = 0;
  for (var i = 0; i < synth.notes.length; i++) {
    var n = synth.notes[i];
    var key = n.time.toFixed(6) + "|" + n.note + "|" + n.inst;
    if (seen[key]) dups++;
    seen[key] = true;
  }
  assert.strictEqual(dups, 0, "pause/resume: no duplicates");
})();

// --- 9. no AudioContext: real synth/director do not throw ---
(function () {
  var realSynth = require("./synth.js");
  assert.strictEqual(realSynth.available(), false);
  assert.doesNotThrow(function () { realSynth.setSound(true); });
  assert.doesNotThrow(function () { realSynth.start(); });
  assert.doesNotThrow(function () { realSynth.suspend(); });
  assert.doesNotThrow(function () { realSynth.resume(); });
  assert.doesNotThrow(function () { realSynth.playNote({ time: 0, dur: 1, note: 60, inst: "pad", vel: 0.5 }); });
  var dir = Director.create(realSynth, Music, pairing);
  assert.doesNotThrow(function () { dir.update(calmStats(), 0); });
  assert.doesNotThrow(function () { dir.pause(); dir.resume(); dir.start(); });
})();

// --- 10. selectPairing determinism and galaxy/mode ---
(function () {
  var a = Music.selectPairing({ galaxy: 3, culture: "guerreiro", pace: "calm", seed: 9 });
  var b = Music.selectPairing({ galaxy: 3, culture: "guerreiro", pace: "calm", seed: 9 });
  assert.deepStrictEqual(a, b, "selectPairing same context");
  var c = Music.selectPairing({ galaxy: 5, culture: "guerreiro", pace: "calm", seed: 9 });
  assert.notStrictEqual(a.transpose, c.transpose, "selectPairing different galaxy");
  assert.strictEqual(Music.selectPairing({ galaxy: 0, culture: "guerreiro" }).mode, "minor");
  assert.strictEqual(Music.selectPairing({ galaxy: 0, culture: "mercantil" }).mode, "major");
  assert.strictEqual(Music.selectPairing({ galaxy: 0, culture: "corredor" }).mode, "lydian");
})();

console.log("music tests ok");
