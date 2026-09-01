export const FONTS = {
  mono: "'Fixedsys', 'FixedSys', 'Courier New', monospace",
  size: {
    xs: '10px',
    sm: '12px',
    md: '14px',
    lg: '16px',
    xl: '20px',
    title: '24px',
  },
};

export const RETRO_COLORS = {
  bgDark: '#06060c',
  panelBg: 'rgba(8, 10, 20, 0.85)',
  panelBgOpaque: '#0a0d18',
  borderSubtle: 'rgba(0, 229, 255, 0.2)',
  borderNeon: '#00e5ff',
  borderHot: '#ff007f',
  neonCyan: '#00e5ff',
  neonMagenta: '#ff007f',
  neonYellow: '#ffee00',
  neonGreen: '#39ff14',
  textPrimary: '#e0f8ff',
  textMuted: '#6d8896',
};

export const RETRO_GLOW = {
  cyan: '0 0 8px rgba(0, 229, 255, 0.6), 0 0 16px rgba(0, 229, 255, 0.3)',
  magenta: '0 0 8px rgba(255, 0, 127, 0.6), 0 0 16px rgba(255, 0, 127, 0.3)',
  boxCyan: '0 0 10px rgba(0, 229, 255, 0.3), inset 0 0 10px rgba(0, 229, 255, 0.1)',
  boxMagenta: '0 0 10px rgba(255, 0, 127, 0.3), inset 0 0 10px rgba(255, 0, 127, 0.1)',
};

export function retroPanelStyle(glowColor: 'cyan' | 'magenta' = 'cyan'): string {
  const glow = glowColor === 'cyan' ? RETRO_GLOW.boxCyan : RETRO_GLOW.boxMagenta;
  const border = glowColor === 'cyan' ? RETRO_COLORS.neonCyan : RETRO_COLORS.neonMagenta;
  return `background: ${RETRO_COLORS.panelBg}; border: 1px solid ${border}; box-shadow: ${glow}; backdrop-filter: blur(8px); border-radius: 4px;`;
}

export function canvasFont(sizePx: number): string {
  return `${sizePx}px ${FONTS.mono}`;
}
