import {
  DEFAULT_RETRO_CONFIG,
  loadRetroConfigFromStorage,
  retroVfxConfig,
  saveRetroConfigToStorage,
} from '../render/gl/retroVfxConfig';
import {
  STYLE_PRESETS,
  type StylePreset,
  type StylePresetColors,
  type StylePresetId,
} from '../render/presets/stylePresets';

export const RETRO_STYLE_PRESET_KEY = 'retro_style_preset';

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildGlowVars(colors: StylePresetColors): Record<string, string> {
  const cyan = colors.neonCyan;
  const magenta = colors.neonMagenta;
  return {
    '--retro-glow-cyan': `0 0 8px ${hexToRgba(cyan, 0.6)}, 0 0 16px ${hexToRgba(cyan, 0.3)}`,
    '--retro-glow-magenta': `0 0 8px ${hexToRgba(magenta, 0.6)}, 0 0 16px ${hexToRgba(magenta, 0.3)}`,
    '--retro-box-cyan': `0 0 10px ${hexToRgba(cyan, 0.3)}, inset 0 0 10px ${hexToRgba(cyan, 0.1)}`,
    '--retro-box-magenta': `0 0 10px ${hexToRgba(magenta, 0.3)}, inset 0 0 10px ${hexToRgba(magenta, 0.1)}`,
  };
}

class StyleManager {
  private currentPreset: StylePresetId = 'CYBER_NEON';

  getPresetId(): StylePresetId {
    return this.currentPreset;
  }

  getPreset(): StylePreset {
    return STYLE_PRESETS[this.currentPreset];
  }

  getActiveColors(): StylePresetColors {
    return STYLE_PRESETS[this.currentPreset].colors;
  }

  applyPreset(id: StylePresetId, saveToStorage = true): void {
    const preset = STYLE_PRESETS[id];
    if (!preset) return;

    this.currentPreset = id;
    const root = document.documentElement;
    const c = preset.colors;

    const cssVars: Record<string, string> = {
      '--retro-bg-dark': c.bgDark,
      '--retro-panel-bg': c.panelBg,
      '--retro-panel-bg-opaque': c.panelBgOpaque,
      '--retro-border-subtle': c.borderSubtle,
      '--retro-border-neon': c.borderNeon,
      '--retro-border-hot': c.borderHot,
      '--retro-neon-cyan': c.neonCyan,
      '--retro-neon-magenta': c.neonMagenta,
      '--retro-neon-yellow': c.neonYellow,
      '--retro-neon-green': c.neonGreen,
      '--retro-text-primary': c.textPrimary,
      '--retro-text-muted': c.textMuted,
      ...buildGlowVars(c),
    };

    for (const [key, value] of Object.entries(cssVars)) {
      root.style.setProperty(key, value);
    }

    Object.assign(retroVfxConfig, { ...DEFAULT_RETRO_CONFIG }, preset.shader);

    document.body.style.backgroundColor = c.bgDark;
    document.body.style.color = c.textPrimary;

    if (saveToStorage) {
      localStorage.setItem(RETRO_STYLE_PRESET_KEY, id);
      saveRetroConfigToStorage();
    }

    window.dispatchEvent(
      new CustomEvent('stylepresetapplied', { detail: { id } }),
    );
  }

  resetCurrentPresetDefaults(): void {
    const preset = STYLE_PRESETS[this.currentPreset];
    Object.assign(retroVfxConfig, { ...DEFAULT_RETRO_CONFIG }, preset.shader);
    saveRetroConfigToStorage();
    window.dispatchEvent(
      new CustomEvent('stylepresetapplied', { detail: { id: this.currentPreset } }),
    );
  }
}

export const styleManager = new StyleManager();

function initStyleManager(): void {
  const stored = localStorage.getItem(RETRO_STYLE_PRESET_KEY) as StylePresetId | null;
  const id = stored && STYLE_PRESETS[stored] ? stored : 'CYBER_NEON';
  styleManager.applyPreset(id, false);
  loadRetroConfigFromStorage();
}

initStyleManager();

(window as unknown as { __setStylePreset?: (id: StylePresetId) => void }).__setStylePreset =
  (id: StylePresetId) => styleManager.applyPreset(id);
