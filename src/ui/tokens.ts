export const FONTS = {
  mono: "'Fixedsys', 'FixedSys', 'Courier New', monospace",
  size: {
    badge: '12px',
    sm: '13px',
    body: '14px',
    md: '16px',
    lg: '18px',
    xl: '22px',
    title: '26px',
  },
};

export const RETRO_COLORS = {
  bgDark: 'var(--retro-bg-dark, #06060c)',
  panelBg: 'var(--retro-panel-bg, rgba(8, 10, 20, 0.85))',
  panelBgOpaque: 'var(--retro-panel-bg-opaque, #0a0d18)',
  borderSubtle: 'var(--retro-border-subtle, rgba(0, 229, 255, 0.2))',
  borderNeon: 'var(--retro-border-neon, #00e5ff)',
  borderHot: 'var(--retro-border-hot, #ff007f)',
  neonCyan: 'var(--retro-neon-cyan, #00e5ff)',
  neonMagenta: 'var(--retro-neon-magenta, #ff007f)',
  neonYellow: 'var(--retro-neon-yellow, #ffee00)',
  neonGreen: 'var(--retro-neon-green, #39ff14)',
  textPrimary: 'var(--retro-text-primary, #e0f8ff)',
  textMuted: 'var(--retro-text-muted, #6d8896)',
  playerCyan: 'var(--retro-player-cyan, #00ccff)',
  playerCyanAim: 'var(--retro-player-cyan-aim, #88eeff)',
  botOrange: 'var(--retro-bot-orange, #ff8844)',
  botOrangeAim: 'var(--retro-bot-orange-aim, #ffbb88)',
};

export const RETRO_GLOW = {
  cyan: 'var(--retro-glow-cyan, 0 0 8px rgba(0, 229, 255, 0.6), 0 0 16px rgba(0, 229, 255, 0.3))',
  magenta:
    'var(--retro-glow-magenta, 0 0 8px rgba(255, 0, 127, 0.6), 0 0 16px rgba(255, 0, 127, 0.3))',
  boxCyan:
    'var(--retro-glow-box-cyan, 0 0 10px rgba(0, 229, 255, 0.3), inset 0 0 10px rgba(0, 229, 255, 0.1))',
  boxMagenta:
    'var(--retro-glow-box-magenta, 0 0 10px rgba(255, 0, 127, 0.3), inset 0 0 10px rgba(255, 0, 127, 0.1))',
};

export function retroPanelStyle(glowColor: 'cyan' | 'magenta' = 'cyan'): string {
  const glow = glowColor === 'cyan' ? RETRO_GLOW.boxCyan : RETRO_GLOW.boxMagenta;
  const border = glowColor === 'cyan' ? RETRO_COLORS.neonCyan : RETRO_COLORS.neonMagenta;
  return `background: ${RETRO_COLORS.panelBg}; border: 1px solid ${border}; box-shadow: ${glow}; backdrop-filter: blur(8px); border-radius: 4px;`;
}

export function fontStyle(size: keyof typeof FONTS.size, extra = ''): string {
  return `font-family:${FONTS.mono};font-size:${FONTS.size[size]};${extra}`;
}

export function canvasFont(sizePx: number): string {
  return `${sizePx}px ${FONTS.mono}`;
}

export function canvasFontToken(size: keyof typeof FONTS.size): string {
  const px = parseInt(FONTS.size[size], 10);
  return canvasFont(px);
}

export { buildCrosshairCursor } from './crosshairPresets';
export { getActiveColors } from './palette';
