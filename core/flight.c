#include "flight.h"
#include "level.h"
#ifndef M_PI_2
#define M_PI_2 1.57079632679f
#endif
#include <math.h>
#include <string.h>

static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static float approach(float v, float target, float step)
{
    if (v < target) { v += step; return v > target ? target : v; }
    v -= step; return v < target ? target : v;
}
static void push_event(Flight *f, int ev)
{
    if (f->ev_count == FL_EVENT_CAP) return;   /* drop newest */
    f->ev[(f->ev_head + f->ev_count) % FL_EVENT_CAP] = (unsigned char)ev;
    f->ev_count++;
}
int flight_event_take(Flight *f)
{
    if (f->ev_count == 0) return FL_EV_NONE;
    int e = f->ev[f->ev_head];
    f->ev_head = (f->ev_head + 1) % FL_EVENT_CAP;
    f->ev_count--;
    return e;
}
float flight_lane_x(const Flight *f, float z) { return 120.0f * sinf(z * 0.0040f + f->lane_phase_x); }
float flight_lane_y(const Flight *f, float z) { return  80.0f * sinf(z * 0.0033f + f->lane_phase_y); }

float flight_lane_half_at(const Flight *f, float z)
{
    float half = FL_LANE_HALF_BELT;
    if (z >= f->route.belt_start && z < f->route.belt_start + FL_LANE_TRANSITION) {
        float t = (z - f->route.belt_start) / FL_LANE_TRANSITION;
        half = FL_LANE_HALF * (1.0f - t) + FL_LANE_HALF_BELT * t;
    }
    else if (z >= f->route.belt_end - FL_LANE_TRANSITION && z <= f->route.belt_end) {
        float t = (z - (f->route.belt_end - FL_LANE_TRANSITION)) / FL_LANE_TRANSITION;
        half = FL_LANE_HALF_BELT * (1.0f - t) + FL_LANE_HALF * t;
    }
    return half;
}

/* Lane centre position at z. */
static void lane_at(const Flight *f, float z, float *lx, float *ly)
{
    *lx = flight_lane_x(f, z);
    *ly = flight_lane_y(f, z);
}

/* Unit vector perpendicular to the lane direction at z, in the x/y plane. */
static void lane_perp(const Flight *f, float z, float *px, float *py)
{
    float eps = 1.0f;
    float lx0, ly0, lx1, ly1;
    lane_at(f, z - eps, &lx0, &ly0);
    lane_at(f, z + eps, &lx1, &ly1);
    float dx = lx1 - lx0, dy = ly1 - ly0;
    float len = sqrtf(dx * dx + dy * dy);
    if (len < 1e-6f) { *px = 1.0f; *py = 0.0f; return; }
    /* perpendicular: (-dy, dx) */
    *px = -dy / len;
    *py = dx / len;
}

/* Rocks never occupy the lane, except inside tamper walls which deliberately
   block it. */
static void generate_rocks(Flight *f)
{
    Rng r; rng_seed(&r, f->route.seed ^ 0xA57E401DU);
    f->rock_total = 0;

    /* ---- Tamper walls: 4 blockages across the belt at regular z intervals ----
       Each wall has a central rock (hp 3) plus two side rocks (hp 2) placed so
       close that the gaps are smaller than 2*(FL_SHIP_RADIUS+3), blocking the
       lane unless the central rock is destroyed. */
    float belt_len = f->route.belt_end - f->route.belt_start;
    float zone = belt_len / (float)FL_TAMPER_COUNT;
    float last_tamper_z = -FL_TAMPER_ZONE_SEP_MIN;
    for (int k = 0; k < FL_TAMPER_COUNT && f->rock_total < FL_MAX_ROCKS; k++) {
        float z_center = f->route.belt_start + (k + 0.5f) * zone
            + rng_range(&r, -zone * 0.2f, zone * 0.2f);
        /* enforce minimum separation between tamper walls */
        if (z_center - last_tamper_z < FL_TAMPER_ZONE_SEP_MIN) continue;
        last_tamper_z = z_center;
        if (z_center < f->route.belt_start || z_center > f->route.belt_end) continue;

        float lx, ly; lane_at(f, z_center, &lx, &ly);
        float px, py; lane_perp(f, z_center, &px, &py);

        float r_central = rng_range(&r, FL_TAMPER_RADIUS_CENTRAL_LO, FL_TAMPER_RADIUS_CENTRAL_HI);
        float r_side = rng_range(&r, FL_TAMPER_RADIUS_SIDE_LO, FL_TAMPER_RADIUS_SIDE_HI);
        /* side rocks overlap the central rock so the gap is < 2*(FL_SHIP_RADIUS+3) */
        float overlap = r_central + r_side - 2.0f; /* gap = -2 units -> impassable */

        Rock c;
        c.x = lx; c.y = ly; c.z = z_center;
        c.r = r_central; c.rot = rng_range(&r, 0.0f, 6.28f);
        c.spin = rng_range(&r, -0.6f, 0.6f); c.hp = FL_TAMPER_HP_CENTRAL;
        c.alive = 1; c.tamper = 1; c.shape = rng_next(&r);
        if (f->rock_total < FL_MAX_ROCKS) f->rocks[f->rock_total++] = c;

        for (int side = 0; side < 2 && f->rock_total < FL_MAX_ROCKS; side++) {
            float s = (side == 0) ? 1.0f : -1.0f;
            Rock sdr;
            sdr.x = lx + px * overlap * s; sdr.y = ly + py * overlap * s;
            sdr.z = z_center;
            sdr.r = r_side; sdr.rot = rng_range(&r, 0.0f, 6.28f);
            sdr.spin = rng_range(&r, -0.6f, 0.6f); sdr.hp = FL_TAMPER_HP_SIDE;
            sdr.alive = 1; sdr.tamper = 1; sdr.shape = rng_next(&r);
            f->rocks[f->rock_total++] = sdr;
        }
    }

    /* ---- Normal rocks: avoid the lane (using the narrowed belt width) ----
       The belt is now harder: the lane is only FL_LANE_HALF_BELT wide at the
       centre, so the pilot must steer carefully or use the laser. */
    int normal_target = f->route.rock_count;
    int normal_placed = 0;
    int attempts = normal_target * 40;
    while (normal_placed < normal_target && attempts-- > 0 && f->rock_total < FL_MAX_ROCKS) {
        Rock k;
        float ang = rng_range(&r, 0.0f, 6.2831853f);
        float rad = FL_CORRIDOR * 0.95f * sqrtf(rng_float(&r));
        k.x = cosf(ang) * rad; k.y = sinf(ang) * rad;
        k.z = rng_range(&r, f->route.belt_start, f->route.belt_end);
        /* larger rocks outside tamper walls: radius 10..36 */
        k.r = rng_range(&r, 10.0f, 36.0f);
        float dx = k.x - flight_lane_x(f, k.z), dy = k.y - flight_lane_y(f, k.z);
        float half = flight_lane_half_at(f, k.z);
        float need = half + k.r + FL_SHIP_RADIUS;
        if (dx * dx + dy * dy < need * need) continue;
        /* do not place a normal rock inside a tamper wall */
        int in_tamper = 0;
        for (int j = 0; j < f->rock_total; j++) {
            if (!f->rocks[j].tamper) continue;
            float ddx = k.x - f->rocks[j].x, ddy = k.y - f->rocks[j].y;
            float ddz = k.z - f->rocks[j].z;
            if (ddx*ddx + ddy*ddy + ddz*ddz < (k.r + f->rocks[j].r) * (k.r + f->rocks[j].r)) {
                in_tamper = 1; break;
            }
        }
        if (in_tamper) continue;
        k.rot = rng_range(&r, 0.0f, 6.28f);
        k.spin = rng_range(&r, -0.6f, 0.6f);
        k.hp = 1 + (int)(k.r / 12.0f);
        k.alive = 1; k.tamper = 0; k.shape = rng_next(&r);
        f->rocks[f->rock_total++] = k;
        normal_placed++;
    }
    f->route.rock_count = f->rock_total;
}

int flight_init(Flight *f, int ship_type, unsigned int seed)
{
    const ShipSpec *s = ship_spec(ship_type);
    if (f == NULL || s == NULL) return -1;
    memset(f, 0, sizeof *f);
    f->spec = s;
    rng_seed(&f->rng, seed);
    f->route.length = 12000.0f;
    f->route.days = 4.0f;
    f->route.dilation = 1.0f;
    f->route.belt_start = 5000.0f;
    f->route.belt_end = 8000.0f;
    f->route.rock_count = 64;
    f->route.seed = seed;
    f->route.generator_version = FL_GENERATOR_VERSION;
    f->lane_phase_x = rng_range(&f->rng, 0.0f, 6.28f);
    f->lane_phase_y = rng_range(&f->rng, 0.0f, 6.28f);
    generate_rocks(f);
    float cost = f->route.length * s->fuel_per_unit;
    f->fuel = clampf(cost * 1.25f, 0.0f, s->fuel_max);
    f->hull = s->hull_max;
    f->energy = s->energy_max;
    f->throttle = 0.0f;
    f->yaw_rate = 0.0f;
    f->pitch_rate = 0.0f;
    f->tilt_angle = (float)(M_PI_2);   /* vertical ascent at start */
    f->mode = FL_MODE_MANUAL;
    return 0;
}

void flight_input(Flight *f, int action, int down)
{
    if (action < 0 || action >= FL_ACTION_COUNT) return;
    unsigned int bit = 1u << action;
    if (down && !(f->held & bit)) f->pressed |= bit;
    if (down) f->held |= bit; else f->held &= ~bit;
}

static int in_belt(const Flight *f) { return f->pz >= f->route.belt_start - 150.0f && f->pz <= f->route.belt_end; }

static int clear_ahead(const Flight *f)
{
    for (int i = 0; i < f->rock_total; i++) {
        const Rock *k = &f->rocks[i];
        float dz = k->z - f->pz;
        if (!k->alive || dz < -k->r || dz > 1200.0f) continue;
        float dx = k->x - f->px, dy = k->y - f->py;
        float need = k->r + 60.0f;
        if (dx * dx + dy * dy < need * need) return 0;
    }
    return 1;
}

static void fire_laser(Flight *f, float dx, float dy, float dz)
{
    if (f->laser_cd > 0.0f || f->energy < 8.0f) return;
    f->laser_cd = 0.25f; f->energy -= 8.0f; f->laser_flash = 0.10f;
    push_event(f, FL_EV_FIRE);
    int best = -1; float best_t = 1500.0f;
    for (int i = 0; i < f->rock_total; i++) {
        Rock *k = &f->rocks[i];
        if (!k->alive) continue;
        float rx = k->x - f->px, ry = k->y - f->py, rz = k->z - f->pz;
        float t = rx * dx + ry * dy + rz * dz;
        if (t <= 0.0f || t >= best_t) continue;
        float cx = rx - dx * t, cy = ry - dy * t, cz = rz - dz * t;
        if (cx * cx + cy * cy + cz * cz <= k->r * k->r) { best = i; best_t = t; }
    }
    if (best >= 0 && --f->rocks[best].hp <= 0) {
        f->rocks[best].alive = 0; f->destroyed_rocks++;
        push_event(f, FL_EV_ROCK_BREAK);
    }
}

static void update_alert(Flight *f)
{
    const ShipSpec *s = f->spec;
    float left = f->route.length - f->pz;
    float cruise = 0.6f * s->max_speed;
    int a = FL_ALERT_NONE;
    if (f->mode == FL_MODE_MANUAL && in_belt(f)) a = FL_ALERT_MANUAL_REQUIRED;
    else if (f->mode == FL_MODE_AUTOPILOT && f->pz < f->route.belt_end &&
             f->route.belt_start - f->pz < cruise * FL_WARN_SECONDS) a = FL_ALERT_HAZARD_AHEAD;
    if (f->fuel < left * s->fuel_per_unit && f->mode <= FL_MODE_MANUAL) a = FL_ALERT_LOW_FUEL;
    if (f->hull < s->hull_max * 0.25f && f->mode <= FL_MODE_MANUAL) a = FL_ALERT_HULL_CRITICAL;
    if (a == FL_ALERT_NONE && hypotf(f->px, f->py) > FL_CORRIDOR * 0.9f) a = FL_ALERT_OFF_ROUTE;
    if (a != f->alert_prev) {
        if (a == FL_ALERT_HAZARD_AHEAD) push_event(f, FL_EV_WARNING);
        else if (a == FL_ALERT_LOW_FUEL) push_event(f, FL_EV_LOW_FUEL);
        else if (a == FL_ALERT_HULL_CRITICAL) push_event(f, FL_EV_HULL_CRITICAL);
    }
    f->alert_prev = f->alert = a;
}

void flight_tick(Flight *f)
{
    const float dt = FL_STEP_SECONDS;
    const ShipSpec *s = f->spec;
    const float d = lv_density(f->pz);
    const float drag = lv_drag_factor(d);
    const float turn_factor = lv_turn_factor(d);
    const float fuel_factor = lv_fuel_factor(d);
    const int phase = lv_phase(f);
    const float pz_before = f->pz;
    f->tick++;
    if (f->laser_cd > 0.0f) f->laser_cd -= dt;
    if (f->laser_flash > 0.0f) f->laser_flash -= dt;
    if (f->shake > 0.0f) f->shake -= dt;
    f->energy = clampf(f->energy + 20.0f * dt, 0.0f, s->energy_max);

    if (f->mode >= FL_MODE_ARRIVED) {           /* terminal states: coast to a stop */
        f->speed = approach(f->speed, 0.0f, s->accel * dt);
        f->yaw_rate = 0.0f;
        f->pitch_rate = 0.0f;
        f->pressed = 0;
        return;
    }
    unsigned int h = f->held;
    if (f->pressed & (1u << FL_AUTOPILOT_TOGGLE)) {
        if (f->mode == FL_MODE_AUTOPILOT) { f->mode = FL_MODE_MANUAL; f->yaw_rate = 0.0f; f->pitch_rate = 0.0f; }
        else if (!in_belt(f) && clear_ahead(f) && f->pz >= LV_ATMO_END) { f->mode = FL_MODE_AUTOPILOT; push_event(f, FL_EV_AUTOPILOT_ON); }
        else push_event(f, FL_EV_AUTOPILOT_REFUSED);
    }
    f->pressed = 0;

    /* Handover: the autopilot yields control before the belt. */
    if (f->mode == FL_MODE_AUTOPILOT && f->pz >= f->route.belt_start - 150.0f && f->pz < f->route.belt_end) {
        f->mode = FL_MODE_MANUAL; f->yaw_rate = 0.0f; f->pitch_rate = 0.0f; push_event(f, FL_EV_MANUAL_REQUIRED);
    }

    if (f->mode == FL_MODE_AUTOPILOT) {
        float ty = clampf(-f->px / 400.0f, -0.35f, 0.35f);
        float tp = clampf(-f->py / 400.0f, -0.35f, 0.35f);
        float cap = 0.6f;
        if (f->pz > f->route.belt_start - 600.0f) cap = 0.35f;
        f->yaw = approach(f->yaw, ty, s->turn_rate * dt);
        f->pitch = approach(f->pitch, tp, s->turn_rate * dt);
        f->throttle = approach(f->throttle, cap, 0.5f * dt);
    } else {
        /* Inércia amortecida na rotação (M2): cada eixo aproxima-se de
           +-turn_rate com turn_accel enquanto a tecla está premida e
           amortece para 0 com turn_damp quando solta. Esquerda+direita
           (ou cima+baixo) premidas ao mesmo tempo anulam-se. */
        int yaw_in  = ((h & (1u << FL_YAW_RIGHT)) != 0) - ((h & (1u << FL_YAW_LEFT)) != 0);
        int pitch_in = ((h & (1u << FL_PITCH_UP)) != 0) - ((h & (1u << FL_PITCH_DOWN)) != 0);
        float accel_step = s->turn_accel * dt * turn_factor;
        float damp_step  = s->turn_damp  * dt * turn_factor;
        if (yaw_in > 0)      f->yaw_rate = approach(f->yaw_rate,  s->turn_rate, accel_step);
        else if (yaw_in < 0) f->yaw_rate = approach(f->yaw_rate, -s->turn_rate, accel_step);
        else                 f->yaw_rate = approach(f->yaw_rate, 0.0f, damp_step);
        if (pitch_in > 0)    f->pitch_rate = approach(f->pitch_rate,  s->turn_rate, accel_step);
        else if (pitch_in < 0) f->pitch_rate = approach(f->pitch_rate, -s->turn_rate, accel_step);
        else                 f->pitch_rate = approach(f->pitch_rate, 0.0f, damp_step);

        f->yaw   += f->yaw_rate   * dt * turn_factor;
        f->pitch += f->pitch_rate * dt * turn_factor;
        if (f->yaw   >  FL_MAX_ANGLE) { f->yaw   =  FL_MAX_ANGLE; f->yaw_rate   = 0.0f; }
        if (f->yaw   < -FL_MAX_ANGLE) { f->yaw   = -FL_MAX_ANGLE; f->yaw_rate   = 0.0f; }
        if (f->pitch >  FL_MAX_ANGLE) { f->pitch =  FL_MAX_ANGLE; f->pitch_rate = 0.0f; }
        if (f->pitch < -FL_MAX_ANGLE) { f->pitch = -FL_MAX_ANGLE; f->pitch_rate = 0.0f; }
        if (h & (1u << FL_THROTTLE_UP))   f->throttle += 0.5f * dt;
        if (h & (1u << FL_THROTTLE_DOWN)) f->throttle -= 0.5f * dt;
    }
    f->yaw = clampf(f->yaw, -FL_MAX_ANGLE, FL_MAX_ANGLE);
    f->pitch = clampf(f->pitch, -FL_MAX_ANGLE, FL_MAX_ANGLE);
    f->throttle = clampf(f->throttle, 0.0f, 1.0f);

    /* Ascent tilt: guided gravity turn, modified by pitch input. */
    if (phase == LV_ASCENT) {
        float target = lv_tilt_profile(f->pz);
        int pitch_in = ((h & (1u << FL_PITCH_UP)) != 0) - ((h & (1u << FL_PITCH_DOWN)) != 0);
        if (pitch_in == 0) {
            f->tilt_angle = approach(f->tilt_angle, target, s->turn_accel * dt * LV_TILT_AUTHORITY);
        } else {
            float tilt_rate = (pitch_in > 0) ? s->turn_rate * LV_TILT_AUTHORITY : -s->turn_rate * LV_TILT_AUTHORITY;
            f->tilt_angle += tilt_rate * dt;
            f->tilt_angle = clampf(f->tilt_angle, 0.0f, (float)(M_PI_2));
        }
    }

    float target_speed = f->fuel > 0.0f ? f->throttle * s->max_speed * drag : 0.0f;
    f->speed = approach(f->speed, target_speed, s->accel * dt);
    float cp = cosf(f->pitch);
    float dx = sinf(f->yaw) * cp, dy = sinf(f->pitch), dz = cosf(f->yaw) * cp;
    float step = f->speed * dt;
    f->px += dx * step; f->py += dy * step; f->pz += dz * step;
    f->fuel = clampf(f->fuel - step * s->fuel_per_unit * fuel_factor, 0.0f, s->fuel_max);

    float rad = hypotf(f->px, f->py);                 /* soft corridor wall */
    if (rad > FL_CORRIDOR * 1.1f) { float k = FL_CORRIDOR * 1.1f / rad; f->px *= k; f->py *= k; }

    if (h & (1u << FL_FIRE)) fire_laser(f, dx, dy, dz);

    for (int i = 0; i < f->rock_total; i++) {
        Rock *k = &f->rocks[i];
        if (!k->alive) continue;
        k->rot += k->spin * dt;
        float rx = k->x - f->px, ry = k->y - f->py, rz = k->z - f->pz;
        float need = k->r + FL_SHIP_RADIUS;
        if (rx * rx + ry * ry + rz * rz < need * need) {
            k->alive = 0;
            f->hull -= 5.0f + k->r * 0.5f;
            f->shake = 0.4f;
            push_event(f, FL_EV_HIT);
        }
    }
    if (f->hull <= 0.0f) { f->hull = 0.0f; f->mode = FL_MODE_DESTROYED; push_event(f, FL_EV_DESTROYED); f->alert = f->alert_prev = 0; return; }
    if (f->pz >= f->route.length) {
        f->pz = f->route.length; f->throttle = 0.0f; f->mode = FL_MODE_ARRIVED;
        push_event(f, FL_EV_ARRIVED); f->alert = f->alert_prev = 0; return;
    }
    if (f->fuel <= 0.0f && f->speed < 0.5f) {
        f->mode = FL_MODE_STRANDED; push_event(f, FL_EV_STRANDED); f->alert = f->alert_prev = 0; return;
    }
    update_alert(f);
    /* Phase edges and one-shot effects are derived from the pz crossing in this
       tick, so no state is needed (checkpoint safe, multiple Flights safe). */
    {
        const int phase_after = lv_phase(f);
        if (phase != phase_after) {
            if (phase_after == LV_TRANSIT && pz_before < LV_ATMO_END) {
                push_event(f, FL_EV_PHASE_ATMO_EXIT);
                if (fabsf(f->tilt_angle) > LV_TILT_WINDOW) {
                    push_event(f, FL_EV_TILT_WARNING);
                    f->fuel = clampf(f->fuel - LV_TILT_PENALTY, 0.0f, s->fuel_max);
                }
            } else if (phase_after == LV_MOON) push_event(f, FL_EV_PHASE_MOON);
        }
        /* Lunar slingshot: applied once when pz crosses LV_MOON_Z. */
        if (pz_before < LV_MOON_Z && f->pz >= LV_MOON_Z) {
            float lx, ly;
            if (lv_moon_xy(f, f->pz, &lx, &ly)) {
                float q = lv_sling_quality(hypotf(f->px - lx, f->py - ly));
                f->speed *= (1.0f + LV_SLING_SPEED_RATIO * q);
                f->fuel = clampf(f->fuel + LV_SLING_FUEL * q, 0.0f, s->fuel_max);
                if (q >= 0.7f) push_event(f, FL_EV_SLING_GOOD);
                else if (q >= 0.3f) push_event(f, FL_EV_SLING_OK);
                else push_event(f, FL_EV_SLING_MISS);
            }
        }
    }
}

float flight_stat(const Flight *f, int id)
{
    const ShipSpec *s = f->spec;
    float prog = clampf(f->pz / f->route.length, 0.0f, 1.0f);
    switch (id) {
    case FS_SPEED: return f->speed;
    case FS_SPEED_MAX: return s->max_speed;
    case FS_THROTTLE: return f->throttle;
    case FS_FUEL: return f->fuel;
    case FS_FUEL_MAX: return s->fuel_max;
    case FS_FUEL_ROUTE_COST: return f->route.length * s->fuel_per_unit;
    case FS_HULL: return f->hull;
    case FS_HULL_MAX: return s->hull_max;
    case FS_ENERGY: return f->energy;
    case FS_ENERGY_MAX: return s->energy_max;
    case FS_PROGRESS: return prog;
    case FS_ETA_SECONDS: { float v = f->speed > 5.0f ? f->speed : 0.6f * s->max_speed; return (f->route.length - f->pz) / v; }
    case FS_PILOT_DAYS: return prog * f->route.days;
    case FS_EARTH_DAYS: return prog * f->route.days * f->route.dilation;
    case FS_ROUTE_DAYS: return f->route.days;
    case FS_DISTANCE_LEFT: return f->route.length - f->pz;
    case FS_MODE: return (float)f->mode;
    case FS_ALERT: return (float)f->alert;
    case FS_IN_BELT: return in_belt(f) ? 1.0f : 0.0f;
    case FS_ROCKS_ALIVE: { int n = 0; for (int i = 0; i < f->rock_total; i++) n += f->rocks[i].alive; return (float)n; }
    case FS_SENSOR_RANGE: return s->sensor_range;
    case FS_SHAKE: return f->shake > 0.0f ? f->shake : 0.0f;
    case FS_LASER_FLASH: return f->laser_flash > 0.0f ? 1.0f : 0.0f;
    case FS_PHASE: return (float)lv_phase(f);
    case FS_ALTITUDE: return f->pz < LV_ATMO_END ? f->pz : LV_ATMO_END;
    case FS_ATMO_DENSITY: return lv_density(f->pz);
    case FS_ASCENT_ANGLE: return f->tilt_angle;
    case FS_SLING_OFFSET: {
        float lx, ly;
        if (lv_moon_xy(f, f->pz, &lx, &ly)) return hypotf(f->px - lx, f->py - ly);
        return 0.0f;
    }
    case FS_SLING_QUALITY: {
        float lx, ly;
        if (lv_moon_xy(f, f->pz, &lx, &ly)) return lv_sling_quality(hypotf(f->px - lx, f->py - ly));
        return 0.0f;
    }
    case FS_MOON_DISTANCE: return f->pz - LV_MOON_Z;
    default: return 0.0f;
    }
}

unsigned int flight_checksum(const Flight *f)
{
    unsigned int h = 2166136261u;
    const float vals[] = { f->px, f->py, f->pz, f->yaw, f->pitch, f->yaw_rate, f->pitch_rate, f->tilt_angle, f->speed, f->fuel, f->hull, f->energy };
    for (unsigned i = 0; i < sizeof vals / sizeof vals[0]; i++) {
        unsigned int u; memcpy(&u, &vals[i], sizeof u);
        h = (h ^ u) * 16777619u;
    }
    h = (h ^ (unsigned)f->mode) * 16777619u;
    for (int i = 0; i < f->rock_total; i++) h = (h ^ (unsigned)f->rocks[i].alive ^ f->rocks[i].shape) * 16777619u;
    return h;
}
