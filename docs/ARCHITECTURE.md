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

## Rotação (M2)

Manual rotation uses damped inertia: `yaw_rate` and `pitch_rate` (rad/s)
approach `+-turn_rate` with `turn_accel` while a turn key is held, and decay to
0 with `turn_damp` when released, reusing the existing `approach`. Values live
in `ShipSpec.turn_accel` / `ShipSpec.turn_damp` (balance placeholders) and
`turn_rate` remains the maximum angular velocity. Touching `FL_MAX_ANGLE` sets
that axis rate to 0 (no bounce). Autopilot keeps the direct approach and rates
start at 0 when switching to manual. In terminal states (arrived, destroyed,
stranded) rates are set to 0. Not stored in the checkpoint (format unchanged);
see `docs/CHECKPOINT.md`.

## Faixa de asteroides e tampões (M2)

The asteroid belt (z from 5000 to 8000) is narrower and more dangerous:
- `FL_LANE_HALF` narrows from 70 to `FL_LANE_HALF_BELT` (45) at the centre of
  the belt, with a `FL_LANE_TRANSITION` (300) unit ease at each belt edge.
- Four `tamper` walls block the lane at regular z intervals. Each wall is three
  overlapping rocks: a central rock (hp 3, radius 26-30) and two side rocks
  (hp 2, radius 20-26). The gaps between neighbouring rocks are smaller than
  `2*(FL_SHIP_RADIUS + 3)`, so the lane is impassable without destroying at
  least the central rock of a wall. Destroying the central rock opens a gap
  wide enough for the ship.
- Rocks outside tamper walls are larger (radius 10-36, hp = 1 + radius/12).
- `FL_MAX_ROCKS` raised to 96 and `rock_count` to 64. `SCENE_MAX_SEGS` raised
  to 4096 to hold 96 rocks * 30 edges plus guides and the planet.
- Checkpoint DTO stores rock-alive bits for up to 96 rocks (lo/hi/extra words);
  `FL_GENERATOR_VERSION` bumped to 2.
