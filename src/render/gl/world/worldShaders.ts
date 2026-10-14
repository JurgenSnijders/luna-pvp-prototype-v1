export const WORLD_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_color;
layout(location = 2) in vec2 a_uv;
layout(location = 3) in vec2 a_mode;
layout(location = 4) in vec4 a_paint;
uniform vec2 u_resolution;
out vec2 v_pos;
out vec4 v_color;
out vec2 v_uv;
flat out vec2 v_mode;
flat out vec4 v_paint;
void main() {
  v_pos = a_pos;
  v_color = a_color;
  v_uv = a_uv;
  v_mode = a_mode;
  v_paint = a_paint;
  vec2 clip = a_pos / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

/** Output is premultiplied; mode 0 solid, 1 atlas, 2 linear ramp, 3 radial ramp. */
export const WORLD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision mediump sampler2D;
in vec2 v_pos;
in vec4 v_color;
in vec2 v_uv;
flat in vec2 v_mode;
flat in vec4 v_paint;
uniform sampler2D u_atlas;
uniform sampler2D u_ramp;
out vec4 fragColor;
void main() {
  float mode = v_mode.x;
  if (mode < 0.5) {
    fragColor = v_color;
    return;
  }
  if (mode < 1.5) {
    fragColor = texture(u_atlas, v_uv) * v_color.a;
    return;
  }
  float t;
  if (mode < 2.5) {
    vec2 d = v_paint.zw - v_paint.xy;
    t = dot(v_pos - v_paint.xy, d) / max(dot(d, d), 1e-6);
  } else {
    t = (length(v_pos - v_paint.xy) - v_paint.z) / max(v_paint.w - v_paint.z, 1e-6);
  }
  t = clamp(t, 0.0, 1.0);
  fragColor = texture(u_ramp, vec2(t * (255.0 / 256.0) + 0.5 / 256.0, v_mode.y)) * v_color.a;
}
`;

/** Premultiplied texture copy; `u_flipY` samples canvas uploads the right way up. */
export const WORLD_BLIT_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in vec2 v_texCoord;
uniform sampler2D u_source;
out vec4 fragColor;
void main() {
  fragColor = texture(u_source, v_texCoord);
}
`;
