/* Sound effects synthesiser: Web Audio API. UMD.
   Parte pura (plan) é testavel sem áudio; parte de reproducao (play) usa o
   contexto unico e o ganho master de synth.js. Degrada silenciosamente sem
   Web Audio. Comentarios de codigo em ingles; texto ao jogador (se houver)
   em portugues com acentos e fica noutro modulo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitSfx = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* IDs de efeito (espelham enum FlEvent de core/flight.h). */
  var SFX = { FIRE: 1, ROCK_BREAK: 2, HIT: 3, DESTROYED: 11, RING_PASS: 20 };
  var SFX_COUNT = 5;

  /* Ganho dos efeitos fica porbaixo do master (0,8 = nivel inicial claro). */
  var SFX_GAIN = 0.8;
  var SFX_VOICE_LIMIT = 24;
  /* Prioridade: menor numero = mantido mais tempo quando excede o limite. */
  var PRIORITY = {};
  PRIORITY[SFX.DESTROYED] = 1;
  PRIORITY[SFX.HIT] = 2;
  PRIORITY[SFX.ROCK_BREAK] = 3;
  PRIORITY[SFX.FIRE] = 4;
  PRIORITY[SFX.RING_PASS] = 2;
  /* Pentatonic steps (ratios) climbed by consecutive rings: the combo. */
  var RING_SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];

  /* Gerador pseudoaleatorio deterministico (LCG). Sem Math.random aqui. */
  function lcg(seed) {
    var s = (seed >>> 0) || 1;
    return {
      next: function () {
        s = (s * 1664525 + 1013904223) | 0;
        return (s >>> 0) / 4294967296;
      },
      range: function (lo, hi) { return lo + this.next() * (hi - lo); },
      rangeInt: function (lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
    };
  }

  function clampIntensity(v) {
    if (v === undefined || v === null) return 1;
    if (isNaN(v)) return 0;
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function isFiniteNumber(v) { return typeof v === "number" && isFinite(v); }

  /* Buffer de ruido branco criado uma unica vez e reutilizado com offsets. */
  var NOISE_BUFFER = null;
  function ensureNoiseBuffer(ctx) {
    if (NOISE_BUFFER) return NOISE_BUFFER;
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var rng = lcg(12345);
    for (var i = 0; i < len; i++) data[i] = rng.next() * 2 - 1;
    NOISE_BUFFER = buf;
    return NOISE_BUFFER;
  }

  /* ---------- Parte pura: plano de eventos de som descritivos ---------- */

  function plan(effectId, seed, intensity, combo) {
    intensity = clampIntensity(intensity);
    var r = lcg(seed);
    var events = [];
    function push(t, dur, kind, wave, f0, f1, filt, fFilt0, fFilt1, gain, atk, dec, priority) {
      events.push({
        t: t, dur: dur, kind: kind, wave: wave,
        f0: f0, f1: f1,
        filt: filt, fFilt0: fFilt0, fFilt1: fFilt1,
        gain: gain, atk: atk, dec: dec, priority: priority
      });
    }

    if (effectId === SFX.FIRE) {
      /* Estalo brilhante com queda de frequencia 1800->300 Hz (120 ms),
         coice grave 60-80 Hz e sopro de ruido filtrado. Total <= 250 ms. */
      push(0, 0.12, "osc", "square", 1800, 300, null, 0, 0, 0.45 * intensity, 0.005, 0.115, PRIORITY[SFX.FIRE]);
      push(0, 0.06, "osc", "sine", 70, 70, null, 0, 0, 0.55 * intensity, 0.002, 0.058, PRIORITY[SFX.FIRE]);
      push(0.01, 0.08, "noise", null, 0, 0, "bandpass", 2500, 1200, 0.30 * intensity, 0.005, 0.075, PRIORITY[SFX.FIRE]);
    } else if (effectId === SFX.RING_PASS) {
      /* Rewarding chime: a bright note on a pentatonic scale that rises with the
         combo (consecutive rings), a fifth above it 70 ms later, a soft octave
         shimmer and a short airy sparkle. Total <= 450 ms. */
      var ci = Math.max(0, Math.min(RING_SCALE.length - 1, (combo | 0)));
      var fb = 523 * RING_SCALE[ci];
      push(0, 0.30, "osc", "triangle", fb, fb, null, 0, 0, 0.42 * intensity, 0.004, 0.28, PRIORITY[SFX.RING_PASS]);
      push(0.07, 0.34, "osc", "sine", fb * 1.5, fb * 1.5, null, 0, 0, 0.36 * intensity, 0.004, 0.32, PRIORITY[SFX.RING_PASS]);
      push(0.07, 0.40, "osc", "sine", fb * 2, fb * 2.01, null, 0, 0, 0.16 * intensity, 0.01, 0.38, PRIORITY[SFX.RING_PASS]);
      push(0.06, 0.12, "noise", null, 0, 0, "bandpass", 6000, 9000, 0.10 * intensity, 0.005, 0.11, PRIORITY[SFX.RING_PASS]);
    } else if (effectId === SFX.ROCK_BREAK) {
      /* Crepitar de rocha a partir de ruido filtrado 2 kHz->300 Hz, golpe
         grave seco 80-120 Hz e 3 a 6 fragmentos curtos nos 400 ms seguintes.
         Total <= 900 ms. */
      push(0, 0.40, "noise", null, 0, 0, "bandpass", 2000, 300, 0.50 * intensity, 0.01, 0.39, PRIORITY[SFX.ROCK_BREAK]);
      push(0, 0.15, "osc", "sine", 100, 100, null, 0, 0, 0.50 * intensity, 0.003, 0.147, PRIORITY[SFX.ROCK_BREAK]);
      var nFrag = 3 + r.rangeInt(0, 3);
      for (var i = 0; i < nFrag; i++) {
        var ft = 0.05 + r.range(0, 0.35);
        var ff = 400 + r.range(0, 3600);
        push(ft, 0.03, "noise", null, 0, 0, "bandpass", ff, ff, 0.25 * intensity, 0.005, 0.025, PRIORITY[SFX.ROCK_BREAK]);
      }
    } else if (effectId === SFX.HIT) {
      /* Pancada grave com peso (50 Hz com queda), ressonancia metallica do
         casco com 3 a 4 parciais nao harmonicos (razoes 1, 2.76, 5.4, 8.9 a
         partir de 180 Hz) e estalido de ruido inicial. Total <= 900 ms. */
      push(0, 0.50, "osc", "sine", 50, 40, null, 0, 0, 0.60 * intensity, 0.005, 0.495, PRIORITY[SFX.HIT]);
      var ratios = [1, 2.76, 5.4, 8.9];
      for (var i = 0; i < ratios.length; i++) {
        var f = 180 * ratios[i];
        push(0, 0.60, "osc", "sine", f, f * 0.9, null, 0, 0, 0.30 * intensity, 0.01, 0.59, PRIORITY[SFX.HIT]);
      }
      push(0, 0.04, "noise", null, 0, 0, "bandpass", 3000, 1000, 0.40 * intensity, 0.003, 0.037, PRIORITY[SFX.HIT]);
    } else if (effectId === SFX.DESTROYED) {
      /* Explosao longa: golpe sub-grave 40->25 Hz, ruido passa-baixo a fechar
         4 kHz->120 Hz ao longo de 2,5 s, estalidos de detritos que rareiam e
         tom metallico final. Duracao 3 a 4 s. */
      push(0, 0.50, "osc", "sine", 40, 25, null, 0, 0, 0.70 * intensity, 0.01, 0.49, PRIORITY[SFX.DESTROYED]);
      push(0, 2.50, "noise", null, 0, 0, "lowpass", 4000, 120, 0.50 * intensity, 0.05, 2.45, PRIORITY[SFX.DESTROYED]);
      var clickTimes = [0.3, 0.75, 1.3, 1.95, 2.6];
      for (var i = 0; i < clickTimes.length; i++) {
        var g = Math.max(0.35 * intensity * (1 - i * 0.15), 0.05);
        push(clickTimes[i], 0.05, "noise", null, 0, 0, "bandpass", 1500, 600, g, 0.005, 0.045, PRIORITY[SFX.DESTROYED]);
      }
      push(2.7, 1.3, "osc", "sine", 400, 400, null, 0, 0, 0.30 * intensity, 0.05, 1.25, PRIORITY[SFX.DESTROYED]);
    }
    /* Small seeded pitch variation (+-6%) so repeated shots do not sound identical. */
    var pf = effectId === SFX.RING_PASS ? 1 : 1 + r.range(-0.06, 0.06);
    for (var k = 0; k < events.length; k++) {
      if (events[k].kind === "osc") { events[k].f0 *= pf; events[k].f1 *= pf; }
    }
    return events;
  }

  /* ---------- Parte de reproducao (Web Audio) ---------- */

  var sfxVoices = [];
  var nextSeed = 1;

  var bus = null, busMaster = null;
  /* Effects bus: one gain node (SFX_GAIN) between the effects and the music master. */
  function getBus(ctx, master) {
    if (bus && busMaster === master) return bus;
    bus = ctx.createGain();
    bus.gain.value = SFX_GAIN;
    bus.connect(master);
    busMaster = master;
    return bus;
  }

  function synthRef() { return typeof CockpitSynth !== "undefined" ? CockpitSynth : null; }

  function available() {
    var s = synthRef();
    return !!s && typeof s.available === "function" && s.available();
  }

  function stopVoice(v) {
    var ctx = synthRef() && synthRef().getContext ? synthRef().getContext() : null;
    var nowT = ctx ? ctx.currentTime : 0;
    try { if (v.gain) v.gain.setValueAtTime(0, nowT); } catch (e) {}
    try { if (v.o && v.o.stop) v.o.stop(nowT); } catch (e) {}
    try { if (v.o) v.o.disconnect(); } catch (e) {}
    try { if (v.gain) v.gain.disconnect(); } catch (e) {}
  }

  function dropVoice() {
    if (sfxVoices.length === 0) return;
    var worst = 0;
    for (var i = 1; i < sfxVoices.length; i++) {
      if (sfxVoices[i].priority > sfxVoices[worst].priority) worst = i;
    }
    stopVoice(sfxVoices[worst]);
    sfxVoices.splice(worst, 1);
  }

  function registerVoice(v) {
    var ctx = synthRef() && synthRef().getContext ? synthRef().getContext() : null;
    var nowT = ctx ? ctx.currentTime : 0;
    sfxVoices = sfxVoices.filter(function (x) { return x.stopTime > nowT; });
    sfxVoices.push(v);
    while (sfxVoices.length > SFX_VOICE_LIMIT) dropVoice();
  }

  function envGain(g, ev, when, dur) {
    g.setValueAtTime(0, when);
    g.linearRampToValueAtTime(ev.gain, when + ev.atk);
    g.linearRampToValueAtTime(ev.gain * 0.15, when + ev.atk + ev.dec);
    g.linearRampToValueAtTime(0, when + dur);
  }

  function playOsc(ctx, master, ev, when, dur) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = ev.wave || "sine";
    o.frequency.setValueAtTime(Math.max(ev.f0, 1), when);
    if (ev.f1 !== undefined && ev.f1 !== ev.f0 && ev.f1 > 0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(ev.f1, 1), when + dur);
    }
    o.connect(g);
    g.connect(master);
    envGain(g.gain, ev, when, dur);
    o.start(when);
    o.stop(when + dur);
    registerVoice({ o: o, g: g, priority: ev.priority, stopTime: when + dur });
    o.onended = function () {
      try { o.disconnect(); } catch (e) {}
      try { g.disconnect(); } catch (e) {}
    };
  }

  function playNoise(ctx, master, ev, when, dur) {
    var buf = ensureNoiseBuffer(ctx);
    if (!buf) return;
    var n = ctx.createBufferSource();
    n.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = ev.filt || "bandpass";
    filt.frequency.setValueAtTime(Math.max(ev.fFilt0, 1), when);
    if (ev.fFilt1 !== undefined && ev.fFilt1 !== ev.fFilt0 && ev.fFilt1 > 0) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(ev.fFilt1, 1), when + dur);
    }
    var g = ctx.createGain();
    n.connect(filt);
    filt.connect(g);
    g.connect(master);
    envGain(g.gain, ev, when, dur);
    n.start(when);
    n.stop(when + dur);
    registerVoice({ o: n, g: g, priority: ev.priority, stopTime: when + dur });
    n.onended = function () {
      try { n.disconnect(); } catch (e) {}
      try { filt.disconnect(); } catch (e) {}
      try { g.disconnect(); } catch (e) {}
    };
  }

  function play(effectId, intensity, combo) {
    intensity = clampIntensity(intensity);
    var s = synthRef();
    if (!s || typeof s.available !== "function" || !s.available()) return false;
    var ctx = s.getContext ? s.getContext() : null;
    var master = s.getMaster ? s.getMaster() : null;
    if (!ctx || !master) return false;
    var now = ctx.currentTime;
    master = getBus(ctx, master);
    var evs = plan(effectId, nextSeed++, intensity, combo);
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!isFiniteNumber(ev.t) || !isFiniteNumber(ev.dur) || ev.t < 0 || ev.dur < 0) continue;
      var when = now + ev.t;
      var dur = ev.dur;
      if (ev.kind === "osc") playOsc(ctx, master, ev, when, dur);
      else if (ev.kind === "noise") playNoise(ctx, master, ev, when, dur);
    }
    return true;
  }

  return {
    SFX: SFX,
    SFX_COUNT: SFX_COUNT,
    plan: plan,
    play: play,
    available: available,
    clampIntensity: clampIntensity,
    isSfxEvent: function (id) { return id === SFX.FIRE || id === SFX.ROCK_BREAK || id === SFX.HIT || id === SFX.DESTROYED || id === SFX.RING_PASS; }
  };
});
