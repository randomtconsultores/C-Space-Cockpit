# C-Space Cockpit

Space exploration game in C compiled to WebAssembly, rendered with WebGL. Successor of C-Space-2Web; the game is rewritten, the Space Impact gameplay is dropped.

Current state: flight prototype (M1). One route, autopilot, asteroid belt, laser, fuel, hull, scanner.

## Build and run

    source /path/to/emsdk/emsdk_env.sh      # Emscripten 6.0.13 validated
    make -f web/Makefile all
    make -f web/Makefile serve              # http://localhost:8000

## Tests

    make -f web/Makefile test               # C (ASan/UBSan), JS contract, sound assets
    make -f web/Makefile test-browser        # headless Chromium smoke test (Playwright)

## Browser smoke test

See tools/smoke/README.md. It loads web/build in headless Chromium, plays the
first steps of a flight and fails if anything is broken. Not a substitute for
the Director's acceptance.

## Controls

Arrows or WASD pilot, Z/X (or Q/E) throttle, Space laser, P autopilot, Enter start/restart. Touch buttons below the cockpit.

See docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/ROADMAP.md.
