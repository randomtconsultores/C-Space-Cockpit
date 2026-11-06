#include "ship.h"
#include <stddef.h>
static const ShipSpec specs[SHIP_TYPE_COUNT] = {
    { SHIP_LIGHT,    130.0f, 60.0f, 1.10f,  60.0f,  80.0f, 140.0f, 0.0090f, 1800.0f, 4.0f, 6.0f, 8.0f },
    { SHIP_BALANCED, 100.0f, 45.0f, 0.85f, 100.0f, 100.0f, 200.0f, 0.0110f, 2200.0f, 8.0f, 4.5f, 6.0f },
    { SHIP_HEAVY,     75.0f, 30.0f, 0.60f, 180.0f, 120.0f, 300.0f, 0.0150f, 2600.0f, 16.0f, 3.0f, 4.0f },
};
const ShipSpec *ship_spec(int type)
{
    if (type < 0 || type >= SHIP_TYPE_COUNT) return NULL;
    return &specs[type];
}
