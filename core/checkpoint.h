#ifndef CORE_CHECKPOINT_H
#define CORE_CHECKPOINT_H

#include "flight.h"

/* Versão do formato do DTO de checkpoint. Nunca alterar a versão 1; para
   evoluir o formato, adicionar uma nova versão e uma função de migração. */
#define CP_VERSION 1

typedef struct {
    int format_version;     /* must equal CP_VERSION */
    int ship_type;          /* enum ShipType */
    unsigned int route_seed;
    unsigned int generator_version; /* must equal FL_GENERATOR_VERSION */
    int mode;               /* only FL_MODE_AUTOPILOT or FL_MODE_MANUAL */
    float px, py, pz;
    float yaw, pitch;
    float throttle, speed;
    float fuel, hull, energy;
    unsigned int rocks_alive_lo; /* bit i = rock i alive, rocks 0..31 */
    unsigned int rocks_alive_hi; /* rocks 32..47 */
} Checkpoint;

enum CpResult { CP_OK = 1, CP_INVALID = -1, CP_UNAVAILABLE = -2 };

/* Valida um DTO de checkpoint. Devolve CP_OK ou CP_INVALID. */
int cp_validate(const Checkpoint *cp);

/* Captura o estado de um voo em curso num DTO.
   Devolve CP_UNAVAILABLE se o modo for ARRIVED/DESTROYED/STRANDED, ou se
   algum dos inputs for NULL; out fica intocado em caso de falha. */
int cp_capture(const Flight *f, Checkpoint *out);

/* Restaura um DTO numa Flight. Valida primeiro; out fica intocado em qualquer
   falha. Campos fora do DTO (laser_cd, tremor, eventos, teclas, tick, rng,
   lane_phase) arrancam a zero. */
int cp_restore(const Checkpoint *cp, Flight *out);

#endif
