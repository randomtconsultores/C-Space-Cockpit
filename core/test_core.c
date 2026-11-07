#include "flight.h"
#include "scene.h"
#include "level.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
static int failures, checks;
#define CHECK(c) do { checks++; if (!(c)) { failures++; printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #c); } } while (0)

static Flight F;
static Scene S;

static void pilot(Flight *f)   /* scripted pilot que segue a faixa garantida, com antecipação */
{
    float look = 400.0f;
    float tx = flight_lane_x(f, f->pz + look), ty = flight_lane_y(f, f->pz + look);
    float wy = atan2f(tx - f->px, look), wp = atan2f(ty - f->py, look);
    float ey = f->yaw - wy, ep = f->pitch - wp;
    float margin = 0.03f;
    float stop_y = (f->yaw_rate * f->yaw_rate) / (2.0f * f->spec->turn_damp + 0.0001f);
    float stop_p = (f->pitch_rate * f->pitch_rate) / (2.0f * f->spec->turn_damp + 0.0001f);
    int accel_yaw_left  = ey >  margin && f->yaw_rate > -f->spec->turn_rate;
    int accel_yaw_right = ey < -margin && f->yaw_rate <  f->spec->turn_rate;
    int accel_pitch_down  = ep >  margin && f->pitch_rate > -f->spec->turn_rate;
    int accel_pitch_up    = ep < -margin && f->pitch_rate <  f->spec->turn_rate;
    int coast_yaw_left  = f->yaw_rate < 0.0f && ey - stop_y <= margin;
    int coast_yaw_right = f->yaw_rate > 0.0f && ey + stop_y >= -margin;
    int coast_pitch_down  = f->pitch_rate < 0.0f && ep - stop_p <= margin;
    int coast_pitch_up    = f->pitch_rate > 0.0f && ep + stop_p >= -margin;
    flight_input(f, FL_YAW_LEFT,  accel_yaw_left  && !coast_yaw_left);
    flight_input(f, FL_YAW_RIGHT, accel_yaw_right && !coast_yaw_right);
    flight_input(f, FL_PITCH_DOWN, accel_pitch_down  && !coast_pitch_down);
    flight_input(f, FL_PITCH_UP,   accel_pitch_up    && !coast_pitch_up);
    flight_input(f, FL_THROTTLE_UP, f->throttle < 0.35f);
    flight_input(f, FL_THROTTLE_DOWN, f->throttle > 0.4f);
}

/* Pilot that follows the lane and fires the laser at tamper walls ahead. */
static void pilot_laser(Flight *f)
{
    pilot(f);
    /* fire whenever a live tamper is ahead within 800 units; the ship follows
       the lane where the tamper sits, so the laser will hit it */
    int fire = 0;
    for (int i = 0; i < f->rock_total && !fire; i++) {
        if (!f->rocks[i].alive || !f->rocks[i].tamper) continue;
        float dz = f->rocks[i].z - f->pz;
        if (dz > 0.0f && dz < 800.0f) fire = 1;
    }
    flight_input(f, FL_FIRE, fire);
}

static int drain_has(Flight *f, int ev) { int found = 0, e; while ((e = flight_event_take(f)) != FL_EV_NONE) if (e == ev) found = 1; return found; }

static void test_rng(void)
{
    Rng a, b, c; rng_seed(&a, 7); rng_seed(&b, 7); rng_seed(&c, 8);
    int same = 1, diff = 0;
    for (int i = 0; i < 100; i++) { unsigned x = rng_next(&a), y = rng_next(&b), z = rng_next(&c); if (x != y) same = 0; if (x != z) diff = 1; }
    CHECK(same); CHECK(diff);
    rng_seed(&a, 0); CHECK(rng_next(&a) != 0);
    for (int i = 0; i < 1000; i++) { float v = rng_float(&a); CHECK(v >= 0.0f && v < 1.0f); }
}
static void test_ship(void)
{
    CHECK(ship_spec(-1) == NULL); CHECK(ship_spec(SHIP_TYPE_COUNT) == NULL);
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        const ShipSpec *s = ship_spec(t); CHECK(s && s->type == t);
        CHECK(s->fuel_max >= 12000.0f * s->fuel_per_unit);
    }
    CHECK(flight_init(&F, 9, 1) == -1);
}
static void test_determinism(void)
{
    static Flight a, b, c;
    flight_init(&a, SHIP_BALANCED, 42); flight_init(&b, SHIP_BALANCED, 42); flight_init(&c, SHIP_BALANCED, 43);
    for (int i = 0; i < 3000; i++) { flight_tick(&a); flight_tick(&b); flight_tick(&c); }
    CHECK(flight_checksum(&a) == flight_checksum(&b));
    CHECK(flight_checksum(&a) != flight_checksum(&c));
}
static void test_lane_clear(void)
{
    for (unsigned seed = 1; seed <= 200; seed++) {
        flight_init(&F, SHIP_HEAVY, seed);
        CHECK(F.rock_total > 20);
        for (int i = 0; i < F.rock_total; i++) {
            if (F.rocks[i].tamper) continue;
            float dx = F.rocks[i].x - flight_lane_x(&F, F.rocks[i].z), dy = F.rocks[i].y - flight_lane_y(&F, F.rocks[i].z);
            float half = flight_lane_half_at(&F, F.rocks[i].z);
            if (sqrtf(dx * dx + dy * dy) < half + F.rocks[i].r) { CHECK(0); break; }
        }
    }
}
static void test_handover(void)
{
    flight_init(&F, SHIP_BALANCED, 5);
    F.mode = FL_MODE_AUTOPILOT;
    int warned = 0, manual_ev = 0, ticks = 0;
    while (F.mode == FL_MODE_AUTOPILOT && ticks++ < 60 * 400) {
        flight_tick(&F);
        int e; while ((e = flight_event_take(&F)) != FL_EV_NONE) { if (e == FL_EV_WARNING) warned = 1; if (e == FL_EV_MANUAL_REQUIRED) manual_ev = 1; }
    }
    CHECK(F.mode == FL_MODE_MANUAL); CHECK(warned); CHECK(manual_ev);
    CHECK(F.hull == F.spec->hull_max);
    CHECK(F.pz >= F.route.belt_start - 160.0f && F.pz < F.route.belt_start);
    CHECK(F.speed <= 0.36f * LV_SPEED_BOOST * F.spec->max_speed + 1.0f);
    CHECK(flight_stat(&F, FS_ALERT) == FL_ALERT_MANUAL_REQUIRED);
}
static void test_autopilot_toggle(void)
{
    flight_init(&F, SHIP_BALANCED, 5);
    F.pz = 1000.0f; F.mode = FL_MODE_MANUAL;   /* inside atmosphere: refused */
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 1); flight_tick(&F); flight_input(&F, FL_AUTOPILOT_TOGGLE, 0);
    CHECK(F.mode == FL_MODE_MANUAL); CHECK(drain_has(&F, FL_EV_AUTOPILOT_REFUSED));
    F.pz = 10000.0f;   /* outside atmosphere and belt: accepted */
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 1); flight_tick(&F);
    CHECK(F.mode == FL_MODE_AUTOPILOT);
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 0); flight_input(&F, FL_AUTOPILOT_TOGGLE, 1); flight_tick(&F);
    CHECK(F.mode == FL_MODE_MANUAL);
}
static void test_tamper_destroyable(void)
{
    /* Find a live tamper central, point at it, fire 3 times, it dies. */
    flight_init(&F, SHIP_BALANCED, 7);
    F.mode = FL_MODE_MANUAL;
    long guard = 0;
    int found_central = -1;
    while (F.mode == FL_MODE_MANUAL && guard++ < 60 * 200 && found_central < 0) {
        pilot(&F);
        flight_tick(&F);
        drain_has(&F, -1);
        for (int i = 0; i < F.rock_total; i++) {
            if (F.rocks[i].alive && F.rocks[i].tamper && F.rocks[i].hp == FL_TAMPER_HP_CENTRAL) {
                found_central = i;
                break;
            }
        }
    }
    CHECK(found_central >= 0);
    /* Position ship directly in front of the central rock and fire 3 times. */
    float dx0 = F.rocks[found_central].x - F.px;
    float dy0 = F.rocks[found_central].y - F.py;
    float dz0 = F.rocks[found_central].z - F.pz;
    float len0 = sqrtf(dx0*dx0 + dy0*dy0 + dz0*dz0);
    if (len0 > 0.0f) {
        F.px = F.rocks[found_central].x - dx0/len0 * 200.0f;
        F.py = F.rocks[found_central].y - dy0/len0 * 200.0f;
        F.pz = F.rocks[found_central].z - dz0/len0 * 200.0f;
        F.yaw = atan2f(dx0, dz0);
        F.pitch = -atan2f(dy0, sqrtf(dx0*dx0 + dz0*dz0));
    }
    F.throttle = 0.0f; F.speed = 0.0f; F.pressed = 0; flight_input(&F, FL_THROTTLE_UP, 0);
    for (int shot = 0; shot < 6 && F.rocks[found_central].alive; shot++) {
        float dx = F.rocks[found_central].x - F.px;
        float dy = F.rocks[found_central].y - F.py;
        float dz = F.rocks[found_central].z - F.pz;
        float len = sqrtf(dx*dx + dy*dy + dz*dz);
        if (len > 0.0f) {
            F.yaw = atan2f(dx, dz);
            F.pitch = -atan2f(dy, sqrtf(dx*dx + dz*dz));
        }
        flight_input(&F, FL_FIRE, 1);
        flight_tick(&F);
        flight_input(&F, FL_FIRE, 0);
        /* wait out the laser cooldown (0.25s = 15 ticks) before next shot */
        for (int i = 0; i < 20 && F.rocks[found_central].alive; i++) flight_tick(&F);
    }
    CHECK(!F.rocks[found_central].alive);
    CHECK(drain_has(&F, FL_EV_ROCK_BREAK));
}
static void test_collision_and_laser(void)
{
    flight_init(&F, SHIP_BALANCED, 9);
    F.rock_total = 1; F.rocks[0] = (Rock){ 0, 0, 200, 20, 0, 0, 2, 1, 0, 77 };
    F.mode = FL_MODE_MANUAL; F.throttle = 0.5f;
    flight_input(&F, FL_FIRE, 1); flight_tick(&F);
    CHECK(F.rocks[0].hp == 1 && F.rocks[0].alive); CHECK(F.energy < F.spec->energy_max);
    for (int i = 0; i < 20; i++) flight_tick(&F);
    CHECK(!F.rocks[0].alive); CHECK(drain_has(&F, FL_EV_ROCK_BREAK));
    flight_input(&F, FL_FIRE, 0);
    F.rocks[0] = (Rock){ 0, 0, F.pz + 30, 20, 0, 0, 1, 1, 0, 77 };
    float hull = F.hull;
    F.speed = 60.0f;  /* ensure the ship reaches the rock despite atmospheric drag */
    for (int i = 0; i < 120 && F.rocks[0].alive; i++) flight_tick(&F);
    CHECK(!F.rocks[0].alive); CHECK(F.hull < hull); CHECK(drain_has(&F, FL_EV_HIT)); CHECK(F.shake > 0.0f);
    flight_init(&F, SHIP_BALANCED, 9);
    F.rock_total = 1; F.rocks[0] = (Rock){ 100, 0, 300, 10, 0, 0, 1, 1, 0, 1 };
    F.mode = FL_MODE_MANUAL; flight_input(&F, FL_FIRE, 1); flight_tick(&F);
    CHECK(F.rocks[0].alive);
}
static void test_destroyed(void)
{
    flight_init(&F, SHIP_LIGHT, 3);
    F.hull = 1.0f; F.mode = FL_MODE_MANUAL; F.throttle = 0.5f;
    F.rock_total = 1; F.rocks[0] = (Rock){ 0, 0, 20, 30, 0, 0, 3, 1, 0, 1 };
    for (int i = 0; i < 60; i++) flight_tick(&F);
    CHECK(F.mode == FL_MODE_DESTROYED); CHECK(F.hull == 0.0f); CHECK(drain_has(&F, FL_EV_DESTROYED));
}
static void test_fuel(void)
{
    flight_init(&F, SHIP_BALANCED, 3);
    CHECK(F.fuel >= flight_stat(&F, FS_FUEL_ROUTE_COST));
    F.fuel = 0.5f; F.rock_total = 0; F.mode = FL_MODE_MANUAL; F.throttle = 1.0f;
    for (int i = 0; i < 60 * 60 && F.mode == FL_MODE_MANUAL; i++) { flight_tick(&F); CHECK(F.fuel >= 0.0f); }
    CHECK(F.mode == FL_MODE_STRANDED); CHECK(F.pz < F.route.length);
}
static void test_time_and_arrival(void)
{
    flight_init(&F, SHIP_BALANCED, 3);
    F.route.dilation = 2.0f; F.rock_total = 0; F.mode = FL_MODE_MANUAL; F.throttle = 1.0f;
    F.pz = F.route.length / 2.0f;
    CHECK(fabsf(flight_stat(&F, FS_PILOT_DAYS) - 2.0f) < 1e-3f);
    CHECK(fabsf(flight_stat(&F, FS_EARTH_DAYS) - 4.0f) < 1e-3f);
    for (int i = 0; i < 60 * 200 && F.mode != FL_MODE_ARRIVED; i++) flight_tick(&F);
    CHECK(F.mode == FL_MODE_ARRIVED); CHECK(drain_has(&F, FL_EV_ARRIVED));
    CHECK(fabsf(flight_stat(&F, FS_PROGRESS) - 1.0f) < 1e-6f);
    for (int i = 0; i < 600; i++) flight_tick(&F);
    CHECK(F.speed == 0.0f);
}
static void test_corridor(void)
{
    flight_init(&F, SHIP_BALANCED, 3);
    F.rock_total = 0; F.mode = FL_MODE_MANUAL; F.throttle = 1.0f;
    flight_input(&F, FL_YAW_RIGHT, 1);
    for (int i = 0; i < 60 * 120 && F.mode == FL_MODE_MANUAL && F.pz < LV_MOON_Z + LV_MOON_ZONE; i++) { flight_tick(&F); CHECK(hypotf(F.px, F.py) <= (lv_moon_in_zone(F.pz) ? LV_MOON_LATERAL : FL_CORRIDOR) * 1.1f + 0.01f); CHECK(fabsf(F.yaw) <= FL_MAX_ANGLE + 1e-6f); }
}
static void test_scene(void)
{
    flight_init(&F, SHIP_BALANCED, 11);
    F.pz = 5200.0f; F.mode = FL_MODE_MANUAL; F.yaw = 0.3f; F.pitch = -0.1f;
    scene_build(&F, &S);
    CHECK(S.seg_count > 0 && S.seg_count <= SCENE_MAX_SEGS); CHECK(S.pt_count > 0 && S.pt_count <= SCENE_MAX_POINTS);
    for (int i = 0; i < S.seg_count; i++) {
        const float *d = &S.seg[i * SCENE_SEG_STRIDE];
        CHECK(d[2] >= SCENE_NEAR - 1e-3f && d[5] >= SCENE_NEAR - 1e-3f);
        for (int k = 0; k < 7; k++) CHECK(isfinite(d[k]));
    }
    for (int i = 0; i < S.pt_count; i++) CHECK(S.pts[i * SCENE_PT_STRIDE + 2] > 0.0f);
    flight_init(&F, SHIP_BALANCED, 11);
    F.yaw = 0.3f; F.pitch = -0.1f; F.px = 10; F.py = -5; F.pz = 100;
    float cp = cosf(F.pitch), t = 500.0f;
    F.rock_total = 1; F.rocks[0] = (Rock){ F.px + sinf(F.yaw) * cp * t, F.py + sinf(F.pitch) * t, F.pz + cosf(F.yaw) * cp * t, 5, 0, 0, 1, 1, 0, 3 };
    scene_build(&F, &S);
    CHECK(S.con_count == 1);
    CHECK(fabsf(S.con[0]) < 0.01f && fabsf(S.con[1]) < 0.01f && fabsf(S.con[2] - t) < 0.01f);
    static Scene S2; scene_build(&F, &S2);
    CHECK(S.seg_count == S2.seg_count);
}
static void test_scene_intro(void)
{
    /* Platform (pz = 0): Earth present, finite, within limits. */
    flight_init(&F, SHIP_BALANCED, 11);
    F.pz = 0.0f; F.mode = FL_MODE_MANUAL; F.tilt_angle = 1.5707963f;
    scene_build(&F, &S);
    CHECK(S.seg_count > 0 && S.seg_count <= SCENE_MAX_SEGS);
    CHECK(S.pt_count <= SCENE_MAX_POINTS);
    int earth_segs = 0;
    for (int i = 0; i < S.seg_count; i++) {
        const float *sg = &S.seg[i * SCENE_SEG_STRIDE];
        CHECK(sg[2] >= SCENE_NEAR - 1e-3f && sg[5] >= SCENE_NEAR - 1e-3f);
        for (int k = 0; k < 7; k++) CHECK(isfinite(sg[k]));
        if ((int)sg[6] == SC_EARTH) earth_segs++;
    }
    CHECK(earth_segs == 0); /* the Earth is no longer drawn */
    /* Stars hidden at ground (density ~1). */
    int star_count = 0;
    for (int i = 0; i < S.pt_count; i++) if (S.pts[i * SCENE_PT_STRIDE + 3] > 0.01f) star_count++;
    CHECK(star_count < SCENE_STARS);

    /* Mid-ascent (pz = 350): Earth still present but smaller. Stars and dust reappear. */
    flight_init(&F, SHIP_BALANCED, 11);
    F.pz = 350.0f; F.mode = FL_MODE_MANUAL; F.tilt_angle = 1.0f;
    scene_build(&F, &S);
    CHECK(S.seg_count <= SCENE_MAX_SEGS);
    CHECK(S.pt_count > 0);
    int earth_mid = 0;
    for (int i = 0; i < S.seg_count; i++) if ((int)S.seg[i * SCENE_SEG_STRIDE + 6] == SC_EARTH) earth_mid++;
    CHECK(earth_mid == 0);

    /* Above atmosphere (pz = 2600 > LV_ATMO_END=2500): no Earth, stars reappear. */
    flight_init(&F, SHIP_BALANCED, 11);
    F.pz = 2600.0f; F.mode = FL_MODE_MANUAL; F.tilt_angle = 0.0f;
    scene_build(&F, &S);
    CHECK(S.seg_count <= SCENE_MAX_SEGS);
    int earth_high = 0;
    for (int i = 0; i < S.seg_count; i++) if ((int)S.seg[i * SCENE_SEG_STRIDE + 6] == SC_EARTH) earth_high++;
    CHECK(earth_high == 0);
    int star_high = 0;
    for (int i = 0; i < S.pt_count; i++) if (S.pts[i * SCENE_PT_STRIDE + 3] > 0.01f) star_high++;
    CHECK(star_high > 0);

    /* Lunar zone (pz = 7500): Moon and guide rings present. */
    flight_init(&F, SHIP_BALANCED, 11);
    F.pz = 7500.0f; F.mode = FL_MODE_MANUAL;
    scene_build(&F, &S);
    CHECK(S.seg_count <= SCENE_MAX_SEGS);
    int moon_segs = 0, guide_segs = 0;
    for (int i = 0; i < S.seg_count; i++) {
        int c = (int)S.seg[i * SCENE_SEG_STRIDE + 6];
        if (c == SC_MOON) moon_segs++;
        if (c == SC_PATH) guide_segs++;
    }
    CHECK(moon_segs > 0);
    CHECK(guide_segs > 0);

    /* Determinism: same seed, same scene. */
    static Scene S2;
    flight_init(&F, SHIP_BALANCED, 11);
    F.pz = 3000.0f; F.mode = FL_MODE_MANUAL;
    scene_build(&F, &S);
    scene_build(&F, &S2);
    CHECK(S.seg_count == S2.seg_count);
    CHECK(S.pt_count == S2.pt_count);
    for (int i = 0; i < S.seg_count * SCENE_SEG_STRIDE; i++)
        CHECK(S.seg[i] == S2.seg[i]);

    /* Belt still fits within SCENE_MAX_SEGS with all scene elements. */
    flight_init(&F, SHIP_BALANCED, 11);
    F.pz = 6000.0f; F.mode = FL_MODE_MANUAL;
    scene_build(&F, &S);
    CHECK(S.seg_count > 0 && S.seg_count <= SCENE_MAX_SEGS);
    for (int i = 0; i < S.seg_count; i++) {
        const float *sg = &S.seg[i * SCENE_SEG_STRIDE];
        for (int k = 0; k < 7; k++) CHECK(isfinite(sg[k]));
    }
}

static void test_scene_lunar_zone(void)
{
    /* Scene within the lunar zone never exceeds SCENE_MAX_SEGS and has Moon
       segments when close to the Moon. Sweep pz from 500 before the zone to
       500 after it. */
    for (float z = LV_MOON_Z - LV_MOON_ZONE - 500.0f;
         z <= LV_MOON_Z + LV_MOON_ZONE + 500.0f; z += 100.0f) {
        flight_init(&F, SHIP_BALANCED, 11);
        F.pz = z; F.mode = FL_MODE_MANUAL;
        scene_build(&F, &S);
        CHECK(S.seg_count > 0 && S.seg_count <= SCENE_MAX_SEGS);
        for (int i = 0; i < S.seg_count; i++) {
            const float *sg = &S.seg[i * SCENE_SEG_STRIDE];
            for (int k = 0; k < 7; k++) CHECK(isfinite(sg[k]));
        }
        /* Moon visible until the ship has passed it (its far side is behind the view). */
        if (z >= LV_MOON_Z - LV_MOON_ZONE && z <= LV_MOON_Z + LV_MOON_RADIUS - 100.0f) {
            int moon_segs = 0;
            for (int i = 0; i < S.seg_count; i++)
                if ((int)S.seg[i * SCENE_SEG_STRIDE + 6] == SC_MOON) moon_segs++;
            CHECK(moon_segs > 0);
        }
    }
}

static void test_stat_bounds(void) {
    flight_init(&F, SHIP_BALANCED, 1);
    for (int id = 0; id < FS_COUNT; id++) CHECK(isfinite(flight_stat(&F, id)));
    CHECK(flight_stat(&F, 999) == 0.0f);
    flight_input(&F, -1, 1); flight_input(&F, 99, 1);
    CHECK(F.held == 0);
}
static void test_determinism_input(void)
{
    static Flight a, b;
    flight_init(&a, SHIP_BALANCED, 7); flight_init(&b, SHIP_BALANCED, 7);
    for (int i = 0; i < 1000; i++) {
        int down = (i % 60) < 30;
        flight_input(&a, FL_YAW_LEFT, down); flight_input(&b, FL_YAW_LEFT, down);
        flight_input(&a, FL_PITCH_UP, down); flight_input(&b, FL_PITCH_UP, down);
        flight_tick(&a); flight_tick(&b);
    }
    CHECK(flight_checksum(&a) == flight_checksum(&b));
}
static void test_inertia_press_release(void)
{
    flight_init(&F, SHIP_HEAVY, 1);
    F.mode = FL_MODE_MANUAL;
    for (int i = 0; i < 60; i++) { flight_input(&F, FL_YAW_LEFT, 1); flight_tick(&F); }
    float yaw_at_release = F.yaw;
    CHECK(F.yaw_rate < -0.1f);
    int stopped = 0;
    for (int i = 0; i < 60 * 20 && !stopped; i++) {
        flight_input(&F, FL_YAW_LEFT, 0);
        flight_tick(&F);
        if (F.yaw_rate == 0.0f) stopped = 1;
    }
    CHECK(stopped);
    CHECK(fabsf(F.yaw - yaw_at_release) > 1e-4f);
    CHECK(fabsf(F.yaw) <= FL_MAX_ANGLE);
    CHECK(fabsf(F.yaw_rate) <= 1e-6f);
}
static void test_turn_rate_heavy_vs_light(void)
{
    int t_light = 0, t_heavy = 0;
    {
        Flight l; flight_init(&l, SHIP_LIGHT, 1); l.mode = FL_MODE_MANUAL;
        for (int i = 0; i < 600 && t_light == 0; i++) {
            flight_input(&l, FL_YAW_LEFT, 1); flight_tick(&l);
            if (l.yaw_rate <= -0.95f * l.spec->turn_rate) t_light = i + 1;
        }
        CHECK(t_light > 0);
    }
    {
        Flight h; flight_init(&h, SHIP_HEAVY, 1); h.mode = FL_MODE_MANUAL;
        for (int i = 0; i < 600 && t_heavy == 0; i++) {
            flight_input(&h, FL_YAW_LEFT, 1); flight_tick(&h);
            if (h.yaw_rate <= -0.95f * h.spec->turn_rate) t_heavy = i + 1;
        }
        CHECK(t_heavy > 0);
        CHECK(t_heavy > t_light);
    }
    Flight l, h;
    flight_init(&l, SHIP_LIGHT, 1); flight_init(&h, SHIP_HEAVY, 1);
    l.mode = h.mode = FL_MODE_MANUAL;
    /* Move out of atmosphere so turn rate is not damped */
    l.pz = LV_ATMO_END + 10.0f; h.pz = LV_ATMO_END + 10.0f;
    for (int i = 0; i < 4; i++) { flight_input(&l, FL_YAW_LEFT, 1); flight_tick(&l); }
    for (int i = 0; i < 8; i++) { flight_input(&h, FL_YAW_LEFT, 1); flight_tick(&h); }
    CHECK(fabsf(l.yaw_rate + 0.80f) < 1e-4f);
    CHECK(fabsf(h.yaw_rate + 0.6667f) < 1e-3f);
    int sl = 0, sh = 0;
    for (int i = 0; i < 100 && (sl == 0 || sh == 0); i++) {
        flight_input(&l, FL_YAW_LEFT, 0); flight_input(&h, FL_YAW_LEFT, 0);
        flight_tick(&l); flight_tick(&h);
        if (sl == 0 && l.yaw_rate == 0.0f) sl = i + 1;
        if (sh == 0 && h.yaw_rate == 0.0f) sh = i + 1;
    }
    CHECK(sl > 0 && sh > 0);
    CHECK(sh > sl);
}
static void test_max_angle_limit(void)
{
    flight_init(&F, SHIP_LIGHT, 2);
    F.mode = FL_MODE_MANUAL;
    int hit = 0;
    for (int i = 0; i < 60 * 60; i++) {
        flight_input(&F, FL_YAW_LEFT, 1);
        flight_tick(&F);
        CHECK(fabsf(F.yaw) <= FL_MAX_ANGLE + 1e-6f);
        if (fabsf(F.yaw) >= FL_MAX_ANGLE - 1e-6f) {
            CHECK(F.yaw_rate == 0.0f);
            hit = 1;
        }
    }
    CHECK(hit);
    for (int i = 0; i < 60; i++) flight_tick(&F);
    CHECK(fabsf(F.yaw) <= FL_MAX_ANGLE + 1e-6f);
    CHECK(F.yaw_rate == 0.0f);
}
static void test_simultaneous_inputs_cancel(void)
{
    flight_init(&F, SHIP_BALANCED, 3);
    F.mode = FL_MODE_MANUAL;
    for (int i = 0; i < 120; i++) {
        flight_input(&F, FL_YAW_LEFT, 1);
        flight_input(&F, FL_YAW_RIGHT, 1);
        flight_input(&F, FL_PITCH_UP, 1);
        flight_input(&F, FL_PITCH_DOWN, 1);
        flight_tick(&F);
    }
    CHECK(F.yaw_rate == 0.0f);
    CHECK(F.pitch_rate == 0.0f);
    CHECK(F.yaw == 0.0f);
    CHECK(F.pitch == 0.0f);
}
static void test_handover_zeroes_rates(void)
{
    flight_init(&F, SHIP_BALANCED, 5);
    while (F.mode == FL_MODE_AUTOPILOT && F.tick < 60 * 400) flight_tick(&F);
    CHECK(F.mode == FL_MODE_MANUAL);
    CHECK(F.yaw_rate == 0.0f);
    CHECK(F.pitch_rate == 0.0f);
    flight_init(&F, SHIP_BALANCED, 5);
    F.pz = 9000.0f; F.mode = FL_MODE_MANUAL;
    F.yaw_rate = 0.5f; F.pitch_rate = -0.3f;
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 1); flight_tick(&F);
    CHECK(F.mode == FL_MODE_AUTOPILOT);
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 0);
    flight_input(&F, FL_AUTOPILOT_TOGGLE, 1); flight_tick(&F);
    CHECK(F.mode == FL_MODE_MANUAL);
    CHECK(F.yaw_rate == 0.0f);
    CHECK(F.pitch_rate == 0.0f);
}
static void test_solvability_seeds(void)
{
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        for (unsigned seed = 1; seed <= 200; seed++) {
            flight_init(&F, t, seed);
            const ShipSpec *s = F.spec;
            float energy_budget = 0.70f * s->energy_max;
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
            CHECK(walls_destroyed == FL_TAMPER_COUNT);
            float energy_used = s->energy_max - F.energy;
            CHECK(energy_used <= energy_budget + 0.5f);
            CHECK(F.hull > 0.0f);
            CHECK(F.pz >= F.route.belt_end);
        }
    }
}
int main(void)
{
    test_rng(); test_ship(); test_determinism(); test_determinism_input();
    test_lane_clear(); test_handover(); test_handover_zeroes_rates();
    test_autopilot_toggle(); test_tamper_destroyable();
    test_collision_and_laser(); test_destroyed();
    test_fuel(); test_time_and_arrival(); test_corridor(); test_inertia_press_release();
    test_turn_rate_heavy_vs_light(); test_max_angle_limit(); test_simultaneous_inputs_cancel();
    test_scene(); test_stat_bounds(); test_scene_intro(); test_scene_lunar_zone(); test_solvability_seeds();
    printf("%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}