/* Tower comms: "Houston" voice that accompanies the whole flight.
   UMD. The director (which line fires when) is pure and testable in Node;
   the player speaks lines with the browser speech synthesis, adds radio
   static through the shared Web Audio context and always shows a subtitle.
   It degrades silently without speech or Web Audio. Code comments in English;
   player-visible text is Portuguese (pt-PT). Story text is provisional. */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CockpitComms = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Stat ids mirror core/FlStat (web/hud.js). */
  var S = { THROTTLE: 2, DISTANCE_LEFT: 15, MODE: 16, PHASE: 23, ALTITUDE: 24 };
  var EV = { ATMO_EXIT: 13, MOON: 14, SLING_GOOD: 15, SLING_OK: 16, SLING_MISS: 17, MOON_COLLISION: 19 };
  var PH = { ASCENT: 0, ATMO_EXIT: 1, TRANSIT: 2, MOON: 3, BELT: 4, EXIT: 5 };
  var ROUTE_LENGTH = 25000;

  /* text: subtitle. say: spoken form (phonetic where the voice needs help).
     prio: 1 = may be dropped when the queue is busy, 2 = always kept. */
  var LINES = {
    RADIO:    { text: "Houston a Cockpit. Houston a Cockpit. Verificação de rádio. Está a ouvir-nos?", say: "Hiuston a Cockpit. Hiuston a Cockpit. Verificação de rádio. Está a ouvir-nos?", prio: 2 },
    IGNITION: { text: "Ignição confirmada. Motores a cem por cento. Boa viagem.", say: "Ignição confirmada. Motores a cem por cento. Boa viagem.", prio: 2 },
    LIFTOFF:  { text: "Descolagem. Já limpou a torre. Mantenha a subida vertical.", say: "Descolagem. Já limpou a torre. Mantenha a subida vertical.", prio: 2 },
    CLIMB:    { text: "Trinta quilómetros. Trajetória nominal. Está a ir muito bem.", say: "Trinta quilómetros. Trajetória nominal. Está a ir muito bem.", prio: 1 },
    HEAT:     { text: "A atravessar a zona de calor máximo. Aguente firme, Cockpit.", say: "A atravessar a zona de calor máximo. Aguente firme, Cockpit.", prio: 2 },
    HIGH:     { text: "Oitenta quilómetros. A atmosfera fica para trás.", say: "Oitenta quilómetros. A atmosfera fica para trás.", prio: 1 },
    ATMO_EXIT:{ text: "Saiu da atmosfera. Parabéns, Cockpit. A torre está orgulhosa de si.", say: "Saiu da atmosfera. Parabéns, Cockpit. A torre está orgulhosa de si.", prio: 2 },
    REASON:   { text: "Recorde a missão: levar a Terra a tempo da tecnologia que a pode salvar. O relógio não pára.", say: "Recorde a missão: levar a Terra a tempo da tecnologia que a pode salvar. O relógio não pára.", prio: 2 },
    MOON:     { text: "Aproxima-se da Lua. Siga os anéis: a trajetória foi calculada pelos cientistas terrestres.", say: "Aproxima-se da Lua. Siga os anéis: a trajetória foi calculada pelos cientistas terrestres.", prio: 2 },
    SLING_GOOD:{ text: "Fantástico. Passagem perfeita. A Lua deu-lhe um grande impulso.", say: "Fantástico. Passagem perfeita. A Lua deu-lhe um grande impulso.", prio: 2 },
    SLING_OK: { text: "Boa passagem. Ganhou algum impulso. Siga em frente.", say: "Boa passagem. Ganhou algum impulso. Siga em frente.", prio: 2 },
    SLING_MISS:{ text: "Passagem demasiado alta. Sem impulso desta vez. Siga em frente.", say: "Passagem demasiado alta. Sem impulso desta vez. Siga em frente.", prio: 2 },
    CRASH_MOON:{ text: "Contacto com a superfície lunar. Verifique o casco. Corrija a rota.", say: "Contacto com a superfície lunar. Verifique o casco. Corrija a rota.", prio: 2 },
    CRUISE:   { text: "Velocidade máxima autorizada. Daqui para a frente a Terra só consegue ouvi-lo em rádio fraco.", say: "Velocidade máxima autorizada. Daqui para a frente a Terra só consegue ouvi-lo em rádio fraco.", prio: 1 },
    BELT:     { text: "Atenção, faixa de asteroides à frente. Controlo manual. Use o laser.", say: "Atenção, faixa de asteroides à frente. Controlo manual. Use o laser.", prio: 2 },
    BELT_MID: { text: "O sinal está a enfraquecer. Está sozinho aí fora. Confiamos em si.", say: "O sinal está a enfraquecer. Está sozinho aí fora. Confiamos em si.", prio: 1 },
    EXIT:     { text: "Atravessou a faixa. Boa sorte, Cockpit. A Terra conta consigo. Adeus.", say: "Atravessou a faixa. Boa sorte, Cockpit. A Terra conta consigo. Adeus.", prio: 2 },
    ARRIVED:  { text: "Houston, última transmissão. Missão cumprida. Adeus e obrigado.", say: "Hiuston, última transmissão. Missão cumprida. Adeus e obrigado.", prio: 2 },
    LOST:     { text: "Cockpit, perdemos o sinal. Cockpit, está aí? Cockpit...", say: "Cockpit, perdemos o sinal. Cockpit, está aí? Cockpit...", prio: 2 }
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
      out.push({ id: id, text: l.text, say: l.say, prio: l.prio });
    }
    return {
      reset: function () { fired = {}; started = false; },
      /* Stat-driven triggers. get(id) returns a stat value. */
      step: function (get) {
        var out = [], z = get(S.ALTITUDE), ph = get(S.PHASE), mode = get(S.MODE);
        if (!started) { started = true; fire(out, "RADIO"); }
        if (mode === 3 || mode === 4) { fire(out, "LOST"); return out; }
        if (mode === 2) { fire(out, "ARRIVED"); return out; }
        if (get(S.THROTTLE) > 0.05) fire(out, "IGNITION");
        if (z > 40) fire(out, "LIFTOFF");
        if (z > 750) fire(out, "CLIMB");
        if (z > 1300 && ph === PH.ASCENT) fire(out, "HEAT");
        if (z > 2000 && ph === PH.ASCENT) fire(out, "HIGH");
        if (ph === PH.TRANSIT && get(S.DISTANCE_LEFT) > 0) {
          if (fired.MOON && z > 10500) fire(out, "CRUISE");
        }
        if (ph === PH.BELT) {
          fire(out, "BELT");
          if (z > 16500) fire(out, "BELT_MID");
        }
        if (ph === PH.EXIT) fire(out, "EXIT");
        return out;
      },
      /* Event-driven triggers. */
      event: function (ev) {
        var out = [];
        if (ev === EV.ATMO_EXIT) { fire(out, "ATMO_EXIT"); fire(out, "REASON"); }
        else if (ev === EV.MOON) fire(out, "MOON");
        else if (ev === EV.SLING_GOOD) fire(out, "SLING_GOOD");
        else if (ev === EV.SLING_OK) fire(out, "SLING_OK");
        else if (ev === EV.SLING_MISS) fire(out, "SLING_MISS");
        else if (ev === EV.MOON_COLLISION) fire(out, "CRASH_MOON");
        return out;
      }
    };
  }

  /* Player. env (all optional, injectable for tests): synth (speechSynthesis),
     Utter (SpeechSynthesisUtterance), node (subtitle element), synthAudio (CockpitSynth). */
  function createPlayer(env) {
    env = env || {};
    var synth = env.synth !== undefined ? env.synth : (typeof speechSynthesis !== "undefined" ? speechSynthesis : null);
    var Utter = env.Utter || (typeof SpeechSynthesisUtterance !== "undefined" ? SpeechSynthesisUtterance : null);
    var node = env.node || null, audio = env.audio || null;
    var queue = [], current = null, until = 0, enabled = true, noise = 0;

    function pickVoice() {
      if (!synth || !synth.getVoices) return null;
      var v = synth.getVoices() || [], i;
      for (i = 0; i < v.length; i++) if (v[i].lang === "pt-PT") return v[i];
      for (i = 0; i < v.length; i++) if (/^pt/i.test(v[i].lang || "")) return v[i];
      return null;
    }
    function burst(level, ms) {
      var ctx = audio && audio.getContext && audio.getContext(), master = audio && audio.getMaster && audio.getMaster();
      if (!ctx || !master) return;
      try {
        var len = Math.floor(ctx.sampleRate * ms / 1000), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.7;
        var g = ctx.createGain(); g.gain.value = 0.05 + 0.15 * level;
        src.connect(f); f.connect(g); g.connect(master); src.start();
      } catch (e) { /* audio is optional */ }
    }
    function show(text) { if (node) { node.textContent = text ? "HOUSTON: " + text : ""; node.style.opacity = text ? "1" : "0"; } }
    function finish() {
      if (!current) return;
      burst(noise, 120); current = null; show("");
    }
    function start(line, now) {
      current = line; show(line.text);
      var est = 1800 + line.say.length * 75;
      until = now + est * 1.6;
      burst(noise, 220);
      if (enabled && synth && Utter) {
        try {
          var u = new Utter(line.say), v = pickVoice();
          u.lang = "pt-PT"; if (v) u.voice = v;
          u.pitch = 0.75; u.rate = 0.93; u.volume = 1 - 0.35 * noise;
          u.onend = function () { if (current === line) until = 0; };
          u.onerror = function () { if (current === line) until = Math.min(until, now + est); };
          synth.speak(u);
        } catch (e) { /* speech is optional */ }
      } else until = now + est;
    }
    return {
      setEnabled: function (on) { enabled = !!on; if (!on) { this.cancel(); } },
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
      pause: function () { if (synth && synth.pause) try { synth.pause(); } catch (e) { /* optional */ } },
      resume: function () { if (synth && synth.resume) try { synth.resume(); } catch (e) { /* optional */ } },
      cancel: function () {
        queue.length = 0; current = null; show("");
        if (synth && synth.cancel) try { synth.cancel(); } catch (e) { /* optional */ }
      },
      busy: function () { return !!current || queue.length > 0; }
    };
  }

  return { LINES: LINES, staticLevel: staticLevel, createDirector: createDirector, createPlayer: createPlayer, STAT: S, EV: EV };
});
