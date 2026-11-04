# Smoke test — C-Space Cockpit (browser)

Automatic smoke test that loads the game in headless Chromium, plays the first
steps of a flight and fails if anything is broken. It is a verification aid,
not a substitute for the Director's acceptance.

## Files

- `package.json` — Playwright (fixed version) as a devDependency.
- `smoke.js` — the test script.
- `README.md` — this file.
- `out/` — screenshots produced by the test (menu, autopilot flight, asteroid belt).

## Install

From `tools/smoke/`:

```bash
npm install          # installs playwright@1.49.0 (devDependency, no node_modules in git)
npm run install-browsers  # downloads the Chromium bundle Playwright uses
```

## Run

The test needs a built game in `web/build`:

```bash
# from the repository root
make -f web/Makefile all

# from tools/smoke/
node smoke.js
```

Use `CHROMIUM_PATH` to point at a specific Chromium executable; otherwise the
Playwright bundled Chromium is used:

```bash
CHROMIUM_PATH=/usr/bin/chromium node smoke.js
```

The script serves `web/build` with its own Node HTTP server on `127.0.0.1`
(a free port), launches Chromium headless with software WebGL flags
(`--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist
--enable-unsafe-swiftshader`), runs steps a-h, prints one `OK`/`FALHOU` line
per step, prints the SHA-256 of `web/build/cockpit_wasm.wasm` at the start,
and exits 0 on success / 1 on failure.

## Acceptance

- `make -f web/Makefile all && make -f web/Makefile test-browser` exits 0 on a
  machine with Chromium available.
- Breaking something simple (e.g. renaming the `data-ship` button) makes the
  test fail with a clear message.

## Notes

- Total wall-clock time is bounded to 30 s; only step c uses an explicit
  3 s wait, as required by the spec.
- Page/console errors fail the test, except Howler.js CDN and `.wav` network
  failures, which are reported as warnings.
- Stat ids are read from `web/hud.js` (object `STAT`), never hard-coded, so the
  test breaks if the contract changes.
