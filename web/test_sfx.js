/* Sound effects tests: Node puro, sem browser, sem AudioContext real.
   Testa plan() (puro) e play() com um AudioContext falso. */
const fs = require("fs"), assert = require("assert"), path = require("path");
const Data = require("./music_data.js"); // garante que o modulo de dados existe
global.CockpitMusicData = Data.DATA;
const Sfx = require("./sfx.js");
const SFX = Sfx.SFX;

let failures = 0, checks = 0;
function c(cond, msg) {
  checks++;
  if (!cond) { failures++; console.log("FAIL: " + msg); }
}
function group(name, fn) {
  try { fn(); console.log("ok - " + name); }
  catch (e) { failures++; console.log("FAIL GROUP: " + name + " -> " + e.message); }
}

/* ---------- AudioContext falso ---------- */
function makeFakeFrequency() {
  return {
    setValueAtTime: function () {},
    exponentialRampToValueAtTime: function () {},
    linearRampToValueAtTime: function () {},
    setTargetAtTime: function () {},
    cancelScheduledValues: function () {},
    value: 0
  };
}
function makeFakeAudioContext() {
  var ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    oscillators: [],
    gains: [],
    filters: [],
    bufferSources: [],
    createOscillator: function () {
      var o = {
        type: "sine",
        frequency: makeFakeFrequency(),
        connect: function () {},
        startCalled: false, stopCalled: false,
        startTime: 0, stopTime: 0,
        start: function (when) { o.startCalled = true; o.startTime = when === undefined ? ctx.currentTime : when; },
        stop: function (when) { o.stopCalled = true; o.stopTime = when === undefined ? ctx.currentTime : when; },
        onended: null
      };
      ctx.oscillators.push(o);
      return o;
    },
    createGain: function () {
      var g = {
        gain: makeFakeFrequency(),
        connect: function () {},
        connectCount: 0
      };
      var orig = g.connect;
      g.connect = function (node) { orig.call(g, node); g.connectCount++; };
      ctx.gains.push(g);
      return g;
    },
    createBiquadFilter: function () {
      var f = { type: "lowpass", frequency: makeFakeFrequency(), connect: function () {} };
      ctx.filters.push(f);
      return f;
    },
    createBuffer: function (ch, len, rate) {
      var data = new Float32Array(len || 1024);
      return { getChannelData: function () { return data; } };
    },
    createBufferSource: function () {
      var n = {
        buffer: null, connect: function () {},
        startCalled: false, stopCalled: false, startTime: 0, stopTime: 0,
        start: function (when) { n.startCalled = true; n.startTime = when === undefined ? ctx.currentTime : when; },
        stop: function (when) { n.stopCalled = true; n.stopTime = when === undefined ? ctx.currentTime : when; },
        onended: null
      };
      ctx.bufferSources.push(n);
      return n;
    },
    resume: function () {}, suspend: function () {}
  };
  return ctx;
}

/* ---------- 1. plan() deterministico ---------- */
group("plan determinismo", function () {
  var a = Sfx.plan(SFX.FIRE, 7, 1);
  var b = Sfx.plan(SFX.FIRE, 7, 1);
  c(JSON.stringify(a) === JSON.stringify(b), "mesma semente = mesma lista");
  var r1 = Sfx.plan(SFX.ROCK_BREAK, 7, 1);
  var r2 = Sfx.plan(SFX.ROCK_BREAK, 8, 1);
  c(JSON.stringify(r1) !== JSON.stringify(r2), "efeito com aleatoriedade e semente diferente = lista diferente");
  c(Array.isArray(a) && a.length > 0, "FIRE devolve lista nao vazia");
});

/* ---------- 2. campos finitos, ganhos, frequencias, atrasos ---------- */
group("campos validos", function () {
  var all = [];
  [SFX.FIRE, SFX.ROCK_BREAK, SFX.HIT, SFX.DESTROYED].forEach(function (e) {
    [0, 0.5, 1].forEach(function (i) {
      Sfx.plan(e, 42, i).forEach(function (ev) { all.push(ev); });
    });
  });
  all.forEach(function (ev) {
    c(isFinite(ev.t) && ev.t >= 0, "t finito e nao negativo");
    c(isFinite(ev.dur) && ev.dur >= 0, "dur finito e nao negativo");
    c(isFinite(ev.gain) && ev.gain >= 0 && ev.gain <= 1, "gain entre 0 e 1");
    if (ev.kind === "osc") {
      c(isFinite(ev.f0) && ev.f0 >= 20 && ev.f0 <= 12000, "f0 entre 20 e 12k");
      if (ev.f1 && ev.f1 !== ev.f0) c(isFinite(ev.f1) && ev.f1 >= 20 && ev.f1 <= 12000, "f1 entre 20 e 12k");
    }
    if (ev.kind === "noise") {
      if (ev.fFilt0) c(isFinite(ev.fFilt0) && ev.fFilt0 >= 20 && ev.fFilt0 <= 12000, "fFilt0 entre 20 e 12k");
      if (ev.fFilt1) c(isFinite(ev.fFilt1) && ev.fFilt1 >= 20 && ev.fFilt1 <= 12000, "fFilt1 entre 20 e 12k");
    }
  });
  c(all.length > 0, "houve eventos gerados");
});

/* ---------- 3. duracoes dentro dos limites ---------- */
group("duracoes dentro dos limites", function () {
  function maxTime(eff) {
    var evs = Sfx.plan(eff, 1, 1);
    var mx = 0;
    evs.forEach(function (ev) { mx = Math.max(mx, ev.t + ev.dur); });
    return mx;
  }
  c(maxTime(SFX.FIRE) <= 0.25, "FIRE <= 250 ms (" + (maxTime(SFX.FIRE)*1000).toFixed(0) + " ms)");
  c(maxTime(SFX.ROCK_BREAK) <= 0.90, "ROCK_BREAK <= 900 ms (" + (maxTime(SFX.ROCK_BREAK)*1000).toFixed(0) + " ms)");
  c(maxTime(SFX.HIT) <= 0.90, "HIT <= 900 ms (" + (maxTime(SFX.HIT)*1000).toFixed(0) + " ms)");
  var d = maxTime(SFX.DESTROYED);
  c(d >= 2.9 && d <= 4.05, "DESTROYED entre 3 e 4 s (" + d.toFixed(2) + " s)");
});

/* ---------- 4. FIRE queda de frequencia ---------- */
group("FIRE queda de frequencia", function () {
  var evs = Sfx.plan(SFX.FIRE, 1, 1);
  var main = evs.filter(function (e) { return e.kind === "osc" && e.f0 >= 1000; })[0];
  c(!!main && main.f1 < main.f0, "FIRE f1 < f0 (" + main.f0 + " -> " + main.f1 + ")");
});

/* ---------- 5. contagens de fragmentos/parciais/filtro ---------- */
group("estrutura de efeitos", function () {
  var rb = Sfx.plan(SFX.ROCK_BREAK, 1, 1);
  var frags = rb.filter(function (e) { return e.kind === "noise" && e.t > 0.04 && evDur(e) === 0.03; }).length;
  c(frags >= 3 && frags <= 6, "ROCK_BREAK tem 3-6 fragmentos (" + frags + ")");
  function evDur(e){ return e.dur; }

  var hit = Sfx.plan(SFX.HIT, 1, 1);
  var partials = hit.filter(function (e) { return e.kind === "osc" && e.f0 >= 170; }).length;
  c(partials === 4, "HIT tem 4 parciais (" + partials + ")");

  var dest = Sfx.plan(SFX.DESTROYED, 1, 1);
  var closing = dest.filter(function (e) {
    return e.kind === "noise" && e.filt === "lowpass" && e.fFilt1 < e.fFilt0;
  }).length;
  c(closing === 1, "DESTROYED tem ruido com filtro a fechar (" + closing + ")");
});

/* ---------- 6. intensidade escala ganho ---------- */
group("intensidade escala ganho", function () {
  var g0 = gains(SFX.FIRE, 0);
  var g05 = gains(SFX.FIRE, 0.5);
  var g1 = gains(SFX.FIRE, 1);
  c(g0.every(function (g) { return g === 0; }), "intensidade 0 => ganho 0");
  c(g1.every(function (g) { return g > 0; }), "intensidade 1 => ganho > 0");
  var mono = true;
  for (var i = 0; i < g1.length; i++) {
    if (Math.abs(g05[i] - g1[i] * 0.5) > 1e-6) mono = false;
  }
  c(mono, "ganho escala linear com intensidade");
  c(clamped(Sfx.clampIntensity(-5)) === 0, "clamp negativo = 0");
  c(Sfx.clampIntensity(2) === 1, "clamp >1 = 1");
  c(Sfx.clampIntensity(NaN) === 0, "clamp NaN = 0");
  c(Sfx.clampIntensity(0.7) === 0.7, "clamp 0.7 = 0.7");
  function gains(eff, i) {
    return Sfx.plan(eff, 3, i).map(function (e) { return e.gain; });
  }
  function clamped(v){ return Sfx.clampIntensity(v); }
});

/* ---------- 7. AudioContext falso: play() de cada efeito ---------- */
group("play com AudioContext falso", function () {
  global.AudioContext = makeFakeAudioContext;
  delete require.cache[require.resolve("./synth.js")];
  delete require.cache[require.resolve("./sfx.js")];
  delete global.CockpitSynth;
  var Synth = require("./synth.js");
  var sfx = require("./sfx.js");
  global.CockpitSynth = Synth;
  Synth.start(); // cria o contexto falso
  c(Synth.available() === true, "synth disponível com contexto falso");

  var maxVoices = 0;
  function countVoices() {
    var now = Synth.now();
    return Synth.getContext().oscillators.filter(function (o) { return o.stopCalled && o.stopTime > now; }).length;
  }

  [SFX.FIRE, SFX.ROCK_BREAK, SFX.HIT, SFX.DESTROYED].forEach(function (eff) {
    var before = Synth.getContext().oscillators.length;
    var ok = sfx.play(eff, 1);
    c(ok === true, "play(" + eff + ") devolve true");
    // todos os osciladores criados tem start e stop
    Synth.getContext().oscillators.forEach(function (o, idx) {
      if (idx >= before) {
        c(o.startCalled === true, "osc tem start");
        c(o.stopCalled === true, "osc tem stop (sem start sem stop)");
      }
    });
    maxVoices = Math.max(maxVoices, countVoices());
  });
  c(maxVoices <= 24, "maximo de vozes simultaneas <= 24 (" + maxVoices + ")");

  // 1000 chamadas de FIRE a 20 por segundo simulados
  var ctx = Synth.getContext();
  var err = false;
  var maxV = 0;
  for (var i = 0; i < 1000; i++) {
    ctx.currentTime = i * 0.05;
    try { sfx.play(SFX.FIRE, 1); } catch (e) { err = true; console.log("erro no play " + i + ": " + e.message); }
    maxV = Math.max(maxV, countVoices());
  }
  c(!err, "1000 chamadas FIRE nao lancam erros");
  c(maxV <= 24, "1000 FIRE: vozes nunca excedem 24 (" + maxV + ")");

  delete global.AudioContext;
});

/* ---------- 8. sem contexto: play() devolve false ---------- */
group("sem contexto", function () {
  delete global.AudioContext;
  delete require.cache[require.resolve("./synth.js")];
  delete require.cache[require.resolve("./sfx.js")];
  delete global.CockpitSynth;
  var Synth2 = require("./synth.js");
  var sfx2 = require("./sfx.js");
  c(Sfx.available() === false || Synth2.available() === false, "sem AudioContext: synth indisponivel");
  var threw = false;
  var ret;
  try { ret = sfx2.play(SFX.FIRE, 1); } catch (e) { threw = true; console.log("erro: " + e.message); }
  c(!threw, "play sem contexto nao lancou");
  c(ret === false, "play sem contexto devolve false (" + ret + ")");
});

console.log(checks + " checks, " + failures + " falhas");
process.exit(failures ? 1 : 0);
