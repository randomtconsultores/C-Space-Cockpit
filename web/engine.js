/* Engine sound: continuous rumble driven by throttle, air density and speed.
   UMD. The pure part (params) is testable in Node; the player part uses the
   shared Web Audio context and master gain of synth.js and degrades silently
   without Web Audio. Code comments in English. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp01(v) { return !(v > 0) ? 0 : (v > 1 ? 1 : v); }

  /* Pure: target parameters for the continuous engine sound.
     level 0..1 overall; noiseGain/noiseFreq: hiss of the exhaust (muffled in thin air);
     lowGain/lowFreq: sub rumble felt through the hull (stays in space). */
  function params(throttle, density, speed, fuel) {
    var t = clamp01(throttle), d = clamp01(density), sp = speed > 0 ? speed : 0;
    var on = fuel === undefined || fuel > 0;
    var level = on && t > 0 ? 0.2 + 0.8 * t : 0;
    return {
      level: level,
      noiseGain: level * 0.55 * (0.12 + 0.88 * d),
      noiseFreq: 250 + 1700 * t * (0.2 + 0.8 * d),
      lowGain: level * (0.30 + 0.25 * d),
      lowFreq: 34 + 26 * t + Math.min(sp, 300) * 0.05
    };
  }

  var nodes = null, prevLevel = 0;

  function build(ctx, master) {
    var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    var s = 987654321;
    for (var i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) | 0; data[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
    var noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    var nf = ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 400;
    var ng = ctx.createGain(); ng.gain.value = 0;
    noise.connect(nf); nf.connect(ng);
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = "sawtooth"; o2.type = "sawtooth"; o1.frequency.value = 40; o2.frequency.value = 41.5;
    var lf = ctx.createBiquadFilter(); lf.type = "lowpass"; lf.frequency.value = 140;
    var lg = ctx.createGain(); lg.gain.value = 0;
    o1.connect(lf); o2.connect(lf); lf.connect(lg);
    var out = ctx.createGain(); out.gain.value = 0.7;
    ng.connect(out); lg.connect(out); out.connect(master);
    noise.start(); o1.start(); o2.start();
    return { ctx: ctx, nf: nf, ng: ng, o1: o1, o2: o2, lg: lg, lf: lf };
  }

  /* synth: CockpitSynth-like object (getContext, getMaster). */
  function update(synth, throttle, density, speed, fuel) {
    if (!synth || !synth.getContext || !synth.getContext() || !synth.getMaster()) return;
    var ctx = synth.getContext();
    if (!nodes || nodes.ctx !== ctx) { try { nodes = build(ctx, synth.getMaster()); } catch (e) { nodes = null; return; } }
    var p = params(throttle, density, speed, fuel), t = ctx.currentTime;
    nodes.ng.gain.setTargetAtTime(p.noiseGain, t, 0.15);
    nodes.nf.frequency.setTargetAtTime(p.noiseFreq, t, 0.2);
    nodes.lg.gain.setTargetAtTime(p.lowGain, t, 0.2);
    nodes.o1.frequency.setTargetAtTime(p.lowFreq, t, 0.3);
    nodes.o2.frequency.setTargetAtTime(p.lowFreq * 1.04, t, 0.3);
    nodes.lf.frequency.setTargetAtTime(100 + 120 * p.level, t, 0.3);
    /* ignition burst: a short rise of the hiss when the engine starts */
    if (prevLevel === 0 && p.level > 0) {
      nodes.ng.gain.cancelScheduledValues(t);
      nodes.ng.gain.setValueAtTime(0, t);
      nodes.ng.gain.linearRampToValueAtTime(Math.min(1, p.noiseGain * 2.2 + 0.2), t + 0.25);
      nodes.ng.gain.setTargetAtTime(p.noiseGain, t + 0.3, 0.4);
    }
    prevLevel = p.level;
  }

  function silence(synth) {
    prevLevel = 0;
    if (!nodes || !synth || !synth.getContext || nodes.ctx !== synth.getContext()) return;
    var t = nodes.ctx.currentTime;
    nodes.ng.gain.setTargetAtTime(0, t, 0.05);
    nodes.lg.gain.setTargetAtTime(0, t, 0.05);
  }

  return { params: params, update: update, silence: silence };
});
