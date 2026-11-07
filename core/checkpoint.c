#include "checkpoint.h"
#include "level.h"
#include <math.h>
#include <string.h>

static unsigned int cp_word(const Checkpoint *cp, int i);

int cp_validate(const Checkpoint *cp)
{
    if (cp == NULL) return CP_INVALID;
    if (cp->format_version != CP_VERSION) return CP_INVALID;
    if (cp->generator_version != FL_GENERATOR_VERSION) return CP_INVALID;
    if (!isfinite(cp->tilt_angle) || cp->tilt_angle < 0.0f || cp->tilt_angle > 1.5707964f) return CP_INVALID;

    /* Obtemos route.length, spec e rock_total de uma Flight inicializada com
       os mesmos ship_type e route_seed, para nao hard-codar valores de rota. */
    Flight tmp;
    if (flight_init(&tmp, cp->ship_type, cp->route_seed) != 0) return CP_INVALID;

    if (cp->mode != FL_MODE_AUTOPILOT && cp->mode != FL_MODE_MANUAL) return CP_INVALID;

    /* Todos os floats devem ser finitos (sem NaN nem infinito). */
    if (!isfinite(cp->px) || !isfinite(cp->py) || !isfinite(cp->pz) ||
        !isfinite(cp->yaw) || !isfinite(cp->pitch) ||
        !isfinite(cp->throttle) || !isfinite(cp->speed) ||
        !isfinite(cp->fuel) || !isfinite(cp->hull) || !isfinite(cp->energy))
        return CP_INVALID;

    if (cp->pz < 0.0f || cp->pz >= tmp.route.length) return CP_INVALID;
    if (hypotf(cp->px, cp->py) > FL_CORRIDOR * 1.1f) return CP_INVALID;
    if (cp->yaw < -FL_MAX_ANGLE || cp->yaw > FL_MAX_ANGLE) return CP_INVALID;
    if (cp->pitch < -FL_MAX_ANGLE || cp->pitch > FL_MAX_ANGLE) return CP_INVALID;

    const ShipSpec *s = tmp.spec;
    if (cp->throttle < 0.0f || cp->throttle > 1.0f) return CP_INVALID;
    if (cp->speed < 0.0f || cp->speed > s->max_speed * LV_SPEED_BOOST * (1.0f + LV_SLING_SPEED_RATIO)) return CP_INVALID;
    if (cp->fuel < 0.0f || cp->fuel > s->fuel_max) return CP_INVALID;
    if (cp->hull <= 0.0f || cp->hull > s->hull_max) return CP_INVALID;
    if (cp->energy < 0.0f || cp->energy > s->energy_max) return CP_INVALID;

    /* Alive bits at or above rock_total must be zero. */
    for (int i = tmp.rock_total; i < 96; i++) {
        if (cp_word(cp, i) & (1u << (i % 32))) return CP_INVALID;
    }

    return CP_OK;
}

/* Alive bits live in three 32-bit words (rocks 0..95). */
static unsigned int cp_word(const Checkpoint *cp, int i)
{
    return i < 32 ? cp->rocks_alive_lo : (i < 64 ? cp->rocks_alive_hi : cp->rocks_alive_extra);
}

int cp_capture(const Flight *f, Checkpoint *out)
{
    if (f == NULL || out == NULL) return CP_UNAVAILABLE;
    if (f->mode == FL_MODE_ARRIVED || f->mode == FL_MODE_DESTROYED || f->mode == FL_MODE_STRANDED)
        return CP_UNAVAILABLE;
    if (f->spec == NULL) return CP_UNAVAILABLE;

    out->format_version = CP_VERSION;
    out->ship_type = f->spec->type;
    out->route_seed = f->route.seed;
    out->generator_version = f->route.generator_version;
    out->mode = f->mode;
    out->px = f->px; out->py = f->py; out->pz = f->pz;
    out->yaw = f->yaw; out->pitch = f->pitch;
    out->tilt_angle = f->tilt_angle;
    out->throttle = f->throttle; out->speed = f->speed;
    out->fuel = f->fuel; out->hull = f->hull; out->energy = f->energy;

    out->rocks_alive_lo = 0u;
    out->rocks_alive_hi = 0u;
    out->rocks_alive_extra = 0u;
    for (int i = 0; i < f->rock_total && i < 96; i++) {
        if (f->rocks[i].alive) {
            if (i < 32) out->rocks_alive_lo |= (1u << i);
            else if (i < 64) out->rocks_alive_hi |= (1u << (i - 32));
            else out->rocks_alive_extra |= (1u << (i - 64));
        }
    }
    return CP_OK;
}

int cp_restore(const Checkpoint *cp, Flight *out)
{
    if (cp == NULL || out == NULL) return CP_INVALID;
    if (cp_validate(cp) != CP_OK) return CP_INVALID;

    Flight tmp;
    if (flight_init(&tmp, cp->ship_type, cp->route_seed) != 0) return CP_INVALID;

    tmp.px = cp->px; tmp.py = cp->py; tmp.pz = cp->pz;
    tmp.yaw = cp->yaw; tmp.pitch = cp->pitch;
    tmp.tilt_angle = cp->tilt_angle;
    tmp.throttle = cp->throttle; tmp.speed = cp->speed;
    tmp.fuel = cp->fuel; tmp.hull = cp->hull; tmp.energy = cp->energy;
    tmp.mode = cp->mode;

    /* flight_init ja gerou todas as rochas vivas; apagamos as que nao estao
       nos bits do DTO. laser_cd, laser_flash, shake, held, pressed, tick,
       lane_phase_x/y, rng, ev, alert_prev, destroyed_rocks ficam a zero
       (flight_init ja fez memset a zero). yaw_rate e pitch_rate nao fazem
       parte do DTO (formato inalterado) e ficam a zero depois da restauracao. */
    tmp.yaw_rate = 0.0f;
    tmp.pitch_rate = 0.0f;
    for (int i = 0; i < tmp.rock_total; i++) {
        tmp.rocks[i].alive = (cp_word(cp, i) & (1u << (i % 32))) ? 1 : 0;
    }

    *out = tmp;
    return CP_OK;
}
