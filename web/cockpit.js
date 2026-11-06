/* Browser shell: loads the WASM core, runs the fixed-step loop, feeds input,
   renders the scene, plays events. Game rules stay in C. */
(function () {
  "use strict";
  var STEP_MS = 1000 / 60, MAX_STEPS = 5;
  var statusNode = document.getElementById("status");
  var glCanvas = document.getElementById("gl"), hudCanvas = document.getElementById("hud");
  var stage = document.getElementById("stage"), menu = document.getElementById("menu");
  var endNode = document.getElementById("end");
  var pauseNode = document.getElementById("pause");
  var pitchNode = document.getElementById("pitch-text");
  var debugNode = document.getElementById("debug");
  var msgNode = document.getElementById("event-msg");
  var msgTimer = 0;
  var hudCtx = hudCanvas.getContext("2d");
  var core = null, renderer = null, running = false, accum = 0, last = 0, ended = false;
  var paused = false, autoPaused = false;
  var shipType = 1, seed = 12345, soundOn = true, sounds = {}, dpr = 1;
  var C = { seg: 0, pt: 1, con: 2 };
  var debugOn = false;
  var fpsSamples = []; var fpsSum = 0;
  var lastSteps = 0, lastDebug = 0;
  var simSteps = 0, simWindowStart = 0, simTicksPerSec = 0;
  var STAT = CockpitHud.STAT;
  /* Keymap panel (only in the initial menu, never during flight). */
  var keymapPanelOpen = false;
  var musicDirector = null, musicPairing = null;  // music:

  function setStatus(t) { statusNode.textContent = t; }

  function sound(id) {
    if (!soundOn || !id || typeof Howl !== "function") return;
    if (!sounds[id]) sounds[id] = new Howl({ src: ["sounds/" + id + ".wav"], volume: 0.6, html5: false });
    sounds[id].play();
  }
  function handleEvents() {
    var ev;
    while ((ev = core._cs_event_take()) !== 0) {
      var synthPlayed = (typeof CockpitSfx !== "undefined" && CockpitSfx.isSfxEvent(ev)) ? CockpitSfx.play(ev, 1) : false;
      if (!synthPlayed) sound(CockpitEvents.soundFor(ev));
      var v = CockpitEvents.vibrationFor(ev);
      if (v && navigator.vibrate) navigator.vibrate(v);
      if (typeof CockpitStory !== "undefined") {
        var et = CockpitStory.textForEvent(ev);
        if (et && msgNode && et !== CockpitStory.hintForState(function (id) { return core._cs_stat(id); })) {
          msgNode.textContent = et;
          msgTimer = 240; /* 4 seconds at 60 fps */
        }
      }
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
  function updatePitchText() {
    if (!pitchNode) return;
    pitchNode.textContent = CockpitSettings.isInverted() ? "PITCH INVERTIDO" : "PITCH NORMAL";
  }
  function updateDebug(now, steps) {
    if (!debugOn || !debugNode) return;
    lastSteps = steps;
    var dt = now - lastDebug; var first = lastDebug === 0; lastDebug = now;
    if (first || dt <= 0) return;
    fpsSamples.push(dt); fpsSum += dt;
    if (fpsSamples.length > 60) { fpsSum -= fpsSamples.shift(); }
    var fps = fpsSamples.length > 0 ? 1000.0 / (fpsSum / fpsSamples.length) : 0;
    simSteps += steps;
    var sdt = now - simWindowStart;
    if (sdt >= 1000) {
      simTicksPerSec = sdt > 0 ? simSteps / (sdt / 1000) : 0;
      simSteps = 0; simWindowStart = now;
    }
    var modeVal = core ? (core._cs_stat(STAT.MODE) || 0) : 0;
    var lines = [
      "DESENHO: " + fps.toFixed(0) + " FPS",
      "SIM: " + simTicksPerSec.toFixed(0) + " ticks/s",
      "ticks/frame: " + lastSteps,
      "SPEED: " + (core ? core._cs_stat(STAT.SPEED) : 0).toFixed(1),
      "PROGRESS: " + (core ? core._cs_stat(STAT.PROGRESS) : 0).toFixed(0) + "%",
      "MODE: " + (["AUTOPILOT", "MANUAL", "ARRIVED", "DESTROYED", "STRANDED"][modeVal] || ""),
      "ALERT: " + (core ? core._cs_stat(STAT.ALERT) : 0).toFixed(0),
      "HULL: " + (core ? core._cs_stat(STAT.HULL) : 0).toFixed(0) + "/" + (core ? core._cs_stat(STAT.HULL_MAX) : 0).toFixed(0),
      "FUEL: " + (core ? core._cs_stat(STAT.FUEL) : 0).toFixed(0) + "/" + (core ? core._cs_stat(STAT.FUEL_MAX) : 0).toFixed(0),
      "ENERGY: " + (core ? core._cs_stat(STAT.ENERGY) : 0).toFixed(0) + "/" + (core ? core._cs_stat(STAT.ENERGY_MAX) : 0).toFixed(0)
    ];
    debugNode.textContent = lines.join("\n");
  }
  function frame(now) {
    if (!running) return;
    if (!paused) {
      var dt = Math.min(now - last, 100); last = now; accum += dt;
      var steps = 0;
      while (accum >= STEP_MS && steps < MAX_STEPS) { core._cs_tick(); accum -= STEP_MS; steps++; }
      if (steps === MAX_STEPS) accum = 0;
      updateDebug(now, steps);
      /* music: update music each frame */
      if (musicDirector) musicDirector.update(function (id) { return core ? core._cs_stat(id) : 0; }, now);  // music:
      handleEvents();
      if (msgTimer > 0) { msgTimer--; if (msgTimer === 0 && msgNode) msgNode.textContent = ""; }
      core._cs_scene_update();
      var sc = core._cs_const(0), pc = core._cs_const(1), cc = core._cs_const(2);
      var segN = core._cs_seg_count(), ptN = core._cs_pt_count(), conN = core._cs_con_count();
      renderer.draw(floats(core._cs_seg_ptr(), segN, sc), segN, floats(core._cs_pt_ptr(), ptN, pc), ptN,
        core._cs_stat(CockpitHud.STAT.ATMO_DENSITY), core._cs_stat(CockpitHud.STAT.SPEED), now / 1000);
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
    } else {
      updateDebug(now, 0);
    }
    if (typeof CockpitGamepad !== "undefined") CockpitGamepad.update(pressInput, togglePause);
    requestAnimationFrame(frame);
  }
  function start() {
    if (musicDirector) musicDirector.start();  // music: needs a user gesture (menu click or Enter)
    if (core._cs_init(shipType, seed) !== 0) { setStatus("Tipo de nave inválido."); return; }
    menu.hidden = true; endNode.hidden = true; ended = false; paused = false; autoPaused = false;
    if (pauseNode) pauseNode.hidden = true;
    accum = 0; resize();
    simWindowStart = performance.now();
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    setStatus("");
  }
  function press(action, down) { if (core && action >= 0 && !paused) core._cs_input(action, down ? 1 : 0); }
  function pressInput(action, down) { press(CockpitSettings.mapAction(action), down); }
  function releaseAll() { if (core) for (var a = 0; a < 8; a++) core._cs_input(a, 0); CockpitInput.releaseAll(); }
  function togglePause() {
    if (!running || menu.hidden === false || ended) return;
    paused = !paused; autoPaused = false;
    if (pauseNode) pauseNode.hidden = !paused;
    /* music: pause/resume music */
    if (musicDirector) { if (paused) musicDirector.pause(); else musicDirector.resume(); }  // music:
    if (paused) releaseAll();
    else { last = performance.now(); accum = 0; fpsSamples = []; fpsSum = 0; lastDebug = 0; }
  }
  function autoPause(pause) {
    if (!running || menu.hidden === false || ended) return;
    if (pause && !paused) { paused = true; autoPaused = true; releaseAll(); if (pauseNode) pauseNode.hidden = false; }
    else if (!pause && autoPaused) { paused = false; autoPaused = false; if (pauseNode) pauseNode.hidden = true; last = performance.now(); accum = 0; fpsSamples = []; fpsSum = 0; lastDebug = 0; }
  }

  window.addEventListener("keydown", function (e) {
    if (!core) return;
    if (keymapPanelOpen && CockpitKeymap.captureState().active) {
      var cap = CockpitKeymap.handleCaptureKey(e.code);
      if (cap.message) showMsg(cap.message);
      renderKeymapPanel();
      e.preventDefault();
      return;
    }
    if (keymapPanelOpen) { if (e.code === "Escape") closeKeymapPanel(); e.preventDefault(); return; }
    if (e.code === "Enter" && (menu.hidden === false || ended)) { start(); e.preventDefault(); return; }
    if (e.code === "Escape" && menu.hidden === true && !ended) { togglePause(); e.preventDefault(); return; }
    if (e.code === "KeyI" && menu.hidden === true && !ended) {
      releaseAll(); CockpitSettings.setInverted(!CockpitSettings.isInverted()); updatePitchText(); e.preventDefault(); return;
    }
    if (e.code === "F3" && menu.hidden === true && !ended) {
      debugOn = !debugOn; if (debugNode) debugNode.hidden = !debugOn; e.preventDefault(); return;
    }
    if (paused) return;
    var a = CockpitInput.actionForCode(e.code);
    if (a >= 0) { CockpitInput.keydown(e.code, e.repeat); e.preventDefault(); }
  });
  window.addEventListener("keyup", function (e) {
    if (!core) return;
    if (keymapPanelOpen && CockpitKeymap.captureState().active) { e.preventDefault(); return; }
    if (keymapPanelOpen) { e.preventDefault(); return; }
    var a = CockpitInput.actionForCode(e.code);
    if (a >= 0) { CockpitInput.keyup(e.code); e.preventDefault(); }
  });
  window.addEventListener("blur", function () { autoPause(true); releaseAll(); });
  window.addEventListener("focus", function () { autoPause(false); });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) autoPause(true); else autoPause(false);
  });

  /* --- Keymap panel (only in the initial menu) --- */
  var keymapNode = document.getElementById("keymap");
  var keymapMsgNode = document.getElementById("keymap-msg");

  function showMsg(m) { if (keymapMsgNode) keymapMsgNode.textContent = m; }

  function slotLabel(action, slot) {
    var keys = CockpitKeymap.getKeys(action);
    var code = keys[slot];
    return code ? CockpitKeymap.keyLabel(code) : "-";
  }

  function renderKeymapPanel() {
    var list = document.getElementById("keymap-list");
    if (!list) return;
    list.innerHTML = "";
    var cap = CockpitKeymap.captureState();
    for (var a = 0; a < CockpitKeymap.ACTION_COUNT; a++) {
      var row = document.createElement("div");
      row.className = "keymap-row";
      var label = document.createElement("span");
      label.textContent = CockpitKeymap.ACTION_NAMES[a];
      row.appendChild(label);
      for (var s = 0; s < 2; s++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.action = a;
        btn.dataset.slot = s;
        btn.textContent = slotLabel(a, s);
        if (cap.active && cap.action === a && cap.slot === s) btn.textContent = "PRESSIONE UMA TECLA";
        (function (act, sl) {
          btn.addEventListener("click", function () {
            var r = CockpitKeymap.startCapture(act, sl);
            renderKeymapPanel();
            showMsg(r.message);
          });
        })(a, s);
        row.appendChild(btn);
      }
      list.appendChild(row);
    }
  }

  function closeKeymapPanel() {
    CockpitKeymap.cancelCapture();
    keymapPanelOpen = false;
    if (keymapNode) keymapNode.hidden = true;
    if (menu) menu.hidden = false;
    showMsg("");
  }

  function openKeymapPanel() {
    if (!core) return;
    if (menu.hidden !== false || ended) return;
    keymapPanelOpen = true;
    if (menu) menu.hidden = true;
    if (keymapNode) keymapNode.hidden = false;
    renderKeymapPanel();
    showMsg("");
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-ship]"), function (b) {
    b.addEventListener("click", function () { shipType = Number(b.dataset.ship); start(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-action]"), function (b) {
    var a = Number(b.dataset.action);
    b.addEventListener("pointerdown", function (e) { e.preventDefault(); pressInput(a, true); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) { b.addEventListener(n, function () { pressInput(a, false); }); });
  });
  document.getElementById("restart").addEventListener("click", start);
  document.getElementById("sound").addEventListener("click", function (e) {
    soundOn = !soundOn; e.target.textContent = soundOn ? "SOM LIGADO" : "SOM DESLIGADO"; e.target.setAttribute("aria-pressed", String(!soundOn));
    /* music: respect sound button */
    if (typeof CockpitSynth !== "undefined") CockpitSynth.setSound(soundOn);  // music:
  });
  var btnKeymap = document.getElementById("btn-keymap");
  if (btnKeymap) btnKeymap.addEventListener("click", openKeymapPanel);
  var btnKeymapClose = document.getElementById("keymap-close");
  if (btnKeymapClose) btnKeymapClose.addEventListener("click", closeKeymapPanel);
  var btnKeymapReset = document.getElementById("keymap-reset");
  if (btnKeymapReset) btnKeymapReset.addEventListener("click", function () {
    CockpitKeymap.resetAll(); renderKeymapPanel(); showMsg("");
  });
  try { renderer = new CockpitRenderer(glCanvas, 70); } catch (err) { setStatus("WebGL indisponível: " + err.message); return; }
  if (typeof createCockpit !== "function") { setStatus("cockpit.js não encontrado: execute make -f web/Makefile all."); return; }
  try { CockpitSettings.useStorage(window.localStorage); } catch (err) { /* storage blocked: defaults only */ }
  try { CockpitKeymap.useStorage(window.localStorage); CockpitKeymap.load(); } catch (err) { /* storage blocked: defaults only */ }
  CockpitInput.setKeymap(CockpitKeymap);
  CockpitInput.bind(pressInput);
  musicPairing = CockpitMusic.selectPairing({ galaxy: 0, culture: "corredor", pace: "calm", seed: 1 });  // music:
  musicDirector = CockpitMusicDirector.create(CockpitSynth, CockpitMusic, musicPairing);  // music:
  updatePitchText();
  createCockpit().then(function (m) {
    core = m; window.__cockpit = m; resize(); setStatus(""); menu.hidden = false;
  }).catch(function (e) { setStatus("Falha ao carregar WebAssembly: " + e); });
})();
