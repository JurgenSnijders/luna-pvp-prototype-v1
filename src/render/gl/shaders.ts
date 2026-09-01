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
uniform float u_time;

out vec2 v_uv;
out vec4 v_color;
out float v_shapeId;
out vec4 v_params;
out float v_birthTime;

void main() {
  float c = cos(a_rotation);
  float s = sin(a_rotation);
  vec2 corner = a_corner * a_size;
  vec2 rotated = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
  vec2 clip = ((a_pos + rotated) / u_resolution) * 2.0 - 1.0;
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

export const BLOOM_THRESHOLD_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_source;
uniform float u_threshold;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_source, v_texCoord);
  float br = max(c.r, max(c.g, c.b));
  float contrib = max(br - u_threshold, 0.0) / max(br, 0.0001);
  fragColor = c * contrib;
}
`;

export const BLUR_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_source;
uniform vec2 u_direction;
uniform vec2 u_texelSize;
out vec4 fragColor;
void main() {
  vec4 sum = vec4(0.0);
  float w[5];
  w[0]=0.227027; w[1]=0.1945946; w[2]=0.1216216; w[3]=0.054054; w[4]=0.016216;
  sum += texture(u_source, v_texCoord) * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = u_direction * u_texelSize * float(i);
    sum += texture(u_source, v_texCoord + off) * w[i];
    sum += texture(u_source, v_texCoord - off) * w[i];
  }
  fragColor = sum;
}
`;

export const COMPOSITE_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomIntensity;
uniform float u_chroma;
out vec4 fragColor;
void main() {
  vec2 uv = v_texCoord;
  vec4 scene = texture(u_scene, uv);
  vec3 bloom = texture(u_bloom, uv).rgb * u_bloomIntensity;
  if (u_chroma > 0.0) {
    bloom.r += texture(u_bloom, uv + vec2(u_chroma, 0.0)).r * u_bloomIntensity * 0.3;
    bloom.b += texture(u_bloom, uv - vec2(u_chroma, 0.0)).b * u_bloomIntensity * 0.3;
  }
  vec3 rgb = scene.rgb + bloom;
  float bloomA = min(1.0, (bloom.r + bloom.g + bloom.b) * 0.333);
  fragColor = vec4(rgb, max(scene.a, bloomA));
}
`;

export const FULLSCREEN_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
out vec2 v_texCoord;
void main() {
  v_texCoord = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const CRT_SHADER = `#version 300 es
precision mediump float;

in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_scanlineIntensity;
uniform float u_scanlineDensity;
uniform float u_vignetteIntensity;
uniform float u_curvature;
uniform float u_chromaticAberration;
uniform float u_phosphorGridIntensity;
uniform float u_flickerIntensity;
uniform vec3 u_tintColor;
uniform float u_tintAmount;
uniform float u_contrast;
uniform float u_brightness;

out vec4 fragColor;

vec2 curve(vec2 uv, float k) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(6.0, 4.0);
  uv = uv + uv * offset * offset * k;
  return uv * 0.5 + 0.5;
}

void main() {
  vec2 uv = u_curvature > 0.0 ? curve(v_texCoord, u_curvature * 10.0) : v_texCoord;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    discard;
  }

  vec2 ca = vec2(u_chromaticAberration);
  float r = texture(u_texture, uv + ca).r;
  float g = texture(u_texture, uv).g;
  float b = texture(u_texture, uv - ca).b;
  vec3 color = vec3(r, g, b);
  float alpha = texture(u_texture, uv).a;

  float px = mod(floor(v_texCoord.x * u_resolution.x), 3.0);
  vec3 phosphorMask = vec3(
    px < 1.0 ? 1.0 + 0.2 * u_phosphorGridIntensity : 1.0 - 0.08 * u_phosphorGridIntensity,
    px >= 1.0 && px < 2.0 ? 1.0 + 0.15 * u_phosphorGridIntensity : 1.0 - 0.08 * u_phosphorGridIntensity,
    px >= 2.0 ? 1.0 + 0.2 * u_phosphorGridIntensity : 1.0 - 0.08 * u_phosphorGridIntensity
  );
  color *= phosphorMask;

  color = (color - 0.5) * u_contrast + 0.5 + (u_brightness - 1.0);
  if (u_tintAmount > 0.0) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 tinted = luma * u_tintColor;
    color = mix(color, tinted, u_tintAmount);
  }

  float scan = sin(v_texCoord.y * u_resolution.y * 3.14159 * u_scanlineDensity);
  float scanMul = 1.0 - u_scanlineIntensity * (0.5 + 0.5 * scan) * 0.5;

  vec2 vig = v_texCoord - 0.5;
  float vigMul = clamp(1.0 - dot(vig, vig) * u_vignetteIntensity * 3.0, 0.0, 1.0);

  float flicker = 1.0 + sin(u_time * 60.0) * u_flickerIntensity;
  color *= scanMul * vigMul * flicker;

  float crtOverlay = (1.0 - scanMul) * 0.35 + (1.0 - vigMul) * 0.5;
  float outAlpha = max(alpha, crtOverlay * max(u_scanlineIntensity, u_vignetteIntensity * 0.5));

  fragColor = vec4(color, outAlpha);
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
