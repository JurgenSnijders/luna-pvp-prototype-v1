export interface EntityShadowConfig {
  /** Max shadow opacity when entity is on the ground. */
  maxAlpha: number;
  /** Minimum opacity retained at high elevation. */
  minAlpha: number;
  /** Elevation (px) over which shadow fades from max to min. */
  fadeDistance: number;
}

export const DEFAULT_ENTITY_SHADOW_CONFIG: EntityShadowConfig = {
  maxAlpha: 0.55,
  minAlpha: 0.08,
  fadeDistance: 450,
};

export const MIN_FADE_DISTANCE = 100;
export const MAX_FADE_DISTANCE = 900;

export const entityShadowConfig: EntityShadowConfig = { ...DEFAULT_ENTITY_SHADOW_CONFIG };

const STORAGE_KEY = 'entity_shadow_config_v1';

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampFadeDistance(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ENTITY_SHADOW_CONFIG.fadeDistance;
  return Math.min(MAX_FADE_DISTANCE, Math.max(MIN_FADE_DISTANCE, value));
}

export function clampEntityShadowConfig(config: Partial<EntityShadowConfig>): EntityShadowConfig {
  return {
    maxAlpha: clampAlpha(config.maxAlpha ?? DEFAULT_ENTITY_SHADOW_CONFIG.maxAlpha),
    minAlpha: clampAlpha(config.minAlpha ?? DEFAULT_ENTITY_SHADOW_CONFIG.minAlpha),
    fadeDistance: clampFadeDistance(
      config.fadeDistance ?? DEFAULT_ENTITY_SHADOW_CONFIG.fadeDistance,
    ),
  };
}

export function loadEntityShadowConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<EntityShadowConfig>;
    Object.assign(entityShadowConfig, clampEntityShadowConfig(parsed));
  } catch {
    // ignore corrupt storage
  }
}

export function saveEntityShadowConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    Object.assign(entityShadowConfig, clampEntityShadowConfig(entityShadowConfig));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entityShadowConfig));
  } catch {
    // ignore quota errors
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __entityShadowConfig?: EntityShadowConfig }).__entityShadowConfig =
    entityShadowConfig;
}
