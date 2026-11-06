#include "level.h"
#include "flight.h"
#ifndef M_PI_2
#define M_PI_2 1.57079632679f
#endif
#include <math.h>
#include <stdlib.h>

/* ------------------------------------------------------------------ */
/* Density, drag, inertia, fuel multipliers                           */
/* ------------------------------------------------------------------ */

float lv_density(float z)
{
    if (z <= 0.0f) return 1.0f;
    if (z >= LV_ATMO_END) return 0.0f;
    return expf(-z / LV_ATMO_SCALE);
}

float lv_drag_factor(float d)
{
    float v = 1.0f - LV_DRAG_K * d;
    if (v < 0.0f) return 0.0f;
    return v;
}

float lv_turn_factor(float d)
{
    float v = 1.0f - LV_ATMO_INERTIA * d;
    if (v < 0.0f) return 0.0f;
    return v;
}

float lv_fuel_factor(float d)
{
    return 1.0f + LV_ATMO_FUEL * d;
}

/* Target tilt angle during ascent: 90 deg (vertical) at z=0, 0 deg
   (horizontal) at LV_ATMO_END. */
float lv_tilt_profile(float z)
{
    if (z <= 0.0f) return (float)(M_PI_2);
    if (z >= LV_ATMO_END) return 0.0f;
    float t = z / LV_ATMO_END;
    return (float)(M_PI_2) * (1.0f - t);
}

/* Minimum fuel margin at arrival, as a fraction of fuel_max. */
float lv_min_fuel_margin(float fuel_max)
{
    return LV_MIN_FUEL_MARGIN_RATIO * fuel_max;
}

/* ------------------------------------------------------------------ */
/* Lunar corridor                                                     */
/* ------------------------------------------------------------------ */

static float lunar_cx(float z)
{
    float t = (z - LV_MOON_Z) / LV_MOON_ZONE;
    return 40.0f * sinf(3.0f * t);
}
static float lunar_cy(float z)
{
    float t = (z - LV_MOON_Z) / LV_MOON_ZONE;
    return 30.0f * cosf(2.0f * t);
}

int lv_moon_xy(const struct Flight *f, float z, float *x, float *y)
{
    (void)f;
    if (z < LV_MOON_Z - LV_MOON_ZONE || z > LV_MOON_Z + LV_MOON_ZONE)
        return 0;
    *x = lunar_cx(z);
    *y = lunar_cy(z);
    return 1;
}

float lv_sling_quality(float offset)
{
    if (offset >= LV_SLING_WIDTH) return 0.0f;
    if (offset <= 0.0f) return 1.0f;
    return 1.0f - offset / LV_SLING_WIDTH;
}

/* ------------------------------------------------------------------ */
/* Phase derivation from pz                                           */
/* ------------------------------------------------------------------ */

int lv_phase(const struct Flight *f)
{
    if (f->pz < 0.0f) return LV_ASCENT;
    if (f->pz < LV_ATMO_END) return LV_ASCENT;
    if (f->pz < LV_MOON_Z - LV_MOON_ZONE) return LV_TRANSIT;
    if (f->pz <= LV_MOON_Z + LV_MOON_ZONE) return LV_MOON;
    if (f->pz < f->route.belt_start) return LV_TRANSIT;
    if (f->pz < f->route.belt_end) return LV_BELT;
    if (f->pz < f->route.length) return LV_EXIT;
    return LV_DONE;
}

int lv_phase_for_pz(float pz, float route_length, float belt_start, float belt_end)
{
    if (pz < 0.0f) return LV_ASCENT;
    if (pz < LV_ATMO_END) return LV_ASCENT;
    if (pz < LV_MOON_Z - LV_MOON_ZONE) return LV_TRANSIT;
    if (pz <= LV_MOON_Z + LV_MOON_ZONE) return LV_MOON;
    if (pz < belt_start) return LV_TRANSIT;
    if (pz < belt_end) return LV_BELT;
    if (pz < route_length) return LV_EXIT;
    return LV_DONE;
}
