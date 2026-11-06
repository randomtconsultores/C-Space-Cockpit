#ifndef CORE_FLIGHT_H
#define CORE_FLIGHT_H
#include "rng.h"
#include "ship.h"

/* Flight model: one route (A to B) flown from the cockpit.
   Axes: z runs along the route, x/y are the offset from the route centre line.
   Freedom is deliberately limited: the ship stays inside a corridor and its
   heading is clamped to a cone ("cockpit com profundidade limitada"). */
#define FL_STEP_SECONDS   (1.0f / 60.0f)
#define FL_MAX_ROCKS      96
#define FL_EVENT_CAP      16
#define FL_CORRIDOR       300.0f
#define FL_MAX_ANGLE      0.61f    /* about 35 degrees */
#define FL_SHIP_RADIUS    6.0f
#define FL_WARN_SECONDS   30.0f    /* proposal, not a fixed rule */
#define FL_LANE_HALF      70.0f    /* lane half width outside the belt / at belt edges */
#define FL_LANE_HALF_BELT 45.0f    /* lane half width at the centre of the belt */
#define FL_LANE_TRANSITION 300.0f  /* transition distance at each belt edge */
#define FL_GENERATOR_VERSION 3
#define FL_TAMPER_COUNT   4        /* number of blockage walls in the belt */
#define FL_TAMPER_RADIUS_CENTRAL_LO 26.0f
#define FL_TAMPER_RADIUS_CENTRAL_HI 30.0f
#define FL_TAMPER_RADIUS_SIDE_LO 20.0f
#define FL_TAMPER_RADIUS_SIDE_HI 26.0f
#define FL_TAMPER_HP_CENTRAL 3
#define FL_TAMPER_HP_SIDE 2
#define FL_TAMPER_ZONE_SEP_MIN 400.0f /* minimum z separation between tamper walls */

enum FlAction {
    FL_PITCH_UP, FL_PITCH_DOWN, FL_YAW_LEFT, FL_YAW_RIGHT,
    FL_THROTTLE_UP, FL_THROTTLE_DOWN, FL_FIRE, FL_AUTOPILOT_TOGGLE,
    FL_ACTION_COUNT
};
enum FlMode { FL_MODE_AUTOPILOT = 0, FL_MODE_MANUAL = 1, FL_MODE_ARRIVED = 2,
              FL_MODE_DESTROYED = 3, FL_MODE_STRANDED = 4 };
enum FlAlert { FL_ALERT_NONE = 0, FL_ALERT_HAZARD_AHEAD = 1, FL_ALERT_MANUAL_REQUIRED = 2,
               FL_ALERT_LOW_FUEL = 3, FL_ALERT_HULL_CRITICAL = 4, FL_ALERT_OFF_ROUTE = 5 };
/* Semantic events; the browser decides which sound/vibration each one gets. */
enum FlEvent { FL_EV_NONE = 0, FL_EV_FIRE, FL_EV_ROCK_BREAK, FL_EV_HIT, FL_EV_WARNING,
               FL_EV_MANUAL_REQUIRED, FL_EV_AUTOPILOT_ON, FL_EV_AUTOPILOT_REFUSED,
               FL_EV_LOW_FUEL, FL_EV_HULL_CRITICAL, FL_EV_ARRIVED, FL_EV_DESTROYED,
               FL_EV_STRANDED, FL_EV_PHASE_ATMO_EXIT, FL_EV_PHASE_MOON,
               FL_EV_SLING_GOOD, FL_EV_SLING_OK, FL_EV_SLING_MISS, FL_EV_TILT_WARNING,
               FL_EV_COUNT };

typedef struct {
    float length;       /* distance units */
    float days;         /* pilot days spent on the route */
    float dilation;     /* earth days per pilot day (1.0 = none) */
    float belt_start, belt_end;
    int   rock_count;
    unsigned int seed;
    unsigned int generator_version;
} Route;

typedef struct Rock {
    float x, y, z, r;
    float rot, spin;
    int   hp, alive;
    int   tamper;   /* 1 if this rock is part of a tamper wall blockage, 0 otherwise */
    unsigned int shape;
} Rock;

typedef struct Flight {
    const ShipSpec *spec;
    Route route;
    Rock  rocks[FL_MAX_ROCKS];
    int   rock_total;
    /* ship state (separate from spec) */
    float px, py, pz;
    float yaw, pitch;
    float yaw_rate, pitch_rate;   /* rad/s, damped inertia (M2), init a 0 */
    float tilt_angle;             /* radians, ascent tilt angle (M3) */
    float throttle, speed;
    float fuel, hull, energy;
    float laser_cd, laser_flash, shake;
    int   mode, alert;
    unsigned int held, pressed;
    unsigned int tick;
    float lane_phase_x, lane_phase_y;
    Rng   rng;
    unsigned char ev[FL_EVENT_CAP];
    unsigned int ev_head, ev_count;
    int   alert_prev, destroyed_rocks;
} Flight;

/* Returns 0 on success, -1 on an invalid ship type or route. */
int  flight_init(Flight *f, int ship_type, unsigned int seed);
void flight_input(Flight *f, int action, int down);
void flight_tick(Flight *f);                  /* exactly FL_STEP_SECONDS */
int  flight_event_take(Flight *f);
float flight_lane_x(const Flight *f, float z);
float flight_lane_y(const Flight *f, float z);
float flight_lane_half_at(const Flight *f, float z); /* lane half width at z */
unsigned int flight_checksum(const Flight *f); /* determinism tests */

/* Scalar HUD read-out: the only data the browser needs besides the scene. */
enum FlStat {
    FS_SPEED, FS_SPEED_MAX, FS_THROTTLE, FS_FUEL, FS_FUEL_MAX, FS_FUEL_ROUTE_COST,
    FS_HULL, FS_HULL_MAX, FS_ENERGY, FS_ENERGY_MAX, FS_PROGRESS, FS_ETA_SECONDS,
    FS_PILOT_DAYS, FS_EARTH_DAYS, FS_ROUTE_DAYS, FS_DISTANCE_LEFT, FS_MODE, FS_ALERT,
    FS_IN_BELT, FS_ROCKS_ALIVE, FS_SENSOR_RANGE, FS_SHAKE, FS_LASER_FLASH,
    FS_PHASE, FS_ALTITUDE, FS_ATMO_DENSITY, FS_ASCENT_ANGLE, FS_SLING_OFFSET,
    FS_SLING_QUALITY, FS_MOON_DISTANCE, FS_COUNT
};
float flight_stat(const Flight *f, int id);
#endif
