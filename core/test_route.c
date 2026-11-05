#include "route.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

static int failures, checks;
#define CHECK(c) do { checks++; if (!(c)) { failures++; printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #c); } } while (0)

/* Distance Dorado(3) <-> Frost(5): dx=40, dy=-80, dist=sqrt(8000). */
static float longest_expected(void)
{
    return sqrtf(40.0f * 40.0f + 80.0f * 80.0f);
}

static void test_table_contents(void)
{
    for (int i = 0; i < RT_SYSTEM_COUNT; i++) {
        const RtSystem sys = rt_system(i);
        CHECK(sys.id == i);
        CHECK(sys.name != NULL);
        CHECK(sys.culture >= 0 && sys.culture < RT_CULTURE_COUNT);
        CHECK(sys.intergalactic == 0 || sys.intergalactic == 1);
    }
    /* Invalid id returns id -1. */
    const RtSystem bad = rt_system(-1);
    CHECK(bad.id == -1);
    const RtSystem bad2 = rt_system(RT_SYSTEM_COUNT);
    CHECK(bad2.id == -1);
}

static void test_distance_basic(void)
{
    /* Symmetric. */
    for (int a = 0; a < RT_SYSTEM_COUNT; a++) {
        for (int b = 0; b < RT_SYSTEM_COUNT; b++) {
            float d1 = rt_distance(a, b);
            float d2 = rt_distance(b, a);
            CHECK(d1 == d2);
            CHECK(isfinite(d1) || d1 == -1.0f);
        }
    }
    /* Zero to itself. */
    for (int i = 0; i < RT_SYSTEM_COUNT; i++) {
        CHECK(rt_distance(i, i) == 0.0f);
    }
    /* Invalid returns -1. */
    CHECK(rt_distance(-1, 0) == -1.0f);
    CHECK(rt_distance(0, RT_SYSTEM_COUNT) == -1.0f);
    CHECK(rt_distance(-1, RT_SYSTEM_COUNT) == -1.0f);
}

static void test_longest_intergalactic(void)
{
    float best = rt_longest_intergalactic();
    CHECK(best > 0.0f);
    CHECK(fabsf(best - longest_expected()) < 1e-4f);
}

static void test_trip_cost_nonnegative(void)
{
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        RtFuelParams p;
        rt_params_for_ship(t, rt_longest_intergalactic(), &p);
        CHECK(p.fixed_cost >= 0.0f);
        CHECK(p.per_distance >= 0.0f);
        CHECK(p.reserve >= 0.0f);
        for (int a = 0; a < RT_SYSTEM_COUNT; a++) {
            for (int b = 0; b < RT_SYSTEM_COUNT; b++) {
                float c = rt_trip_cost(p, a, b);
                if (a == b) {
                    CHECK(c == 0.0f);
                } else {
                    CHECK(c >= 0.0f);
                    CHECK(isfinite(c));
                }
                /* Invalid ids return -1. */
                CHECK(rt_trip_cost(p, -1, b) == -1.0f);
                CHECK(rt_trip_cost(p, a, RT_SYSTEM_COUNT) == -1.0f);
            }
        }
    }
}

static void test_can_travel_boundary(void)
{
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        RtFuelParams p;
        rt_params_for_ship(t, rt_longest_intergalactic(), &p);
        for (int a = 0; a < RT_SYSTEM_COUNT; a++) {
            for (int b = 0; b < RT_SYSTEM_COUNT; b++) {
                if (a == b) continue;
                float cost = rt_trip_cost(p, a, b);
                CHECK(rt_can_travel(p, cost, a, b) == 1);          /* exact boundary */
                CHECK(rt_can_travel(p, cost + 1.0f, a, b) == 1);   /* above */
                CHECK(rt_can_travel(p, cost - 1.0f, a, b) == 0);   /* below */
                CHECK(rt_can_travel(p, 0.0f, a, b) == 0);          /* no fuel */
                /* Invalid ids never travel. */
                CHECK(rt_can_travel(p, 1000.0f, -1, b) == 0);
                CHECK(rt_can_travel(p, 1000.0f, a, RT_SYSTEM_COUNT) == 0);
            }
        }
    }
}

static void test_full_tank_covers_longest_jump(void)
{
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        const ShipSpec *s = ship_spec(t);
        RtFuelParams p;
        rt_params_for_ship(t, rt_longest_intergalactic(), &p);
        float cost = p.fixed_cost + p.per_distance * rt_longest_intergalactic();
        CHECK(s->fuel_max >= cost);                                 /* covers longest jump */
        CHECK(fabsf(s->fuel_max - cost - p.reserve) < 1e-3f);      /* leaves reserve */
        CHECK(rt_can_travel(p, s->fuel_max, 3, 5) == 1);           /* Dorado <-> Frost */
        CHECK(rt_can_travel(p, s->fuel_max, 5, 3) == 1);           /* symmetric */
    }
}

static void test_params_formula(void)
{
    for (int t = 0; t < SHIP_TYPE_COUNT; t++) {
        const ShipSpec *s = ship_spec(t);
        float lj = rt_longest_intergalactic();
        RtFuelParams p;
        rt_params_for_ship(t, lj, &p);
        CHECK(fabsf(p.fixed_cost - 0.05f * s->fuel_max) < 1e-6f);
        CHECK(fabsf(p.reserve - 0.15f * s->fuel_max) < 1e-6f);
        if (lj > 0.0f) {
            CHECK(fabsf(p.per_distance - (0.80f * s->fuel_max) / lj) < 1e-6f);
        }
    }
}

static void test_bad_fuel_values(void)
{
    RtFuelParams p;
    rt_params_for_ship(SHIP_BALANCED, rt_longest_intergalactic(), &p);
    CHECK(rt_can_travel(p, NAN, 0, 1) == 0);      /* NaN fuel never travels */
    CHECK(rt_can_travel(p, -5.0f, 0, 1) == 0);    /* negative fuel never travels */
    CHECK(rt_can_travel(p, 0.0f, 2, 2) == 1);     /* staying put is free */
    rt_params_for_ship(SHIP_BALANCED, 0.0f, &p);  /* zero jump length: k is 0, no division */
    CHECK(p.per_distance == 0.0f && isfinite(p.fixed_cost));
    rt_params_for_ship(SHIP_BALANCED, rt_longest_intergalactic(), NULL); /* NULL out is ignored */
}

static void test_invalid_ship_type(void)
{
    RtFuelParams p;
    memset(&p, 0, sizeof p);
    rt_params_for_ship(SHIP_TYPE_COUNT, rt_longest_intergalactic(), &p);
    CHECK(p.fixed_cost == 0.0f);
    CHECK(p.per_distance == 0.0f);
    CHECK(p.reserve == 0.0f);
    rt_params_for_ship(-1, rt_longest_intergalactic(), &p);
    CHECK(p.fixed_cost == 0.0f);
}

int main(void)
{
    test_table_contents();
    test_distance_basic();
    test_longest_intergalactic();
    test_trip_cost_nonnegative();
    test_can_travel_boundary();
    test_full_tank_covers_longest_jump();
    test_params_formula();
    test_bad_fuel_values();
    test_invalid_ship_type();
    printf("%d checks, %d failures\n", checks, failures);
    return failures ? 1 : 0;
}
