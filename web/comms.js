/* Tower comms: real NASA recordings ("Houston") that accompany the whole flight.
   UMD. The director (which line fires when) is pure and testable in Node;
   the player plays public-domain NASA clips, adds a short radio squelch
   through the shared Web Audio context and always shows a subtitle (English
   original plus Portuguese translation). It degrades to subtitles only when
   audio is unavailable. Code comments in English; subtitles in Portuguese. */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitComms = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Stat ids mirror core/FlStat (web/hud.js). */
  var S = { THROTTLE: 2, DISTANCE_LEFT: 15, MODE: 16, PHASE: 23, ALTITUDE: 24 };
  var EV = { HULL_CRITICAL: 9, ATMO_EXIT: 13, MOON_COLLISION: 19 };
  var PH = { ASCENT: 0, ATMO_EXIT: 1, TRANSIT: 2, MOON: 3, BELT: 4, EXIT: 5 };
  var ROUTE_LENGTH = 25000;

  /* Real NASA recordings (public domain, see docs/CREDITS.md). Each line has the
     audio clip, the English original (en) and a Portuguese translation (text)
     for the subtitle. prio: 1 = may be dropped when the queue is busy. */
  var LINES = {
    RADIO:    { clip: "radio", en: "Houston, go ahead.", text: "Houston, pode falar.", prio: 2 },
    IGNITION: { clip: "ignition", rumble: true, en: "Ten seconds. Go for main engine start.", text: "Dez segundos. Luz verde para o arranque dos motores.", prio: 2 },
    LIFTOFF:  { clip: "liftoff", en: "Liftoff. We have a liftoff.", text: "Descolagem. Temos descolagem.", prio: 2 },
    CLIMB:    { clip: "climb", en: "Roll program. Roger, roll program.", text: "Programa de rotação. Recebido.", prio: 1 },
    HEAT:     { clip: "heat", en: "Go ahead, throttle up. Roger, Houston, throttle up.", text: "Pode acelerar a fundo. Recebido, Houston.", prio: 2 },
    ATMO_EXIT:{ clip: "atmo_exit", en: "We see a nominal engine cutoff. Welcome to space.", text: "Corte dos motores nominal. Bem-vindos ao espaço.", prio: 2 },
    REASON:   { clip: "reason", en: "We choose to go to the Moon, not because it is easy, but because it is hard.", text: "Escolhemos ir à Lua, não porque é fácil, mas porque é difícil.", prio: 2 },
    PROBLEM:  { clip: "problem", en: "Houston, we've had a problem.", text: "Houston, tivemos um problema.", prio: 2 },
    EXIT:     { clip: "godspeed", en: "Godspeed.", text: "Boa sorte na viagem.", prio: 2 },
    ARRIVED:  { clip: "arrived", en: "Houston, Tranquility Base here. The Eagle has landed.", text: "Houston, daqui Base da Tranquilidade. A Águia aterrou.", prio: 2 },
    FAREWELL: { clip: "farewell", en: "We came in peace for all mankind.", text: "Viemos em paz, em nome de toda a humanidade.", prio: 2 }
  };

  /* Radio static 0..1 from the distance covered: clean at the pad, noisy far away. */
  function staticLevel(z) {
    var t = z > 0 ? z / ROUTE_LENGTH : 0;
    return t > 1 ? 1 : t;
  }

  function createDirector() {
    var fired = {}, started = false;
    function fire(out, id) {
      if (fired[id]) return;
      fired[id] = true;
      var l = LINES[id];
      if (!l) return;
      out.push({ id: id, clip: l.clip, rumble: !!l.rumble, en: l.en, text: l.text, prio: l.prio });
    }
    return {
      reset: function () { fired = {}; started = false; },
      /* Stat-driven triggers. get(id) returns a stat value. */
      step: function (get) {
        var out = [], z = get(S.ALTITUDE), ph = get(S.PHASE), mode = get(S.MODE);
        if (!started) { started = true; fire(out, "RADIO"); }
        if (mode === 3 || mode === 4) return out;
        if (mode === 2) { fire(out, "ARRIVED"); fire(out, "FAREWELL"); return out; }
        if (get(S.THROTTLE) > 0.05) fire(out, "IGNITION");
        if (z > 40) fire(out, "LIFTOFF");
        if (z > 750) fire(out, "CLIMB");
        if (z > 1300 && ph === PH.ASCENT) fire(out, "HEAT");
        if (ph === PH.EXIT) fire(out, "EXIT");
        return out;
      },
      /* Event-driven triggers. */
      event: function (ev) {
        var out = [];
        if (ev === EV.ATMO_EXIT) { fire(out, "ATMO_EXIT"); fire(out, "REASON"); }
        else if (ev === EV.MOON_COLLISION || ev === EV.HULL_CRITICAL) fire(out, "PROBLEM");
        return out;
      }
    };
  }

  /* Player. env (all optional, injectable for tests): Audio (constructor of
     HTMLAudioElement-like objects), base (URL prefix of the clips), node
     (subtitle element), audio (CockpitSynth, for the radio squelch). */
  function createPlayer(env) {
    env = env || {};
    var AudioCtor = env.Audio !== undefined ? env.Audio : (typeof Audio !== "undefined" ? Audio : null);
    var base = env.base !== undefined ? env.base : "sounds/nasa/";
    var node = env.node || null, audio = env.audio || null;
    var queue = [], current = null, until = 0, enabled = true, noise = 0, clip = null, rumble = null;

    function squelch(level, ms) {
      var ctx = audio && audio.getContext && audio.getContext(), master = audio && audio.getMaster && audio.getMaster();
      if (!ctx || !master) return;
      try {
        var len = Math.floor(ctx.sampleRate * ms / 1000), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2200; f.Q.value = 0.8;
        var g = ctx.createGain(); g.gain.value = 0.03 + 0.08 * level;
        src.connect(f); f.connect(g); g.connect(master); src.start();
      } catch (e) { /* audio is optional */ }
    }
    function show(line) {
      if (!node) return;
      node.textContent = line ? "HOUSTON: \u00ab" + line.en + "\u00bb \u2014 " + line.text : "";
      node.style.opacity = line ? "1" : "0";
    }
    function stopAudio() {
      var a = [clip, rumble];
      for (var i = 0; i < a.length; i++) if (a[i]) { try { a[i].pause(); } catch (e) { /* optional */ } }
      clip = null; rumble = null;
    }
    function finish() { if (!current) return; stopAudio(); current = null; show(null); }
    function play(src, volume, onend) {
      if (!AudioCtor) return null;
      try {
        var a = new AudioCtor(base + src + ".mp3");
        a.volume = volume;
        if (onend) { a.onended = onend; a.onerror = onend; }
        var pr = a.play(); if (pr && pr.catch) pr.catch(function () { if (onend) onend(); });
        return a;
      } catch (e) { return null; }
    }
    function start(line, now) {
      current = line; show(line);
      var est = 2500 + (line.en.length + line.text.length) * 45;
      until = now + est * 2; /* safety net if the clip never ends */
      squelch(noise, 160);
      if (enabled) {
        clip = play(line.clip, 0.95, function () { if (current === line) until = Math.min(until, 0); });
        if (line.rumble) rumble = play("rumble", 0.45, null);
        if (!clip) until = now + est;
      } else until = now + est;
    }
    return {
      setEnabled: function (on) { enabled = !!on; if (!on) stopAudio(); },
      setStatic: function (z) { noise = staticLevel(z); },
      push: function (lines) {
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].prio < 2 && (queue.length > 1 || current)) continue;
          queue.push(lines[i]);
        }
      },
      /* Call every frame with a millisecond clock. */
      update: function (now) {
        if (current && now >= until) finish();
        if (!current && queue.length) start(queue.shift(), now);
      },
      pause: function () { if (clip && clip.pause) try { clip.pause(); } catch (e) { /* optional */ } if (rumble) try { rumble.pause(); } catch (e) { /* optional */ } },
      resume: function () { if (clip && clip.play) try { clip.play(); } catch (e) { /* optional */ } if (rumble) try { rumble.play(); } catch (e) { /* optional */ } },
      cancel: function () { queue.length = 0; stopAudio(); current = null; show(null); },
      busy: function () { return !!current || queue.length > 0; }
    };
  }

  return { LINES: LINES, staticLevel: staticLevel, createDirector: createDirector, createPlayer: createPlayer, STAT: S, EV: EV };
});
