# Introductory level (core, M3 part 1)

Layout along z (constants in core/level.h):
- Ascent and atmosphere: z in [0, LV_ATMO_END = 2500]. The flight starts on the pad (pz = 0, speed 0, manual mode, throttle 0).
- Transit to the Moon, lunar zone centred at LV_MOON_Z = 4500 (width LV_MOON_ZONE = 400).
- Asteroid belt: route.belt_start .. belt_end (5000..8000). Exit: up to route.length (12000).
- The phase (LevelPhase) is derived from pz only. No phase state is stored.

Formulas (d = density, 1 on the ground, 0 at LV_ATMO_END and above):
- Density: d = exp(-z / LV_ATMO_SCALE).
- Speed target = throttle * max_speed * drag * lv_max_speed_factor(z), where
  lv_max_speed_factor ramps linearly from LV_ATMO_MIN_SPEED (0.16) at z=0 to
  LV_ATMO_MAX_SPEED (1.00) at z=LV_ATMO_END. This stretches the ascent to
  ~2 minutes at full throttle.
- Turn acceleration, damping and rotation integration are multiplied by (1 - LV_ATMO_INERTIA * d).
- Fuel burn is multiplied by (1 + LV_ATMO_FUEL * d).
- The autopilot is refused while pz < LV_ATMO_END.
- Initial fuel = clamp(route.length * fuel_per_unit * 1.50, 0, fuel_max).

Ascent tilt (tilt_angle, radians, 90 degrees at start): guided gravity turn towards 0 at LV_ATMO_END. Holding pitch changes the tilt rate (LV_TILT_AUTHORITY). If |tilt| > LV_TILT_WINDOW when crossing LV_ATMO_END, FL_EV_TILT_WARNING is raised once and LV_TILT_PENALTY fuel is lost. The ship is never destroyed by this. tilt_angle is stored in the checkpoint (validated finite, 0..pi/2).

Lunar slingshot: when pz crosses LV_MOON_Z the lateral offset to the reference trajectory (lunar_cx, lunar_cy) gives quality q = 1 - offset / LV_SLING_WIDTH (0..1). Speed is multiplied by 1 + LV_SLING_SPEED_RATIO * q and LV_SLING_FUEL * q fuel is credited. Events: FL_EV_SLING_GOOD (q >= 0.7), FL_EV_SLING_OK (q >= 0.3), FL_EV_SLING_MISS. The effect and the phase events are detected by comparing pz before and after the tick, so no static or hidden state exists and a restored checkpoint behaves like the original.

New stats: PHASE, ALTITUDE, ATMO_DENSITY, ASCENT_ANGLE, SLING_OFFSET (0 outside the zone), SLING_QUALITY, MOON_DISTANCE. New events: PHASE_ATMO_EXIT, PHASE_MOON, SLING_GOOD/OK/MISS, TILT_WARNING (the web layer ignores unknown ids until the scene and sound tasks map them).

generator_version is 3. Left for the next tasks: sound per phase (task 12b part 2).

## Scene and guidance (task 11)

The C core (`core/scene.c`, `core/scene.h`) builds the view-space scene from `Flight` state:

- **Scene colors**: `SC_ROCK=0`, `SC_GUIDE=1`, `SC_CONTACT=2`, `SC_LASER=3`, `SC_PLANET=4`, `SC_EARTH=5`, `SC_MOON=6`.
- **Earth**: wireframe sphere (9 parallels x 16 meridians + simple continent outline) drawn below and slightly ahead of the ship during ascent (`pz < LV_ATMO_END`). Radius shrinks linearly from 600 at `pz=0` to 0 at `pz=LV_ATMO_END`. Rotated around X by `tilt_angle` so the horizon reflects the guided ascent angle. Colour `SC_EARTH` (blue-green).
- **Moon**: wireframe sphere (icosahedron, `SC_MOON` colour) drawn at the lunar reference trajectory position (`lv_moon_xy`) only inside the lunar zone (`|pz - LV_MOON_Z| <= LV_MOON_ZONE`).
- **Guide rings**: 10 thin rings (`SC_GUIDE`) along the lunar reference trajectory, only ahead of the ship, fading with distance. Inside the lunar zone only.
- **Stars and dust**: hidden when atmospheric density `d > 0.95`; brightness fades linearly as `d` drops (`fade = 1 - d`).
- **Segment budget**: `SCENE_MAX_SEGS = 4096`; `add_seg` stops drawing when full. Earth, Moon and guide rings only appear outside the belt, so the 96-rocha belt always fits.

The WebGL renderer (`web/render_gl.js`):
- Sky colour is a piecewise-linear gradient in RGB as a function of density `d`:
  d 1.0: (0.35, 0.60, 0.95) light blue
  d 0.6: (0.20, 0.40, 0.75) dark blue-cyan
  d 0.35: (0.90, 0.45, 0.15) orange
  d 0.20: (0.55, 0.12, 0.10) dark red
  d 0.08: (0.15, 0.04, 0.20) dark violet
  d 0.0: (0.00, 0.015, 0.02) near-black
  Pure function `skyColor(d)`, Node-testable via `module.exports.skyColor`.
- Deterministic screen shake (sines, no `Math.random`) proportional to density and speed.
- Fragment shader maps `SC_EARTH` to (0.2, 0.6, 0.8) and `SC_MOON` to (0.8, 0.8, 0.85).

The HUD (`web/hud.js`):
- Hint line (`CockpitStory.hintForState`) above the alert banner.
- `ALTITUDE` (km, z/25 -> ~100 km at LV_ATMO_END) and `INCLINAÇÃO` (current vs target angle) during ascent.
- `DESVIO` (lateral offset) and sling quality (green/amber/red) in the lunar zone.

Story text (`web/story.js`, pure, Node-testable):
- `textForPhase(phase)`, `textForEvent(ev)`, `hintForState(stats)`.
- Portuguese (pt-PT) with accents: platform, ascent, tilt warning, atmo exit, transit, moon, sling GOOD/OK/MISS.

The browser shell (`web/cockpit.js`) shows event text (via `CockpitStory.textForEvent`) for 4 seconds as a temporary on-screen message.
