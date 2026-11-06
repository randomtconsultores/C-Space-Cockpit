/* Music synthesiser: Web Audio API. UMD.
   Single clock: AudioContext.currentTime. Created after a user gesture.
   Degrades silently when AudioContext is unavailable. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitSynth = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var AudioCtx = (typeof AudioContext !== "undefined") ? AudioContext :
                 (typeof webkitAudioContext !== "undefined") ? webkitAudioContext : null;
  var ctx = null;
  var master = null;
  var started = false;
  var soundOn = true;
  var NOISE_BUFFER = null;
  var voiceLimit = 24;
  var activeVoices = []; // { osc, gain, stopTime, inst, priority }

  /* Inst priority (lower number = kept longer when over the voice limit). */
  function instPriority(inst) {
    switch (inst) {
      case "pad": return 1;
      case "bass": return 2;
      case "kick": return 2;
      case "lead": return 3;
      case "melody": return 3;
      case "riser_off": return 3;
      case "clap": return 4;
      case "hats": return 4;
      case "arp": return 5; /* dropped first */
      default: return 4;
    }
  }

  function ensure() {
    if (!AudioCtx || started) return;
    try {
      ctx = new AudioCtx();
    } catch (e) {
      ctx = null; return;
    }
    master = ctx.createGain();
    master.gain.value = soundOn ? 0.35 : 0;
    master.connect(ctx.destination);
    started = true;
    NOISE_BUFFER = makeNoiseBuffer(ctx.sampleRate * 4);
  }

  function available() { return !!ctx; }

  function now() { return ctx ? ctx.currentTime : 0; }

  function setSound(on) {
    soundOn = !!on;
    if (master) master.gain.value = soundOn ? 0.35 : 0;
  }

  function start() {
    ensure();
    if (ctx && ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) { /* gesture may be required */ }
    }
  }

  function suspend() {
    if (ctx && ctx.state === "running") {
      try { ctx.suspend(); } catch (e) { /* ignore */ }
    }
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  /* Pre-generate one shared noise buffer reused by hats, clap, snare, riser. */
  function makeNoiseBuffer(len) {
    if (!ctx) return null;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function stopVoice(v) {
    try { if (v.gain) v.gain.setValueAtTime(0, ctx.currentTime); } catch (e) {}
    try { if (v.o && v.o.stop) v.o.stop(ctx.currentTime); } catch (e) {}
    try { if (v.o) v.o.disconnect(); } catch (e) {}
    try { if (v.gain) v.gain.disconnect(); } catch (e) {}
  }

  function dropVoice() {
    if (activeVoices.length === 0) return;
    var worst = 0;
    for (var i = 1; i < activeVoices.length; i++) {
      if (activeVoices[i].priority > activeVoices[worst].priority) worst = i;
    }
    stopVoice(activeVoices[worst]);
    activeVoices.splice(worst, 1);
  }

  function registerVoice(v) {
    var t = ctx ? ctx.currentTime : 0;
    activeVoices = activeVoices.filter(function (x) { return x.stopTime > t; });
    activeVoices.push(v);
    while (activeVoices.length > voiceLimit) dropVoice();
  }

  /* Envelope: short attack, sustain, release; no clicks. */
  function env(gainNode, dur, vel, when) {
    var a = 0.02, s = 0.08, r = Math.max(0.05, dur - 0.10);
    gainNode.setValueAtTime(0, when);
    gainNode.linearRampToValueAtTime(vel * 0.5, when + a);
    gainNode.linearRampToValueAtTime(vel, when + a + s);
    gainNode.linearRampToValueAtTime(vel * 0.15, when + a + s + r);
    gainNode.linearRampToValueAtTime(0, when + dur);
  }

  function osc(type, freq, when, dur, vel, inst) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    o.connect(g);
    g.connect(master);
    env(g.gain, dur, vel, when);
    o.start(when);
    o.stop(when + dur);
    registerVoice({ o: o, g: g, inst: inst, priority: instPriority(inst), stopTime: when + dur });
    o.onended = function () {
      try { o.disconnect(); } catch (e) {}
      try { g.disconnect(); } catch (e) {}
    };
  }

  function midiToFreq(m) { return m > 0 ? 440.0 * Math.pow(2, (m - 69) / 12.0) : 0; }

  function noiseSource(when, dur, filterType, filterFreq, vel) {
    if (!NOISE_BUFFER) return;
    var n = ctx.createBufferSource();
    n.buffer = NOISE_BUFFER;
    var filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = filterFreq;
    var g = ctx.createGain();
    n.connect(filt);
    filt.connect(g);
    g.connect(master);
    env(g.gain, dur, vel, when);
    n.start(when);
    n.stop(when + dur);
    registerVoice({ o: n, g: g, inst: "noise", priority: instPriority("hats"), stopTime: when + dur });
    n.onended = function () {
      try { n.disconnect(); } catch (e) {}
      try { filt.disconnect(); } catch (e) {}
      try { g.disconnect(); } catch (e) {}
    };
  }

  function playNote(ev) {
    if (!ctx || !master) return;
    var when = Math.max(ev.time, ctx.currentTime);
    var dur = ev.dur;
    var vel = ev.vel || 0.5;
    var note = ev.note;
    var inst = ev.inst;
    var base = midiToFreq(note);
    switch (inst) {
      case "pad": {
        if (!base) return;
        osc("sine", base, when, dur, vel, "pad");
        osc("sine", base * 2, when, dur, vel * 0.6, "pad");
        osc("sine", base * 3, when, dur, vel * 0.4, "pad");
        break;
      }
      case "melody":
      case "lead": {
        osc("sine", base, when, dur, vel, inst);
        break;
      }
      case "bass": {
        var o = ctx.createOscillator(); o.type = "sawtooth";
        var g = ctx.createGain();
        o.frequency.setValueAtTime(base, when);
        o.frequency.exponentialRampToValueAtTime(Math.max(40, base * 0.5), when + dur);
        o.connect(g); g.connect(master);
        env(g.gain, dur, vel, when);
        o.start(when); o.stop(when + dur);
        registerVoice({ o: o, g: g, inst: "bass", priority: instPriority("bass"), stopTime: when + dur });
        o.onended = function () { try { o.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} };
        break;
      }
      case "arp": {
        osc("square", base, when, dur * 0.6, vel, "arp");
        break;
      }
      case "kick": {
        var o = ctx.createOscillator(); o.type = "sine";
        var g = ctx.createGain();
        o.frequency.setValueAtTime(150, when);
        o.frequency.exponentialRampToValueAtTime(40, when + dur);
        o.connect(g); g.connect(master);
        env(g.gain, dur, vel, when);
        o.start(when); o.stop(when + dur);
        registerVoice({ o: o, g: g, inst: "kick", priority: instPriority("kick"), stopTime: when + dur });
        o.onended = function () { try { o.disconnect(); } catch (e) {} try { g.disconnect(); } catch (e) {} };
        break;
      }
      case "clap":
      case "hats": {
        noiseSource(when, dur, "bandpass", inst === "hats" ? 8000 : 2000, vel);
        break;
      }
      case "riser_off": {
        noiseSource(when, dur, "highpass", 800, vel);
        break;
      }
    }
  }

  /* Schedule a single note for absolute AudioContext time. */
  function schedule(ev) {
    if (!ctx) return;
    playNote(ev);
  }

  return {
    available: available,
    now: now,
    setSound: setSound,
    start: start,
    suspend: suspend,
    resume: resume,
    schedule: schedule,
    playNote: playNote
  };
});
