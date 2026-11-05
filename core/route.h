#ifndef CORE_ROUTE_H
#define CORE_ROUTE_H

#include "ship.h"

/* Provisional route table for the first map (M3). Names, coordinates,
   cultures and the intergalactic flags are placeholders to be calibrated by
   simulation. */
#define RT_SYSTEM_COUNT 7

enum RtCulture { RT_CULTURE_WARRIOR = 0, RT_CULTURE_RACER = 1,
                 RT_CULTURE_MERCHANT = 2, RT_CULTURE_COUNT = 3 };

typedef struct {
    int id;              /* 0..6 */
    const char *name;    /* ASCII, fixed table */
    float x, y;          /* map coordinates in light units, provisional */
    int culture;         /* enum RtCulture */
    int intergalactic;   /* 1 if the system is a gateway to another galaxy */
} RtSystem;

typedef struct {
    float fixed_cost;    /* fuel per trip, independent of distance */
    float per_distance;  /* k: fuel per distance unit */
    float reserve;       /* fuel always left after the longest intergalactic jump on a full tank */
} RtFuelParams;

/* Returns the system with the given id, or a zeroed system with id -1 if
   invalid. */
RtSystem rt_system(int id);

/* Distance between two systems in light units. -1 if invalid; 0 if a == b. */
float rt_distance(int a, int b);

/* Fuel cost of a trip: fixed_cost + k * distance. -1 if invalid; 0 if a == b. */
float rt_trip_cost(RtFuelParams p, int a, int b);

/* 1 if fuel >= cost of the trip from a to b; never lets a trip start with
   fuel below the cost. */
int rt_can_travel(RtFuelParams p, float fuel, int a, int b);

/* Derive fuel params from ship_spec(): fuel_max must cover longest_jump plus
   reserve. reserve = 15 percent of fuel_max. fixed_cost = 5 percent of
   fuel_max. k = (fuel_max - reserve - fixed_cost) / longest_jump. All fields
   >= 0. */
void rt_params_for_ship(int ship_type, float longest_jump, RtFuelParams *out);

/* Longest distance between two intergalactic systems. */
float rt_longest_intergalactic(void);

#endif
