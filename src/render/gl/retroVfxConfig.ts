export type IconRenderStyle = 'SEMANTIC_GLYPH' | 'SIMULATION_TRACE';

export interface RetroShaderConfig {
  iconStyle: IconRenderStyle;
}

export const DEFAULT_RETRO_CONFIG: RetroShaderConfig = {
  iconStyle: 'SEMANTIC_GLYPH',
};

const STORAGE_KEY = 'LUNA_RETRO_VFX_CONFIG';

const VALID_STYLES = new Set<IconRenderStyle>(['SEMANTIC_GLYPH', 'SIMULATION_TRACE']);

let cache: RetroShaderConfig | null = null;

export function loadRetroConfigFromStorage(): RetroShaderConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RETRO_CONFIG };
    const parsed = JSON.parse(raw) as Partial<RetroShaderConfig>;
    const iconStyle = parsed.iconStyle;
    return {
      iconStyle:
        iconStyle && VALID_STYLES.has(iconStyle) ? iconStyle : DEFAULT_RETRO_CONFIG.iconStyle,
    };
  } catch {
    return { ...DEFAULT_RETRO_CONFIG };
  }
}

export function saveRetroConfigToStorage(config: RetroShaderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getRetroVfxConfig(): RetroShaderConfig {
  if (!cache) {
    cache = loadRetroConfigFromStorage();
  }
  return cache;
}

export function getIconRenderStyle(): IconRenderStyle {
  return getRetroVfxConfig().iconStyle;
}

export function setIconRenderStyle(style: IconRenderStyle): void {
  cache = { iconStyle: style };
  saveRetroConfigToStorage(cache);
  window.dispatchEvent(new CustomEvent('iconstylechanged', { detail: { style } }));
}
