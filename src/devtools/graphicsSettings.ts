import {
  POST_EFFECTS,
  POST_EFFECT_IDS,
  type PostEffectId,
  type StreakTarget,
  resolveStreakTarget,
  tierMeetsMinimum,
} from '../render/gl/postEffects';
import {
  DEFAULT_BLUR_HALF_LIFE,
  DEFAULT_GLITCH_HALF_LIFE,
  DEFAULT_HEAVY_PULSE,
  DEFAULT_LIGHT_PULSE,
  DEFAULT_SHOCK_DURATION,
  type ReactiveFxTuning,
} from '../render/gl/reactiveFx';
import {
  STYLE_PRESETS,
  type StylePresetId,
  isStylePresetId,
} from '../render/presets/stylePresets';
import { type CrosshairStyleId, isCrosshairStyleId } from '../ui/crosshairPresets';

export interface PostEffectState {
  enabled: boolean;
  params: Record<string, number>;
}

export const STORAGE_KEY_GRAPHICS = 'LUNA_GRAPHICS_SETTINGS';

export type QualityTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA' | 'AUTO';

export interface GraphicsSettings {
  tier: QualityTier;
  webglBackground: boolean;
  floorSubGrid: boolean;
  ambientEmbers: boolean;
  particleTrails: boolean;
  bloomEnabled: boolean;
  refractionEnabled: boolean;
  screenShakeIntensity: number;
  manualTierOverride: boolean;
  crtEnabled: boolean;
  crtScanlineIntensity: number;
  crtCurvature: number;
  crtVignette: number;
  crtPhosphor: number;
  crtBrightness: number;
  bloomIntensity: number;
  bloomThreshold: number;
  arcadeBezel: boolean;
  /** 0 = screen-locked, 1 = world-locked camera follow for the void/star layer. */
  bgParallaxVoid: number;
  /** 0 = screen-locked, 1 = world-locked camera follow for the lava sea. */
  bgParallaxLava: number;
  /** Time multiplier for lava vein drift. */
  bgLavaScrollSpeed: number;
  activePreset: StylePresetId;
  crosshairStyle: CrosshairStyleId;
  postEffects: Record<string, PostEffectState>;
}

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  tier: 'HIGH',
  webglBackground: true,
  floorSubGrid: true,
  ambientEmbers: true,
  particleTrails: true,
  bloomEnabled: true,
  refractionEnabled: false,
  screenShakeIntensity: 1,
  manualTierOverride: false,
  crtEnabled: true,
  crtScanlineIntensity: 0.35,
  crtCurvature: 0.12,
  crtVignette: 0.45,
  crtPhosphor: 0.25,
  crtBrightness: 1.0,
  bloomIntensity: 0.8,
  bloomThreshold: 0.6,
  arcadeBezel: true,
  bgParallaxVoid: 0.18,
  bgParallaxLava: 0.32,
  bgLavaScrollSpeed: 0.18,
  activePreset: 'CYBER_NEON',
  crosshairStyle: 'TACTICAL',
  postEffects: {},
};

export interface TierLimits {
  particleBudget: number;
  dprCap: number;
  bloomPasses: number;
  bloomResolution: number;
  refraction: boolean;
  trailDensity: number;
  maxPrimitives: number;
  groundDecals: boolean;
}

/**
 * CRT knobs after tier clamping. `webglCrt` and `cssOverlay` are mutually
 * exclusive so the two CRT paths can never stack on screen.
 */
export interface EffectiveCrtSettings {
  crtEnabled: boolean;
  webglCrt: boolean;
  cssOverlay: boolean;
  scanlineIntensity: number;
  curvature: number;
  vignette: number;
  phosphor: number;
  maskType: number;
  bloomIntensity: number;
  bloomThreshold: number;
  arcadeBezel: boolean;
  tintColor: [number, number, number];
  tintAmount: number;
  brightness: number;
  effectUniforms: Record<string, number>;
  persistence: { enabled: boolean; decay: number; threshold: number };
  retro: {
    enabled: boolean;
    pixelSize: number;
    paletteId: number;
    paletteMix: number;
    dither: number;
  };
  reactive: ReactiveFxTuning & {
    enabled: boolean;
    blurAmount: number;
    shockStrength: number;
    shockSpeed: number;
    shockWidth: number;
    glitchAmount: number;
    glitchSlices: number;
    glitchChroma: number;
  };
  grade: {
    streakIntensity: number;
    streakLength: number;
    streakTarget: StreakTarget;
    lutEnabled: boolean;
    lutId: number;
    lutMix: number;
    saturation: number;
    contrast: number;
  };
}

const TIER_LIMITS: Record<Exclude<QualityTier, 'AUTO'>, TierLimits> = {
  LOW: {
    particleBudget: 1024,
    dprCap: 1.0,
    bloomPasses: 0,
    bloomResolution: 0.25,
    refraction: false,
    trailDensity: 0.5,
    maxPrimitives: 64,
    groundDecals: false,
  },
  MEDIUM: {
    particleBudget: 4096,
    dprCap: 1.0,
    bloomPasses: 1,
    bloomResolution: 0.25,
    refraction: false,
    trailDensity: 0.8,
    maxPrimitives: 256,
    groundDecals: true,
  },
  HIGH: {
    particleBudget: 16384,
    dprCap: 1.5,
    bloomPasses: 2,
    bloomResolution: 0.5,
    refraction: false,
    trailDensity: 1.0,
    maxPrimitives: 1024,
    groundDecals: true,
  },
  ULTRA: {
    particleBudget: 65536,
    dprCap: 999,
    bloomPasses: 2,
    bloomResolution: 0.5,
    refraction: true,
    trailDensity: 1.4,
    maxPrimitives: 4096,
    groundDecals: true,
  },
};

let cache: GraphicsSettings | null = null;
let effectiveTier: Exclude<QualityTier, 'AUTO'> = 'HIGH';
const listeners = new Set<() => void>();

export function getEffectiveTier(): Exclude<QualityTier, 'AUTO'> {
  const s = getGraphicsSettings();
  if (s.tier === 'AUTO') return effectiveTier;
  return s.tier;
}

export function setAdaptiveEffectiveTier(tier: Exclude<QualityTier, 'AUTO'>): void {
  if (!getGraphicsSettings().manualTierOverride && getGraphicsSettings().tier === 'AUTO') {
    effectiveTier = tier;
  }
}

export function getTierLimits(): TierLimits {
  const tier = getEffectiveTier();
  const base = TIER_LIMITS[tier];
  const s = getGraphicsSettings();
  return {
    ...base,
    refraction: base.refraction && s.refractionEnabled,
    bloomPasses: s.bloomEnabled ? base.bloomPasses : 0,
  };
}

export function areGroundDecalsEnabled(): boolean {
  return getTierLimits().groundDecals;
}

export function getEffectiveDprCap(): number {
  const cap = getTierLimits().dprCap;
  const native = window.devicePixelRatio || 1;
  return Math.min(native, cap);
}

function getActivePresetCrt() {
  const preset = STYLE_PRESETS[getGraphicsSettings().activePreset];
  return preset.crt;
}

function getPostEffectState(id: PostEffectId): PostEffectState | undefined {
  return getGraphicsSettings().postEffects[id];
}

export function getPostEffectUserEnabled(id: PostEffectId): boolean {
  const state = getPostEffectState(id);
  return state?.enabled ?? POST_EFFECTS[id].defaultEnabled;
}

export function isPostEffectTierAvailable(id: PostEffectId): boolean {
  return tierMeetsMinimum(getEffectiveTier(), POST_EFFECTS[id].minTier);
}

export function getPostEffectConflictReason(id: PostEffectId): PostEffectId | null {
  if (!getPostEffectUserEnabled(id)) return null;
  const def = POST_EFFECTS[id];
  for (const otherId of def.conflictsWith) {
    if (getPostEffectUserEnabled(otherId) && isPostEffectTierAvailable(otherId)) {
      return otherId;
    }
  }
  return null;
}

export function isPostEffectEnabled(id: PostEffectId): boolean {
  if (!getPostEffectUserEnabled(id)) return false;
  if (!isPostEffectTierAvailable(id)) return false;
  if (getPostEffectConflictReason(id)) return false;
  return true;
}

export function getPostEffectParam(id: PostEffectId, paramKey: string): number {
  const def = POST_EFFECTS[id];
  const param = def.params.find((p) => p.key === paramKey);
  if (!param) return 0;
  if (param.storage.kind === 'legacy') {
    const s = getGraphicsSettings();
    return s[param.storage.key] as number;
  }
  const state = getPostEffectState(id);
  return state?.params[paramKey] ?? param.defaultValue;
}

export function setPostEffectEnabled(id: PostEffectId, enabled: boolean): void {
  const s = getGraphicsSettings();
  const current = s.postEffects[id] ?? {
    enabled: POST_EFFECTS[id].defaultEnabled,
    params: {},
  };
  saveGraphicsSettings({
    ...s,
    postEffects: {
      ...s.postEffects,
      [id]: { ...current, enabled },
    },
  });
}

export function setPostEffectParam(id: PostEffectId, paramKey: string, value: number): void {
  const def = POST_EFFECTS[id];
  const param = def.params.find((p) => p.key === paramKey);
  if (!param) return;

  if (param.storage.kind === 'legacy') {
    saveGraphicsSettings({ ...getGraphicsSettings(), [param.storage.key]: value });
    return;
  }

  const s = getGraphicsSettings();
  const current = s.postEffects[id] ?? {
    enabled: POST_EFFECTS[id].defaultEnabled,
    params: {},
  };
  saveGraphicsSettings({
    ...s,
    postEffects: {
      ...s.postEffects,
      [id]: {
        ...current,
        params: { ...current.params, [paramKey]: value },
      },
    },
  });
}

export function getEffectUniforms(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of POST_EFFECT_IDS) {
    const def = POST_EFFECTS[id];
    if ((def.pass ?? 'CRT') !== 'CRT') continue;
    const active = isPostEffectEnabled(id);
    for (const param of def.params) {
      if (!param.uniform) continue;
      const neutralised = !active && param.key === def.masterParam;
      out[param.uniform] = neutralised ? 0 : getPostEffectParam(id, param.key);
    }
  }
  return out;
}

function resolveScanlineIntensity(): number {
  if (!isPostEffectEnabled('SCANLINES')) return 0;
  return getPostEffectParam('SCANLINES', 'intensity');
}

function resolveCurvature(): number {
  if (!isPostEffectEnabled('CURVATURE')) return 0;
  return getPostEffectParam('CURVATURE', 'intensity');
}

function resolveVignette(): number {
  if (!isPostEffectEnabled('VIGNETTE')) return 0;
  return getPostEffectParam('VIGNETTE', 'intensity');
}

function resolvePhosphor(): number {
  if (!isPostEffectEnabled('PHOSPHOR')) return 0;
  return getPostEffectParam('PHOSPHOR', 'intensity');
}

function resolveMaskType(): number {
  return getPostEffectParam('PHOSPHOR', 'type');
}

function resolveTintAmount(presetAmount: number): number {
  if (!isPostEffectEnabled('TINT')) return 0;
  return presetAmount;
}

function resolvePersistence(): { enabled: boolean; decay: number; threshold: number } {
  const enabled = isPostEffectEnabled('PERSISTENCE');
  return {
    enabled,
    decay: enabled ? getPostEffectParam('PERSISTENCE', 'decay') : 0.85,
    threshold: enabled ? getPostEffectParam('PERSISTENCE', 'threshold') : 0,
  };
}

function resolveRetro(): {
  enabled: boolean;
  pixelSize: number;
  paletteId: number;
  paletteMix: number;
  dither: number;
} {
  const pixelate = isPostEffectEnabled('PIXELATE');
  const palette = isPostEffectEnabled('PALETTE');
  const ditherOn = isPostEffectEnabled('DITHER');
  return {
    enabled: pixelate || palette || ditherOn,
    pixelSize: pixelate ? getPostEffectParam('PIXELATE', 'size') : 1,
    paletteId: getPostEffectParam('PALETTE', 'id'),
    paletteMix: palette ? getPostEffectParam('PALETTE', 'mix') : 0,
    dither: ditherOn ? getPostEffectParam('DITHER', 'amount') : 0,
  };
}

function resolveReactive(): EffectiveCrtSettings['reactive'] {
  const blurOn = isPostEffectEnabled('RADIAL_BLUR');
  const shockOn = isPostEffectEnabled('SHOCKWAVE');
  const glitchOn = isPostEffectEnabled('HIT_GLITCH');
  return {
    enabled: blurOn || shockOn || glitchOn,
    blurAmount: blurOn ? getPostEffectParam('RADIAL_BLUR', 'amount') : 0,
    blurHalfLife: getPostEffectParam('RADIAL_BLUR', 'halfLife'),
    blurLight: getPostEffectParam('RADIAL_BLUR', 'light'),
    blurHeavy: getPostEffectParam('RADIAL_BLUR', 'heavy'),
    shockStrength: shockOn ? getPostEffectParam('SHOCKWAVE', 'strength') : 0,
    shockSpeed: getPostEffectParam('SHOCKWAVE', 'speed'),
    shockWidth: getPostEffectParam('SHOCKWAVE', 'width'),
    shockDuration: getPostEffectParam('SHOCKWAVE', 'duration'),
    shockLight: getPostEffectParam('SHOCKWAVE', 'light'),
    shockHeavy: getPostEffectParam('SHOCKWAVE', 'heavy'),
    glitchAmount: glitchOn ? getPostEffectParam('HIT_GLITCH', 'amount') : 0,
    glitchSlices: getPostEffectParam('HIT_GLITCH', 'slices'),
    glitchChroma: getPostEffectParam('HIT_GLITCH', 'chroma'),
    glitchHalfLife: getPostEffectParam('HIT_GLITCH', 'halfLife'),
    glitchLight: getPostEffectParam('HIT_GLITCH', 'light'),
    glitchHeavy: getPostEffectParam('HIT_GLITCH', 'heavy'),
  };
}

function resolveGrade(): {
  streakIntensity: number;
  streakLength: number;
  streakTarget: StreakTarget;
  lutEnabled: boolean;
  lutId: number;
  lutMix: number;
  saturation: number;
  contrast: number;
} {
  const anamorphicOn = isPostEffectEnabled('ANAMORPHIC');
  const lutOn = isPostEffectEnabled('LUT');
  const streakTarget = resolveStreakTarget(getPostEffectParam('ANAMORPHIC', 'target'));
  return {
    streakIntensity: anamorphicOn ? getPostEffectParam('ANAMORPHIC', 'intensity') : 0,
    streakLength: getPostEffectParam('ANAMORPHIC', 'length'),
    streakTarget,
    lutEnabled: lutOn,
    lutId: getPostEffectParam('LUT', 'id'),
    lutMix: lutOn ? getPostEffectParam('LUT', 'mix') : 0,
    saturation: lutOn ? getPostEffectParam('LUT', 'saturation') : 1,
    contrast: lutOn ? getPostEffectParam('LUT', 'contrast') : 1,
  };
}

export function getEffectiveCrtSettings(): EffectiveCrtSettings {
  const s = getGraphicsSettings();
  const tier = getEffectiveTier();
  const bloomIntensity = tier === 'LOW' ? 0 : s.bloomIntensity;
  const bloomThreshold = s.bloomThreshold;
  const presetCrt = getActivePresetCrt();
  const tintColor = presetCrt.tintColor;
  const tintAmount = resolveTintAmount(presetCrt.tintAmount);
  const brightness = s.crtBrightness;
  const effectUniforms = s.crtEnabled ? getEffectUniforms() : {};
  const persistenceOff = { enabled: false, decay: 0.85, threshold: 0 };
  const retroOff = { enabled: false, pixelSize: 1, paletteId: 0, paletteMix: 0, dither: 0 };
  const reactiveOff = {
    enabled: false,
    blurAmount: 0,
    blurHalfLife: DEFAULT_BLUR_HALF_LIFE,
    blurLight: DEFAULT_LIGHT_PULSE,
    blurHeavy: DEFAULT_HEAVY_PULSE,
    shockStrength: 0,
    shockSpeed: 1.1,
    shockWidth: 0.06,
    shockDuration: DEFAULT_SHOCK_DURATION,
    shockLight: DEFAULT_LIGHT_PULSE,
    shockHeavy: DEFAULT_HEAVY_PULSE,
    glitchAmount: 0,
    glitchSlices: 12,
    glitchChroma: 0.5,
    glitchHalfLife: DEFAULT_GLITCH_HALF_LIFE,
    glitchLight: DEFAULT_LIGHT_PULSE,
    glitchHeavy: DEFAULT_HEAVY_PULSE,
  };
  const gradeOff = {
    streakIntensity: 0,
    streakLength: 8,
    streakTarget: 'COMBAT_ONLY' as StreakTarget,
    lutEnabled: false,
    lutId: 0,
    lutMix: 0,
    saturation: 1,
    contrast: 1,
  };

  if (!s.crtEnabled) {
    return {
      crtEnabled: false,
      webglCrt: false,
      cssOverlay: false,
      scanlineIntensity: 0,
      curvature: 0,
      vignette: 0,
      phosphor: 0,
      maskType: 0,
      bloomIntensity,
      bloomThreshold,
      arcadeBezel: s.arcadeBezel,
      tintColor,
      tintAmount: 0,
      brightness: 1,
      effectUniforms: {},
      persistence: persistenceOff,
      retro: retroOff,
      reactive: reactiveOff,
      grade: gradeOff,
    };
  }

  // LOW has no budget for the world-texture upload, so it degrades to the CSS overlay.
  if (tier === 'LOW') {
    return {
      crtEnabled: true,
      webglCrt: false,
      cssOverlay: true,
      scanlineIntensity: resolveScanlineIntensity(),
      curvature: 0,
      vignette: resolveVignette(),
      phosphor: 0,
      maskType: 0,
      bloomIntensity,
      bloomThreshold,
      arcadeBezel: s.arcadeBezel,
      tintColor,
      tintAmount,
      brightness,
      effectUniforms: {},
      persistence: persistenceOff,
      retro: retroOff,
      reactive: reactiveOff,
      grade: gradeOff,
    };
  }

  return {
    crtEnabled: true,
    webglCrt: true,
    cssOverlay: false,
    scanlineIntensity: resolveScanlineIntensity(),
    curvature: resolveCurvature(),
    vignette: resolveVignette(),
    phosphor: resolvePhosphor(),
    maskType: resolveMaskType(),
    bloomIntensity,
    bloomThreshold,
    arcadeBezel: s.arcadeBezel,
    tintColor,
    tintAmount,
    brightness,
    effectUniforms,
    persistence: resolvePersistence(),
    retro: resolveRetro(),
    reactive: resolveReactive(),
    grade: resolveGrade(),
  };
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampUnit(value: number): number {
  return clampRange(value, 0, 1);
}

export function parseGraphicsSettings(raw: unknown): GraphicsSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
  const parsed = raw as Partial<GraphicsSettings> & {
    lavaHeatWaves?: boolean;
    webglBackground?: boolean;
    ambientEmbers?: boolean;
    particleTrails?: boolean;
  };
  const webglBackground =
    parsed.webglBackground ??
    parsed.lavaHeatWaves ??
    DEFAULT_GRAPHICS_SETTINGS.webglBackground;
  return {
    tier: parsed.tier ?? DEFAULT_GRAPHICS_SETTINGS.tier,
    webglBackground,
    floorSubGrid: parsed.floorSubGrid ?? DEFAULT_GRAPHICS_SETTINGS.floorSubGrid,
    ambientEmbers: parsed.ambientEmbers ?? DEFAULT_GRAPHICS_SETTINGS.ambientEmbers,
    particleTrails: parsed.particleTrails ?? DEFAULT_GRAPHICS_SETTINGS.particleTrails,
    bloomEnabled: parsed.bloomEnabled ?? DEFAULT_GRAPHICS_SETTINGS.bloomEnabled,
    refractionEnabled: parsed.refractionEnabled ?? DEFAULT_GRAPHICS_SETTINGS.refractionEnabled,
    screenShakeIntensity:
      parsed.screenShakeIntensity ?? DEFAULT_GRAPHICS_SETTINGS.screenShakeIntensity,
    manualTierOverride:
      parsed.manualTierOverride ?? DEFAULT_GRAPHICS_SETTINGS.manualTierOverride,
    crtEnabled: parsed.crtEnabled ?? DEFAULT_GRAPHICS_SETTINGS.crtEnabled,
    crtScanlineIntensity:
      parsed.crtScanlineIntensity ?? DEFAULT_GRAPHICS_SETTINGS.crtScanlineIntensity,
    crtCurvature: parsed.crtCurvature ?? DEFAULT_GRAPHICS_SETTINGS.crtCurvature,
    crtVignette: parsed.crtVignette ?? DEFAULT_GRAPHICS_SETTINGS.crtVignette,
    crtPhosphor: parsed.crtPhosphor ?? DEFAULT_GRAPHICS_SETTINGS.crtPhosphor,
    crtBrightness: parsed.crtBrightness ?? DEFAULT_GRAPHICS_SETTINGS.crtBrightness,
    bloomIntensity: parsed.bloomIntensity ?? DEFAULT_GRAPHICS_SETTINGS.bloomIntensity,
    bloomThreshold: parsed.bloomThreshold ?? DEFAULT_GRAPHICS_SETTINGS.bloomThreshold,
    arcadeBezel: parsed.arcadeBezel ?? DEFAULT_GRAPHICS_SETTINGS.arcadeBezel,
    bgParallaxVoid: clampUnit(
      parsed.bgParallaxVoid ?? DEFAULT_GRAPHICS_SETTINGS.bgParallaxVoid,
    ),
    bgParallaxLava: clampUnit(
      parsed.bgParallaxLava ?? DEFAULT_GRAPHICS_SETTINGS.bgParallaxLava,
    ),
    bgLavaScrollSpeed: clampRange(
      parsed.bgLavaScrollSpeed ?? DEFAULT_GRAPHICS_SETTINGS.bgLavaScrollSpeed,
      0,
      1,
    ),
    activePreset:
      parsed.activePreset && isStylePresetId(parsed.activePreset)
        ? parsed.activePreset
        : DEFAULT_GRAPHICS_SETTINGS.activePreset,
    crosshairStyle:
      parsed.crosshairStyle && isCrosshairStyleId(parsed.crosshairStyle)
        ? parsed.crosshairStyle
        : DEFAULT_GRAPHICS_SETTINGS.crosshairStyle,
    postEffects: parsed.postEffects ?? DEFAULT_GRAPHICS_SETTINGS.postEffects,
  };
}

function loadFromStorage(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRAPHICS);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    return parseGraphicsSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

export function getGraphicsSettings(): GraphicsSettings {
  if (!cache) {
    cache = loadFromStorage();
  }
  return cache;
}

export function saveGraphicsSettings(settings: GraphicsSettings): void {
  cache = { ...settings };
  localStorage.setItem(STORAGE_KEY_GRAPHICS, JSON.stringify(cache));
  for (const listener of listeners) listener();
}

export function subscribeGraphicsSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTierPreset(tier: Exclude<QualityTier, 'AUTO'>): GraphicsSettings {
  const limits = TIER_LIMITS[tier];
  const next: GraphicsSettings = {
    ...getGraphicsSettings(),
    tier,
    manualTierOverride: true,
    webglBackground: tier !== 'LOW',
    floorSubGrid: tier !== 'LOW',
    ambientEmbers: tier !== 'LOW',
    particleTrails: true,
    bloomEnabled: limits.bloomPasses > 0,
    refractionEnabled: limits.refraction,
    crtEnabled: tier !== 'LOW',
  };
  saveGraphicsSettings(next);
  return next;
}

export function applyStylePreset(id: StylePresetId): GraphicsSettings {
  const preset = STYLE_PRESETS[id];
  const crt = preset.crt;
  const current = getGraphicsSettings();
  const postEffects = { ...current.postEffects };

  const phosphorState = postEffects.PHOSPHOR ?? {
    enabled: POST_EFFECTS.PHOSPHOR.defaultEnabled,
    params: {},
  };
  postEffects.PHOSPHOR = {
    ...phosphorState,
    params: { ...phosphorState.params, type: crt.maskType },
  };

  const arcadeEffects: {
    id: 'HALATION' | 'BEAM_BLUR' | 'CONVERGENCE' | 'GLASS_GLARE';
    paramKey: string;
    value: number;
  }[] = [
    { id: 'HALATION', paramKey: 'intensity', value: crt.halation },
    { id: 'BEAM_BLUR', paramKey: 'amount', value: crt.beamBlur },
    { id: 'CONVERGENCE', paramKey: 'amount', value: crt.convergence },
    { id: 'GLASS_GLARE', paramKey: 'intensity', value: crt.glassGlare },
  ];

  for (const { id: effectId, paramKey, value } of arcadeEffects) {
    const def = POST_EFFECTS[effectId];
    const state = postEffects[effectId] ?? {
      enabled: def.defaultEnabled,
      params: {},
    };
    postEffects[effectId] = {
      enabled: value > 0,
      params: {
        ...state.params,
        [paramKey]: value > 0 ? value : state.params[paramKey] ?? def.params.find((p) => p.key === paramKey)?.defaultValue ?? 0,
      },
    };
  }

  const next: GraphicsSettings = {
    ...current,
    activePreset: id,
    crtScanlineIntensity: crt.crtScanlineIntensity,
    crtCurvature: crt.crtCurvature,
    crtVignette: crt.crtVignette,
    crtPhosphor: crt.crtPhosphor,
    crtBrightness: crt.crtBrightness,
    bloomIntensity: crt.bloomIntensity,
    postEffects,
  };
  saveGraphicsSettings(next);
  return next;
}

/** Re-applies CRT numerics from the current preset without changing activePreset. */
export function resetStylePresetDefaults(): GraphicsSettings {
  return applyStylePreset(getGraphicsSettings().activePreset);
}
