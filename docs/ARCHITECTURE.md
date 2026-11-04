# Architecture

```
 keyboard / touch --> input.js --> cs_input(action, down) --+
                                                            v
 +----------------------- WASM (core/ + web/cockpit.c) ----------------------+
 | rng.c    deterministic PRNG (seed + generator_version reproduce a route)  |
 | ship.c   ship TYPE specs (static)                                         |
 | flight.c ship STATE, autopilot, belt, laser, fuel, time, events           |
 | scene.c  builds view-space lines/points + scanner contacts                |
 +--------------------------------------------------------------------------+
        | cs_tick() x N (fixed 1/60 s)        | cs_scene_update()
        v                                      v
 cs_event_take() -> events.js          float arrays (HEAPF32) -> render_gl.js (WebGL)
 cs_stat(id)     -> hud.js (2D overlay)
```

## Layers

- core/: portable C, no Emscripten, no browser. Native tests with sanitizers (`make -f web/Makefile test-c`).
- web/cockpit.c: the only file that knows about WebAssembly. It exports scalar functions and array pointers.
- web/*.js: presentation, input, audio and vibration. They do not decide rules.

## Contracts

- Actions, stats and events are enums in core/flight.h. JS mirrors them; web/test_js.js parses the header and fails if they diverge.
- Scene arrays are in VIEW space (x right, y up, z forward, ship at origin), near-plane clipped in C. Strides are exported through cs_const().
- Core emits semantic events (FL_EV_*). JS maps them to sounds and vibration; replacing assets never touches C.
- One route is flown per run. The belt generator guarantees a rock-free lane (FL_LANE_HALF), proven by tests across 200 seeds and a scripted pilot that crosses the belt without damage for all ship types.

## Two clocks (groundwork for time dilation)

Route.days is pilot time, Route.dilation converts it to Earth time (1.0 today). Both are exposed as FS_PILOT_DAYS and FS_EARTH_DAYS and shown in the HUD.

## Reused from C-Space-2Web

| Item | State here |
|---|---|
| Sound generator and WAV set (web/make_sounds.py, audio.h) | Copied unchanged. Events map to existing ids in web/events.js. |
| Server (server/) | Copied unchanged except the CONTRACT.md header. Not wired yet. |
| Controls | New keymap in web/input.js. Remapping UI from the old game is not ported yet. |
| Ranking, SAVE/LOAD bridge (persist_bridge, persistence.js) | Not ported. They depend on the old ASCII UI. Will be rebuilt on the checkpoint v1 DTO of this game. |
| ASCII framebuffer, levels, bosses, intro | Dropped. |

## Browser-side input modules

- `web/settings.js`: user preferences persisted in `localStorage` (key
  `cockpit.invertPitch`). Exposes a pure `mapAction(action)` that swaps
  `PITCH_UP`/`PITCH_DOWN` when pitch inversion is on; tolerant of missing or
  throwing `localStorage`.
- `web/gamepad.js`: Gamepad API polling with standard mapping (left stick yaw /
  pitch with 0.2 deadzone and 0.5 press threshold, A=FIRE, Y=AUTOPILOT,
  LT/RT=THROTTLE_DOWN/UP, Start=pause). Edge-triggered: only calls `press()`
  when an action's state changes, and releases held actions when a gamepad
  disconnects.
- `web/cockpit.js`: pause (Esc, automatic on blur/visibilitychange), pitch
  inversion toggle (I), F3 debug overlay, and the gamepad/keyboard/touch input
  wiring. All actions pass through `settings.mapAction` before reaching the C
  core.

## Not verified

WASM was built with Emscripten 6.0.13 and loaded in headless Chromium (SwiftShader). Real GPU, audio playback, vibration, touch and gamepad are not verified. Balance values in core/ship.c are placeholders.
