# Introductory level (core, M3 part 1)

Layout along z (constants in core/level.h):
- Ascent and atmosphere: z in [0, LV_ATMO_END = 2500]. The flight starts on the pad (pz = 0, speed 0, manual mode, throttle 0).
- Transit to the Moon, lunar zone centred at LV_MOON_Z = 7500 (width LV_MOON_ZONE = 2250).
- Asteroid belt: BELT_START .. BELT_END (11000..14000). Exit: up to ROUTE_LENGTH (16000).
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

Lunar slingshot (final design): the Moon is a fixed sphere in the world, centre (LV_MOON_CX 2600, 0, LV_MOON_Z 7500), radius LV_MOON_RADIUS 2000. Lunar zone: |pz - LV_MOON_Z| <= LV_MOON_ZONE (2250); inside it the lateral soft wall is LV_MOON_LATERAL (1300) and the off-route alert is suppressed. Altitude = 3D distance to the centre minus the radius (lv_moon_alt). Sling quality q (lv_sling_quality) is 1 at altitude <= 200 and falls linearly to 0 at 900. While q > 0 the speed target rises by 25% of max speed times q and fuel is credited at LV_SLING_FUEL/20 per second times q (about 50 per 20 s at q=1), for manual and autopilot alike. When pz crosses LV_MOON_Z a summary event is raised: FL_EV_SLING_GOOD (q >= 0.7), FL_EV_SLING_OK (q >= 0.3), FL_EV_SLING_MISS. The autopilot steers to x=0 (altitude about 600, q about 0.4). Guide rings (draw_guide_rings) follow a circular path at altitude LV_MOON_RING_ALT (250). Measured durations of the lunar phase: about 70 s at 60% throttle, about 43 s at full throttle. Phase events compare pz before and after the tick, so a restored checkpoint behaves like the original.

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