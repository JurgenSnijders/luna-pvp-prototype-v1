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
  bloomIntensity: number;
  arcadeBezel: boolean;
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
  bloomIntensity: 0.8,
  arcadeBezel: true,
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

export function getEffectiveCrtSettings(): EffectiveCrtSettings {
  const s = getGraphicsSettings();
  const tier = getEffectiveTier();
  const bloomIntensity = tier === 'LOW' ? 0 : s.bloomIntensity;
  const bloomThreshold = tier === 'ULTRA' ? 0.5 : 0.6;

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
    };
  }

  // LOW has no budget for the world-texture upload, so it degrades to the CSS overlay.
  if (tier === 'LOW') {
    return {
      crtEnabled: true,
      webglCrt: false,
      cssOverlay: true,
      scanlineIntensity: s.crtScanlineIntensity,
      curvature: 0,
      vignette: s.crtVignette,
      phosphor: 0,
      bloomIntensity,
      bloomThreshold,
      arcadeBezel: s.arcadeBezel,
    };
  }

  const fullCrt = tier !== 'MEDIUM';
  return {
    crtEnabled: true,
    webglCrt: true,
    cssOverlay: false,
    scanlineIntensity: s.crtScanlineIntensity,
    curvature: fullCrt ? s.crtCurvature : 0,
    vignette: s.crtVignette,
    phosphor: fullCrt ? s.crtPhosphor : 0,
    bloomIntensity,
    bloomThreshold,
    arcadeBezel: s.arcadeBezel,
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
      bloomIntensity: parsed.bloomIntensity ?? DEFAULT_GRAPHICS_SETTINGS.bloomIntensity,
      arcadeBezel: parsed.arcadeBezel ?? DEFAULT_GRAPHICS_SETTINGS.arcadeBezel,
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
