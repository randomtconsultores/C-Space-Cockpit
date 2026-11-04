#include "rng.h"
unsigned int rng_hash(unsigned int v)
{
    v ^= v >> 16; v *= 0x7feb352dU;
    v ^= v >> 15; v *= 0x846ca68bU;
    v ^= v >> 16;
    return v;
}
void rng_seed(Rng *r, unsigned int seed)
{
    r->s = rng_hash(seed ^ 0x9e3779b9U);
    if (r->s == 0) r->s = 0x1badf00dU;
}
unsigned int rng_next(Rng *r)
{
    unsigned int x = r->s;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    r->s = x;
    return x;
}
float rng_float(Rng *r) { return (float)(rng_next(r) >> 8) / 16777216.0f; }
float rng_range(Rng *r, float lo, float hi) { return lo + (hi - lo) * rng_float(r); }
