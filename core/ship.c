#include "ship.h"
#include <stddef.h>
static const ShipSpec specs[SHIP_TYPE_COUNT] = {
    { SHIP_LIGHT,    260.0f, 120.0f, 2.00f,  60.0f,  80.0f, 140.0f, 0.0058f, 1800.0f, 4.0f, 12.0f, 16.0f },
    { SHIP_BALANCED, 200.0f, 90.0f, 1.50f, 100.0f, 100.0f, 200.0f, 0.0070f, 2200.0f, 8.0f, 9.0f, 12.0f },
    { SHIP_HEAVY,    150.0f, 60.0f, 1.00f, 180.0f, 120.0f, 300.0f, 0.0096f, 2600.0f, 16.0f, 5.0f, 6.0f },
};
const ShipSpec *ship_spec(int type)
{
    if (type < 0 || type >= SHIP_TYPE_COUNT) return NULL;
    return &specs[type];
}
