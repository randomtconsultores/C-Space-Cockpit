#ifndef CORE_SHIP_H
#define CORE_SHIP_H
/* Ship TYPE (static base specs) is separate from ship STATE (damage, fuel,
   cargo, modules), which lives in Flight. All values are placeholders for
   structure only, not approved balance. */
enum ShipType { SHIP_LIGHT = 0, SHIP_BALANCED = 1, SHIP_HEAVY = 2, SHIP_TYPE_COUNT = 3 };
typedef struct {
    int   type;
    float max_speed;      /* units per second at throttle 1.0 */
    float accel;          /* units per second squared */
    float turn_rate;      /* radians per second (manobrabilidade) */
    float hull_max;       /* casco */
    float energy_max;     /* lasers and systems */
    float fuel_max;       /* fuel units */
    float fuel_per_unit;  /* fuel burnt per distance unit travelled */
    float sensor_range;   /* distance at which contacts are shown */
    float cargo_slots;    /* reserved for the 'bag game' */
    float turn_accel;     /* rad/s^2, placeholder balance (M2) */
    float turn_damp;      /* rad/s^2, placeholder balance (M2) */
} ShipSpec;
const ShipSpec *ship_spec(int type);   /* NULL if type is invalid */
#endif
