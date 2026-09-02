export type StylePresetId =
  | 'CYBER_NEON'
  | 'AMBER_TERMINAL'
  | 'GREEN_PHOSPHOR'
  | 'MIDNIGHT_ARCADE'
  | 'CLEAN_CRT';

export interface PaletteColors {
  bgDark: string;
  panelBg: string;
  panelBgOpaque: string;
  borderSubtle: string;
  borderNeon: string;
  borderHot: string;
  neonCyan: string;
  neonMagenta: string;
  neonYellow: string;
  neonGreen: string;
  textPrimary: string;
  textMuted: string;
  playerCyan: string;
  playerCyanAim: string;
  botOrange: string;
  botOrangeAim: string;
}

export interface PresetGlow {
  cyan: string;
  magenta: string;
  boxCyan: string;
  boxMagenta: string;
}

export interface CrtPresetValues {
  crtScanlineIntensity: number;
  crtCurvature: number;
  crtVignette: number;
  crtPhosphor: number;
  crtBrightness: number;
  bloomIntensity: number;
  tintColor: [number, number, number];
  tintAmount: number;
}

export interface StylePreset {
  id: StylePresetId;
  label: string;
  colors: PaletteColors;
  glow: PresetGlow;
  crt: CrtPresetValues;
}

const CYBER_NEON_COLORS: PaletteColors = {
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
  playerCyan: '#00ccff',
  playerCyanAim: '#88eeff',
  botOrange: '#ff8844',
  botOrangeAim: '#ffbb88',
};

export const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
  CYBER_NEON: {
    id: 'CYBER_NEON',
    label: 'Cyber Neon',
    colors: CYBER_NEON_COLORS,
    glow: {
      cyan: '0 0 8px rgba(0, 229, 255, 0.6), 0 0 16px rgba(0, 229, 255, 0.3)',
      magenta: '0 0 8px rgba(255, 0, 127, 0.6), 0 0 16px rgba(255, 0, 127, 0.3)',
      boxCyan: '0 0 10px rgba(0, 229, 255, 0.3), inset 0 0 10px rgba(0, 229, 255, 0.1)',
      boxMagenta: '0 0 10px rgba(255, 0, 127, 0.3), inset 0 0 10px rgba(255, 0, 127, 0.1)',
    },
    crt: {
      crtScanlineIntensity: 0.35,
      crtCurvature: 0.12,
      crtVignette: 0.45,
      crtPhosphor: 0.25,
      crtBrightness: 1.0,
      bloomIntensity: 0.8,
      tintColor: [1, 1, 1],
      tintAmount: 0,
    },
  },
  AMBER_TERMINAL: {
    id: 'AMBER_TERMINAL',
    label: 'Amber Terminal',
    colors: {
      bgDark: '#0c0800',
      panelBg: 'rgba(20, 14, 0, 0.85)',
      panelBgOpaque: '#141000',
      borderSubtle: 'rgba(255, 176, 0, 0.2)',
      borderNeon: '#ffb000',
      borderHot: '#ffcc00',
      neonCyan: '#ffb000',
      neonMagenta: '#ffcc00',
      neonYellow: '#ffcc00',
      neonGreen: '#ffb000',
      textPrimary: '#ffe8b0',
      textMuted: '#887755',
      playerCyan: '#ffb000',
      playerCyanAim: '#ffdd66',
      botOrange: '#cc8800',
      botOrangeAim: '#ffaa44',
    },
    glow: {
      cyan: '0 0 8px rgba(255, 176, 0, 0.6), 0 0 16px rgba(255, 176, 0, 0.3)',
      magenta: '0 0 8px rgba(255, 204, 0, 0.6), 0 0 16px rgba(255, 204, 0, 0.3)',
      boxCyan: '0 0 10px rgba(255, 176, 0, 0.3), inset 0 0 10px rgba(255, 176, 0, 0.1)',
      boxMagenta: '0 0 10px rgba(255, 204, 0, 0.3), inset 0 0 10px rgba(255, 204, 0, 0.1)',
    },
    crt: {
      crtScanlineIntensity: 0.45,
      crtCurvature: 0.12,
      crtVignette: 0.45,
      crtPhosphor: 0.35,
      crtBrightness: 1.05,
      bloomIntensity: 0.8,
      tintColor: [1, 0.7, 0],
      tintAmount: 0.85,
    },
  },
  GREEN_PHOSPHOR: {
    id: 'GREEN_PHOSPHOR',
    label: 'Green Phosphor',
    colors: {
      bgDark: '#020b04',
      panelBg: 'rgba(4, 18, 8, 0.85)',
      panelBgOpaque: '#041208',
      borderSubtle: 'rgba(51, 255, 51, 0.2)',
      borderNeon: '#33ff33',
      borderHot: '#88ff88',
      neonCyan: '#33ff33',
      neonMagenta: '#88ff88',
      neonYellow: '#aaff44',
      neonGreen: '#33ff33',
      textPrimary: '#ccffcc',
      textMuted: '#5a8860',
      playerCyan: '#33ff33',
      playerCyanAim: '#88ff88',
      botOrange: '#22cc22',
      botOrangeAim: '#66ee66',
    },
    glow: {
      cyan: '0 0 8px rgba(51, 255, 51, 0.6), 0 0 16px rgba(51, 255, 51, 0.3)',
      magenta: '0 0 8px rgba(136, 255, 136, 0.6), 0 0 16px rgba(136, 255, 136, 0.3)',
      boxCyan: '0 0 10px rgba(51, 255, 51, 0.3), inset 0 0 10px rgba(51, 255, 51, 0.1)',
      boxMagenta: '0 0 10px rgba(136, 255, 136, 0.3), inset 0 0 10px rgba(136, 255, 136, 0.1)',
    },
    crt: {
      crtScanlineIntensity: 0.4,
      crtCurvature: 0.12,
      crtVignette: 0.45,
      crtPhosphor: 0.35,
      crtBrightness: 1.05,
      bloomIntensity: 0.8,
      tintColor: [0.2, 1, 0.2],
      tintAmount: 0.9,
    },
  },
  MIDNIGHT_ARCADE: {
    id: 'MIDNIGHT_ARCADE',
    label: 'Midnight Arcade',
    colors: {
      bgDark: '#030305',
      panelBg: 'rgba(8, 6, 16, 0.85)',
      panelBgOpaque: '#080610',
      borderSubtle: 'rgba(255, 230, 0, 0.2)',
      borderNeon: '#ffe600',
      borderHot: '#b026ff',
      neonCyan: '#ffe600',
      neonMagenta: '#b026ff',
      neonYellow: '#ffe600',
      neonGreen: '#39ff14',
      textPrimary: '#f0e8ff',
      textMuted: '#7a7090',
      playerCyan: '#ffe600',
      playerCyanAim: '#fff080',
      botOrange: '#b026ff',
      botOrangeAim: '#d080ff',
    },
    glow: {
      cyan: '0 0 8px rgba(255, 230, 0, 0.6), 0 0 16px rgba(255, 230, 0, 0.3)',
      magenta: '0 0 8px rgba(176, 38, 255, 0.6), 0 0 16px rgba(176, 38, 255, 0.3)',
      boxCyan: '0 0 10px rgba(255, 230, 0, 0.3), inset 0 0 10px rgba(255, 230, 0, 0.1)',
      boxMagenta: '0 0 10px rgba(176, 38, 255, 0.3), inset 0 0 10px rgba(176, 38, 255, 0.1)',
    },
    crt: {
      crtScanlineIntensity: 0.25,
      crtCurvature: 0.12,
      crtVignette: 0.45,
      crtPhosphor: 0.25,
      crtBrightness: 1.1,
      bloomIntensity: 1.4,
      tintColor: [1, 1, 1],
      tintAmount: 0,
    },
  },
  CLEAN_CRT: {
    id: 'CLEAN_CRT',
    label: 'Clean CRT',
    colors: {
      ...CYBER_NEON_COLORS,
      bgDark: '#08080e',
      panelBg: 'rgba(10, 10, 18, 0.85)',
      panelBgOpaque: '#0c0c14',
    },
    glow: {
      cyan: '0 0 6px rgba(0, 229, 255, 0.4), 0 0 12px rgba(0, 229, 255, 0.2)',
      magenta: '0 0 6px rgba(255, 0, 127, 0.4), 0 0 12px rgba(255, 0, 127, 0.2)',
      boxCyan: '0 0 8px rgba(0, 229, 255, 0.2), inset 0 0 8px rgba(0, 229, 255, 0.05)',
      boxMagenta: '0 0 8px rgba(255, 0, 127, 0.2), inset 0 0 8px rgba(255, 0, 127, 0.05)',
    },
    crt: {
      crtScanlineIntensity: 0.1,
      crtCurvature: 0,
      crtVignette: 0.45,
      crtPhosphor: 0,
      crtBrightness: 1.0,
      bloomIntensity: 0.8,
      tintColor: [1, 1, 1],
      tintAmount: 0,
    },
  },
};

export const STYLE_PRESET_IDS = Object.keys(STYLE_PRESETS) as StylePresetId[];

export function isStylePresetId(id: string): id is StylePresetId {
  return id in STYLE_PRESETS;
}
