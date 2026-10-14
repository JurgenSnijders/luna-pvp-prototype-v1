export const SHADOW_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;

uniform vec2 u_resolution;
uniform vec2 u_camPos;
uniform float u_zoom;
uniform vec2 u_shake;

void main() {
  vec2 screen = (a_pos - u_camPos) * u_zoom + 0.5 * u_resolution + u_shake;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

export const LIGHT_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_center;
layout(location = 2) in float a_radius;
layout(location = 3) in vec3 a_rgb;
layout(location = 4) in float a_intensity;
layout(location = 5) in float a_falloff;

uniform vec2 u_resolution;
uniform vec2 u_camPos;
uniform float u_zoom;
uniform vec2 u_shake;
uniform float u_lightScale;

out vec2 v_local;
out vec3 v_rgb;
out float v_intensity;
out float v_falloff;

void main() {
  vec2 world = a_center + a_corner * a_radius;
  vec2 screen = (world - u_camPos) * u_zoom + 0.5 * u_resolution + u_shake;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = a_corner;
  v_rgb = a_rgb;
  v_intensity = a_intensity * u_lightScale;
  v_falloff = a_falloff;
}
`;

export const LIGHT_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec2 v_local;
in vec3 v_rgb;
in float v_intensity;
in float v_falloff;

out vec4 fragColor;

void main() {
  float d2 = dot(v_local, v_local);
  if (d2 > 1.0) discard;
  float t = 1.0 - d2;
  float atten = pow(t, v_falloff);
  vec3 rgb = v_rgb * v_intensity * atten;
  float l = min(length(rgb), 4.0);
  rgb *= l / max(length(rgb), 1e-4);
  fragColor = vec4(rgb, 1.0);
}
`;

/** Flat-top hex lava rim in world space (matches HexMath.isInsideHex distance). */
export const LAVA_LIGHT_VERTEX = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const LAVA_LIGHT_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec2 u_resolution;
uniform vec2 u_camPos;
uniform float u_zoom;
uniform vec2 u_shake;
uniform vec2 u_hexCenter;
uniform float u_hexRadius;
uniform float u_lavaGlow;
uniform float u_lavaRange;
uniform float u_lightScale;

out vec4 fragColor;

const float HALF_SQRT3 = 0.8660254037844386;

float hexInside(vec2 p, vec2 center, float radius) {
  vec2 d = abs(p - center);
  float apothem = radius * HALF_SQRT3;
  if (d.y > apothem) return 0.0;
  if (HALF_SQRT3 * d.x + 0.5 * d.y > apothem) return 0.0;
  return 1.0;
}

float hexEdgeDist(vec2 p, vec2 center, float radius) {
  vec2 d = abs(p - center);
  float apothem = radius * HALF_SQRT3;
  float edgeY = apothem - d.y;
  float edgeX = apothem - (HALF_SQRT3 * d.x + 0.5 * d.y);
  return min(edgeY, edgeX);
}

void main() {
  vec2 screen = v_uv * u_resolution;
  vec2 world = (screen - 0.5 * u_resolution - u_shake) / u_zoom + u_camPos;
  float inside = hexInside(world, u_hexCenter, u_hexRadius);
  float dist = hexEdgeDist(world, u_hexCenter, u_hexRadius);
  float glow = 0.0;
  if (inside < 0.5) {
    glow = 1.0;
  } else {
    glow = 1.0 - smoothstep(0.0, u_lavaRange, dist);
  }
  vec3 lava = vec3(1.0, 0.35, 0.08) * u_lavaGlow * u_lightScale * glow;
  float l = min(length(lava), 4.0);
  lava *= l / max(length(lava), 1e-4);
  fragColor = vec4(lava, 1.0);
}
`;
