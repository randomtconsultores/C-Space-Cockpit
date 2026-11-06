# Introductory level (core, M3 part 1)

Layout along z (constants in core/level.h):
- Ascent and atmosphere: z in [0, LV_ATMO_END = 700]. The flight starts on the pad (pz = 0, speed 0, manual mode, throttle 0).
- Transit to the Moon, lunar zone centred at LV_MOON_Z = 3000 (width LV_MOON_ZONE = 800).
- Asteroid belt: route.belt_start .. belt_end (5000..8000). Exit: up to route.length (12000).
- The phase (LevelPhase) is derived from pz only. No phase state is stored.

Formulas (d = density, 1 on the ground, 0 at LV_ATMO_END and above):
- Density: d = exp(-z / LV_ATMO_SCALE).
- Speed target = throttle * max_speed * (1 - LV_DRAG_K * d).
- Turn acceleration, damping and rotation integration are multiplied by (1 - LV_ATMO_INERTIA * d).
- Fuel burn is multiplied by (1 + LV_ATMO_FUEL * d).
- The autopilot is refused while pz < LV_ATMO_END.

Ascent tilt (tilt_angle, radians, 90 degrees at start): guided gravity turn towards 0 at LV_ATMO_END. Holding pitch changes the tilt rate (LV_TILT_AUTHORITY). If |tilt| > LV_TILT_WINDOW when crossing LV_ATMO_END, FL_EV_TILT_WARNING is raised once and LV_TILT_PENALTY fuel is lost. The ship is never destroyed by this. tilt_angle is stored in the checkpoint (validated finite, 0..pi/2).

Lunar slingshot: when pz crosses LV_MOON_Z the lateral offset to the reference trajectory (lunar_cx, lunar_cy) gives quality q = 1 - offset / LV_SLING_WIDTH (0..1). Speed is multiplied by 1 + LV_SLING_SPEED_RATIO * q and LV_SLING_FUEL * q fuel is credited. Events: FL_EV_SLING_GOOD (q >= 0.7), FL_EV_SLING_OK (q >= 0.3), FL_EV_SLING_MISS. The effect and the phase events are detected by comparing pz before and after the tick, so no static or hidden state exists and a restored checkpoint behaves like the original.

New stats: PHASE, ALTITUDE, ATMO_DENSITY, ASCENT_ANGLE, SLING_OFFSET (0 outside the zone), SLING_QUALITY, MOON_DISTANCE. New events: PHASE_ATMO_EXIT, PHASE_MOON, SLING_GOOD/OK/MISS, TILT_WARNING (the web layer ignores unknown ids until the scene and sound tasks map them).

generator_version is 3. Left for the next tasks: Earth, Moon and sky rendering, sound per phase, story text, on-screen guidance.
