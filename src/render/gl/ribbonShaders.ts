export const RIBBON_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_across;
layout(location = 2) in float a_along;
layout(location = 3) in vec4 a_color;

uniform vec2 u_resolution;
uniform vec2 u_camPos;
uniform float u_zoom;
uniform vec2 u_shake;

out float v_across;
out float v_along;
out vec4 v_color;

void main() {
  vec2 screen = (a_pos - u_camPos) * u_zoom + 0.5 * u_resolution + u_shake;
  vec2 clip = (screen / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_across = a_across;
  v_along = a_along;
  v_color = a_color;
}
`;

export const RIBBON_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in float v_across;
in float v_along;
in vec4 v_color;

out vec4 fragColor;

void main() {
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(v_across));
  float core = exp(-v_across * v_across * 6.0);
  float a = v_color.a * edge * v_along;
  vec3 rgb = v_color.rgb * (0.6 + 0.4 * core) * a;
  fragColor = vec4(rgb, a);
}
`;
