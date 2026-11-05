# Route and fuel module (M3 logic in C)

Purpose: route table of the 7 systems of the first map, distances between
them, and fuel cost of a trip. Pure C and native tests only. No JavaScript,
no WebAssembly, no server.

## Files

- `core/route.h` — contract: types, table accessor, distance, cost,
  travel-check, fuel-parameter derivation.
- `core/route.c` — implementation.
- `core/test_route.c` — native tests (ASan/UBSan, -Werror).
- `docs/ROUTE.md` — this file.
- `web/Makefile` — `core/route.c` added to `CORE`; `core/test_route.c`
  added to `test-c`.

## Contract (core/route.h)

```c
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
RtSystem rt_system(int id);          /* by value; id -1 and name NULL if invalid */
float rt_distance(int a, int b);
float rt_trip_cost(RtFuelParams p, int a, int b);
int rt_can_travel(RtFuelParams p, float fuel, int a, int b);
void rt_params_for_ship(int ship_type, float longest_jump, RtFuelParams *out);
float rt_longest_intergalactic(void);
```

## Route table (provisional)

| id | name | x | y | culture | intergalactic |
|---|---|---|---|---|---|
| 0 | Aurea | 0 | 0 | merchant | no |
| 1 | Boreal | 40 | 10 | warrior | no |
| 2 | Cinder | 25 | 45 | racer | no |
| 3 | Dorado | -30 | 30 | merchant | yes |
| 4 | Ember | -45 | -20 | warrior | no |
| 5 | Frost | 10 | -50 | racer | yes |
| 6 | Gale | 60 | -35 | warrior | no |

Intergalactic systems: Dorado (3) and Frost (5). They are the gateways to
another galaxy.

All names, coordinates, cultures and flags are provisional: to be calibrated
by simulation.

## Functions

### `rt_system(int id)` -> `RtSystem` (by value)

Returns the system with the given id. Invalid id yields a zeroed system with
`id == -1`.

### `rt_distance(int a, int b)` -> `float`

Distance in light units, Euclidean on the provisional coordinates. Symmetric.
`0` if `a == b`. `-1` if either id is invalid.

### `rt_trip_cost(RtFuelParams p, int a, int b)` -> `float`

`fixed_cost + k * distance(a, b)`. `0` if `a == b`. `-1` if invalid.

### `rt_can_travel(RtFuelParams p, float fuel, int a, int b)` -> `int`

`1` if `fuel >= cost`, else `0`. Never lets a trip start with fuel below the
cost: fuel exactly equal to the cost is allowed. Invalid ids return `0`.

### `rt_params_for_ship(int ship_type, float longest_jump, RtFuelParams *out)`

Derives fuel params from `ship_spec()`:

- `reserve = 0.15 * fuel_max`
- `fixed_cost = 0.05 * fuel_max`
- `k = (fuel_max - reserve - fixed_cost) / longest_jump`
  (0 if `longest_jump <= 0`)

All fields are `>= 0`. Invalid ship type yields all zeros.

### `rt_longest_intergalactic(void)` -> `float`

Longest distance between two intergalactic systems. With the provisional
table this is Dorado <-> Frost: `sqrt(40^2 + 80^2) = sqrt(8000)`.

## Fuel cost formula

Cost of a trip = `fixed_cost + k * distance`.

With a full tank (`fuel_max`), a trip of `longest_jump` costs exactly
`fuel_max - reserve`, so the tank always covers the longest intergalactic
jump and leaves `reserve` fuel.

## Provisional

The route table (names, coordinates, cultures, intergalactic flags) and the
fuel formula percentages (15% reserve, 5% fixed cost) are provisional and
subject to calibration by simulation. The structure of the contract is not.
