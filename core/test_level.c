#include "flight.h"
#include "level.h"
#include "checkpoint.h"
#ifndef M_PI_2
#define M_PI_2 1.57079632679f
#endif
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
static int failures, checks;
#define CHECK(c) do { checks++; if (!(c)) { failures++; printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #c); } } while (0)

static Flight F;

/* ------------------------------------------------------------------ */
/* Phase derivation from pz                                           */
/* ------------------------------------------------------------------ */
static void test_phase_from_pz(void)
{
    /* pz < LV_ATMO_END -> ASCENT */
    CHECK(lv_phase_for_pz(-1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_ASCENT);
    CHECK(lv_phase_for_pz(0.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_ASCENT);
    CHECK(lv_phase_for_pz(LV_ATMO_END - 1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_ASCENT);
    CHECK(lv_phase_for_pz(LV_ATMO_END, ROUTE_LENGTH, BELT_START, BELT_END) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(LV_MOON_Z - LV_MOON_ZONE - 1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(LV_MOON_Z - LV_MOON_ZONE, ROUTE_LENGTH, BELT_START, BELT_END) == LV_MOON);
    CHECK(lv_phase_for_pz(LV_MOON_Z, ROUTE_LENGTH, BELT_START, BELT_END) == LV_MOON);
    CHECK(lv_phase_for_pz(LV_MOON_Z + LV_MOON_ZONE, ROUTE_LENGTH, BELT_START, BELT_END) == LV_MOON);
    CHECK(lv_phase_for_pz(LV_MOON_Z + LV_MOON_ZONE + 1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(BELT_START - 1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(BELT_START, ROUTE_LENGTH, BELT_START, BELT_END) == LV_BELT);
    CHECK(lv_phase_for_pz(BELT_END - 1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_BELT);
    CHECK(lv_phase_for_pz(BELT_END, ROUTE_LENGTH, BELT_START, BELT_END) == LV_EXIT);
    CHECK(lv_phase_for_pz(ROUTE_LENGTH - 1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_EXIT);
    CHECK(lv_phase_for_pz(ROUTE_LENGTH, ROUTE_LENGTH, BELT_START, BELT_END) == LV_DONE);
    CHECK(lv_phase_for_pz(ROUTE_LENGTH + 1.0f, ROUTE_LENGTH, BELT_START, BELT_END) == LV_DONE);
}

/* ------------------------------------------------------------------ */
/* Density                                                            */
/* ------------------------------------------------------------------ */
static void test_density(void)
{
    CHECK(fabsf(lv_density(0.0f) - 1.0f) < 1e-6f);
    CHECK(lv_density(LV_ATMO_END) < 0.02f);
    CHECK(lv_density(LV_ATMO_END + 1.0f) == 0.0f);
    CHECK(lv_density(10000.0f) == 0.0f);
    /* Monotonically decreasing. */
    float prev = lv_density(0.0f);
    for (float z = 10.0f; z < LV_ATMO_END; z += 10.0f) {
        float d = lv_density(z);
        CHECK(d <= prev + 1e-6f);
        prev = d;
    }
}

/* ------------------------------------------------------------------ */
/* Drag                                                               */
/* ------------------------------------------------------------------ */
static void test_drag(void)
{
    float d0 = lv_density(0.0f); /* = 1.0f */
    float f0 = lv_drag_factor(d0);
    CHECK(fabsf(f0 - (1.0f - LV_DRAG_K)) < 1e-6f); /* ~0.30 */
    float d_mid = lv_density(LV_ATMO_END / 2.0f);
    float f_mid = lv_drag_factor(d_mid);
    CHECK(f_mid > f0); /* drag less at altitude */
    float d_end = lv_density(LV_ATMO_END);
    float f_end = lv_drag_factor(d_end);
    CHECK(f_end > f0);
    /* Beyond atmosphere: drag factor = 1. */
    float f_beyond = lv_drag_factor(lv_density(LV_ATMO_END + 1.0f));
    CHECK(fabsf(f_beyond - 1.0f) < 1e-6f);
}

/* ------------------------------------------------------------------ */
/* Inertia: response time larger at z=0 than at LV_ATMO_END           */
/* ------------------------------------------------------------------ */
static void test_inertia(void)
{
    float d0 = lv_density(0.0f);
    float d_end = lv_density(LV_ATMO_END);
    float f0 = lv_turn_factor(d0);
    float f_end = lv_turn_factor(d_end);
    CHECK(f0 < f_end); /* heavier at z=0 */
    CHECK(f0 > 0.0f);
    CHECK(f_end <= 1.0f);
}

/* ------------------------------------------------------------------ */
/* Ascent tilt: profile, override, penalty                            */
/* ------------------------------------------------------------------ */
static void test_tilt_profile(void)
{
    CHECK(fabsf(lv_tilt_profile(0.0f) - (float)(M_PI_2)) < 1e-6f);
    CHECK(fabsf(lv_tilt_profile(LV_ATMO_END)) < 1e-6f);
    float mid = lv_tilt_profile(LV_ATMO_END / 2.0f);
    CHECK(mid > 0.0f && mid < (float)(M_PI_2));
    /* Monotonically decreasing. */
    float prev = lv_tilt_profile(0.0f);
    for (float z = 100.0f; z < LV_ATMO_END; z += 100.0f) {
        float v = lv_tilt_profile(z);
        CHECK(v <= prev + 1e-6f);
        prev = v;
    }
}

/* ------------------------------------------------------------------ */
/* Sling quality                                                      */
/* ------------------------------------------------------------------ */
static void test_sling_quality(void)
{
    CHECK(fabsf(lv_sling_quality(-10.0f) - 1.0f) < 1e-6f);
    CHECK(fabsf(lv_sling_quality(LV_SLING_ALT_BEST) - 1.0f) < 1e-6f);
    CHECK(fabsf(lv_sling_quality(LV_SLING_ALT_MAX) - 0.0f) < 1e-6f);
    CHECK(fabsf(lv_sling_quality(0.5f * (LV_SLING_ALT_BEST + LV_SLING_ALT_MAX)) - 0.5f) < 1e-6f);
    CHECK(lv_sling_quality(LV_SLING_ALT_MAX + 100.0f) == 0.0f);
    /* Moon geometry: the guide path hugs the surface at LV_MOON_RING_ALT. */
    float rx, ry;
    CHECK(lv_moon_ring(0.0f, &rx, &ry) == 1);
    CHECK(fabsf(lv_moon_alt(rx, ry, LV_MOON_Z) - LV_MOON_RING_ALT) < 0.5f);
    CHECK(lv_moon_ring(LV_MOON_RING_SPAN, &rx, &ry) == 1);
    CHECK(fabsf(lv_moon_alt(rx, ry, LV_MOON_Z + LV_MOON_RING_SPAN) - LV_MOON_RING_ALT) < 0.5f);
    CHECK(rx < LV_MOON_LATERAL);
    CHECK(lv_moon_ring(LV_MOON_RING_SPAN + 1.0f, &rx, &ry) == 1);
    CHECK(lv_moon_ring(LV_MOON_ZONE + 1.0f, &rx, &ry) == 0);
    /* The steepest part of the path must be flyable: slope angle below the yaw limit. */
    {
        float maxslope = 0.0f, ax, ay, bx, by;
        for (float uu = -LV_MOON_ZONE; uu < LV_MOON_ZONE; uu += 10.0f) {
            lv_moon_ring(uu, &ax, &ay); lv_moon_ring(uu + 10.0f, &bx, &by);
            float sl = fabsf(bx - ax) / 10.0f;
            if (sl > maxslope) maxslope = sl;
        }
        CHECK(atanf(maxslope) < FL_MAX_ANGLE * 0.95f);
    }
    /* The path rejoins the official route (x = 0) at both zone edges, without jumps. */
    CHECK(lv_moon_ring(-LV_MOON_ZONE, &rx, &ry) == 1 && fabsf(rx) < 0.5f);
    CHECK(lv_moon_ring(LV_MOON_ZONE, &rx, &ry) == 1 && fabsf(rx) < 0.5f);
    {
        float px0 = 0.0f; int first = 1;
        for (float u = -LV_MOON_ZONE; u <= LV_MOON_ZONE; u += 25.0f) {
            lv_moon_ring(u, &rx, &ry);
            if (!first) CHECK(fabsf(rx - px0) < 60.0f);
            px0 = rx; first = 0;
        }
    }
    /* The route axis does not hit the Moon, and the ring path is reachable. */
    CHECK(lv_moon_alt(0.0f, 0.0f, LV_MOON_Z) > LV_SLING_ALT_BEST);
}

/* ------------------------------------------------------------------ */
/* Min fuel margin                                                    */
/* ------------------------------------------------------------------ */
static void test_min_fuel_margin(void)
{
    CHECK(fabsf(lv_min_fuel_margin(1000.0f) - 100.0f) < 1e-6f);
    CHECK(lv_min_fuel_margin(0.0f) == 0.0f);
}

/* ------------------------------------------------------------------ */
/* Integration: full flight with scripted laser pilot                 */
/* ------------------------------------------------------------------ */
static void pilot_laser(Flight *f)
{
    /* Follow the lane: aim at lane ahead. */
    float look = 400.0f;
    float tx = flight_lane_x(f, f->pz + look), ty = flight_lane_y(f, f->pz + look);
    float wy = atan2f(tx - f->px, look), wp = atan2f(ty - f->py, look);
    float ey = f->yaw - wy, ep = f->pitch - wp;
    float margin = 0.03f;
    float stop_y = (f->yaw_rate * f->yaw_rate) / (2.0f * f->spec->turn_damp + 0.0001f);
    float stop_p = (f->pitch_rate * f->pitch_rate) / (2.0f * f->spec->turn_damp + 0.0001f);
    int accel_yaw_left = ey > margin && f->yaw_rate > -f->spec->turn_rate;
    int accel_yaw_right = ey < -margin && f->yaw_rate < f->spec->turn_rate;
    int accel_pitch_down = ep > margin && f->pitch_rate > -f->spec->turn_rate;
    int accel_pitch_up = ep < -margin && f->pitch_rate < f->spec->turn_rate;
    int coast_yaw_left = f->yaw_rate < 0.0f && ey - stop_y <= margin;
    int coast_yaw_right = f->yaw_rate > 0.0f && ey + stop_y >= -margin;
    int coast_pitch_down = f->pitch_rate < 0.0f && ep - stop_p <= margin;
    int coast_pitch_up = f->pitch_rate > 0.0f && ep + stop_p >= -margin;
    flight_input(f, FL_YAW_LEFT, accel_yaw_left && !coast_yaw_left);
    flight_input(f, FL_YAW_RIGHT, accel_yaw_right && !coast_yaw_right);
    flight_input(f, FL_PITCH_DOWN, accel_pitch_down && !coast_pitch_down);
    flight_input(f, FL_PITCH_UP, accel_pitch_up && !coast_pitch_up);
    flight_input(f, FL_THROTTLE_UP, f->throttle < 0.35f);
    flight_input(f, FL_THROTTLE_DOWN, f->throttle > 0.4f);
    /* Fire at tamper walls ahead. */
    int fire = 0;
    for (int i = 0; i < f->rock_total && !fire; i++) {
        if (!f->rocks[i].alive || !f->rocks[i].tamper) continue;
        float dz = f->rocks[i].z - f->pz;
        if (dz > 0.0f && dz < 800.0f) {
            float dx = f->rocks[i].x - f->px, dy = f->rocks[i].y - f->py;
            if (sqrtf(dx * dx + dy * dy) < 300.0f) fire = 1;
        }
    }
    flight_input(f, FL_FIRE, fire);
}

static int drain_has(Flight *f, int ev) { int found = 0, e; while ((e = flight_event_take(f)) != FL_EV_NONE) if (e == ev) found = 1; return found; }

static void test_solvability_50_seeds(void)
{
    int fail_seeds = 0;
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        for (unsigned seed = 1; seed <= 50; seed++) {
            flight_init(&F, t, seed);
            F.mode = FL_MODE_MANUAL;
            long guard = 0;
            int central_ids[4];
            int n_central = 0;
            for (int i = 0; i < F.rock_total; i++) {
                if (F.rocks[i].tamper && F.rocks[i].hp == FL_TAMPER_HP_CENTRAL && F.rocks[i].alive)
                    central_ids[n_central++] = i;
            }
            while (F.mode == FL_MODE_MANUAL && guard++ < 60 * 900) {
                pilot_laser(&F);
                flight_tick(&F);
                drain_has(&F, -1);
            }
            int walls_destroyed = 0;
            for (int w = 0; w < n_central; w++) {
                if (!F.rocks[central_ids[w]].alive) walls_destroyed++;
            }
            if (walls_destroyed != 4 || F.hull <= 0.0f || F.pz < F.route.belt_end) {
                fail_seeds++;
                if (fail_seeds <= 5)
                    printf("FAIL t=%d seed=%u walls=%d pz=%.0f energy=%.1f hull=%.1f centrals=%d\n",
                        t, seed, walls_destroyed, F.pz, F.energy, F.hull, n_central);
            }
        }
    }
    printf("solvability fail_seeds=%d/150\n", fail_seeds);
    CHECK(fail_seeds == 0);
}


/* ------------------------------------------------------------------ */
/* Behaviour tests added by the Architect                              */
/* ------------------------------------------------------------------ */
static int count_ev(Flight *f, int ev) { int n = 0, e; while ((e = flight_event_take(f)) != FL_EV_NONE) if (e == ev) n++; return n; }

static void test_autopilot_atmosphere(void)
{
    flight_init(&F, SHIP_BALANCED, 3);
    CHECK(F.mode == FL_MODE_MANUAL);
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 1); flight_tick(&F);
    CHECK(F.mode == FL_MODE_MANUAL);
    CHECK(count_ev(&F, FL_EV_AUTOPILOT_REFUSED) == 1);
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 0); flight_tick(&F);
    F.pz = LV_ATMO_END + 50.0f;
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 1); flight_tick(&F);
    CHECK(F.mode == FL_MODE_AUTOPILOT);
}

static int sling_event_at(float alt, int *got_good, int *got_ok, int *got_miss, float *dspeed, float *dfuel)
{
    /* Place the ship just before the closest-approach plane at the given
       altitude over the Moon surface (on the near side, y = 0). */
    flight_init(&F, SHIP_BALANCED, 4);
    F.mode = FL_MODE_MANUAL;
    F.pz = LV_MOON_Z - 3.0f; F.py = 0.0f;
    F.px = LV_MOON_CX - LV_MOON_RADIUS - alt;
    F.speed = 30.0f; F.throttle = 0.5f; F.fuel = F.spec->fuel_max * 0.5f;
    float s0 = F.speed, f0 = F.fuel;
    int ticks = 0;
    *got_good = *got_ok = *got_miss = 0;
    while (F.pz < LV_MOON_Z + 30.0f && ticks++ < 600) {
        flight_tick(&F);
        int e;
        while ((e = flight_event_take(&F)) != FL_EV_NONE) {
            if (e == FL_EV_SLING_GOOD) (*got_good)++;
            else if (e == FL_EV_SLING_OK) (*got_ok)++;
            else if (e == FL_EV_SLING_MISS) (*got_miss)++;
        }
    }
    *dspeed = F.speed - s0; *dfuel = F.fuel - f0;
    return ticks;
}

static void test_ring_events(void)
{
    float rx, ry, u = 400.0f;
    CHECK(lv_moon_ring(u, &rx, &ry) == 1);
    for (int k = 0; k < 2; k++) {
        flight_init(&F, SHIP_BALANCED, 4);
        F.mode = FL_MODE_MANUAL; F.throttle = 0.5f; F.speed = 60.0f;
        F.pz = LV_MOON_Z + u - 3.0f; F.px = rx + (k ? 150.0f : 10.0f); F.py = ry;
        int pass = 0, miss = 0;
        for (int i = 0; i < 20; i++) {
            F.px = rx + (k ? 150.0f : 10.0f); F.py = ry;
            flight_tick(&F);
            int e;
            while ((e = flight_event_take(&F)) != FL_EV_NONE) { if (e == FL_EV_RING_PASS) pass++; if (e == FL_EV_RING_MISS) miss++; }
        }
        if (k == 0) { CHECK(pass == 1 && miss == 0); } else { CHECK(pass == 0 && miss == 1); }
    }
}

static void test_ring_flyable(void)
{
    /* A simple pilot that steers towards the path ahead must collect most rings with every ship. */
    for (int ship = 0; ship < SHIP_TYPE_COUNT; ship++) {
        flight_init(&F, ship, 7);
        F.mode = FL_MODE_MANUAL; F.throttle = 0.8f; F.speed = F.spec->max_speed * 0.6f;
        F.pz = LV_MOON_Z - LV_MOON_ZONE + 5.0f; F.px = 0.0f; F.py = 0.0f;
        int pass = 0, miss = 0;
        for (int i = 0; i < 60 * 90 && F.pz < LV_MOON_Z + LV_MOON_ZONE - 10.0f; i++) {
            float tx, ty, ahead = 250.0f;
            if (!lv_moon_ring(F.pz + ahead - LV_MOON_Z, &tx, &ty)) tx = 0.0f;
            float want = atan2f(tx - F.px, ahead), err = want - F.yaw;
            flight_input(&F, FL_YAW_RIGHT, err > 0.04f && F.yaw_rate < 0.6f * F.spec->turn_rate);
            flight_input(&F, FL_YAW_LEFT, err < -0.04f && F.yaw_rate > -0.6f * F.spec->turn_rate);
            flight_tick(&F);
            int e;
            while ((e = flight_event_take(&F)) != FL_EV_NONE) { if (e == FL_EV_RING_PASS) pass++; if (e == FL_EV_RING_MISS) miss++; }
        }
        printf("ring pilot ship %d: pass=%d miss=%d\n", ship, pass, miss);
        CHECK(pass >= 14 && pass > 3 * miss);
    }
}

static void test_sling(void)
{
    int g, o, m; float ds, df;
    /* Low pass: quality 1, one good event, speed goes up, fuel never does. */
    sling_event_at(120.0f, &g, &o, &m, &ds, &df);
    CHECK(g == 1); CHECK(o == 0); CHECK(m == 0); CHECK(ds > 0.0f); CHECK(df <= 0.0f);   /* the sling never refuels */
    /* Medium altitude: acceptable. */
    sling_event_at(0.5f * (LV_SLING_ALT_BEST + LV_SLING_ALT_MAX), &g, &o, &m, &ds, &df);
    CHECK(g == 0); CHECK(o == 1); CHECK(m == 0);
    /* High pass: miss, no gain beyond the throttle target. */
    sling_event_at(LV_SLING_ALT_MAX + 100.0f, &g, &o, &m, &ds, &df);
    CHECK(g == 0); CHECK(o == 0); CHECK(m == 1);
    CHECK(df <= 0.0f);
}

static void test_tilt(void)
{
    /* Guided ascent with full throttle and no pitch input stays in the window. */
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        flight_init(&F, t, 7);
        int warn = 0, ticks = 0;
        flight_input(&F, FL_THROTTLE_UP, 1);
        while (F.pz < LV_ATMO_END + 20.0f && ticks++ < 60 * 400) {
            flight_tick(&F);
            warn += count_ev(&F, FL_EV_TILT_WARNING);
            flight_input(&F, FL_THROTTLE_UP, 1);
        }
        CHECK(F.pz >= LV_ATMO_END);
        CHECK(warn == 0);
        CHECK(F.hull == F.spec->hull_max);
        CHECK(fabsf(F.tilt_angle) <= LV_TILT_WINDOW);
    }
    /* Holding pitch up keeps the nose vertical: warning once, fuel penalty, no destruction. */
    flight_init(&F, SHIP_BALANCED, 7);
    int warn = 0, ticks = 0; float fuel_before = 0.0f;
    while (F.pz < LV_ATMO_END + 20.0f && ticks++ < 60 * 400) {
        flight_input(&F, FL_THROTTLE_UP, 1); flight_input(&F, FL_PITCH_UP, 1);
        fuel_before = F.fuel;
        flight_tick(&F);
        int w = count_ev(&F, FL_EV_TILT_WARNING);
        if (w) { warn += w; CHECK(fuel_before - F.fuel >= LV_TILT_PENALTY - 0.5f); }
    }
    CHECK(warn == 1);
    CHECK(F.mode != FL_MODE_DESTROYED);
}

static void test_checkpoint_phases(void)
{
    /* Points in ascent, transit, and after lunar zone (avoiding lunar zone itself). */
    float zs[] = { 300.0f, 1500.0f, 4000.0f, 9500.0f, 11000.0f };
    for (int k = 0; k < 5; k++) {
        flight_init(&F, SHIP_BALANCED, 11);
        F.mode = FL_MODE_AUTOPILOT; F.pz = zs[k]; F.speed = 40.0f; F.throttle = 0.6f; F.tilt_angle = (zs[k] < LV_ATMO_END) ? 0.8f : 0.0f;
        Checkpoint cp; Flight a, b;
        if (cp_capture(&F, &cp) != CP_OK) { CHECK(0); continue; }
        CHECK(cp_restore(&cp, &a) == CP_OK);
        b = F;
        for (int i = 0; i < 600; i++) { flight_tick(&a); flight_tick(&b); }
        CHECK(flight_checksum(&a) == flight_checksum(&b));
        CHECK(a.tilt_angle == b.tilt_angle);
    }
    /* Invalid tilt is rejected. */
    flight_init(&F, SHIP_BALANCED, 11); F.pz = 100.0f; F.mode = FL_MODE_MANUAL;
    Checkpoint cp; if (cp_capture(&F, &cp) == CP_OK) { cp.tilt_angle = NAN; CHECK(cp_validate(&cp) == CP_INVALID); cp.tilt_angle = 5.0f; CHECK(cp_validate(&cp) == CP_INVALID); }
}

static void test_instances_independent(void)
{
    /* No hidden global state: two flights advanced in lockstep or in sequence match. */
    Flight a, b;
    flight_init(&a, SHIP_BALANCED, 9); flight_init(&b, SHIP_BALANCED, 9);
    a.mode = b.mode = FL_MODE_AUTOPILOT; a.pz = b.pz = 4400.0f; a.speed = b.speed = 40.0f; a.throttle = b.throttle = 0.6f;
    for (int i = 0; i < 1200; i++) flight_tick(&a);
    for (int i = 0; i < 1200; i++) flight_tick(&b);
    CHECK(flight_checksum(&a) == flight_checksum(&b));
}

/* ------------------------------------------------------------------ */
/* Ascent duration (~2 minutes at full throttle)                      */
/* ------------------------------------------------------------------ */

/* Scripted ascent pilot: full throttle, no pitch input (guided gravity turn
   keeps tilt_angle on profile automatically). */
static void pilot_ascent(Flight *f, float throttle)
{
    f->throttle = throttle;
    /* No yaw/pitch input: let the guided turn handle tilt. */
}

static int ascent_ticks(float throttle, int ship_type)
{
    flight_init(&F, ship_type, 7);
    F.mode = FL_MODE_MANUAL;
    int ticks = 0;
    while (F.pz < LV_ATMO_END && ticks < 60 * 600) {
        pilot_ascent(&F, throttle);
        flight_tick(&F);
        ticks++;
    }
    return ticks;
}

static void test_ascent_duration(void)
{
    /* Full throttle (100%): 40-70 seconds (game speed doubled; was 100-140 s). */
    int ticks100 = ascent_ticks(1.0f, SHIP_BALANCED);
    float seconds100 = ticks100 / 60.0f;
    printf("ascent 100%%: %d ticks = %.1f s\n", ticks100, seconds100);
    CHECK(seconds100 >= 40.0f && seconds100 <= 70.0f);

    /* Never less than 30 s even at full throttle. */
    CHECK(seconds100 >= 30.0f);

    /* Partial throttle (60%, 30%): takes longer, no upper bound but must
       eventually exit (guard limits ticks). */
    int ticks60 = ascent_ticks(0.6f, SHIP_BALANCED);
    int ticks30 = ascent_ticks(0.3f, SHIP_BALANCED);
    float seconds60 = ticks60 / 60.0f;
    float seconds30 = ticks30 / 60.0f;
    printf("ascent 60%%:  %d ticks = %.1f s\n", ticks60, seconds60);
    printf("ascent 30%%:  %d ticks = %.1f s\n", ticks30, seconds30);
    CHECK(seconds60 > seconds100);
    CHECK(seconds30 > seconds60);
    /* 30% must eventually exit the atmosphere (not stranded on pad). */
    CHECK(ticks30 < 60 * 600);
    CHECK(F.pz >= LV_ATMO_END);
}

static void test_ascent_tilt_follow(void)
{
    /* Following the profile with no pitch input stays within the window. */
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        flight_init(&F, t, 7);
        F.mode = FL_MODE_MANUAL;
        F.throttle = 1.0f;
        int warnings = 0, ticks = 0;
        while (F.pz < LV_ATMO_END + 20.0f && ticks++ < 60 * 600) {
            flight_tick(&F);
            warnings += count_ev(&F, FL_EV_TILT_WARNING);
        }
        CHECK(F.pz >= LV_ATMO_END);
        CHECK(warnings == 0);
        CHECK(fabsf(F.tilt_angle) <= LV_TILT_WINDOW);
    }
}

static void test_platform_stationary(void)
{
    /* No throttle: ship stays on the platform, never exits the atmosphere. */
    flight_init(&F, SHIP_BALANCED, 7);
    F.mode = FL_MODE_MANUAL;
    /* throttle stays 0 */
    int ticks = 0;
    while (F.pz < LV_ATMO_END && ticks < 60 * 600) {
        flight_tick(&F);
        ticks++;
    }
    CHECK(F.pz < LV_ATMO_END);  /* never reaches space without thrust */
}

static void test_tilt_penalty_ascent(void)
{
    /* Holding pitch up keeps the nose vertical: warning once, fuel penalty,
       no destruction. */
    flight_init(&F, SHIP_BALANCED, 7);
    float fuel_before = F.fuel;
    int warnings = 0, ticks = 0;
    while (F.pz < LV_ATMO_END + 20.0f && ticks++ < 60 * 600) {
        flight_input(&F, FL_THROTTLE_UP, 1);
        flight_input(&F, FL_PITCH_UP, 1);
        flight_tick(&F);
        int w = count_ev(&F, FL_EV_TILT_WARNING);
        if (w) { warnings += w; CHECK(fuel_before - F.fuel >= LV_TILT_PENALTY - 0.5f); fuel_before = F.fuel; }
    }
    CHECK(warnings >= 1);
    CHECK(F.mode != FL_MODE_DESTROYED);
    CHECK(F.fuel < flight_stat(&F, FS_FUEL_MAX));
}

static void test_checkpoint_ascent(void)
{
    /* Checkpoint round-trip at various points during the ascent. */
    float zs[] = { 0.0f, 500.0f, 1250.0f, 2000.0f, 2490.0f };
    for (int k = 0; k < 5; k++) {
        flight_init(&F, SHIP_BALANCED, 11);
        F.mode = FL_MODE_MANUAL;
        F.pz = zs[k];
        F.throttle = 1.0f;
        F.tilt_angle = lv_tilt_profile(zs[k]);
        /* Advance a few ticks to reach this state naturally */
        for (int i = 0; i < 60 && F.pz < zs[k] + 50.0f; i++) flight_tick(&F);
        Checkpoint cp; Flight a, b;
        if (cp_capture(&F, &cp) != CP_OK) { CHECK(0); continue; }
        CHECK(cp_restore(&cp, &a) == CP_OK);
        b = F;
        for (int i = 0; i < 300; i++) { flight_tick(&a); flight_tick(&b); }
        CHECK(flight_checksum(&a) == flight_checksum(&b));
        CHECK(a.tilt_angle == b.tilt_angle);
    }
}

/* ------------------------------------------------------------------ */
/* Lunar phase tests                                                  */
/* ------------------------------------------------------------------ */

static void place_before_zone(Flight *f, unsigned seed)
{
    flight_init(f, SHIP_BALANCED, seed);
    f->mode = FL_MODE_MANUAL;
    f->pz = LV_MOON_Z - LV_MOON_ZONE - 20.0f; f->px = 0.0f; f->py = 0.0f;
    f->speed = 80.0f; f->throttle = 1.0f;
}

static void test_moon_collision(void)
{
    /* Straight at the surface: hull damage once per contact, never negative. */
    place_before_zone(&F, 7);
    float hull0 = F.hull;
    int hits = 0;
    for (int i = 0; i < 60 * 300 && F.pz < LV_MOON_Z + 500.0f && F.mode == FL_MODE_MANUAL; i++) {
        float err = (LV_MOON_CX - 100.0f) - F.px;
        flight_input(&F, FL_YAW_RIGHT, err > 20.0f && F.yaw < 0.5f);
        flight_tick(&F);
        hits += count_ev(&F, FL_EV_MOON_COLLISION);
    }
    CHECK(hits >= 1);
    CHECK(F.hull < hull0);
    CHECK(lv_moon_alt(F.px, F.py, F.pz) >= 0.0f);   /* never inside the Moon */
    CHECK(lv_moon_collision_damage(&F) > 0.0f && lv_moon_collision_damage(&F) <= 1.0f);
}

static void test_moon_warn_alt(void)
{
    flight_init(&F, SHIP_BALANCED, 7);
    F.mode = FL_MODE_MANUAL; F.pz = LV_MOON_Z;
    F.px = LV_MOON_CX - LV_MOON_RADIUS - 100.0f; F.py = 0.0f;
    float alt = flight_stat(&F, FS_MOON_ALT);
    CHECK(fabsf(alt - 100.0f) < 1.0f);
    CHECK(flight_stat(&F, FS_SLING_QUALITY) > 0.99f);
    F.pz = LV_MOON_Z - LV_MOON_ZONE - 500.0f;
    CHECK(flight_stat(&F, FS_MOON_ALT) == 0.0f);   /* outside the zone */
}

static void test_moon_sling_gain(void)
{
    /* A low pass gives more speed and fuel than a far pass, spread in time. */
    Flight lo, hi;
    place_before_zone(&lo, 7); place_before_zone(&hi, 7);
    (void)0;
    float vmax_lo = 0.0f, vmax_hi = 0.0f; int ev_lo = 0, ev_hi = 0;
    for (int i = 0; i < 60 * 300 && (lo.pz < LV_MOON_Z + LV_MOON_ZONE || hi.pz < LV_MOON_Z + LV_MOON_ZONE); i++) {
        float rx, ry;
        float target_lo = lv_moon_ring(lo.pz - LV_MOON_Z, &rx, &ry) ? rx : 350.0f;
        flight_input(&lo, FL_YAW_RIGHT, target_lo - lo.px > 25.0f && lo.yaw < 0.35f);
        flight_input(&lo, FL_YAW_LEFT, target_lo - lo.px < -25.0f && lo.yaw > -0.35f);
        flight_input(&hi, FL_YAW_LEFT, hi.px > 0.0f);
        lo.throttle = hi.throttle = 0.6f;
        if (lo.pz < LV_MOON_Z + LV_MOON_ZONE) { flight_tick(&lo); ev_lo += count_ev(&lo, FL_EV_SLING_GOOD) + count_ev(&lo, FL_EV_SLING_OK) * 10; if (lo.speed > vmax_lo) vmax_lo = lo.speed; }
        if (hi.pz < LV_MOON_Z + LV_MOON_ZONE) { flight_tick(&hi); ev_hi += count_ev(&hi, FL_EV_SLING_MISS) + count_ev(&hi, FL_EV_SLING_OK) * 10; if (hi.speed > vmax_hi) vmax_hi = hi.speed; }
    }
    CHECK(vmax_lo > vmax_hi + 5.0f);
    CHECK(ev_lo >= 1);                /* a sling summary was reported */
    CHECK(lo.hull == lo.spec->hull_max);   /* following the ring path never touches the Moon */
}

static void test_lunar_phase_duration(void)
{
    /* Phase lunar duration at cruise speed (autopilot cap 0.6) and max speed,
       using the balanced ship. */
    /* Cruise (autopilot throttle cap). */
    flight_init(&F, SHIP_BALANCED, 7);
    F.mode = FL_MODE_AUTOPILOT;
    int entry_tick = -1, exit_tick = -1, ticks = 0;
    while (ticks++ < 60 * 600) {
        int phase_before = (int)flight_stat(&F, FS_PHASE);
        flight_tick(&F);
        int phase_after = (int)flight_stat(&F, FS_PHASE);
        if (phase_before != 3 && phase_after == 3) entry_tick = ticks;
        if (phase_before == 3 && phase_after != 3) { exit_tick = ticks; break; }
    }
    CHECK(entry_tick >= 0 && exit_tick >= 0);
    {
        float dur = (exit_tick - entry_tick) / 60.0f;
        printf("cruise lunar duration=%.1f s\n", dur);
        CHECK(dur >= 25.0f && dur <= 45.0f);
    }

    /* Max speed. */
    flight_init(&F, SHIP_BALANCED, 7);
    F.mode = FL_MODE_MANUAL; F.throttle = 1.0f;
    entry_tick = -1; exit_tick = -1; ticks = 0;
    while (ticks++ < 60 * 600) {
        int phase_before = (int)flight_stat(&F, FS_PHASE);
        flight_tick(&F);
        int phase_after = (int)flight_stat(&F, FS_PHASE);
        if (phase_before != 3 && phase_after == 3) entry_tick = ticks;
        if (phase_before == 3 && phase_after != 3) { exit_tick = ticks; break; }
    }
    CHECK(entry_tick >= 0 && exit_tick >= 0);
    {
        float dur = (exit_tick - entry_tick) / 60.0f;
        printf("max lunar duration=%.1f s\n", dur);
        CHECK(dur >= 15.0f && dur <= 30.0f);
    }
}

static void test_autopilot_lunar_zone(void)
{
    /* Autopilot stays active in the lunar zone (follows arc, no full sling bonus). */
    flight_init(&F, SHIP_BALANCED, 7);
    F.mode = FL_MODE_AUTOPILOT; F.throttle = 0.6f;
    /* Advance into the lunar zone. */
    int ticks = 0;
    while (F.pz < LV_MOON_Z - LV_MOON_ZONE && ticks++ < 60 * 600) {
        flight_tick(&F);
    }
    CHECK(F.pz >= LV_MOON_Z - LV_MOON_ZONE);
    /* Autopilot should still be active (not yielded). */
    CHECK(F.mode == FL_MODE_AUTOPILOT);
}

static void test_checkpoint_lunar_arc(void)
{
    /* Checkpoint round-trip at the middle of the lunar arc. */
    flight_init(&F, SHIP_BALANCED, 11);
    F.mode = FL_MODE_MANUAL;
    F.pz = LV_MOON_Z;
    F.throttle = 0.5f;
    /* Advance into the zone. */
    while (F.pz < LV_MOON_Z - LV_MOON_ZONE) flight_tick(&F);
    Checkpoint cp; Flight a, b;
    if (cp_capture(&F, &cp) != CP_OK) { CHECK(0); }
    CHECK(cp_restore(&cp, &a) == CP_OK);
    b = F;
    for (int i = 0; i < 300; i++) { flight_tick(&a); flight_tick(&b); }
    CHECK(flight_checksum(&a) == flight_checksum(&b));
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */
int main(void)
{
    test_phase_from_pz();
    test_density();
    test_drag();
    test_inertia();
    test_tilt_profile();
    test_sling_quality();
    test_min_fuel_margin();
    test_solvability_50_seeds();
    test_autopilot_atmosphere();
    test_sling();
    test_ring_events();
    test_ring_flyable();
    test_tilt();
    test_checkpoint_phases();
    test_instances_independent();
    test_ascent_duration();
    test_ascent_tilt_follow();
    test_platform_stationary();
    test_tilt_penalty_ascent();
    test_checkpoint_ascent();
    test_moon_collision();
    test_moon_warn_alt();
    test_moon_sling_gain();
    test_lunar_phase_duration();
    test_autopilot_lunar_zone();
    test_checkpoint_lunar_arc();
    printf("%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}
