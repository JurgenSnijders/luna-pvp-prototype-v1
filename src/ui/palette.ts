import { applyStylePreset, getGraphicsSettings, saveGraphicsSettings, subscribeGraphicsSettings } from '../devtools/graphicsSettings';
import { buildCrosshairCursor, isCrosshairStyleId, type CrosshairStyleId } from './crosshairPresets';
import {
  STYLE_PRESETS,
  isStylePresetId,
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

/** Browsers do not reliably resolve cursor: var() when the value contains url() fallbacks. */
function applyArenaCursor(cursor: string): void {
  const gameCanvas = document.getElementById('game-canvas');
  if (gameCanvas) gameCanvas.style.cursor = cursor;
  const vfxCanvas = document.getElementById('vfx-canvas');
  if (vfxCanvas) vfxCanvas.style.cursor = cursor;
}

function resolveArenaCursor(neonColor: string): string {
  return buildCrosshairCursor(getGraphicsSettings().crosshairStyle, neonColor);
}

const HIT_FLASH_MS = 90;
const HIT_FLASH_LIGHT = '#ffffff';
const HIT_FLASH_HEAVY = '#ff007f';

let flashRestoreTimer: ReturnType<typeof setTimeout> | null = null;

function refreshArenaCursor(): void {
  const colors = getActiveColors();
  const cursor = resolveArenaCursor(colors.borderNeon || colors.neonCyan);
  setCssVar('--retro-cursor', cursor);
  applyArenaCursor(cursor);
}

/** Briefly recolor the hardware crosshair on hit (white = light, hot magenta = heavy). */
export function flashArenaCrosshair(isHeavy: boolean): void {
  const style = getGraphicsSettings().crosshairStyle;
  const flashColor = isHeavy ? HIT_FLASH_HEAVY : HIT_FLASH_LIGHT;
  const flashStyle = style === 'SYSTEM' ? 'CLASSIC_CROSS' : style;
  applyArenaCursor(buildCrosshairCursor(flashStyle, flashColor));

  if (flashRestoreTimer) clearTimeout(flashRestoreTimer);
  flashRestoreTimer = setTimeout(() => {
    flashRestoreTimer = null;
    refreshArenaCursor();
  }, HIT_FLASH_MS);
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
  refreshArenaCursor();

  document.body.style.backgroundColor = colors.bgDark;
}

/** Re-apply arena cursor (e.g. after #vfx-canvas is mounted). */
export function syncArenaCursor(): void {
  refreshArenaCursor();
}

subscribeGraphicsSettings(() => applyPalette());

export function getActivePresetId(): StylePresetId {
  return getGraphicsSettings().activePreset;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __setStylePreset?: (id: StylePresetId) => void }).__setStylePreset = (
    id,
  ) => {
    if (isStylePresetId(id)) applyStylePreset(id);
  };

  (window as unknown as { __setCrosshairStyle?: (id: CrosshairStyleId) => void }).__setCrosshairStyle = (
    id,
  ) => {
    if (isCrosshairStyleId(id)) {
      saveGraphicsSettings({ ...getGraphicsSettings(), crosshairStyle: id });
    }
  };
}
