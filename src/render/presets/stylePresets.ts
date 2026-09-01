import type { RetroShaderConfig } from '../gl/retroVfxConfig';

export type StylePresetId =
  | 'CYBER_NEON'
  | 'AMBER_TERMINAL'
  | 'GREEN_PHOSPHOR'
  | 'MIDNIGHT_ARCADE'
  | 'CLEAN_CRT';

export interface StylePresetColors {
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
}

export interface StylePreset {
  id: StylePresetId;
  name: string;
  description: string;
  colors: StylePresetColors;
  shader: Partial<RetroShaderConfig>;
}

export const STYLE_PRESETS: Record<StylePresetId, StylePreset> = {
  CYBER_NEON: {
    id: 'CYBER_NEON',
    name: 'Cyber Neon',
    description: 'Deep violet-navy base with vibrant cyan and magenta neon borders.',
    colors: {
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
    },
    shader: {
      tintAmount: 0,
      scanlineIntensity: 0.30,
      curvature: 0.03,
      chromaticAberration: 0.0025,
      bloomIntensity: 1.65,
    },
  },

  AMBER_TERMINAL: {
    id: 'AMBER_TERMINAL',
    name: 'Amber Terminal',
    description: 'Warm monochrome amber phosphor CRT terminal aesthetic.',
    colors: {
      bgDark: '#0c0800',
      panelBg: 'rgba(20, 12, 0, 0.85)',
      panelBgOpaque: '#140c00',
      borderSubtle: 'rgba(255, 176, 0, 0.2)',
      borderNeon: '#ffb000',
      borderHot: '#ff8800',
      neonCyan: '#ffb000',
      neonMagenta: '#ff8800',
      neonYellow: '#ffcc00',
      neonGreen: '#cc9900',
      textPrimary: '#ffcc00',
      textMuted: '#997700',
    },
    shader: {
      tintColor: [1.0, 0.7, 0.0],
      tintAmount: 0.85,
      scanlineIntensity: 0.45,
      curvature: 0.04,
      chromaticAberration: 0.001,
      bloomIntensity: 1.5,
      flickerIntensity: 0.02,
    },
  },

  GREEN_PHOSPHOR: {
    id: 'GREEN_PHOSPHOR',
    name: 'Green Phosphor',
    description: 'Classic green-screen terminal with high phosphor tint.',
    colors: {
      bgDark: '#020b04',
      panelBg: 'rgba(2, 20, 6, 0.85)',
      panelBgOpaque: '#021406',
      borderSubtle: 'rgba(51, 255, 51, 0.2)',
      borderNeon: '#33ff33',
      borderHot: '#22cc22',
      neonCyan: '#33ff33',
      neonMagenta: '#22cc22',
      neonYellow: '#88ff44',
      neonGreen: '#39ff14',
      textPrimary: '#88ff88',
      textMuted: '#448844',
    },
    shader: {
      tintColor: [0.2, 1.0, 0.2],
      tintAmount: 0.90,
      scanlineIntensity: 0.40,
      curvature: 0.035,
      flickerIntensity: 0.025,
      bloomIntensity: 1.55,
      chromaticAberration: 0.001,
    },
  },

  MIDNIGHT_ARCADE: {
    id: 'MIDNIGHT_ARCADE',
    name: 'Midnight Arcade',
    description: 'Inky black base with neon yellow and purple arcade accents.',
    colors: {
      bgDark: '#030305',
      panelBg: 'rgba(6, 4, 12, 0.88)',
      panelBgOpaque: '#0a0814',
      borderSubtle: 'rgba(255, 230, 0, 0.2)',
      borderNeon: '#ffe600',
      borderHot: '#b026ff',
      neonCyan: '#ffe600',
      neonMagenta: '#b026ff',
      neonYellow: '#ffe600',
      neonGreen: '#88ff44',
      textPrimary: '#e8e0ff',
      textMuted: '#6d6688',
    },
    shader: {
      tintAmount: 0,
      scanlineIntensity: 0.25,
      curvature: 0.03,
      bloomIntensity: 1.85,
      chromaticAberration: 0.003,
    },
  },

  CLEAN_CRT: {
    id: 'CLEAN_CRT',
    name: 'Clean CRT',
    description: 'Near-flat arcade look with minimal scanlines and neutral coloring.',
    colors: {
      bgDark: '#08080e',
      panelBg: 'rgba(10, 12, 18, 0.85)',
      panelBgOpaque: '#0c0e16',
      borderSubtle: 'rgba(200, 210, 220, 0.2)',
      borderNeon: '#c8d4e0',
      borderHot: '#a0b0c0',
      neonCyan: '#c8d4e0',
      neonMagenta: '#a0b0c0',
      neonYellow: '#e0e8f0',
      neonGreen: '#b0c8b0',
      textPrimary: '#e8f0f8',
      textMuted: '#788898',
    },
    shader: {
      tintAmount: 0,
      curvature: 0,
      scanlineIntensity: 0.12,
      chromaticAberration: 0,
      bloomIntensity: 1.4,
      contrast: 1,
      brightness: 1,
      flickerIntensity: 0,
      phosphorGridIntensity: 0.05,
    },
  },
};
