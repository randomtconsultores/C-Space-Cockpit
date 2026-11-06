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
    CHECK(lv_phase_for_pz(-1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_ASCENT);
    CHECK(lv_phase_for_pz(0.0f, 12000.0f, 5000.0f, 8000.0f) == LV_ASCENT);
    CHECK(lv_phase_for_pz(LV_ATMO_END - 1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_ASCENT);
    CHECK(lv_phase_for_pz(LV_ATMO_END, 12000.0f, 5000.0f, 8000.0f) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(LV_MOON_Z - LV_MOON_ZONE - 1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(LV_MOON_Z - LV_MOON_ZONE, 12000.0f, 5000.0f, 8000.0f) == LV_MOON);
    CHECK(lv_phase_for_pz(LV_MOON_Z, 12000.0f, 5000.0f, 8000.0f) == LV_MOON);
    CHECK(lv_phase_for_pz(LV_MOON_Z + LV_MOON_ZONE, 12000.0f, 5000.0f, 8000.0f) == LV_MOON);
    CHECK(lv_phase_for_pz(LV_MOON_Z + LV_MOON_ZONE + 1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(5000.0f - 1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_TRANSIT);
    CHECK(lv_phase_for_pz(5000.0f, 12000.0f, 5000.0f, 8000.0f) == LV_BELT);
    CHECK(lv_phase_for_pz(8000.0f - 1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_BELT);
    CHECK(lv_phase_for_pz(8000.0f, 12000.0f, 5000.0f, 8000.0f) == LV_EXIT);
    CHECK(lv_phase_for_pz(12000.0f - 1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_EXIT);
    CHECK(lv_phase_for_pz(12000.0f, 12000.0f, 5000.0f, 8000.0f) == LV_DONE);
    CHECK(lv_phase_for_pz(12000.0f + 1.0f, 12000.0f, 5000.0f, 8000.0f) == LV_DONE);
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
    CHECK(fabsf(lv_sling_quality(0.0f) - 1.0f) < 1e-6f);
    CHECK(fabsf(lv_sling_quality(LV_SLING_WIDTH) - 0.0f) < 1e-6f);
    CHECK(fabsf(lv_sling_quality(LV_SLING_WIDTH / 2.0f) - 0.5f) < 1e-6f);
    CHECK(lv_sling_quality(LV_SLING_WIDTH + 10.0f) == 0.0f);
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
            while (F.mode == FL_MODE_MANUAL && guard++ < 60 * 600) {
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

static void sling_at(float ox, float oy, int *good, int *ok, int *miss, float *dspeed, float *dfuel, int *again)
{
    flight_init(&F, SHIP_BALANCED, 4);
    F.mode = FL_MODE_MANUAL;
    float lx, ly; lv_moon_xy(&F, LV_MOON_Z, &lx, &ly);
    F.pz = LV_MOON_Z - 0.2f; F.px = lx + ox; F.py = ly + oy;
    F.speed = 30.0f; F.throttle = 0.5f; F.fuel = F.spec->fuel_max * 0.5f;
    float s0 = F.speed, f0 = F.fuel;
    flight_tick(&F);
    *good = count_ev(&F, FL_EV_SLING_GOOD); 
    /* events were drained by count_ev; recompute using a second identical run */
    (void)ok; (void)miss;
    *dspeed = F.speed - s0; *dfuel = F.fuel - f0;
    for (int i = 0; i < 300; i++) flight_tick(&F);
    *again = 0; int e; while ((e = flight_event_take(&F)) != FL_EV_NONE) if (e >= FL_EV_SLING_GOOD && e <= FL_EV_SLING_MISS) (*again)++;
}

static void test_sling(void)
{
    int g, o, m, again; float ds, df;
    sling_at(0.0f, 0.0f, &g, &o, &m, &ds, &df, &again);
    CHECK(g == 1); CHECK(ds > 0.0f); CHECK(df > 0.0f); CHECK(again == 0);
    /* Far outside the corridor: no bonus, miss event. */
    flight_init(&F, SHIP_BALANCED, 4); F.mode = FL_MODE_MANUAL;
    float lx, ly; lv_moon_xy(&F, LV_MOON_Z, &lx, &ly);
    F.pz = LV_MOON_Z - 0.2f; F.px = lx + 200.0f; F.py = ly; F.speed = 30.0f; F.throttle = 0.5f;
    float f0 = F.fuel;
    flight_tick(&F);
    CHECK(count_ev(&F, FL_EV_SLING_MISS) == 1);
    CHECK(F.fuel <= f0);
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
    float zs[] = { 300.0f, 1500.0f, 2990.0f, 3010.0f, 6000.0f };
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
    a.mode = b.mode = FL_MODE_AUTOPILOT; a.pz = b.pz = 2900.0f; a.speed = b.speed = 40.0f; a.throttle = b.throttle = 0.6f;
    for (int i = 0; i < 1200; i++) flight_tick(&a);
    for (int i = 0; i < 1200; i++) flight_tick(&b);
    CHECK(flight_checksum(&a) == flight_checksum(&b));
    int na = 0, nb = 0, e;
    while ((e = flight_event_take(&a)) != FL_EV_NONE) if (e >= FL_EV_SLING_GOOD && e <= FL_EV_SLING_MISS) na++;
    while ((e = flight_event_take(&b)) != FL_EV_NONE) if (e >= FL_EV_SLING_GOOD && e <= FL_EV_SLING_MISS) nb++;
    CHECK(na == 1 && nb == 1);
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
    test_tilt();
    test_checkpoint_phases();
    test_instances_independent();
    printf("%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}
