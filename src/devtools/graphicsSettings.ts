export const STORAGE_KEY_GRAPHICS = 'LUNA_GRAPHICS_SETTINGS';

export interface GraphicsSettings {
  lavaHeatWaves: boolean;
  ambientEmbers: boolean;
  particleTrails: boolean;
}

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  lavaHeatWaves: true,
  ambientEmbers: true,
  particleTrails: true,
};

let cache: GraphicsSettings | null = null;

function loadFromStorage(): GraphicsSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRAPHICS);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GraphicsSettings>;
    return {
      lavaHeatWaves: parsed.lavaHeatWaves ?? DEFAULT_GRAPHICS_SETTINGS.lavaHeatWaves,
      ambientEmbers: parsed.ambientEmbers ?? DEFAULT_GRAPHICS_SETTINGS.ambientEmbers,
      particleTrails: parsed.particleTrails ?? DEFAULT_GRAPHICS_SETTINGS.particleTrails,
    };
  } catch {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

/** Returns the live settings object; reads localStorage only on first call. */
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
