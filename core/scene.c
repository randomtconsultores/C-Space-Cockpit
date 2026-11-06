#include "scene.h"
#include "level.h"
#include <math.h>
#include <string.h>

typedef struct { float cy, sy, cp, sp, ox, oy, px, py, pz; } View;

static void to_view(const View *v, float wx, float wy, float wz, float out[3], int translate)
{
    float rx = translate ? wx - v->px : wx, ry = translate ? wy - v->py : wy, rz = translate ? wz - v->pz : wz;
    float x1 = rx * v->cy - rz * v->sy;
    float z1 = rx * v->sy + rz * v->cy;
    out[0] = x1 + v->ox;
    out[1] = ry * v->cp - z1 * v->sp + v->oy;
    out[2] = ry * v->sp + z1 * v->cp;
}

static void add_seg(Scene *s, const float a[3], const float b[3], int color)
{
    float p[3] = { a[0], a[1], a[2] }, q[3] = { b[0], b[1], b[2] };
    if (p[2] < SCENE_NEAR && q[2] < SCENE_NEAR) return;
    if (p[2] < SCENE_NEAR || q[2] < SCENE_NEAR) {            /* clip to near plane */
        float *in = p[2] >= SCENE_NEAR ? p : q, *out = p[2] >= SCENE_NEAR ? q : p;
        float t = (SCENE_NEAR - in[2]) / (out[2] - in[2]);
        for (int i = 0; i < 3; i++) out[i] = in[i] + (out[i] - in[i]) * t;
    }
    if (s->seg_count >= SCENE_MAX_SEGS) return;
    float *d = &s->seg[s->seg_count++ * SCENE_SEG_STRIDE];
    memcpy(d, p, sizeof p); memcpy(d + 3, q, sizeof q); d[6] = (float)color;
}

static float ico_v[12][3];
static int ico_e[30][2];
static int ico_ready;
static void ico_init(void)
{
    const float t = 1.6180339887f;
    const float raw[12][3] = { {0,1,t},{0,-1,t},{0,1,-t},{0,-1,-t},{1,t,0},{-1,t,0},{1,-t,0},{-1,-t,0},{t,0,1},{t,0,-1},{-t,0,1},{-t,0,-1} };
    float n = sqrtf(1.0f + t * t);
    for (int i = 0; i < 12; i++) for (int k = 0; k < 3; k++) ico_v[i][k] = raw[i][k] / n;
    int c = 0;
    for (int i = 0; i < 12 && c < 30; i++) for (int j = i + 1; j < 12 && c < 30; j++) {
        float dx = raw[i][0] - raw[j][0], dy = raw[i][1] - raw[j][1], dz = raw[i][2] - raw[j][2];
        float d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 3.9f && d2 < 4.1f) { ico_e[c][0] = i; ico_e[c][1] = j; c++; }
    }
    ico_ready = 1;
}

static void draw_rock(Scene *s, const View *v, const Rock *k)
{
    float verts[12][3];
    float cr = cosf(k->rot), sr = sinf(k->rot);
    for (int i = 0; i < 12; i++) {
        float jit = 0.70f + 0.30f * (float)(rng_hash(k->shape + (unsigned)i * 7919u) & 0xff) / 255.0f;
        float x = ico_v[i][0] * jit * k->r, y = ico_v[i][1] * jit * k->r, z = ico_v[i][2] * jit * k->r;
        float wx = x * cr - z * sr, wz = x * sr + z * cr;
        to_view(v, k->x + wx, k->y + y, k->z + wz, verts[i], 1);
    }
    for (int e = 0; e < 30; e++) add_seg(s, verts[ico_e[e][0]], verts[ico_e[e][1]], SC_ROCK);
}

static void draw_ring(Scene *s, const View *v, float cx, float cy, float cz, float rad, int axis, int n, int color)
{
    float prev[3] = {0, 0, 0}, first[3] = {0, 0, 0};
    for (int i = 0; i <= n; i++) {
        float a = 6.2831853f * (float)i / (float)n, c = cosf(a) * rad, d = sinf(a) * rad;
        float wx = cx, wy = cy, wz = cz;
        if (axis == 2) { wx += c; wy += d; } else if (axis == 1) { wx += c; wz += d; } else { wy += c; wz += d; }
        float cur[3]; to_view(v, wx, wy, wz, cur, 1);
        if (i == 0) memcpy(first, cur, sizeof cur); else add_seg(s, prev, cur, color);
        memcpy(prev, cur, sizeof cur);
    }
    (void)first;
}

static void draw_earth(Scene *s, const View *v, const Flight *f)
{
    if (f->pz >= LV_ATMO_END) return;
    float earth_r = 600.0f * (1.0f - f->pz / LV_ATMO_END);
    if (earth_r < 30.0f) return;
    float tilt = f->tilt_angle;
    float ct = cosf(tilt), st = sinf(tilt);
    float ey = -earth_r * 0.7f;
    float ez = f->pz + 100.0f;
    /* Paralelos */
    for (int i = 1; i < 10; i++) {
        float lat = -1.5707963f + 3.1415926f * (float)i / 9.0f;
        float r = earth_r * cosf(lat), yc = earth_r * sinf(lat);
        float prev[3] = {0,0,0}, first[3] = {0,0,0};
        for (int j = 0; j <= 16; j++) {
            float lon = 6.2831853f * (float)j / 16.0f;
            float x = r * cosf(lon), z = r * sinf(lon);
            float y2 = yc * ct - z * st, z2 = yc * st + z * ct;
            float cur[3];
            to_view(v, x, ey + y2, ez + z2, cur, 1);
            if (j == 0) memcpy(first, cur, sizeof cur); else add_seg(s, prev, cur, SC_EARTH);
            memcpy(prev, cur, sizeof cur);
        }
        add_seg(s, prev, first, SC_EARTH);
    }
    /* Meridianos */
    for (int j = 0; j < 12; j++) {
        float lon = 6.2831853f * (float)j / 12.0f;
        float prev[3] = {0,0,0}, first[3] = {0,0,0};
        for (int i = 0; i <= 10; i++) {
            float lat = -1.5707963f + 3.1415926f * (float)i / 10.0f;
            float r = earth_r * cosf(lat), yc = earth_r * sinf(lat);
            float x = r * cosf(lon), z = r * sinf(lon);
            float y2 = yc * ct - z * st, z2 = yc * st + z * ct;
            float cur[3];
            to_view(v, x, ey + y2, ez + z2, cur, 1);
            if (i == 0) memcpy(first, cur, sizeof cur); else add_seg(s, prev, cur, SC_EARTH);
            memcpy(prev, cur, sizeof cur);
        }
        add_seg(s, prev, first, SC_EARTH);
    }
    /* Contorno de continentes simples (poucas linhas perto do equador) */
    {
        float c[6][3];
        for (int k = 0; k < 6; k++) {
            float a = 6.2831853f * (float)k / 6.0f;
            float r = earth_r * (0.85f + 0.10f * (float)(k % 3));
            float x = r * cosf(a), z = r * sinf(a);
            float y2 = 0.0f * ct - z * st, z2 = 0.0f * st + z * ct;
            to_view(v, x, ey + y2, ez + z2, c[k], 1);
        }
        for (int k = 0; k < 6; k++) add_seg(s, c[k], c[(k + 1) % 6], SC_EARTH);
    }
}

/* The Moon is a giant wireframe sphere fixed in the world (see lv_moon_center).
   Only the hemisphere facing the ship is drawn. It is visible from the end of
   the atmosphere until the ship has passed it. */
#define MOON_PAR 11     /* parallels */
#define MOON_MER 16     /* meridians */
#define MOON_STEPS 20   /* segments per parallel or meridian */

static int moon_front(const Flight *f, float mx, float my, float mz, float wx, float wy, float wz)
{
    /* Front-facing if the surface normal points towards the ship. */
    float nx = wx - mx, ny = wy - my, nz = wz - mz;
    float sx = f->px - wx, sy = f->py - wy, sz = f->pz - wz;
    return nx * sx + ny * sy + nz * sz > 0.0f;
}

static void moon_seg(Scene *s, const View *v, const Flight *f, const float c[3],
                     const float a[3], const float b[3])
{
    float mid[3] = { (a[0] + b[0]) * 0.5f, (a[1] + b[1]) * 0.5f, (a[2] + b[2]) * 0.5f };
    if (!moon_front(f, c[0], c[1], c[2], mid[0], mid[1], mid[2])) return;
    float va[3], vb[3];
    to_view(v, a[0], a[1], a[2], va, 1);
    to_view(v, b[0], b[1], b[2], vb, 1);
    add_seg(s, va, vb, SC_MOON);
}

static void moon_point(const float c[3], float r, float lat, float lon, float out[3])
{
    out[0] = c[0] + r * cosf(lat) * cosf(lon);
    out[1] = c[1] + r * sinf(lat);
    out[2] = c[2] + r * cosf(lat) * sinf(lon);
}

static void draw_moon(Scene *s, const View *v, const Flight *f)
{
    if (f->pz < LV_ATMO_END || f->pz > LV_MOON_Z + LV_MOON_RADIUS + 400.0f) return;
    float c[3]; lv_moon_center(&c[0], &c[1], &c[2]);
    const float r = LV_MOON_RADIUS;
    const float pi = 3.1415926f;
    /* parallels */
    for (int i = 1; i <= MOON_PAR; i++) {
        float lat = -pi * 0.5f + pi * (float)i / (float)(MOON_PAR + 1);
        float prev[3]; moon_point(c, r, lat, 0.0f, prev);
        for (int j = 1; j <= MOON_STEPS; j++) {
            float cur[3]; moon_point(c, r, lat, 2.0f * pi * (float)j / (float)MOON_STEPS, cur);
            moon_seg(s, v, f, c, prev, cur);
            memcpy(prev, cur, sizeof cur);
        }
    }
    /* meridians */
    for (int k = 0; k < MOON_MER; k++) {
        float lon = 2.0f * pi * (float)k / (float)MOON_MER;
        float prev[3]; moon_point(c, r, -pi * 0.5f, lon, prev);
        for (int j = 1; j <= MOON_STEPS; j++) {
            float cur[3]; moon_point(c, r, -pi * 0.5f + pi * (float)j / (float)MOON_STEPS, lon, cur);
            moon_seg(s, v, f, c, prev, cur);
            memcpy(prev, cur, sizeof cur);
        }
    }
    /* craters: small circles on the sphere at fixed, deterministic places */
    for (int n = 0; n < 6; n++) {
        float clat = (-0.9f + 1.8f * (float)(rng_hash(300u + (unsigned)n * 31u) & 0xff) / 255.0f) * 0.9f;
        float clon = 2.0f * pi * (float)(rng_hash(500u + (unsigned)n * 17u) & 0xff) / 255.0f;
        float cr = 0.06f + 0.05f * (float)(rng_hash(700u + (unsigned)n * 13u) & 0xff) / 255.0f;   /* angular radius */
        float prev[3] = {0, 0, 0}; int have = 0;
        for (int j = 0; j <= 14; j++) {
            float a = 2.0f * pi * (float)j / 14.0f;
            float lat = clat + cr * sinf(a), lon = clon + cr * cosf(a) / (cosf(clat) > 0.2f ? cosf(clat) : 0.2f);
            float cur[3]; moon_point(c, r, lat, lon, cur);
            if (have) moon_seg(s, v, f, c, prev, cur);
            memcpy(prev, cur, sizeof cur); have = 1;
        }
    }
}

/* Guide rings along the circle that hugs the surface: following them keeps the
   ship low over the Moon for the whole pass. */
static void draw_guide_rings(Scene *s, const View *v, const Flight *f)
{
    if (!lv_moon_in_zone(f->pz)) return;
    const int n_rings = 10;
    for (int i = 0; i < n_rings; i++) {
        float u = -LV_MOON_RING_SPAN + 2.0f * LV_MOON_RING_SPAN * (float)i / (float)(n_rings - 1);
        float z = LV_MOON_Z + u, lx, ly;
        if (!lv_moon_ring(u, &lx, &ly)) continue;
        float ahead = z - f->pz;
        if (ahead <= 0.0f || ahead > 1500.0f) continue;
        draw_ring(s, v, lx, ly, z, 45.0f, 2, 12, SC_GUIDE);
        draw_ring(s, v, lx, ly, z, 22.0f, 2, 12, SC_GUIDE);
    }
}

void scene_build(const Flight *f, Scene *s)
{
    if (!ico_ready) ico_init();
    s->seg_count = s->pt_count = s->con_count = 0;
    View v;
    v.cy = cosf(f->yaw); v.sy = sinf(f->yaw); v.cp = cosf(f->pitch); v.sp = sinf(f->pitch);
    float sh = f->shake > 0.0f ? f->shake : 0.0f;
    v.ox = sinf((float)f->tick * 2.3f) * sh * 1.5f; v.oy = cosf((float)f->tick * 3.1f) * sh * 1.5f;
    v.px = f->px; v.py = f->py; v.pz = f->pz;

    float d = lv_density(f->pz);
    float fade = 1.0f - d;

    /* stars at infinity: direction only, rotated by the ship heading.
       Hidden during thick atmosphere, fade in as density drops. */
    if (d < 0.95f) {
    for (int i = 0; i < SCENE_STARS && s->pt_count < SCENE_MAX_POINTS; i++) {
        float zc = 2.0f * (float)(rng_hash((unsigned)i * 3u + 1u) >> 8) / 16777216.0f - 1.0f;
        float ph = 6.2831853f * (float)(rng_hash((unsigned)i * 3u + 2u) >> 8) / 16777216.0f;
        float rr = sqrtf(1.0f - zc * zc), o[3];
        to_view(&v, rr * cosf(ph), rr * sinf(ph), zc, o, 0);
        if (o[2] <= 0.05f) continue;
        float *dp = &s->pts[s->pt_count++ * SCENE_PT_STRIDE];
        dp[0] = o[0] * 2000.0f; dp[1] = o[1] * 2000.0f; dp[2] = o[2] * 2000.0f;
        dp[3] = (0.35f + 0.65f * (float)(rng_hash((unsigned)i * 3u + 3u) & 0xff) / 255.0f) * fade;
    }
    }
    /* dust wraps around the ship: gives parallax and a sense of speed */
    if (d < 0.95f) {
    for (int i = 0; i < SCENE_DUST && s->pt_count < SCENE_MAX_POINTS; i++) {
        float w[3], o[3];
        for (int k = 0; k < 3; k++) {
            float base = 400.0f * (float)(rng_hash((unsigned)i * 5u + (unsigned)k + 100u) >> 8) / 16777216.0f;
            float ship = k == 0 ? f->px : (k == 1 ? f->py : f->pz);
            float rel = fmodf(base - ship, 400.0f); if (rel < 0) rel += 400.0f;
            w[k] = rel - 200.0f;
        }
        to_view(&v, w[0], w[1], w[2], o, 0);
        if (o[2] <= SCENE_NEAR) continue;
        float *dp = &s->pts[s->pt_count++ * SCENE_PT_STRIDE];
        dp[0] = o[0]; dp[1] = o[1]; dp[2] = o[2]; dp[3] = 0.25f * fade;
    }
    }
    /* route gates every 500 units */
    float z0 = ceilf(f->pz / 500.0f) * 500.0f;
    for (int g = 0; g < 7; g++) {
        float z = z0 + 500.0f * (float)g;
        if (z > f->route.length) break;
        draw_ring(s, &v, 0, 0, z, FL_CORRIDOR, 2, 8, SC_GUIDE);
    }
    /* destination planet */
    float pz = f->route.length + 700.0f;
    if (pz - f->pz < 9000.0f) {
        draw_ring(s, &v, 0, 0, pz, 450.0f, 2, 28, SC_PLANET);
        draw_ring(s, &v, 0, 0, pz, 450.0f, 1, 28, SC_PLANET);
        draw_ring(s, &v, 0, 0, pz, 450.0f, 0, 28, SC_PLANET);
    }
    /* Earth during ascent */
    draw_earth(s, &v, f);
    /* Moon and guide rings in the lunar zone */
    draw_moon(s, &v, f);
    draw_guide_rings(s, &v, f);
    /* rocks, contact markers and scanner contacts */
    for (int i = 0; i < f->rock_total; i++) {
        const Rock *k = &f->rocks[i];
        if (!k->alive) continue;
        float c[3]; to_view(&v, k->x, k->y, k->z, c, 1);
        float dist = sqrtf(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
        if (dist <= f->spec->sensor_range && s->con_count < FL_MAX_ROCKS) {
            float *d = &s->con[s->con_count++ * SCENE_CON_STRIDE];
            d[0] = c[0]; d[1] = c[1]; d[2] = c[2]; d[3] = 0.0f;
        }
        if (c[2] > SCENE_NEAR && c[2] < 3500.0f) {
            draw_rock(s, &v, k);
            if (c[2] > 150.0f && dist <= f->spec->sensor_range) {
                float m = k->r * 1.4f;
                float a[3] = { c[0] - m, c[1], c[2] }, b[3] = { c[0], c[1] + m, c[2] },
                      cc[3] = { c[0] + m, c[1], c[2] }, d[3] = { c[0], c[1] - m, c[2] };
                add_seg(s, a, b, SC_CONTACT); add_seg(s, b, cc, SC_CONTACT);
                add_seg(s, cc, d, SC_CONTACT); add_seg(s, d, a, SC_CONTACT);
            }
        }
    }
    if (f->laser_flash > 0.0f) {
        float tip[3] = { 0.0f, 0.0f, 1500.0f };
        float l[3] = { -0.5f, -0.45f, 1.5f }, r[3] = { 0.5f, -0.45f, 1.5f };
        add_seg(s, l, tip, SC_LASER); add_seg(s, r, tip, SC_LASER);
    }
}
