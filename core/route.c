#include "route.h"
#include <math.h>
#include <stddef.h>

/* Provisional route table. Names, coordinates, cultures and intergalactic
   flags are placeholders to be calibrated by simulation. */
static const RtSystem SYSTEMS[RT_SYSTEM_COUNT] = {
    { 0, "Aurea",     0.0f,   0.0f,   RT_CULTURE_MERCHANT, 0 },
    { 1, "Boreal",   40.0f,  10.0f,   RT_CULTURE_WARRIOR,  0 },
    { 2, "Cinder",   25.0f,  45.0f,   RT_CULTURE_RACER,    0 },
    { 3, "Dorado",  -30.0f,  30.0f,   RT_CULTURE_MERCHANT, 1 },
    { 4, "Ember",   -45.0f, -20.0f,   RT_CULTURE_WARRIOR,  0 },
    { 5, "Frost",    10.0f, -50.0f,   RT_CULTURE_RACER,    1 },
    { 6, "Gale",     60.0f, -35.0f,   RT_CULTURE_WARRIOR,  0 }
};

static int valid_id(int id) { return id >= 0 && id < RT_SYSTEM_COUNT; }

RtSystem rt_system(int id)
{
    static const RtSystem invalid = { -1, NULL, 0.0f, 0.0f, RT_CULTURE_COUNT, 0 };
    if (!valid_id(id)) return invalid;
    return SYSTEMS[id];
}

float rt_distance(int a, int b)
{
    if (!valid_id(a) || !valid_id(b)) return -1.0f;
    if (a == b) return 0.0f;
    const RtSystem *sa = &SYSTEMS[a];
    const RtSystem *sb = &SYSTEMS[b];
    float dx = sb->x - sa->x;
    float dy = sb->y - sa->y;
    return sqrtf(dx * dx + dy * dy);
}

float rt_trip_cost(RtFuelParams p, int a, int b)
{
    if (!valid_id(a) || !valid_id(b)) return -1.0f;
    if (a == b) return 0.0f;
    return p.fixed_cost + p.per_distance * rt_distance(a, b);
}

int rt_can_travel(RtFuelParams p, float fuel, int a, int b)
{
    if (!valid_id(a) || !valid_id(b)) return 0;
    if (a == b) return 1;
    float cost = rt_trip_cost(p, a, b);
    return fuel >= cost ? 1 : 0;
}

void rt_params_for_ship(int ship_type, float longest_jump, RtFuelParams *out)
{
    const ShipSpec *s = ship_spec(ship_type);
    float fuel_max = s ? s->fuel_max : 0.0f;
    float reserve = 0.15f * fuel_max;
    float fixed_cost = 0.05f * fuel_max;
    float k = 0.0f;
    if (longest_jump > 0.0f) {
        k = (fuel_max - reserve - fixed_cost) / longest_jump;
    }
    if (out != NULL) {
        out->fixed_cost = fixed_cost;
        out->per_distance = k;
        out->reserve = reserve;
    }
}

float rt_longest_intergalactic(void)
{
    float best = 0.0f;
    int found = 0;
    for (int i = 0; i < RT_SYSTEM_COUNT; i++) {
        if (!SYSTEMS[i].intergalactic) continue;
        for (int j = i + 1; j < RT_SYSTEM_COUNT; j++) {
            if (!SYSTEMS[j].intergalactic) continue;
            float d = rt_distance(i, j);
            if (!found || d > best) { best = d; found = 1; }
        }
    }
    return best;
}
