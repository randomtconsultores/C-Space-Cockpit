/* WebAssembly entry points. The only C/JS boundary of the cockpit build:
   scalars in, scalars out, plus read-only float arrays in WASM memory.
   No strings and no pointers are accepted from JavaScript. */
#include <emscripten/emscripten.h>
#include "../core/flight.h"
#include "../core/scene.h"

static Flight flight;
static Scene scene;
static int ready;

EMSCRIPTEN_KEEPALIVE int   cs_init(int ship_type, unsigned int seed) { ready = flight_init(&flight, ship_type, seed) == 0; return ready ? 0 : -1; }
EMSCRIPTEN_KEEPALIVE void  cs_input(int action, int down) { if (ready) flight_input(&flight, action, down); }
EMSCRIPTEN_KEEPALIVE void  cs_tick(void) { if (ready) flight_tick(&flight); }
EMSCRIPTEN_KEEPALIVE int   cs_event_take(void) { return ready ? flight_event_take(&flight) : 0; }
EMSCRIPTEN_KEEPALIVE float cs_stat(int id) { return ready ? flight_stat(&flight, id) : 0.0f; }
EMSCRIPTEN_KEEPALIVE void  cs_scene_update(void) { if (ready) scene_build(&flight, &scene); }
EMSCRIPTEN_KEEPALIVE int   cs_seg_ptr(void) { return (int)(unsigned long)scene.seg; }
EMSCRIPTEN_KEEPALIVE int   cs_seg_count(void) { return scene.seg_count; }
EMSCRIPTEN_KEEPALIVE int   cs_pt_ptr(void) { return (int)(unsigned long)scene.pts; }
EMSCRIPTEN_KEEPALIVE int   cs_pt_count(void) { return scene.pt_count; }
EMSCRIPTEN_KEEPALIVE int   cs_con_ptr(void) { return (int)(unsigned long)scene.con; }
EMSCRIPTEN_KEEPALIVE int   cs_con_count(void) { return scene.con_count; }
/* Contract constants, so JS never hard-codes strides. */
EMSCRIPTEN_KEEPALIVE int   cs_const(int id)
{
    switch (id) {
    case 0: return SCENE_SEG_STRIDE;
    case 1: return SCENE_PT_STRIDE;
    case 2: return SCENE_CON_STRIDE;
    case 3: return FS_COUNT;
    case 4: return FL_ACTION_COUNT;
    case 5: return FL_GENERATOR_VERSION;
    default: return -1;
    }
}
