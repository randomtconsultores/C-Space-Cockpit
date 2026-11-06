#include "checkpoint.h"
#include "level.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

static int failures, checks;
#define CHECK(c) do { checks++; if (!(c)) { failures++; printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #c); } } while (0)

static void equal_checkpoint(const Checkpoint *a, const Checkpoint *b)
{
    CHECK(a->format_version == b->format_version);
    CHECK(a->ship_type == b->ship_type);
    CHECK(a->route_seed == b->route_seed);
    CHECK(a->generator_version == b->generator_version);
    CHECK(a->mode == b->mode);
    CHECK(a->px == b->px && a->py == b->py && a->pz == b->pz);
    CHECK(a->yaw == b->yaw && a->pitch == b->pitch);
    CHECK(a->throttle == b->throttle && a->speed == b->speed);
    CHECK(a->fuel == b->fuel && a->hull == b->hull && a->energy == b->energy);
    CHECK(a->rocks_alive_lo == b->rocks_alive_lo);
    CHECK(a->rocks_alive_hi == b->rocks_alive_hi);
    CHECK(a->rocks_alive_extra == b->rocks_alive_extra);
}

static Checkpoint make_valid(void)
{
    Flight f;
    CHECK(flight_init(&f, SHIP_BALANCED, 7) == 0);
    Checkpoint cp; memset(&cp, 0, sizeof cp);
    CHECK(cp_capture(&f, &cp) == CP_OK);
    return cp;
}

/* Round trip: autopilot */
static void test_roundtrip_autopilot(void)
{
    Flight a, b;
    CHECK(flight_init(&a, SHIP_BALANCED, 42) == 0);
    for (int i = 0; i < 100; i++) flight_tick(&a);
    Checkpoint cp1, cp2;
    memset(&cp1, 0, sizeof cp1); memset(&cp2, 0, sizeof cp2);
    CHECK(cp_capture(&a, &cp1) == CP_OK);
    CHECK(cp_restore(&cp1, &b) == CP_OK);
    CHECK(cp_capture(&b, &cp2) == CP_OK);
    equal_checkpoint(&cp1, &cp2);
}

/* Round trip: manual inside the asteroid belt */
static void test_roundtrip_manual_belt(void)
{
    Flight a, b;
    CHECK(flight_init(&a, SHIP_HEAVY, 11) == 0);
    a.pz = 6000.0f;                 /* inside belt (5000..8000) */
    a.mode = FL_MODE_MANUAL;
    for (int i = 0; i < 10; i++) flight_tick(&a);
    Checkpoint cp1, cp2;
    memset(&cp1, 0, sizeof cp1); memset(&cp2, 0, sizeof cp2);
    CHECK(cp_capture(&a, &cp1) == CP_OK);
    CHECK(cp_restore(&cp1, &b) == CP_OK);
    CHECK(cp_capture(&b, &cp2) == CP_OK);
    equal_checkpoint(&cp1, &cp2);
}

/* Determinism: same checksum after M ticks on original and restored */
static void test_determinism(void)
{
    Flight orig, restored;
    CHECK(flight_init(&orig, SHIP_BALANCED, 99) == 0);
    for (int i = 0; i < 50; i++) flight_tick(&orig);
    Checkpoint cp;
    memset(&cp, 0, sizeof cp);
    CHECK(cp_capture(&orig, &cp) == CP_OK);
    CHECK(cp_restore(&cp, &restored) == CP_OK);
    for (int i = 0; i < 300; i++) { flight_tick(&orig); flight_tick(&restored); }
    CHECK(flight_checksum(&orig) == flight_checksum(&restored));
}

/* Every validation rule: one failing case per rule */
static void test_validation_rules(void)
{
    Checkpoint base = make_valid();

    /* format_version wrong */
    Checkpoint c = base; c.format_version = 99; CHECK(cp_validate(&c) == CP_INVALID);
    /* generator_version wrong */
    c = base; c.generator_version = 99; CHECK(cp_validate(&c) == CP_INVALID);
    /* ship_type invalid */
    c = base; c.ship_type = SHIP_TYPE_COUNT; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.ship_type = -1; CHECK(cp_validate(&c) == CP_INVALID);
    /* mode not autopilot/manual (DESTROYED) */
    c = base; c.mode = FL_MODE_DESTROYED; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.mode = FL_MODE_ARRIVED; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.mode = FL_MODE_STRANDED; CHECK(cp_validate(&c) == CP_INVALID);
    /* NaN */
    c = base; c.px = NAN; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.energy = NAN; CHECK(cp_validate(&c) == CP_INVALID);
    /* Infinity */
    c = base; c.py = INFINITY; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.fuel = -INFINITY; CHECK(cp_validate(&c) == CP_INVALID);
    /* pz < 0 */
    c = base; c.pz = -1.0f; CHECK(cp_validate(&c) == CP_INVALID);
    /* pz >= route length */
    c = base; c.pz = ROUTE_LENGTH; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.pz = 20000.0f; CHECK(cp_validate(&c) == CP_INVALID);
    /* hypot(px, py) > corridor * 1.1 */
    c = base; c.px = 400.0f; c.py = 0.0f; CHECK(cp_validate(&c) == CP_INVALID);
    /* |yaw| > FL_MAX_ANGLE */
    c = base; c.yaw = FL_MAX_ANGLE + 0.1f; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.yaw = -(FL_MAX_ANGLE + 0.1f); CHECK(cp_validate(&c) == CP_INVALID);
    /* |pitch| > FL_MAX_ANGLE */
    c = base; c.pitch = FL_MAX_ANGLE + 0.1f; CHECK(cp_validate(&c) == CP_INVALID);
    /* throttle out of range */
    c = base; c.throttle = -0.1f; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.throttle = 1.1f; CHECK(cp_validate(&c) == CP_INVALID);
    /* speed out of range */
    c = base; c.speed = -1.0f; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.speed = ship_spec(SHIP_BALANCED)->max_speed + 1.0f; CHECK(cp_validate(&c) == CP_INVALID);
    /* fuel out of range */
    c = base; c.fuel = -1.0f; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.fuel = 100000.0f; CHECK(cp_validate(&c) == CP_INVALID);
    /* hull <= 0 or > hull_max */
    c = base; c.hull = 0.0f; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.hull = -5.0f; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.hull = 100000.0f; CHECK(cp_validate(&c) == CP_INVALID);
    /* energy out of range */
    c = base; c.energy = -1.0f; CHECK(cp_validate(&c) == CP_INVALID);
    c = base; c.energy = 100000.0f; CHECK(cp_validate(&c) == CP_INVALID);
    /* rocks bits above rock_total must be zero */
    c = base;
    {
        Flight tmp; flight_init(&tmp, c.ship_type, c.route_seed);
        if (tmp.rock_total < 32) c.rocks_alive_lo |= (1u << tmp.rock_total);
        else if (tmp.rock_total < 64) c.rocks_alive_hi |= (1u << (tmp.rock_total - 32));
        else c.rocks_alive_extra |= (1u << (tmp.rock_total - 64));
    }
    CHECK(cp_validate(&c) == CP_INVALID);
    /* valid checkpoint still passes */
    CHECK(cp_validate(&base) == CP_OK);
}

/* cp_capture in terminal modes returns CP_UNAVAILABLE and does not write out */
static void test_capture_terminal_modes(void)
{
    Flight f;
    CHECK(flight_init(&f, SHIP_LIGHT, 3) == 0);
    Checkpoint out, untouched;
    memset(&out, 0xAA, sizeof out);
    memset(&untouched, 0xAA, sizeof untouched);

    f.mode = FL_MODE_ARRIVED;
    CHECK(cp_capture(&f, &out) == CP_UNAVAILABLE);
    CHECK(memcmp(&out, &untouched, sizeof out) == 0);

    f.mode = FL_MODE_DESTROYED;
    CHECK(cp_capture(&f, &out) == CP_UNAVAILABLE);
    CHECK(memcmp(&out, &untouched, sizeof out) == 0);

    f.mode = FL_MODE_STRANDED;
    CHECK(cp_capture(&f, &out) == CP_UNAVAILABLE);
    CHECK(memcmp(&out, &untouched, sizeof out) == 0);
}

/* cp_restore with invalid DTO does not alter out */
static void test_restore_invalid_leaves_out(void)
{
    Flight out_flight, out_copy;
    CHECK(flight_init(&out_flight, SHIP_BALANCED, 7) == 0);
    out_copy = out_flight;

    Checkpoint bad; memset(&bad, 0, sizeof bad);
    bad.format_version = 99;            /* invalid version */
    CHECK(cp_restore(&bad, &out_flight) == CP_INVALID);
    CHECK(memcmp(&out_flight, &out_copy, sizeof out_flight) == 0);

    bad = make_valid();
    bad.mode = FL_MODE_DESTROYED;       /* invalid mode */
    CHECK(cp_restore(&bad, &out_flight) == CP_INVALID);
    CHECK(memcmp(&out_flight, &out_copy, sizeof out_flight) == 0);
}

/* NULL inputs do not crash */
static void test_null_inputs(void)
{
    Flight f;
    CHECK(flight_init(&f, SHIP_BALANCED, 7) == 0);
    Checkpoint out; memset(&out, 0, sizeof out);

    CHECK(cp_capture(NULL, NULL) == CP_UNAVAILABLE);
    CHECK(cp_capture(&f, NULL) == CP_UNAVAILABLE);
    CHECK(cp_capture(NULL, &out) == CP_UNAVAILABLE);

    CHECK(cp_restore(NULL, NULL) == CP_INVALID);
    CHECK(cp_restore(&out, NULL) == CP_INVALID);
    CHECK(cp_restore(NULL, &f) == CP_INVALID);

    CHECK(cp_validate(NULL) == CP_INVALID);
}

/* All three ships, 20 seeds: capture at deterministic tick, restore, 600 ticks, checksums equal */
static void test_all_ships_seeds(void)
{
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        for (unsigned seed = 1; seed <= 20; seed++) {
            Flight a, b;
            CHECK(flight_init(&a, t, seed) == 0);
            unsigned int nticks = (seed * 2654435761u) % 200u + 10u;
            for (unsigned int i = 0; i < nticks; i++) flight_tick(&a);
            Checkpoint cp; memset(&cp, 0, sizeof cp);
            CHECK(cp_capture(&a, &cp) == CP_OK);
            CHECK(cp_restore(&cp, &b) == CP_OK);
            for (int i = 0; i < 600; i++) { flight_tick(&a); flight_tick(&b); }
            CHECK(flight_checksum(&a) == flight_checksum(&b));
        }
    }
}

int main(void)
{
    test_roundtrip_autopilot();
    test_roundtrip_manual_belt();
    test_determinism();
    test_validation_rules();
    test_capture_terminal_modes();
    test_restore_invalid_leaves_out();
    test_null_inputs();
    test_all_ships_seeds();
    printf("%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}
