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
  };
  saveGraphicsSettings(next);
  return next;
}
