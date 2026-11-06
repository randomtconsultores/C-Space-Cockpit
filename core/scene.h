#ifndef CORE_SCENE_H
#define CORE_SCENE_H
#include "flight.h"
/* The C core describes what the pilot sees as flat float arrays in VIEW space
   (x right, y up, z forward, origin at the ship). The renderer only projects
   and draws them. No strings, no pointers, fixed capacities. */
#define SCENE_MAX_SEGS    4096
#define SCENE_SEG_STRIDE  7   /* x1 y1 z1 x2 y2 z2 color */
#define SCENE_STARS       160
#define SCENE_DUST        96
#define SCENE_MAX_POINTS  (SCENE_STARS + SCENE_DUST)
#define SCENE_PT_STRIDE   4   /* x y z brightness */
#define SCENE_CON_STRIDE  4   /* x y z kind (view space, for the scanner) */
#define SCENE_NEAR        1.0f
enum SceneColor { SC_ROCK = 0, SC_GUIDE = 1, SC_CONTACT = 2, SC_LASER = 3, SC_PLANET = 4 };
typedef struct {
    float seg[SCENE_MAX_SEGS * SCENE_SEG_STRIDE];
    int   seg_count;
    float pts[SCENE_MAX_POINTS * SCENE_PT_STRIDE];
    int   pt_count;
    float con[FL_MAX_ROCKS * SCENE_CON_STRIDE];
    int   con_count;
} Scene;
void scene_build(const Flight *f, Scene *s);
#endif
