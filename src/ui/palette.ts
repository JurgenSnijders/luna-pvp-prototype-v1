import { getGraphicsSettings, subscribeGraphicsSettings } from '../devtools/graphicsSettings';
import {
  STYLE_PRESETS,
  type PaletteColors,
  type StylePreset,
  type StylePresetId,
} from '../render/presets/stylePresets';

export function getActivePreset(): StylePreset {
  return STYLE_PRESETS[getGraphicsSettings().activePreset];
}

export function getActiveColors(): PaletteColors {
  return getActivePreset().colors;
}

function setCssVar(name: string, value: string): void {
  document.documentElement.style.setProperty(name, value);
}

/** Writes resolved preset colors to :root so DOM cssText using RETRO_COLORS vars live-updates. */
export function applyPalette(): void {
  const preset = getActivePreset();
  const { colors, glow } = preset;

  setCssVar('--retro-bg-dark', colors.bgDark);
  setCssVar('--retro-panel-bg', colors.panelBg);
  setCssVar('--retro-panel-bg-opaque', colors.panelBgOpaque);
  setCssVar('--retro-border-subtle', colors.borderSubtle);
  setCssVar('--retro-border-neon', colors.borderNeon);
  setCssVar('--retro-border-hot', colors.borderHot);
  setCssVar('--retro-neon-cyan', colors.neonCyan);
  setCssVar('--retro-neon-magenta', colors.neonMagenta);
  setCssVar('--retro-neon-yellow', colors.neonYellow);
  setCssVar('--retro-neon-green', colors.neonGreen);
  setCssVar('--retro-text-primary', colors.textPrimary);
  setCssVar('--retro-text-muted', colors.textMuted);
  setCssVar('--retro-player-cyan', colors.playerCyan);
  setCssVar('--retro-player-cyan-aim', colors.playerCyanAim);
  setCssVar('--retro-bot-orange', colors.botOrange);
  setCssVar('--retro-bot-orange-aim', colors.botOrangeAim);
  setCssVar('--retro-glow-cyan', glow.cyan);
  setCssVar('--retro-glow-magenta', glow.magenta);
  setCssVar('--retro-glow-box-cyan', glow.boxCyan);
  setCssVar('--retro-glow-box-magenta', glow.boxMagenta);

  document.body.style.backgroundColor = colors.bgDark;
}

subscribeGraphicsSettings(() => applyPalette());

export function getActivePresetId(): StylePresetId {
  return getGraphicsSettings().activePreset;
}
