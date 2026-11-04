/* Browser shell: loads the WASM core, runs the fixed-step loop, feeds input,
   renders the scene, plays events. Game rules stay in C. */
(function () {
  "use strict";
  var STEP_MS = 1000 / 60, MAX_STEPS = 5;
  var statusNode = document.getElementById("status");
  var glCanvas = document.getElementById("gl"), hudCanvas = document.getElementById("hud");
  var stage = document.getElementById("stage"), menu = document.getElementById("menu");
  var endNode = document.getElementById("end");
  var hudCtx = hudCanvas.getContext("2d");
  var core = null, renderer = null, running = false, accum = 0, last = 0, ended = false;
  var shipType = 1, seed = 12345, soundOn = true, sounds = {}, dpr = 1;
  var C = { seg: 0, pt: 1, con: 2 };

  function setStatus(t) { statusNode.textContent = t; }

  function sound(id) {
    if (!soundOn || !id || typeof Howl !== "function") return;
    if (!sounds[id]) sounds[id] = new Howl({ src: ["sounds/" + id + ".wav"], volume: 0.6, html5: false });
    sounds[id].play();
  }
  function handleEvents() {
    var ev;
    while ((ev = core._cs_event_take()) !== 0) {
      sound(CockpitEvents.soundFor(ev));
      var v = CockpitEvents.vibrationFor(ev);
      if (v && navigator.vibrate) navigator.vibrate(v);
    }
  }
  function resize() {
    var r = stage.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (renderer) renderer.resize(r.width, r.height, dpr);
    hudCanvas.width = Math.floor(r.width * dpr); hudCanvas.height = Math.floor(r.height * dpr);
    hudCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function floats(ptr, count, stride) {
    return new Float32Array(core.HEAPF32.buffer, ptr, count * stride);
  }
  function frame(now) {
    if (!running) return;
    var dt = Math.min(now - last, 100); last = now; accum += dt;
    var steps = 0;
    while (accum >= STEP_MS && steps < MAX_STEPS) { core._cs_tick(); accum -= STEP_MS; steps++; }
    if (steps === MAX_STEPS) accum = 0;
    handleEvents();
    core._cs_scene_update();
    var sc = core._cs_const(0), pc = core._cs_const(1), cc = core._cs_const(2);
    var segN = core._cs_seg_count(), ptN = core._cs_pt_count(), conN = core._cs_con_count();
    renderer.draw(floats(core._cs_seg_ptr(), segN, sc), segN, floats(core._cs_pt_ptr(), ptN, pc), ptN);
    var r = stage.getBoundingClientRect();
    CockpitHud.draw(hudCtx, r.width, r.height, function (id) { return core._cs_stat(id); },
      floats(core._cs_con_ptr(), conN, cc), conN, Math.floor(now / 350) % 2 === 0);
    var mode = core._cs_stat(CockpitHud.STAT.MODE);
    if (mode >= 2 && !ended) {
      ended = true;
      endNode.hidden = false;
      endNode.querySelector("h2").textContent = CockpitHud.endText(mode);
      endNode.querySelector("p").textContent = "Casco " + Math.round(core._cs_stat(CockpitHud.STAT.HULL)) +
        " | combustível " + Math.round(core._cs_stat(CockpitHud.STAT.FUEL)) +
        " | tempo na Terra " + core._cs_stat(CockpitHud.STAT.EARTH_DAYS).toFixed(1) + " dias";
    }
    requestAnimationFrame(frame);
  }
  function start() {
    if (core._cs_init(shipType, seed) !== 0) { setStatus("Tipo de nave inválido."); return; }
    menu.hidden = true; endNode.hidden = true; ended = false; accum = 0; resize();
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    setStatus("");
  }
  function press(action, down) { if (core && action >= 0) core._cs_input(action, down ? 1 : 0); }

  window.addEventListener("keydown", function (e) {
    if (!core) return;
    if (e.code === "Enter" && (menu.hidden === false || ended)) { start(); e.preventDefault(); return; }
    var a = CockpitInput.actionForCode(e.code);
    if (a >= 0) { if (!e.repeat) press(a, true); e.preventDefault(); }
  });
  window.addEventListener("keyup", function (e) {
    var a = CockpitInput.actionForCode(e.code);
    if (a >= 0) { press(a, false); e.preventDefault(); }
  });
  window.addEventListener("blur", function () { for (var a = 0; a < 8; a++) press(a, false); });
  window.addEventListener("resize", resize);

  Array.prototype.forEach.call(document.querySelectorAll("[data-ship]"), function (b) {
    b.addEventListener("click", function () { shipType = Number(b.dataset.ship); start(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-action]"), function (b) {
    var a = Number(b.dataset.action);
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); press(a, true); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) { b.addEventListener(n, function () { press(a, false); }); });
  });
  document.getElementById("restart").addEventListener("click", start);
  document.getElementById("sound").addEventListener("click", function (e) {
    soundOn = !soundOn; e.target.textContent = soundOn ? "SOM LIGADO" : "SOM DESLIGADO"; e.target.setAttribute("aria-pressed", String(!soundOn));
  });

  try { renderer = new CockpitRenderer(glCanvas, 70); } catch (err) { setStatus("WebGL indisponível: " + err.message); return; }
  if (typeof createCockpit !== "function") { setStatus("cockpit.js não encontrado: execute make -f web/Makefile all."); return; }
  createCockpit().then(function (m) {
    core = m; window.__cockpit = m; resize(); setStatus(""); menu.hidden = false;
  }).catch(function (e) { setStatus("Falha ao carregar WebAssembly: " + e); });
})();
