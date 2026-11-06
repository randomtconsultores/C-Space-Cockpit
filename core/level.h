#ifndef CORE_LEVEL_H
#define CORE_LEVEL_H

#include <stddef.h>

struct Flight;

/* Introductory level (M3): constant layout constants and pure functions.
   Layout in z along the route:
      - ascent & atmosphere: z in [0, LV_ATMO_END]
      - calm transit to the Moon
      - lunar zone: center LV_MOON_Z, width LV_MOON_ZONE (sling arc around the Moon)
      - asteroid belt: BELT_START .. BELT_END
      - end of Solar System: ROUTE_LENGTH
    Phases: LV_ASCENT, LV_ATMO_EXIT, LV_TRANSIT, LV_MOON, LV_BELT, LV_EXIT, LV_DONE.
    Phase is derived from pz only (no persistent state), so the checkpoint
    does not need new fields. */

#define LV_ATMO_END       2500.0f  /* end of atmosphere (z): ~2 minutes ascent at full throttle */
#define LV_ATMO_SCALE     600.0f   /* density scale: gradual transition through the atmosphere */
#define LV_DRAG_K         0.84f    /* max drag: max speed at ground = 16% of max_speed */
#define LV_ATMO_INERTIA   0.6f     /* turn rates slower in atmosphere */
#define LV_ATMO_FUEL      1.0f     /* fuel multiplier in atmosphere */
#define LV_ATMO_MIN_SPEED 0.16f    /* minimum max-speed fraction at ground (z=0) */
#define LV_ATMO_MAX_SPEED 1.00f    /* maximum max-speed fraction outside atmosphere (z>=LV_ATMO_END) */
#define LV_TILT_AUTHORITY 0.40f    /* player authority over tilt (fraction of guide rate) */
#define LV_TILT_WINDOW    0.20943951f  /* 12 degrees in radians */
#define LV_TILT_PENALTY   5.0f     /* fuel penalty for tilt outside window */
#define LV_MOON_Z         7500.0f  /* lunar zone center (z) */
#define LV_MOON_ZONE      2250.0f  /* lunar zone width: ~60s arc at cruise speed */
#define LV_MOON_RADIUS    2000.0f  /* Moon world radius (units): giant, dwarfs the ship */
#define LV_MOON_CX        2600.0f  /* Moon centre x (world): beside the route, Moon is NOT on the route axis */
#define LV_MOON_CY        0.0f     /* Moon centre y (world) */
#define LV_MOON_LATERAL   1300.0f  /* soft lateral wall radius inside the lunar zone (the corridor wall is wider there) */
#define LV_MOON_COLLISION_DAMAGE_RATIO 0.60f  /* hull damage ratio on Moon surface contact */
#define LV_MOON_WARN_ALT  150.0f   /* warn when altitude over surface < this */
#define LV_SLING_ALT_BEST 200.0f   /* altitude over the surface at or below which quality is 1 */
#define LV_SLING_ALT_MAX  900.0f   /* altitude at or above which quality is 0 */
#define LV_SLING_BAND_SECONDS 20.0f /* fuel credit is spread over this many seconds at quality 1 */
#define LV_MOON_RING_SPAN 1500.0f  /* guide rings cover z offsets within +-this from the Moon centre */
#define LV_MOON_RING_ALT  250.0f   /* altitude over the surface of the guide ring path */
#define LV_SLING_SPEED_RATIO 0.25f /* speed bonus up to +25% of max_speed */
#define LV_SLING_FUEL     50.0f    /* fuel credit */
#define LV_MIN_FUEL_MARGIN_RATIO 0.10f  /* minimum fuel ratio at arrival */

#define ROUTE_LENGTH      16000.0f /* total route length (z) */
#define BELT_START        11000.0f /* asteroid belt start (z) */
#define BELT_END          14000.0f /* asteroid belt end (z) */

enum LevelPhase {
    LV_ASCENT = 0,
    LV_ATMO_EXIT = 1,
    LV_TRANSIT = 2,
    LV_MOON = 3,
    LV_BELT = 4,
    LV_EXIT = 5,
    LV_DONE = 6
};

/* Pure functions, deterministic, no global state, no allocation. */
int lv_phase(const struct Flight *f);
float lv_density(float z);
float lv_drag_factor(float d);
float lv_turn_factor(float d);
float lv_fuel_factor(float d);
float lv_tilt_profile(float z);   /* target tilt angle (radians) at z during ascent */
float lv_max_speed_factor(float z); /* max allowed speed fraction in atmosphere (0..1) */
int lv_moon_in_zone(float z);   /* 1 if z is inside the lunar zone */
void lv_moon_center(float *x, float *y, float *z);   /* Moon centre in world space */
float lv_moon_alt(float px, float py, float pz);   /* altitude over the Moon surface (negative = inside) */
int lv_moon_ring(float u, float *x, float *y);   /* guide path (x,y) at z offset u from the Moon centre; 0 outside the span */
float lv_moon_collision_damage(const struct Flight *f);         /* hull damage if hitting Moon surface */
float lv_sling_quality(float alt);   /* quality 0..1 from altitude over the Moon surface */
float lv_min_fuel_margin(float fuel_max);

/* Helpers exposed for tests. */
int lv_phase_for_pz(float pz, float route_length, float belt_start, float belt_end);

#endif
