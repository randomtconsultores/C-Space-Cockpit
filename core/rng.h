#ifndef CORE_RNG_H
#define CORE_RNG_H
/* Deterministic xorshift32 with explicit state. No libc rand/srand: the same
   seed and generator version must always reproduce the same universe. */
typedef struct { unsigned int s; } Rng;
void rng_seed(Rng *r, unsigned int seed);
unsigned int rng_next(Rng *r);
float rng_float(Rng *r);                    /* [0, 1) */
float rng_range(Rng *r, float lo, float hi);
unsigned int rng_hash(unsigned int v);      /* stateless mixing */
#endif
