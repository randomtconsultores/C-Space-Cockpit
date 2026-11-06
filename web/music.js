/* Music logic: pure functions, UMD. No Web Audio, no DOM.
   Selects a pairing from context, maps game stats to a pace, and generates
   deterministic note events for a beat interval and a set of layers.
   Times are expressed in calm beats from the start of the piece. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitMusic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Stat ids mirror web/hud.js CockpitHud.STAT (kept local so this module
     stays pure and does not import the HUD). */
  var STAT = { MODE: 16, ALERT: 17, IN_BELT: 18, ROCKS_ALIVE: 19, LASER_FLASH: 22 };
  var MODE_ARRIVED = 2;

  /* In browsers CockpitMusicData is { DATA: ... }; tests may assign DATA directly. */
  var Data = (typeof CockpitMusicData !== "undefined" && CockpitMusicData)
    ? (CockpitMusicData.DATA || CockpitMusicData) : null;

  function getPiece(id) { return Data && Data.pieces ? Data.pieces[id] : null; }
  function getBasePairing(id) { return Data && Data.pairings ? Data.pairings[id] : null; }

  /* Seconds for a number of calm-beats at a given BPM. */
  function beatSeconds(beats, bpm) { return beats * 60.0 / bpm; }

  /* Seconds of one calm beat. */
  function secondsPerBeat(bpm) { return 60.0 / bpm; }

  /* Clone a base pairing and derive transpose (galaxy) and mode/timbre (culture).
     Same context always yields the same pairing. */
  function selectPairing(context) {
    var galaxy = (context && context.galaxy !== undefined) ? context.galaxy : 0;
    var culture = (context && context.culture) ? context.culture : "corredor";
    var transpose = ((galaxy % 12) + 12) % 12;
    var mode, leadWave;
    if (culture === "guerreiro") { mode = "minor"; leadWave = "saw"; }
    else if (culture === "mercantil") { mode = "major"; leadWave = "triangle"; }
    else { mode = "lydian"; leadWave = "square"; } /* corredor: default */
    var base = getBasePairing("satie_d_major") || {};
    var pairing = {
      piece: base.piece || "satie_gymnopedie1",
      calm_bpm: base.calm_bpm || 66,
      fast_ratio: base.fast_ratio || 2,
      transpose: transpose,
      mode: mode,
      instruments: {
        calm: { pad: (base.instruments && base.instruments.calm && base.instruments.calm.pad) || "sine",
                melody: (base.instruments && base.instruments.calm && base.instruments.calm.melody) || "sine" },
        fast: { bass: (base.instruments && base.instruments.fast && base.instruments.fast.bass) || "saw",
                arp: (base.instruments && base.instruments.fast && base.instruments.fast.arp) || "square",
                lead: leadWave,
                drums: (base.instruments && base.instruments.fast && base.instruments.fast.drums) || "kit80" }
      },
      layers: {
        calm: (base.layers && base.layers.calm) ? base.layers.calm.slice() : ["pad", "motif"],
        alert: (base.layers && base.layers.alert) ? base.layers.alert.slice() : ["pad", "motif"],
        belt: (base.layers && base.layers.belt) ? base.layers.belt.slice() : ["pad", "bass", "kick", "hats"],
        combat: (base.layers && base.layers.combat) ? base.layers.combat.slice() : ["bass", "kick", "clap", "hats", "arp", "lead"],
        arrival: (base.layers && base.layers.arrival) ? base.layers.arrival.slice() : ["pad", "motif"]
      },
      transition: { bars: (base.transition && base.transition.bars !== undefined) ? base.transition.bars : 2 }
    };
    return pairing;
  }

  /* Pure: map game stats to a pace. No hysteresis here; the director keeps the
     2-bar minimum between changes. */
  function paceFromStats(stats) {
    var mode = stats(STAT.MODE);
    var alert = stats(STAT.ALERT);
    var inBelt = stats(STAT.IN_BELT);
    var laserFlash = stats(STAT.LASER_FLASH);
    if (mode === MODE_ARRIVED) return "arrival";
    if (inBelt && laserFlash > 0) return "combat";
    if (inBelt) return "belt";
    if (alert === 1 || alert === 2) return "alert";
    return "calm";
  }

  /* Semitone offset applied to melody notes by mode (small, documented rule;
     the Arquiteto may refine once the real transcription exists). */
  function modeShift(mode) {
    if (mode === "minor") return -3;   /* placeholder: flat third colour */
    return 0;                          /* major and lydian: no global shift */
  }

  /* Generate note events {t, dur, note, inst, vel} for [fromBeatAbs, toBeatAbs)
     in calm-beat absolute coordinates. Deterministic. `t` and `dur` are in
     calm beats; the director converts them to AudioContext seconds. */
  function scheduleEvents(pairing, fromBeatAbs, toBeatAbs, layers) {
    var events = [];
    var piece = getPiece(pairing.piece);
    if (!piece || !layers || layers.length === 0) return events;
    var bpm = pairing.calm_bpm;
    var transpose = pairing.transpose || 0;
    var mshift = modeShift(pairing.mode);
    var fast = pairing.fast_ratio || 2;
    var spb = piece.beats_per_bar || 3;

    function push(tBeat, durBeat, note, inst, vel) {
      if (tBeat < 0 || durBeat < 0 || isNaN(tBeat) || isNaN(durBeat) || isNaN(note)) return;
      events.push({ t: tBeat, dur: durBeat, note: Math.round(note), inst: inst, vel: Math.max(0, Math.min(1, vel)) });
    }

    function inRange(tBeat) { return tBeat >= fromBeatAbs && tBeat < toBeatAbs; }

    /* --- pad: sustained chords, one per bar, starting in the window --- */
    if (layers.indexOf("pad") >= 0) {
      var chords = piece.chords || [];
      if (chords.length > 0) {
        var cycleBars = 0;
        for (var c = 0; c < chords.length; c++) cycleBars += chords[c].bars || 1;
        var cycleBeats = cycleBars * spb;
        var barStart = Math.floor(fromBeatAbs / spb) * spb;
        var endBar = Math.ceil(toBeatAbs / spb) * spb;
        for (var b = barStart; b < endBar; b += spb) {
          var chordIndex = Math.floor((b % cycleBeats) / spb);
          var chord = chords[chordIndex];
          if (!chord) continue;
          var chordStart = b;
          var chordDur = (chord.bars || 1) * spb;
          if (chordStart < fromBeatAbs || chordStart >= toBeatAbs) continue;
          for (var ti = 0; ti < chord.tones.length; ti++) {
            push(chordStart, chordDur, chord.tones[ti] + transpose, "pad", 0.25);
          }
        }
      }
    }

    /* --- motif: calm theme, only notes starting in the window --- */
    if (layers.indexOf("motif") >= 0) {
      var motif = piece.motif || [];
      var motifBars = piece.motif_bars || 7;
      var motifPeriod = motifBars * spb;
      if (motif.length > 0 && motifPeriod > 0) {
        var kMin = Math.floor(fromBeatAbs / motifPeriod) - 1;
        var kMax = Math.ceil(toBeatAbs / motifPeriod) + 1;
        for (var k = kMin; k <= kMax; k++) {
          for (var m = 0; m < motif.length; m++) {
            var start = motif[m][0] + k * motifPeriod;
            var dur = motif[m][1];
            var note = motif[m][2] + transpose + mshift;
            if (start >= fromBeatAbs && start < toBeatAbs) {
              push(start, dur, note, "melody", 0.6);
            }
          }
        }
      }
    }

    /* --- fast layers (eighth-note grid: 2 fast beats per calm beat) --- */
    var isFast = (layers.indexOf("bass") >= 0 || layers.indexOf("arp") >= 0 ||
                  layers.indexOf("kick") >= 0 || layers.indexOf("clap") >= 0 ||
                  layers.indexOf("hats") >= 0 || layers.indexOf("lead") >= 0 ||
                  layers.indexOf("riser_off") >= 0);
    if (isFast) {
      var f0 = Math.ceil(fromBeatAbs * fast);
      var f1 = Math.ceil(toBeatAbs * fast);
      var chords = piece.chords || [];
      function chordAtBeat(tBeat) {
        if (chords.length === 0) return { root: 0, tones: [] };
        var cycleBars = 0;
        for (var c = 0; c < chords.length; c++) cycleBars += chords[c].bars || 1;
        var cycleBeats = cycleBars * spb;
        var b = Math.floor(tBeat / spb) * spb;
        var chordIndex = Math.floor((b % cycleBeats) / spb);
        return chords[chordIndex] || { root: 0, tones: [] };
      }

      if (layers.indexOf("bass") >= 0) {
        for (var f = f0; f < f1; f++) {
          var tBeat = f / fast;
          var chord = chordAtBeat(tBeat);
          var root = chord.root + transpose;
          var note = (f % 2 === 0) ? root : root + 12;
          push(tBeat, 1.0 / fast, note, "bass", 0.5);
        }
      }
      if (layers.indexOf("arp") >= 0) {
        var af0 = Math.ceil(fromBeatAbs * fast * 2);
        var af1 = Math.ceil(toBeatAbs * fast * 2);
        for (var f = af0; f < af1; f++) {
          var tBeat = f / (fast * 2);
          var chord = chordAtBeat(tBeat);
          var tones = chord.tones;
          if (tones.length === 0) continue;
          var tone = tones[f % tones.length] + transpose;
          push(tBeat, 1.0 / (fast * 2), tone, "arp", 0.4);
        }
      }
      if (layers.indexOf("kick") >= 0) {
        for (var f = f0; f < f1; f++) {
          push(f / fast, 1.0 / fast, 36, "kick", 0.7);
        }
      }
      if (layers.indexOf("clap") >= 0) {
        for (var f = f0; f < f1; f++) {
          if (f % 2 === 0) push(f / fast, 1.0 / fast, 0, "clap", 0.5);
        }
      }
      if (layers.indexOf("hats") >= 0) {
        for (var f = f0; f < f1; f++) {
          if (f % 2 === 1) push(f / fast, 1.0 / fast, 0, "hats", 0.35);
        }
      }
      if (layers.indexOf("lead") >= 0) {
        var motif = piece.motif || [];
        var motifBars = piece.motif_bars || 7;
        var motifPeriod = motifBars * spb;
        if (motif.length > 0 && motifPeriod > 0) {
          var kMin = Math.floor(fromBeatAbs / motifPeriod) - 1;
          var kMax = Math.ceil(toBeatAbs / motifPeriod) + 1;
          for (var k = kMin; k <= kMax; k++) {
            for (var m = 0; m < motif.length; m++) {
              var start = motif[m][0] + k * motifPeriod;
              var dur = motif[m][1];
              var note = motif[m][2] + 12 + transpose + mshift;
              if (start >= fromBeatAbs && start < toBeatAbs) {
                push(start, dur, note, "lead", 0.55);
              }
            }
          }
        }
      }
      if (layers.indexOf("riser_off") >= 0) {
        /* one riser per bar, starting on the bar line inside the window */
        var rb = Math.ceil(fromBeatAbs / spb) * spb;
        if (rb < toBeatAbs) push(rb, spb, 0, "riser_off", 0.4);
      }
    }

    events.sort(function (a, b) { return a.t - b.t || a.note - b.note; });
    return events;
  }

  return {
    STAT: STAT,
    selectPairing: selectPairing,
    paceFromStats: paceFromStats,
    scheduleEvents: scheduleEvents,
    modeShift: modeShift,
    beatSeconds: beatSeconds,
    secondsPerBeat: secondsPerBeat,
    getPiece: getPiece
  };
});
