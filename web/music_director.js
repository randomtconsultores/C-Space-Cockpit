/* Music director: links game state to music layers. One update(statFn, now)
   per frame. All timing uses AudioContext.currentTime (synth.now()); never
   Date.now()/performance.now()/requestAnimationFrame time for note decisions.
   UMD. Degrades without synth. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitMusicDirector = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var LOOKAHEAD = 0.25;   /* seconds ahead to schedule */
  var GAP_RESET = 1.0;    /* seconds idle before jumping the cursor */
  var MIN_BARS_BETWEEN_CHANGES = 2;
  var TRANSITION_BARS = 2;

  return {
    create: function (synth, music, pairing) {
      var synthRef = synth || null;
      var musicRef = music || null;
      var pairingRef = pairing || null;
      var startTime = null;       /* AudioContext currentTime when piece began */
      var cursorBeat = 0;         /* next calm beat not yet scheduled */
      var lastNow = null;
      var currentPace = null;
      var currentLayers = [];
      var lastChangeBar = -999;
      var pendingPace = null;
      var pendingChangeBar = null;
      var transition = null;      /* null || {startedBar, total} */

      function secondsPerBeat() { return 60.0 / (pairingRef && pairingRef.calm_bpm ? pairingRef.calm_bpm : 66); }
      function beatsPerBar() {
        var piece = musicRef && musicRef.getPiece ? musicRef.getPiece(pairingRef.piece) : null;
        return piece && piece.beats_per_bar ? piece.beats_per_bar : 3;
      }
      function barDuration() { return beatsPerBar() * secondsPerBeat(); }

      /* Layers for a bar relative to the start of a transition (0 = first bar). */
      function transitionLayers(barRel) {
        if (barRel === 0) return ["bass", "hats"];           /* baixo + charles em contratempo */
        if (barRel === 1) return ["kick", "clap", "hats", "riser_off"]; /* bombo + caixa + ruído */
        return null;
      }

      function layersFor(pace, barRel) {
        if (transition && barRel < transition.total) {
          var t = transitionLayers(barRel);
          if (t) return t;
        }
        return pairingRef.layers[pace] || pairingRef.layers.calm || [];
      }

      function isFastPace(pace) {
        return pace === "belt" || pace === "combat";
      }

      function beginTransition(pace) {
        if (isFastPace(pace)) transition = { startedBar: null, total: TRANSITION_BARS };
        else transition = null;
      }

      function applyPace(pace, bar) {
        currentPace = pace;
        lastChangeBar = bar;
        beginTransition(pace);
        if (transition) transition.startedBar = bar;
        currentLayers = layersFor(pace, 0);
      }

      function update(statFn, nowMs) {
        /* nowMs is accepted for signature compatibility; the single clock is
           AudioContext.currentTime (synth.now()). */
        if (!synthRef || typeof synthRef.available !== "function" || !synthRef.available()) return;
        if (!musicRef || !pairingRef) return;
        var now = synthRef.now();
        if (startTime === null) {
          startTime = now;
          cursorBeat = 0;
          lastNow = now;
          currentPace = musicRef.paceFromStats(statFn);
          currentLayers = layersFor(currentPace, 0);
          beginTransition(currentPace);
          return;
        }

        /* Jump the cursor after a long idle instead of flushing late notes. */
        if (lastNow !== null && now - lastNow > GAP_RESET) {
          cursorBeat = (now - startTime) / secondsPerBeat();
        }
        lastNow = now;

        var spb = secondsPerBeat();
        var bpb = beatsPerBar();
        var posBeat = (now - startTime) / spb;
        var currentBar = Math.floor(posBeat / bpb);
        var nextBarBoundaryBeat = (currentBar + 1) * bpb;

        var desired = musicRef.paceFromStats(statFn);

        /* Pace change: only at a bar boundary, min 2 bars between changes. */
        if (desired !== currentPace && pendingPace === null) {
          if (currentBar >= lastChangeBar + MIN_BARS_BETWEEN_CHANGES) {
            pendingPace = desired;
            pendingChangeBar = currentBar + 1;
          }
        }

        /* Apply pending change at the boundary. */
        if (pendingPace !== null && currentBar >= pendingChangeBar) {
          applyPace(pendingPace, currentBar);
          pendingPace = null;
          pendingChangeBar = null;
        }

        /* If desired changed mid-transition, end the transition before the new change. */
        if (transition && desired !== currentPace && pendingPace === null) {
          /* handled by the pending logic above; clear transition once applied */
        }

        /* Determine the scheduling window, clamped to bar/pace boundaries so
           layers stay consistent within the window. */
        var lookaheadBeats = LOOKAHEAD / spb;
        var windowEndBeat = posBeat + lookaheadBeats;
        var effectiveEnd = windowEndBeat;
        if (nextBarBoundaryBeat < effectiveEnd) effectiveEnd = nextBarBoundaryBeat;
        if (pendingChangeBar !== null && pendingChangeBar * bpb < effectiveEnd) effectiveEnd = pendingChangeBar * bpb;

        var barRel = transition ? (currentBar - transition.startedBar) : 0;
        if (transition && transition.startedBar === null) transition.startedBar = currentBar;
        currentLayers = layersFor(currentPace, barRel);

        if (cursorBeat < effectiveEnd) {
          var events = musicRef.scheduleEvents(pairingRef, cursorBeat, effectiveEnd, currentLayers);
          for (var e = 0; e < events.length; e++) {
            var ev = events[e];
            /* Só agendar notas que ainda não começaram e ainda estão dentro da
               janela (cursorBeat <= t < effectiveEnd). Evita duplicados e
               disparos em bursts depois de saltos de relógio ou mudanças de
               camada no limite do compasso. */
            if (ev.t < cursorBeat || ev.t >= effectiveEnd) continue;
            synthRef.playNote({
              time: startTime + ev.t * spb,
              dur: ev.dur * spb,
              note: ev.note,
              inst: ev.inst,
              vel: ev.vel
            });
          }
          cursorBeat = effectiveEnd;
        }

        /* Complete transition once its bars have passed. */
        if (transition && currentBar >= transition.startedBar + transition.total) {
          transition = null;
          currentLayers = layersFor(currentPace, 0);
        }
      }

      function pause() {
        if (synthRef && typeof synthRef.suspend === "function") synthRef.suspend();
      }
      function resume() {
        if (synthRef && typeof synthRef.resume === "function") synthRef.resume();
      }
      function startMusic() {
        if (synthRef && typeof synthRef.start === "function") synthRef.start();
      }

      function state() {
        return {
          cursorBeat: cursorBeat,
          currentPace: currentPace,
          currentLayers: currentLayers.slice(),
          startTime: startTime,
          transition: transition ? { startedBar: transition.startedBar, total: transition.total } : null,
          lastChangeBar: lastChangeBar
        };
      }

      return { update: update, pause: pause, resume: resume, start: startMusic, state: state };
    }
  };
});
