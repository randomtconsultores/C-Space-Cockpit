# C-Space Cockpit

Space exploration game in C compiled to WebAssembly, rendered with WebGL. Successor of C-Space-2Web; the game is rewritten, the Space Impact gameplay is dropped.

Current state: flight prototype (M1). One route, autopilot, asteroid belt, laser, fuel, hull, scanner.

## Build and run

    source /path/to/emsdk/emsdk_env.sh      # Emscripten 6.0.13 validated
    make -f web/Makefile all
    make -f web/Makefile serve              # http://localhost:8000

## Tests

    make -f web/Makefile test               # C (ASan/UBSan), JS contract, sound assets

## Controls

Arrows or WASD pilot, Z/X (or Q/E) throttle, Space laser, P autopilot, Enter start/restart. Touch buttons below the cockpit.

See docs/DECISIONS.md, docs/ARCHITECTURE.md, docs/ROADMAP.md.
