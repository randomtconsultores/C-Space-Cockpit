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

/* Maximum allowed speed fraction during ascent: 15% at ground, 100% at
   LV_ATMO_END. Pure function of z, linear ramp. Used to stretch the ascent
   to ~2 minutes without changing the route length. */
float lv_max_speed_factor(float z)
{
    if (z <= 0.0f) return LV_ATMO_MIN_SPEED;
    if (z >= LV_ATMO_END) return LV_ATMO_MAX_SPEED;
    float t = z / LV_ATMO_END;
    return LV_ATMO_MIN_SPEED + (LV_ATMO_MAX_SPEED - LV_ATMO_MIN_SPEED) * t;
}

/* Minimum fuel margin at arrival, as a fraction of fuel_max. */
float lv_min_fuel_margin(float fuel_max)
{
    return LV_MIN_FUEL_MARGIN_RATIO * fuel_max;
}

/* ------------------------------------------------------------------ */
/* Moon geometry                                                      */
/* ------------------------------------------------------------------ */

int lv_moon_in_zone(float z)
{
    return z >= LV_MOON_Z - LV_MOON_ZONE && z <= LV_MOON_Z + LV_MOON_ZONE;
}

void lv_moon_center(float *x, float *y, float *z)
{
    *x = LV_MOON_CX; *y = LV_MOON_CY; *z = LV_MOON_Z;
}

float lv_moon_alt(float px, float py, float pz)
{
    float dx = px - LV_MOON_CX, dy = py - LV_MOON_CY, dz = pz - LV_MOON_Z;
    return sqrtf(dx * dx + dy * dy + dz * dz) - LV_MOON_RADIUS;
}

/* Guide path: the circle of radius R + LV_MOON_RING_ALT around the Moon,
   seen from the route plane (y = 0). Following it keeps the ship low over
   the surface for the whole pass. */
int lv_moon_ring(float u, float *x, float *y)
{
    float r = LV_MOON_RADIUS + LV_MOON_RING_ALT;
    if (u < -LV_MOON_RING_SPAN || u > LV_MOON_RING_SPAN) return 0;
    *x = LV_MOON_CX - sqrtf(r * r - u * u);
    *y = LV_MOON_CY;
    return 1;
}

/* Quality 0..1 from altitude: 1 at or below LV_SLING_ALT_BEST, 0 at or above
   LV_SLING_ALT_MAX, linear in between. */
float lv_sling_quality(float alt)
{
    if (alt >= LV_SLING_ALT_MAX) return 0.0f;
    if (alt <= LV_SLING_ALT_BEST) return 1.0f;
    return (LV_SLING_ALT_MAX - alt) / (LV_SLING_ALT_MAX - LV_SLING_ALT_BEST);
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
    if (f->pz < BELT_START) return LV_TRANSIT;
    if (f->pz < BELT_END) return LV_BELT;
    if (f->pz < ROUTE_LENGTH) return LV_EXIT;
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

/* Hull damage ratio on Moon surface contact (fraction of hull_max). */
float lv_moon_collision_damage(const struct Flight *f)
{
    (void)f;
    return LV_MOON_COLLISION_DAMAGE_RATIO;
}
