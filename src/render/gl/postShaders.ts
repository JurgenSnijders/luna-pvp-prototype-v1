export const BLOOM_THRESHOLD_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_source;
uniform float u_threshold;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_source, v_texCoord);
  // Luminance, not max(rgb): lava is high-red but dim, neon cores are actually bright.
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float contrib = max(lum - u_threshold, 0.0) / max(lum, 0.0001);
  fragColor = vec4(c.rgb * contrib, 0.0);
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
  fragColor = vec4(rgb, scene.a);
}
`;

/** Premultiplied VFX over the Canvas2D world, written opaque for bloom + CRT. */
export const OPAQUE_COMPOSITE_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_world;
uniform sampler2D u_vfx;
out vec4 fragColor;
void main() {
  vec4 world = texture(u_world, v_texCoord);
  vec4 vfx = texture(u_vfx, v_texCoord);
  fragColor = vec4(world.rgb * (1.0 - vfx.a) + vfx.rgb, 1.0);
}
`;

export const PERSISTENCE_SHADER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_current;
uniform sampler2D u_history;
uniform float u_decay;
uniform float u_persistThreshold;
uniform vec2 u_reproject;
out vec4 fragColor;
void main() {
  vec3 cur = texture(u_current, v_texCoord).rgb;
  vec2 hUv = v_texCoord + u_reproject;
  vec3 prev = texture(u_history, hUv).rgb * u_decay;
  float luma = dot(prev, vec3(0.2126, 0.7152, 0.0722));
  prev *= step(u_persistThreshold, luma);
  bool inside = all(greaterThanEqual(hUv, vec2(0.0))) && all(lessThanEqual(hUv, vec2(1.0)));
  fragColor = vec4(inside ? max(cur, prev) : cur, 1.0);
}
`;

export const CRT_SHADER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform vec2 u_effectResolution;
uniform float u_bloomIntensity;
uniform float u_hasBloom;
uniform float u_scanline;
uniform float u_curvature;
uniform float u_vignette;
uniform float u_phosphor;
uniform vec3 u_tintColor;
uniform float u_tintAmount;
uniform float u_brightness;
uniform float u_time;
uniform float u_rollIntensity;
uniform float u_rollSpeed;
uniform float u_rollWidth;
uniform float u_jitterAmount;
uniform float u_jitterLines;
uniform float u_jitterSpeed;
uniform float u_grainAmount;
uniform float u_grainDarkBias;
uniform float u_trackFrequency;
uniform float u_trackHeight;
uniform float u_trackShift;
uniform float u_trackDesaturate;
out vec4 fragColor;

vec2 barrelDistort(vec2 uv, float k) {
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  return uv + cc * r2 * k;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_texCoord;

  float trackMask = 0.0;
  if (u_trackFrequency > 0.0) {
    float bandY = fract(uv.y * mix(5.0, 40.0, u_trackFrequency) + u_time * 0.1);
    trackMask = smoothstep(0.0, u_trackHeight, bandY)
              * (1.0 - smoothstep(u_trackHeight, u_trackHeight * 2.0, bandY));
  }

  if (u_jitterAmount > 0.0) {
    float lineIdx = floor(uv.y * u_jitterLines);
    float jitter = (hash21(vec2(lineIdx, floor(u_time * u_jitterSpeed))) - 0.5) * 2.0;
    uv.x += jitter * u_jitterAmount / u_effectResolution.x;
  }

  if (u_trackFrequency > 0.0) {
    uv.x += trackMask * u_trackShift / u_effectResolution.x;
  }

  uv = barrelDistort(uv, u_curvature);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 base = texture(u_scene, uv).rgb;
  vec3 bloomCol = u_hasBloom > 0.5 ? texture(u_bloom, uv).rgb * u_bloomIntensity : vec3(0.0);
  vec3 rgb = min(vec3(1.0), base + bloomCol);

  float px = uv.x * u_effectResolution.x;
  vec3 phosphorMask = vec3(
    0.8 + 0.2 * step(0.5, mod(px, 3.0)),
    0.8 + 0.2 * step(0.5, mod(px + 1.0, 3.0)),
    0.8 + 0.2 * step(0.5, mod(px + 2.0, 3.0))
  );
  float phosphorMean = 1.0 - 0.033333333 * u_phosphor;
  rgb = mix(rgb, rgb * phosphorMask, u_phosphor);
  if (u_phosphor > 0.0) {
    rgb /= phosphorMean;
  }

  if (u_tintAmount > 0.0) {
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(rgb, luma * u_tintColor, u_tintAmount);
  }

  float scan = sin(uv.y * u_effectResolution.y * 3.14159265);
  float scanMask = 1.0 - u_scanline * 0.5 * (0.5 + 0.5 * scan);
  if (u_scanline > 0.0) {
    rgb *= scanMask / (1.0 - 0.25 * u_scanline);
  }

  float r = length(uv * 2.0 - 1.0) * 0.70710678;
  rgb *= 1.0 - u_vignette * smoothstep(0.4, 1.0, r);

  if (u_rollIntensity > 0.0) {
    float rollPos = fract(uv.y + u_time * u_rollSpeed);
    float rollBand = smoothstep(0.0, u_rollWidth, rollPos)
                   * (1.0 - smoothstep(u_rollWidth, u_rollWidth * 2.0, rollPos));
    rgb *= 1.0 + u_rollIntensity * rollBand;
  }

  if (u_trackFrequency > 0.0 && trackMask > 0.0) {
    float tluma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(rgb, vec3(tluma), trackMask * u_trackDesaturate);
  }

  if (u_grainAmount > 0.0) {
    float glum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float gn = hash21(uv * u_effectResolution + vec2(u_time * 60.0));
    rgb += (gn - 0.5) * u_grainAmount * mix(1.0, 1.0 - glum, u_grainDarkBias);
  }

  rgb *= u_brightness;

  fragColor = vec4(max(rgb, vec3(0.0)), 1.0);
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
