#ifndef CORE_LEVEL_H
#define CORE_LEVEL_H

#include <stddef.h>

struct Flight;

/* Introductory level (M3): constant layout constants and pure functions.
   Layout in z along the route:
     - ascent & atmosphere: z in [0, LV_ATMO_END]
     - calm transit to the Moon
     - lunar zone: center LV_MOON_Z, width LV_MOON_ZONE
     - asteroid belt: f->route.belt_start to f->route.belt_end (5000..8000)
     - end of Solar System: f->route.length (12000)
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
#define LV_MOON_Z         4500.0f  /* lunar zone center (z) */
#define LV_MOON_ZONE      400.0f   /* lunar zone width */
#define LV_SLING_WIDTH    60.0f    /* sling corridor width for q = 0 */
#define LV_SLING_SPEED_RATIO 0.25f /* speed bonus up to +25% of max_speed */
#define LV_SLING_FUEL     50.0f    /* fuel credit */
#define LV_MIN_FUEL_MARGIN_RATIO 0.10f  /* minimum fuel ratio at arrival */

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
int lv_moon_xy(const struct Flight *f, float z, float *x, float *y);
float lv_sling_quality(float offset);   /* quality 0..1 from lateral offset */
float lv_min_fuel_margin(float fuel_max);

/* Helpers exposed for tests. */
int lv_phase_for_pz(float pz, float route_length, float belt_start, float belt_end);

#endif
