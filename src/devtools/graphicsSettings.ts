import {
  POST_EFFECTS,
  type PostEffectId,
  tierMeetsMinimum,
} from '../render/gl/postEffects';
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
  lavaHeatWaves: boolean;
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
  activePreset: StylePresetId;
  crosshairStyle: CrosshairStyleId;
  postEffects: Record<string, PostEffectState>;
}

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  tier: 'HIGH',
  lavaHeatWaves: true,
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
  bloomIntensity: number;
  bloomThreshold: number;
  arcadeBezel: boolean;
  tintColor: [number, number, number];
  tintAmount: number;
  brightness: number;
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
  return state?.enabled !== false;
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
  const current = s.postEffects[id] ?? { enabled: true, params: {} };
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
  const current = s.postEffects[id] ?? { enabled: true, params: {} };
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

function resolveTintAmount(presetAmount: number): number {
  if (!isPostEffectEnabled('TINT')) return 0;
  return presetAmount;
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

  if (!s.crtEnabled) {
    return {
      crtEnabled: false,
      webglCrt: false,
      cssOverlay: false,
      scanlineIntensity: 0,
      curvature: 0,
      vignette: 0,
      phosphor: 0,
      bloomIntensity,
      bloomThreshold,
      arcadeBezel: s.arcadeBezel,
      tintColor,
      tintAmount: 0,
      brightness: 1,
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
      bloomIntensity,
      bloomThreshold,
      arcadeBezel: s.arcadeBezel,
      tintColor,
      tintAmount,
      brightness,
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
    bloomIntensity,
    bloomThreshold,
    arcadeBezel: s.arcadeBezel,
    tintColor,
    tintAmount,
    brightness,
  };
}

function loadFromStorage(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRAPHICS);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings> & {
      lavaHeatWaves?: boolean;
      ambientEmbers?: boolean;
      particleTrails?: boolean;
    };
    return {
      tier: parsed.tier ?? DEFAULT_GRAPHICS_SETTINGS.tier,
      lavaHeatWaves: parsed.lavaHeatWaves ?? DEFAULT_GRAPHICS_SETTINGS.lavaHeatWaves,
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
    lavaHeatWaves: tier !== 'LOW',
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
  const next: GraphicsSettings = {
    ...getGraphicsSettings(),
    activePreset: id,
    crtScanlineIntensity: preset.crt.crtScanlineIntensity,
    crtCurvature: preset.crt.crtCurvature,
    crtVignette: preset.crt.crtVignette,
    crtPhosphor: preset.crt.crtPhosphor,
    crtBrightness: preset.crt.crtBrightness,
    bloomIntensity: preset.crt.bloomIntensity,
  };
  saveGraphicsSettings(next);
  return next;
}

/** Re-applies CRT numerics from the current preset without changing activePreset. */
export function resetStylePresetDefaults(): GraphicsSettings {
  return applyStylePreset(getGraphicsSettings().activePreset);
}
