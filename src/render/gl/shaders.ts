export const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_pos;
layout(location = 2) in vec2 a_size;
layout(location = 3) in float a_rotation;
layout(location = 4) in vec4 a_color;
layout(location = 5) in float a_shapeId;
layout(location = 6) in vec4 a_params;

uniform vec2 u_resolution;
uniform vec2 u_camPos;
uniform float u_zoom;
uniform vec2 u_shake;
uniform float u_time;

out vec2 v_uv;
out vec4 v_color;
out float v_shapeId;
out vec4 v_params;
out float v_birthTime;

void main() {
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  vec2 corner = a_corner * a_size * u_zoom;
  vec2 rotated = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
  vec2 screen = (a_pos - u_camPos) * u_zoom + 0.5 * u_resolution + u_shake + rotated;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_corner;
  v_color = a_color;
  v_shapeId = a_shapeId;
  v_params = a_params;
  v_birthTime = a_params.w;
}
`;

export const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_color;
in float v_shapeId;
in vec4 v_params;

uniform sampler2D u_noise;
uniform float u_time;

out vec4 fragColor;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdRing(vec2 p, float r, float w) {
  return abs(length(p) - r) - w;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdStar(vec2 p, float r, int n, float m) {
  float an = 3.14159265 / float(n);
  float en = 3.14159265 / m;
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.y, p.x), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * tan(an));
  return length(p) * sign(p.x);
}

float shapeAlpha(vec2 uv, float shapeId, vec4 params) {
  float d;
  int sid = int(shapeId + 0.5);
  if (sid == 0) {
    d = sdCircle(uv, 0.45);
  } else if (sid == 1) {
    d = sdCircle(uv, 0.5);
    float glow = exp(-max(d, 0.0) * 6.0);
    return glow * 0.9;
  } else if (sid == 2) {
    d = sdRing(uv, 0.42, params.x * 0.08 + 0.04);
  } else if (sid == 3) {
    d = sdRing(uv, params.y, params.x * 0.06 + 0.03);
  } else if (sid == 4) {
    d = sdStar(uv, 0.4, 5, 2.5);
  } else if (sid == 5) {
    float ang = atan(uv.y, uv.x);
    float r = length(uv);
    float sector = cos(floor(0.5 + ang / (3.14159265 / params.z)) * (3.14159265 / params.z) - ang) * r;
    d = sector - 0.38;
  } else if (sid == 6) {
    d = sdBox(uv * vec2(1.0, 2.5), vec2(0.08, 0.35));
  } else if (sid == 7) {
    float capR = max(params.x, 0.04);
    float halfLen = max(params.y, capR);
    float aspect = halfLen / capR;
    float circD = sdCircle(uv, capR);
    float capD = sdCapsule(uv, vec2(-halfLen, 0.0), vec2(halfLen, 0.0), capR);
    float blend = smoothstep(1.25, 2.5, aspect);
    d = mix(circD, capD, blend);
  } else if (sid == 8) {
    d = sdCapsule(uv, vec2(-params.y, 0.0), vec2(params.y, 0.0), 0.05);
  } else {
    vec2 nuv = uv * 2.0 + u_time * 0.1;
    float n = texture(u_noise, nuv * 0.5 + 0.5).r;
    d = sdCircle(uv, 0.35 + n * 0.15);
    d += (n - 0.5) * 0.2;
  }
  float aa = fwidth(d) * 1.5;
  return 1.0 - smoothstep(-aa, aa, d);
}

void main() {
  float alpha = shapeAlpha(v_uv, v_shapeId, v_params) * v_color.a;
  if (alpha < 0.004) discard;
  vec3 rgb = v_color.rgb * alpha;
  fragColor = vec4(rgb, alpha);
}
`;

/** Shape id constants shared between CPU and GPU. */
export const ShapeId = {
  DISC: 0,
  GLOW: 1,
  RING: 2,
  ANNULUS: 3,
  STAR: 4,
  NGON: 5,
  SHARD: 6,
  STREAK: 7,
  CAPSULE: 8,
  SMOKE: 9,
} as const;

export const FLOATS_PER_INSTANCE = 16;
export const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

export const BACKGROUND_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;

out vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const BACKGROUND_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec2 u_resolution;
uniform vec2 u_cameraPos;
uniform float u_cameraZoom;
uniform float u_time;
uniform float u_hexRadius;
uniform float u_initialRadius;
uniform vec2 u_hexCenter;
uniform int u_tier;
uniform float u_parallaxVoid;
uniform float u_lavaScroll;

out vec4 fragColor;

const vec3 VOID_COLOR = vec3(0.02, 0.01, 0.03);

vec2 worldPos(vec2 uv) {
  vec2 screen = vec2(uv.x, 1.0 - uv.y) * u_resolution;
  return u_cameraPos + (screen - u_resolution * 0.5) / u_cameraZoom;
}

// follow=1 is world-locked; follow=0 is screen-locked. Distant layers use low follow.
vec2 parallaxPos(vec2 world, float follow) {
  return mix(world - u_cameraPos, world, follow);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int maxOctaves) {
  float v = 0.0;
  float a = 0.5;
  float totalA = 0.0;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    if (i >= maxOctaves) break;
    v += a * noise2(p);
    totalA += a;
    p = rot * p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v / max(totalA, 0.001);
}

float hexSdf(vec2 p, float r) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

float bayer4(ivec2 p) {
  int m = (p.x & 3) * 4 + (p.y & 3);
  float[16] t = float[16](
    0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (t[m] + 0.5) / 16.0;
}

vec3 deepLayer(vec2 world) {
  vec2 p = parallaxPos(world, u_parallaxVoid) * 0.0015;
  float grid = 0.0;
  vec2 g = abs(fract(p * 0.08) - 0.5);
  grid = smoothstep(0.48, 0.5, min(g.x, g.y)) * 0.12;
  float stars = step(0.992, hash21(floor(p * 120.0))) * 0.55;
  return VOID_COLOR + vec3(grid + stars);
}

vec3 lavaLayer(vec2 world) {
  vec2 p = (world - u_hexCenter) * 0.0028;
  float t = u_time * u_lavaScroll;

  int octaves = (u_tier >= 2) ? 3 : ((u_tier == 1) ? 2 : 1);

  vec2 warp = vec2(
    noise2(p * 0.85 + vec2(cos(t * 0.7) * 0.4, sin(t * 0.5) * 0.4)),
    noise2(p * 0.85 + vec2(sin(t * 0.6) * 0.4, cos(t * 0.8) * 0.4) + vec2(3.1, 7.4))
  );
  vec2 q = p + (warp - 0.5) * 1.6;

  float ridge = 1.0 - abs(fbm(q * 2.2, octaves) * 2.0 - 1.0);
  float crackMask = pow(clamp(ridge, 0.0, 1.0), 5.5);

  float plateShape = smoothstep(0.35, 0.70, fbm(p * 0.45, 2));
  float plateCrust = mix(1.0, 0.18, plateShape);

  float microCrack = pow(clamp(1.0 - abs(noise2(q * 6.5) * 2.0 - 1.0), 0.0, 1.0), 4.0) * 0.35;

  const vec3 cObsidian = vec3(0.04, 0.015, 0.02);
  const vec3 cBasalt   = vec3(0.18, 0.04, 0.01);
  const vec3 cMagma    = vec3(0.85, 0.18, 0.01);
  const vec3 cOrange   = vec3(1.00, 0.45, 0.04);
  const vec3 cWhiteHot = vec3(1.40, 1.25, 0.75);

  float baseHeat = fbm(q * 0.8, 2) * plateCrust;
  vec3 col = mix(cObsidian, cBasalt, smoothstep(0.1, 0.4, baseHeat));
  col = mix(col, cMagma, smoothstep(0.45, 0.75, baseHeat));

  float totalCrack = clamp(crackMask + microCrack * (1.0 - plateShape), 0.0, 1.0);
  col = mix(col, cOrange, smoothstep(0.15, 0.65, totalCrack));
  col = mix(col, cWhiteHot, smoothstep(0.70, 0.98, totalCrack));

  float apothem = u_hexRadius * 0.8660254;
  float rimDist = hexSdf(world - u_hexCenter, apothem);
  float rimWidth = u_hexRadius * 0.09;
  float rimGlow = 1.0 - smoothstep(0.0, rimWidth, max(rimDist, 0.0));
  col += cOrange * rimGlow * 0.55;

  return col;
}

void main() {
  vec2 world = worldPos(v_uv);
  vec3 deep = deepLayer(world);
  vec3 lava = lavaLayer(world);
  float initApothem = u_initialRadius * 0.8660254;
  float distFromInitial = hexSdf(world - u_hexCenter, initApothem);
  float arenaFade = smoothstep(u_initialRadius * 0.6, u_initialRadius * 2.8, distFromInitial);
  vec3 rgb = mix(lava, deep, arenaFade);
  ivec2 px = ivec2(floor(v_uv * u_resolution));
  rgb += (bayer4(px) - 0.5) / 255.0;
  fragColor = vec4(rgb, 1.0);
}
`;
