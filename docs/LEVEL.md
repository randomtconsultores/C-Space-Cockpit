# Introductory level (core, M3 part 1)

Layout along z (constants in core/level.h):
- Ascent and atmosphere: z in [0, LV_ATMO_END = 2500]. The flight starts on the pad (pz = 0, speed 0, manual mode, throttle 0).
- Transit to the Moon, lunar zone centred at LV_MOON_Z = 7500 (width LV_MOON_ZONE = 2250).
- Asteroid belt: BELT_START .. BELT_END (12000..21000). Exit: up to ROUTE_LENGTH (25000).
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
- Initial fuel = fuel_max (never refilled). Burn per distance = fuel_per_unit * (0.40 + 0.80 t^2) * atmosphere factor, plus fuel_per_unit * 0.5 per unit of speed change. FS_FUEL_ROUTE_COST is the nominal cruise cost (route * fuel_per_unit * 0.70).

Ascent tilt (tilt_angle, radians, 90 degrees at start): guided gravity turn towards 0 at LV_ATMO_END. Holding pitch changes the tilt rate (LV_TILT_AUTHORITY). If |tilt| > LV_TILT_WINDOW when crossing LV_ATMO_END, FL_EV_TILT_WARNING is raised once and LV_TILT_PENALTY fuel is lost. The ship is never destroyed by this. tilt_angle is stored in the checkpoint (validated finite, 0..pi/2).

Lunar slingshot (final design): the Moon is a fixed sphere in the world, centre (LV_MOON_CX 2600, 0, LV_MOON_Z 7500), radius LV_MOON_RADIUS 2000. Lunar zone: |pz - LV_MOON_Z| <= LV_MOON_ZONE (2250); inside it the lateral soft wall is LV_MOON_LATERAL (1300) and the off-route alert is suppressed. Altitude = 3D distance to the centre minus the radius (lv_moon_alt). Sling quality q (lv_sling_quality) is 1 at altitude <= 200 and falls linearly to 0 at 900. While q > 0 the speed target rises by 25% of max speed times q (the sling no longer refuels), for manual and autopilot alike. When pz crosses LV_MOON_Z a summary event is raised: FL_EV_SLING_GOOD (q >= 0.7), FL_EV_SLING_OK (q >= 0.3), FL_EV_SLING_MISS. The autopilot steers to x=0 (altitude about 600, q about 0.4). Guide rings (draw_guide_rings) follow a circular path at altitude LV_MOON_RING_ALT (250). Measured durations of the lunar phase: about 70 s at 60% throttle, about 43 s at full throttle. Phase events compare pz before and after the tick, so a restored checkpoint behaves like the original.

Moon collision: contact (altitude < ship radius) pushes the ship out, halves speed and causes LV_MOON_COLLISION_DAMAGE_RATIO = 0.60 of hull_max damage once per contact. HUD warning below LV_MOON_WARN_ALT (150). Event: FL_EV_MOON_COLLISION.

New stats: PHASE, ALTITUDE, ATMO_DENSITY, ASCENT_ANGLE, SLING_OFFSET (0 outside the zone), SLING_QUALITY, MOON_DISTANCE, MOON_ALT (altitude above Moon surface, 0 outside zone). New events: PHASE_ATMO_EXIT, PHASE_MOON, SLING_GOOD/OK/MISS, TILT_WARNING, MOON_COLLISION.

generator_version is 4. Checkpoint validates the version and rejects older versions.

## Scene and guidance (tasks 11 and 12b)

The C core (`core/scene.c`, `core/scene.h`) builds the view-space scene from `Flight` state:

- **Scene colors**: `SC_ROCK=0`, `SC_GUIDE=1`, `SC_CONTACT=2`, `SC_LASER=3`, `SC_PLANET=4`, `SC_EARTH=5`, `SC_MOON=6`, `SC_PATH=7`.
- **Earth**: no longer drawn (removed on the Director's request; the ascent shows only the sky). The route gates are not drawn during the ascent nor inside the lunar zone.
- **Moon**: wireframe sphere fixed in the world (parallels, meridians, craters, back-face culled), drawn from the end of the atmosphere until just after the zone; it must be circled, not followed.
- **Moon path**: rings in a distinct magenta colour (`SC_PATH=7`) every 200 units over the whole lunar zone, two radii (60, 30). The path is the circle at altitude 250 for |u| <= 1500 and blends smoothly back to the official route (x = 0) at the zone edges, so there are no leftover rings pointing away from the route. The Moon is drawn from the start of the flight so it is already there, small and far, during the ascent.
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
- Proximity warning ("PERIGO: demasiado perto da superfície.") when MOON_ALT < 150 in the lunar zone.

Story text (`web/story.js`, pure, Node-testable):
- `textForPhase(phase)`, `textForEvent(ev)`, `hintForState(stats)`.
- Portuguese (pt-PT) with accents: platform, ascent, tilt warning, atmo exit, transit, moon guide, moon warn, sling GOOD/OK/MISS.

The browser shell (`web/cockpit.js`) shows event text (via `CockpitStory.textForEvent`) for 4 seconds as a temporary on-screen message.


- **Heat of atmospheric exit**: full-screen additive flame glow at the screen edges (render_gl.js `heatLevel(d)`, peak in the orange/red stage, zero on the ground and in space) plus extra vibration.
- **Moon geometry fix**: 40 steps per parallel or meridian, a segment is drawn only if both ends face the ship (no chords across the disc), and the axis is tilted 0.35 rad so the equator is not a straight line seen edge-on.
- **Launch feedback**: continuous engine sound (web/engine.js: filtered noise plus sub rumble driven by throttle, density and speed; ignition burst; hull rumble only in space; silent when out of fuel, paused or ended) and a flame glow at the bottom of the view plus vibration proportional to throttle (render_gl.js).

- **Moon limb**: segments are cut exactly on the horizon (bisection) and a silhouette circle is drawn, so no line stops short in mid-air.
- **Ring reward**: FL_EV_RING_PASS (20) when the ship crosses a guide ring plane within LV_MOON_RING_RADIUS (60) of its centre, FL_EV_RING_MISS (21) otherwise. JS keeps a combo: each consecutive pass plays a short chime one pentatonic step higher (up to 8), a miss resets it.

- **Game speed doubled and more mobility** (Director, 2026-11-07): ship max speed and acceleration x2 (light 260/120, balanced 200/90, heavy 150/60), laser cooldown 0.125 s and energy regeneration 40/s (same weapon rhythm relative to the faster belt), turn rates light 2.0, balanced 1.5, heavy 1.0 rad/s with turn_accel 12, 9, 5 and damping 16, 12, 6. FL_MAX_ANGLE raised from 0.61 to 0.90 rad because the Moon path needed up to about 42 degrees. The ring span is 1100 so the whole path stays below the yaw limit (test_ring_flyable: every ship collects all 23 rings with a simple pilot). Durations are now about 50 s of ascent at full throttle, 84 s at 60%, and about 35 s (cruise) or 22 s (max) in the lunar zone. The soft wall pull-in is 800 u/s so a fast ship cannot drift through it.

- **Tripled belt distance and top speed** (Director, 2026-11-07): the belt is 9000 long (BELT_START 12000, BELT_END 21000, ROUTE_LENGTH 25000) with the same 96 rocks, so the spacing between asteroids is three times larger. The speed cap is multiplied by `lv_speed_boost(z)`: 1 up to the end of the lunar zone (ascent and sling keep the intro pacing) and a smooth ramp to `LV_SPEED_BOOST = 3` over `LV_BOOST_RAMP = 1500` after it (balanced ship: 600 u/s). Acceleration scales with the boost, the autopilot starts slowing 1500 before the belt, `fuel_per_unit` is scaled by about 0.64 so the route cost still fits in the tank, the checkpoint speed bound uses the boost and FL_GENERATOR_VERSION is 5.
- **Tower comms** (`web/comms.js`): a pure director fires each line once; lines are real public-domain NASA clips (see docs/CREDITS.md) in `web/nasa/` (radio check, ignition with Saturn rumble, liftoff, climb, throttle up, "welcome to space", Kennedy "we choose to go to the Moon", "Godspeed", "we have had a problem" on hull critical or Moon contact, "the Eagle has landed" and "we came in peace" on arrival). The subtitle (`#comms`) shows the English original and a Portuguese translation, clips never overlap, and the sound toggle and pause are respected. Browser speech synthesis is no longer used.
