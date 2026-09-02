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
    d = sdCapsule(uv, vec2(-0.4, 0.0), vec2(0.4, 0.0), 0.06);
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
