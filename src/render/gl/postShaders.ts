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

export const RETRO_SHADER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_source;
uniform vec2 u_effectResolution;
uniform float u_pixelSize;
uniform float u_paletteMix;
uniform int u_paletteSize;
uniform vec3 u_palette[16];
uniform float u_dither;
out vec4 fragColor;

float bayer4(ivec2 p) {
  int m = (p.x & 3) * 4 + (p.y & 3);
  float[16] t = float[16](
    0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (t[m] + 0.5) / 16.0;
}

void main() {
  vec2 grid = u_effectResolution / max(u_pixelSize, 1.0);
  vec2 snapped = (floor(v_texCoord * grid) + 0.5) / grid;
  vec3 col = texture(u_source, snapped).rgb;
  ivec2 px = ivec2(floor(v_texCoord * grid));
  col += (bayer4(px) - 0.5) * u_dither * 0.15;
  if (u_paletteMix > 0.0 && u_paletteSize > 0) {
    vec3 best = u_palette[0];
    float bestD = 1e10;
    for (int i = 0; i < 16; i++) {
      if (i >= u_paletteSize) break;
      float d = dot(col - u_palette[i], col - u_palette[i]);
      if (d < bestD) { bestD = d; best = u_palette[i]; }
    }
    col = mix(col, best, u_paletteMix);
  }
  fragColor = vec4(col, 1.0);
}
`;

export const REACTIVE_SHADER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_source;
uniform float u_time;
uniform float u_blur;
uniform float u_glitch;
uniform float u_glitchSlices;
uniform float u_glitchChroma;
uniform float u_shock;
uniform float u_shockRadius;
uniform float u_shockWidth;
uniform float u_shockU;
uniform float u_shockV;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_texCoord;
  vec2 baseUv = uv;

  vec2 toHit = uv - vec2(u_shockU, u_shockV);
  float d = length(toHit);
  float band = smoothstep(u_shockRadius - u_shockWidth, u_shockRadius, d)
             * (1.0 - smoothstep(u_shockRadius, u_shockRadius + u_shockWidth, d));
  uv += normalize(toHit + 1e-5) * band * u_shock;

  float slice = floor(uv.y * u_glitchSlices);
  float j = (hash21(vec2(slice, floor(u_time * 60.0))) - 0.5) * 2.0;
  uv.x += j * u_glitch * 0.04;

  vec2 dir = uv - 0.5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec2 s = uv - dir * u_blur * float(i) / 7.0;
    bool inside = all(greaterThanEqual(s, vec2(0.0))) && all(lessThanEqual(s, vec2(1.0)));
    vec2 sampleUv = inside ? s : baseUv;
    vec3 t = texture(u_source, sampleUv).rgb;
    vec2 chromaOff = vec2(u_glitch * u_glitchChroma * 0.01, 0.0);
    t.r = texture(u_source, inside ? s + chromaOff : baseUv).r;
    t.b = texture(u_source, inside ? s - chromaOff : baseUv).b;
    col += t;
  }
  fragColor = vec4(col / 8.0, 1.0);
}
`;

export const STREAK_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_length;
out vec4 fragColor;
void main() {
  float w[5];
  w[0] = 0.227027;
  w[1] = 0.1945946;
  w[2] = 0.1216216;
  w[3] = 0.054054;
  w[4] = 0.016216;
  vec4 sum = texture(u_source, v_texCoord) * w[0];
  for (int i = 1; i < 5; i++) {
    float off = float(i) * u_length * u_texelSize.x;
    sum += texture(u_source, v_texCoord + vec2(off, 0.0)) * w[i];
    sum += texture(u_source, v_texCoord - vec2(off, 0.0)) * w[i];
  }
  fragColor = sum;
}
`;

export const CRT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_texCoord;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_streak;
uniform sampler3D u_lut;
uniform vec2 u_effectResolution;
uniform float u_bloomIntensity;
uniform float u_hasBloom;
uniform float u_hasStreak;
uniform float u_streakIntensity;
uniform float u_lutMix;
uniform float u_saturation;
uniform float u_contrast;
uniform float u_scanline;
uniform float u_curvature;
uniform float u_vignette;
uniform float u_phosphor;
uniform vec3 u_tintColor;
uniform float u_tintAmount;
uniform float u_brightness;
uniform float u_maskType;
uniform float u_halation;
uniform float u_beamBlur;
uniform float u_convergence;
out vec4 fragColor;

vec3 sampleComposite(vec2 suv) {
  vec3 sceneCol = texture(u_scene, suv).rgb;
  vec3 bloomCol = u_hasBloom > 0.5 ? texture(u_bloom, suv).rgb * u_bloomIntensity : vec3(0.0);
  vec3 streakCol = u_hasStreak > 0.5 ? texture(u_streak, suv).rgb * u_streakIntensity : vec3(0.0);
  return min(vec3(1.0), sceneCol + bloomCol + streakCol);
}

vec3 convergedComposite(vec2 suv) {
  if (u_convergence <= 0.0) {
    return sampleComposite(suv);
  }
  vec2 offset = (suv - 0.5) * u_convergence / u_effectResolution;
  vec3 col;
  col.r = sampleComposite(suv + offset).r;
  col.g = sampleComposite(suv).g;
  col.b = sampleComposite(suv - offset).b;
  return col;
}

vec3 phosphorMaskAt(vec2 suv, float maskType) {
  float px = floor(suv.x * u_effectResolution.x);
  float py = floor(suv.y * u_effectResolution.y);
  if (maskType < 0.5) {
    return vec3(
      0.8 + 0.2 * step(0.5, mod(px, 3.0)),
      0.8 + 0.2 * step(0.5, mod(px + 1.0, 3.0)),
      0.8 + 0.2 * step(0.5, mod(px + 2.0, 3.0))
    );
  }
  if (maskType < 1.5) {
    float rowOffset = mod(py, 2.0);
    return vec3(
      0.8 + 0.2 * step(0.5, mod(px + rowOffset, 3.0)),
      0.8 + 0.2 * step(0.5, mod(px + rowOffset + 1.0, 3.0)),
      0.8 + 0.2 * step(0.5, mod(px + rowOffset + 2.0, 3.0))
    );
  }
  float cell = mod(px + py * 2.0, 3.0);
  return mix(
    mix(vec3(1.0, 0.8, 0.8), vec3(0.8, 1.0, 0.8), step(1.0, cell)),
    vec3(0.8, 0.8, 1.0),
    step(2.0, cell)
  );
}

vec2 barrelDistort(vec2 uv, float k) {
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  return uv + cc * r2 * k;
}

void main() {
  vec2 uv = barrelDistort(v_texCoord, u_curvature);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 rgb = convergedComposite(uv);

  if (u_beamBlur > 0.0) {
    float dx = u_beamBlur / u_effectResolution.x;
    rgb = convergedComposite(uv - vec2(dx, 0.0)) * 0.25
        + convergedComposite(uv) * 0.5
        + convergedComposite(uv + vec2(dx, 0.0)) * 0.25;
  }

  if (u_halation > 0.0 && u_hasBloom > 0.5) {
    rgb += texture(u_bloom, uv + vec2(0.0, 1.0 / u_effectResolution.y)).rgb * u_halation;
    rgb = min(rgb, vec3(1.0));
  }

  if (u_phosphor > 0.0) {
    vec3 phosphorMask = phosphorMaskAt(uv, u_maskType);
    float phosphorMean = 1.0 - 0.033333333 * u_phosphor;
    rgb = mix(rgb, rgb * phosphorMask, u_phosphor);
    rgb /= phosphorMean;
  }

  if (u_tintAmount > 0.0) {
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(rgb, luma * u_tintColor, u_tintAmount);
  }

  {
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3(luma), rgb, u_saturation);
    rgb = (rgb - 0.5) * u_contrast + 0.5;
    if (u_lutMix > 0.0) {
      float scale = 15.0 / 16.0;
      float offset = 0.5 / 16.0;
      vec3 coord = clamp(rgb, 0.0, 1.0) * scale + offset;
      rgb = mix(rgb, texture(u_lut, coord).rgb, u_lutMix);
    }
  }

  float scan = sin(uv.y * u_effectResolution.y * 3.14159265);
  float scanMask = 1.0 - u_scanline * 0.5 * (0.5 + 0.5 * scan);
  if (u_scanline > 0.0) {
    rgb *= scanMask / (1.0 - 0.25 * u_scanline);
  }

  float r = length(uv * 2.0 - 1.0) * 0.70710678;
  rgb *= 1.0 - u_vignette * smoothstep(0.4, 1.0, r);

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
