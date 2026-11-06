"use strict";

/* C-Space Cockpit - automatic smoke test in headless Chromium.
 *
 * Loads the game from web/build, drives the first minutes of flight and
 * fails if anything is broken. Not a substitute for the Director's sign-off.
 *
 * Usage:  node smoke.js          (from tools/smoke/)
 *         CHROMIUM_PATH=/path/to/chromium node smoke.js
 *
 * Prints one line per step: OK or FALHOU, plus the reason. Exit code 0 on
 * success, 1 on failure.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const BUILD = path.join(ROOT, "web", "build");
const HUD_PATH = path.join(ROOT, "web", "hud.js");
const WASM = path.join(BUILD, "cockpit_wasm.wasm");
const OUT_DIR = path.join(__dirname, "out");

/* Stat ids are read from web/hud.js (object STAT), never hard-coded, so the
 * test breaks if the contract changes. */
let STAT;
try {
  STAT = require(HUD_PATH).STAT;
} catch (err) {
  console.error("FALHOU setup: nao foi possivel ler web/hud.js (" + err.message + ")");
  process.exit(1);
}

const ID = {
  SPEED: STAT.SPEED,           // 0
  PROGRESS: STAT.PROGRESS,     // 10
  MODE: STAT.MODE,             // 16
  ALERT: STAT.ALERT,           // 17
  HULL: STAT.HULL,             // 6
  HULL_MAX: STAT.HULL_MAX,     // 7
  ENERGY: STAT.ENERGY,         // 8
  ALTITUDE: STAT.ALTITUDE
};

let failures = 0;
let results = [];   /* { step, ok, reason } */
let pageErrors = [];/* real (non-noise) page/console errors */
let warnings = [];  /* howler CDN / .wav network noise */

function log(kind, step, reason) {
  results.push({ step, ok: kind === "OK", reason });
  console.log(kind + " " + step + (reason ? " - " + reason : ""));
}

function isNoise(msg) {
  const m = String(msg).toLowerCase();
  return m.indexOf("howler") !== -1 ||
         m.indexOf(".wav") !== -1 ||
         m.indexOf("cdnjs.cloudflare") !== -1;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(file);
    s.on("data", d => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

/* ------------------------------------------------------------------ */
/* HTTP server serving web/build on 127.0.0.1, a free port.           */
/* ------------------------------------------------------------------ */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".css": "text/css"
};

function startServer() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BUILD)) {
      reject(new Error("web/build nao existe. Corra: make -f web/Makefile all"));
      return;
    }
    const server = http.createServer((req, res) => {
      let url = new URL(req.url, "http://localhost");
      let file = path.join(BUILD, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      // prevent path traversal
      const real = path.resolve(BUILD);
      if (!file.startsWith(real + path.sep) && file !== real) {
        res.writeHead(403); res.end(); return;
      }
      fs.stat(file, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(404); res.end("not found"); return;
        }
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        fs.createReadStream(file).pipe(res);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, port, url: "http://127.0.0.1:" + port + "/" });
    });
    server.on("error", reject);
  });
}

/* ------------------------------------------------------------------ */
/* Steps                                                              */
/* ------------------------------------------------------------------ */
async function readStat(page, id) {
  return page.evaluate(id => window.__cockpit._cs_stat(id), id);
}

/* Advance the simulation until stat `id` equals `value` (or maxTicks). */
async function runTicksUntil(page, maxTicks, id, value) {
  return page.evaluate(({ maxTicks, id, value }) => {
    let ticks = 0;
    while (ticks < maxTicks && window.__cockpit._cs_stat(id) !== value) {
      window.__cockpit._cs_tick();
      ticks++;
    }
    return { ticks };
  }, { maxTicks, id, value });
}

async function main() {
  /* ---- 0. sanity: build exists + wasm sha256 ---- */
  if (!fs.existsSync(WASM)) {
    console.error("FALHOU setup: web/build/cockpit_wasm.wasm nao encontrado. Corra: make -f web/Makefile all");
    process.exit(1);
  }
  const wasmSha = await sha256File(WASM);
  console.log("SHA-256 web/build/cockpit_wasm.wasm: " + wasmSha);

  /* ---- 1. start HTTP server ---- */
  let server;
  try {
    ({ server } = await startServer());
  } catch (err) {
    console.error("FALHOU setup: " + err.message);
    process.exit(1);
  }
  const { port, url } = await new Promise(r => {
    /* startServer already resolved with server+port; re-capture */
    r({ port: server.address().port, url: "http://127.0.0.1:" + server.address().port + "/" });
  });

  /* ---- 2. launch Chromium ---- */
  const chromiumPath = process.env.CHROMIUM_PATH;
  const browserArgs = [
    "--use-gl=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--no-sandbox",
    "--disable-setuid-sandbox"
  ];
  let browser, page;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: chromiumPath || undefined,
      args: browserArgs
    });
    page = await browser.newPage();

    /* Collect console errors and page errors. Noise (howler CDN / .wav) is a
     * warning, anything else fails the test. */
    page.on("console", msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error") {
        /* HTTP failures are judged per URL in the "response" handler. */
        if (text.toLowerCase().indexOf("failed to load resource") !== -1) return;
        if (isNoise(text)) warnings.push(text);
        else pageErrors.push(text);
      }
    });
    page.on("pageerror", err => {
      const text = String(err);
      if (isNoise(text)) warnings.push(text);
      else pageErrors.push(text);
    });
    page.on("response", resp => {
      const u = resp.url();
      if (resp.status() >= 400) {
        if (u.indexOf(".wav") !== -1 || u.indexOf("howler") !== -1 || u.endsWith("/favicon.ico")) warnings.push("http " + resp.status() + " " + u);
        else pageErrors.push("http " + resp.status() + " " + u);
      }
    });
    page.on("requestfailed", req => {
      const u = req.url();
      if (u.indexOf("howler") !== -1 || u.indexOf(".wav") !== -1 || u.indexOf("cdnjs.cloudflare") !== -1) {
        warnings.push("network " + req.failure().errorText + " " + u);
      } else {
        pageErrors.push("network " + req.failure().errorText + " " + u);
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    /* ---- step a: menu visible ---- */
    let ok = false, reason = "";
    try {
      await page.waitForFunction(() => {
        const m = document.getElementById("menu");
        return !!m && !m.hasAttribute("hidden");
      }, { timeout: 15000 });
      ok = true;
    } catch (e) { reason = "menu #menu nao apareceu: " + e.message; }
    log(ok ? "OK" : "FALHOU", "a. menu visível", reason);
    if (!ok) { await finish(browser, server); return; }

    /* screenshot 1: menu */
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(OUT_DIR, "menu.png"), fullPage: true });

    /* wait for wasm bridge */
    try {
      await page.waitForFunction(() => typeof window.__cockpit !== "undefined", { timeout: 15000 });
    } catch (e) {
      log("FALHOU", "setup: window.__cockpit", "WebAssembly nao exposto: " + e.message);
      await finish(browser, server); return;
    }

    /* ---- step b: click ship 1 ---- */
    try {
      await page.click('[data-ship="1"]', { timeout: 10000 });
      ok = true; reason = "";
    } catch (e) { ok = false; reason = "clique em [data-ship='1'] falhou: " + e.message; }
    log(ok ? "OK" : "FALHOU", "b. seleciona nave 1", reason);
    if (!ok) { await finish(browser, server); return; }

    /* ---- step c: the level starts on the pad in manual mode; hold the
     * throttle (X) for 3 s and read stats ---- */
    await page.keyboard.down("KeyX");
    await page.waitForTimeout(3000);
    const speed = await readStat(page, ID.SPEED);
    const progress = await readStat(page, ID.PROGRESS);
    const mode = await readStat(page, ID.MODE);
    await page.keyboard.up("KeyX");
    ok = speed > 0 && progress > 0 && mode === 1;
    reason = "speed=" + speed + " progress=" + progress + " mode=" + mode;
    log(ok ? "OK" : "FALHOU", "c. subida: apos 3s com acelerador SPEED>0 PROGRESS>0 MODE==1", reason);
    if (!ok) { await finish(browser, server); return; }

    /* ---- step c2: finish the ascent (fast ticks), then engage the autopilot ---- */
    const THROTTLE_UP = 4;
    const AUTOPILOT = 7;
    await page.evaluate(([t]) => window.__cockpit._cs_input(t, 1), [THROTTLE_UP]);
    const ascent = await runTicksUntil(page, 60 * 120, ID.ALTITUDE, 700);
    await page.evaluate(([t]) => { window.__cockpit._cs_input(t, 1); window.__cockpit._cs_tick(); window.__cockpit._cs_input(t, 0); }, [AUTOPILOT]);
    const modeAuto = await readStat(page, ID.MODE);
    ok = modeAuto === 0;
    reason = "ticks de subida=" + ascent.ticks + " mode=" + modeAuto;
    log(ok ? "OK" : "FALHOU", "c2. fora da atmosfera: piloto automático ativo (MODE==0)", reason);
    if (!ok) { await finish(browser, server); return; }

    /* screenshot 2: voo em piloto automático (mode == 0) */
    await page.screenshot({ path: path.join(OUT_DIR, "autopilot.png"), fullPage: true });

    /* ---- step d: tick until alert == 1 ---- */
    let dRes;
    try {
      dRes = await runTicksUntil(page, 20000, ID.ALERT, 1);
    } catch (e) {
      dRes = { ticks: 0, error: e.message };
    }
    const alertAfterD = await readStat(page, ID.ALERT);
    ok = alertAfterD === 1;
    reason = "alert=" + alertAfterD + " ticks=" + (dRes ? dRes.ticks : 0) + (dRes && dRes.error ? " err=" + dRes.error : "");
    log(ok ? "OK" : "FALHOU", "d. aviso perigo (ALERT==1)", reason);
    if (!ok) { await finish(browser, server); return; }

    /* ---- step e: continue until mode == 1 ---- */
    let eRes;
    try {
      eRes = await runTicksUntil(page, 20000, ID.MODE, 1);
    } catch (e) {
      eRes = { ticks: 0, error: e.message };
    }
    const modeAfterE = await readStat(page, ID.MODE);
    const alertAfterE = await readStat(page, ID.ALERT);
    const hull = await readStat(page, ID.HULL);
    const hullMax = await readStat(page, ID.HULL_MAX);
    ok = modeAfterE === 1 && alertAfterE === 2 && hull === hullMax;
    reason = "mode=" + modeAfterE + " alert=" + alertAfterE + " hull=" + hull + "/" + hullMax + " ticks=" + (eRes ? eRes.ticks : 0) + (eRes && eRes.error ? " err=" + eRes.error : "");
    log(ok ? "OK" : "FALHOU", "e. controlo manual (MODE==1 ALERT==2 HULL==HULL_MAX)", reason);
    if (!ok) { await finish(browser, server); return; }

    /* screenshot 3: faixa de asteroides (mode == 1) */
    await page.screenshot({ path: path.join(OUT_DIR, "belt.png"), fullPage: true });

    /* ---- step f: press Space, 300 ms, release; energy must drop ---- */
    const energyBefore = await readStat(page, ID.ENERGY);
    let energyHeld;
    try {
      await page.keyboard.down("Space");
      await page.waitForTimeout(150);          /* energy regenerates, so sample while firing */
      energyHeld = await readStat(page, ID.ENERGY);
      await page.keyboard.up("Space");
    } catch (e) {
      log("FALHOU", "f. tecla Espaco", "page.keyboard falhou: " + e.message);
      await finish(browser, server); return;
    }
    ok = energyHeld < energyBefore;
    reason = "energia antes=" + energyBefore + " durante=" + energyHeld;
    log(ok ? "OK" : "FALHOU", "f. laser Espaco (ENERGIA desce)", reason);
    if (!ok) { await finish(browser, server); return; }

    /* ---- step g: press P inside belt, mode stays 1 ---- */
    try {
      await page.keyboard.press("P");
    } catch (e) {
      log("FALHOU", "g. tecla P", "page.keyboard falhou: " + e.message);
      await finish(browser, server); return;
    }
    await page.waitForTimeout(300);
    const modeAfterP = await readStat(page, ID.MODE);
    ok = modeAfterP === 1;
    reason = "mode depois de P=" + modeAfterP;
    log(ok ? "OK" : "FALHOU", "g. piloto automático recusado na faixa (MODE continua 1)", reason);
    if (!ok) { await finish(browser, server); return; }

    /* ---- step h: screenshots size + hash difference ---- */
    const files = ["menu.png", "autopilot.png", "belt.png"];
    const sizes = {};
    const hashes = {};
    let hOk = true;
    for (const f of files) {
      const p = path.join(OUT_DIR, f);
      const st = fs.statSync(p);
      sizes[f] = st.size;
      if (st.size <= 5120) hOk = false;
      hashes[f] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    }
    const diff = hashes["autopilot.png"] !== hashes["belt.png"];
    if (!diff) hOk = false;
    ok = hOk;
    reason = "tamanhos menu=" + sizes["menu.png"] + " autopilot=" + sizes["autopilot.png"] + " belt=" + sizes["belt.png"] +
      " bytes; ultimas duas diferentes=" + diff;
    log(ok ? "OK" : "FALHOU", "h. capturas >5KB e duas ultimas distintas", reason);

    /* ---- any real page/console error fails ---- */
    if (pageErrors.length > 0) {
      log("FALHOU", "erros de pagina/consola", pageErrors.join(" | "));
      ok = false;
    } else {
      if (warnings.length > 0) {
        console.log("AVISO (rede howler/.wav): " + warnings.join(" | "));
      }
    }

    await finish(browser, server);
    process.exit(failures === 0 ? 0 : 1);
  } catch (err) {
    console.error("FALHOU setup/infraestrutura: " + err.message);
    try { await finish(browser, server); } catch (_) {}
    process.exit(1);
  }
}

function failuresCount() {
  return results.filter(r => !r.ok).length;
}

async function finish(browser, server) {
  failures = failuresCount() + (pageErrors.length > 0 ? 1 : 0);
  process.exitCode = failures === 0 ? 0 : 1;
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (server) server.close(); } catch (_) {}
}

main().catch(err => { console.error("FALHOU inesperado: " + err.message); process.exit(1); });
