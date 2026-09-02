import type { QualityTier } from '../../devtools/graphicsSettings';
import { RETRO_PALETTES } from './retroPalettes';

const PALETTE_SELECT_OPTIONS = RETRO_PALETTES.map((palette, index) => ({
  value: index,
  label: palette.label,
}));

export type PostEffectId =
  | 'SCANLINES'
  | 'PHOSPHOR'
  | 'CURVATURE'
  | 'VIGNETTE'
  | 'TINT'
  | 'PERSISTENCE'
  | 'PIXELATE'
  | 'PALETTE'
  | 'DITHER'
  | 'RADIAL_BLUR'
  | 'SHOCKWAVE'
  | 'HIT_GLITCH'
  | 'ROLL_BAR'
  | 'VHS_JITTER'
  | 'GRAIN'
  | 'TRACKING';

export type LegacyGraphicsKey =
  | 'crtScanlineIntensity'
  | 'crtCurvature'
  | 'crtVignette'
  | 'crtPhosphor';

export type ParamStorage =
  | { kind: 'legacy'; key: LegacyGraphicsKey }
  | { kind: 'effect' };

export interface PostEffectParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  storage: ParamStorage;
  uniform?: string;
  widget?: 'slider' | 'select';
  options?: { value: number; label: string }[];
}

export type PostEffectGroup = 'CRT' | 'ANALOG' | 'RETRO' | 'REACTIVE' | 'GRADE';

export type PostEffectPass = 'CRT' | 'PERSISTENCE' | 'RETRO' | 'REACTIVE';

export interface PostEffectDef {
  id: PostEffectId;
  label: string;
  group: PostEffectGroup;
  minTier: Exclude<QualityTier, 'AUTO'>;
  conflictsWith: PostEffectId[];
  costHint: number;
  defaultEnabled: boolean;
  masterParam?: string;
  pass?: PostEffectPass;
  params: PostEffectParam[];
}

export const POST_EFFECTS: Record<PostEffectId, PostEffectDef> = {
  SCANLINES: {
    id: 'SCANLINES',
    label: 'CRT Scanlines',
    group: 'CRT',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: true,
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        storage: { kind: 'legacy', key: 'crtScanlineIntensity' },
      },
    ],
  },
  PHOSPHOR: {
    id: 'PHOSPHOR',
    label: 'CRT Phosphor',
    group: 'CRT',
    minTier: 'HIGH',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: true,
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.25,
        storage: { kind: 'legacy', key: 'crtPhosphor' },
      },
    ],
  },
  CURVATURE: {
    id: 'CURVATURE',
    label: 'CRT Curvature',
    group: 'CRT',
    minTier: 'HIGH',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: true,
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: 0,
        max: 0.5,
        step: 0.01,
        defaultValue: 0.12,
        storage: { kind: 'legacy', key: 'crtCurvature' },
      },
    ],
  },
  VIGNETTE: {
    id: 'VIGNETTE',
    label: 'CRT Vignette',
    group: 'CRT',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: true,
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.45,
        storage: { kind: 'legacy', key: 'crtVignette' },
      },
    ],
  },
  TINT: {
    id: 'TINT',
    label: 'CRT Tint',
    group: 'CRT',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: true,
    params: [],
  },
  PERSISTENCE: {
    id: 'PERSISTENCE',
    label: 'Phosphor Persistence',
    group: 'CRT',
    minTier: 'HIGH',
    conflictsWith: [],
    costHint: 2,
    defaultEnabled: false,
    masterParam: 'decay',
    pass: 'PERSISTENCE',
    params: [
      {
        key: 'decay',
        label: 'Decay',
        min: 0.5,
        max: 0.98,
        step: 0.01,
        defaultValue: 0.85,
        storage: { kind: 'effect' },
        uniform: 'u_decay',
      },
      {
        key: 'threshold',
        label: 'Threshold',
        min: 0,
        max: 0.5,
        step: 0.01,
        defaultValue: 0,
        storage: { kind: 'effect' },
        uniform: 'u_persistThreshold',
      },
    ],
  },
  PIXELATE: {
    id: 'PIXELATE',
    label: 'Pixelate',
    group: 'RETRO',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'size',
    pass: 'RETRO',
    params: [
      {
        key: 'size',
        label: 'Pixel Size',
        min: 2,
        max: 16,
        step: 1,
        defaultValue: 4,
        storage: { kind: 'effect' },
      },
    ],
  },
  PALETTE: {
    id: 'PALETTE',
    label: 'Palette Quantise',
    group: 'RETRO',
    minTier: 'MEDIUM',
    conflictsWith: ['PHOSPHOR'],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'mix',
    pass: 'RETRO',
    params: [
      {
        key: 'mix',
        label: 'Mix',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 1,
        storage: { kind: 'effect' },
      },
      {
        key: 'id',
        label: 'Palette',
        min: 0,
        max: PALETTE_SELECT_OPTIONS.length - 1,
        step: 1,
        defaultValue: 0,
        storage: { kind: 'effect' },
        widget: 'select',
        options: PALETTE_SELECT_OPTIONS,
      },
    ],
  },
  DITHER: {
    id: 'DITHER',
    label: 'Ordered Dither',
    group: 'RETRO',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'amount',
    pass: 'RETRO',
    params: [
      {
        key: 'amount',
        label: 'Amount',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        storage: { kind: 'effect' },
      },
    ],
  },
  RADIAL_BLUR: {
    id: 'RADIAL_BLUR',
    label: 'Radial Blur',
    group: 'REACTIVE',
    minTier: 'HIGH',
    conflictsWith: [],
    costHint: 2,
    defaultEnabled: false,
    masterParam: 'amount',
    pass: 'REACTIVE',
    params: [
      {
        key: 'amount',
        label: 'Amount',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.45,
        storage: { kind: 'effect' },
      },
    ],
  },
  SHOCKWAVE: {
    id: 'SHOCKWAVE',
    label: 'Shockwave',
    group: 'REACTIVE',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'strength',
    pass: 'REACTIVE',
    params: [
      {
        key: 'strength',
        label: 'Strength',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        storage: { kind: 'effect' },
      },
      {
        key: 'speed',
        label: 'Speed',
        min: 0.4,
        max: 2.0,
        step: 0.05,
        defaultValue: 1.1,
        storage: { kind: 'effect' },
      },
      {
        key: 'width',
        label: 'Width',
        min: 0.02,
        max: 0.2,
        step: 0.01,
        defaultValue: 0.06,
        storage: { kind: 'effect' },
      },
    ],
  },
  HIT_GLITCH: {
    id: 'HIT_GLITCH',
    label: 'Hit Glitch',
    group: 'REACTIVE',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'amount',
    pass: 'REACTIVE',
    params: [
      {
        key: 'amount',
        label: 'Amount',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.4,
        storage: { kind: 'effect' },
      },
      {
        key: 'slices',
        label: 'Slices',
        min: 4,
        max: 40,
        step: 1,
        defaultValue: 12,
        storage: { kind: 'effect' },
      },
      {
        key: 'chroma',
        label: 'Chroma',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        storage: { kind: 'effect' },
      },
    ],
  },
  ROLL_BAR: {
    id: 'ROLL_BAR',
    label: 'Vertical Roll Bar',
    group: 'ANALOG',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'intensity',
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.18,
        storage: { kind: 'effect' },
        uniform: 'u_rollIntensity',
      },
      {
        key: 'speed',
        label: 'Speed',
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.08,
        storage: { kind: 'effect' },
        uniform: 'u_rollSpeed',
      },
      {
        key: 'width',
        label: 'Width',
        min: 0.02,
        max: 0.4,
        step: 0.01,
        defaultValue: 0.12,
        storage: { kind: 'effect' },
        uniform: 'u_rollWidth',
      },
    ],
  },
  VHS_JITTER: {
    id: 'VHS_JITTER',
    label: 'VHS Jitter',
    group: 'ANALOG',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'amount',
    params: [
      {
        key: 'amount',
        label: 'Amount (px)',
        min: 0,
        max: 20,
        step: 0.5,
        defaultValue: 3,
        storage: { kind: 'effect' },
        uniform: 'u_jitterAmount',
      },
      {
        key: 'lines',
        label: 'Line Density',
        min: 50,
        max: 1200,
        step: 10,
        defaultValue: 400,
        storage: { kind: 'effect' },
        uniform: 'u_jitterLines',
      },
      {
        key: 'speed',
        label: 'Speed',
        min: 1,
        max: 30,
        step: 1,
        defaultValue: 10,
        storage: { kind: 'effect' },
        uniform: 'u_jitterSpeed',
      },
    ],
  },
  GRAIN: {
    id: 'GRAIN',
    label: 'Film Grain',
    group: 'ANALOG',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'amount',
    params: [
      {
        key: 'amount',
        label: 'Amount',
        min: 0,
        max: 0.5,
        step: 0.01,
        defaultValue: 0.08,
        storage: { kind: 'effect' },
        uniform: 'u_grainAmount',
      },
      {
        key: 'darkBias',
        label: 'Dark Bias',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.7,
        storage: { kind: 'effect' },
        uniform: 'u_grainDarkBias',
      },
    ],
  },
  TRACKING: {
    id: 'TRACKING',
    label: 'Tracking Bands',
    group: 'ANALOG',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'frequency',
    params: [
      {
        key: 'frequency',
        label: 'Frequency',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.15,
        storage: { kind: 'effect' },
        uniform: 'u_trackFrequency',
      },
      {
        key: 'height',
        label: 'Band Height',
        min: 0.01,
        max: 0.3,
        step: 0.01,
        defaultValue: 0.06,
        storage: { kind: 'effect' },
        uniform: 'u_trackHeight',
      },
      {
        key: 'shift',
        label: 'Shift (px)',
        min: 0,
        max: 40,
        step: 1,
        defaultValue: 8,
        storage: { kind: 'effect' },
        uniform: 'u_trackShift',
      },
      {
        key: 'desaturate',
        label: 'Desaturate',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.6,
        storage: { kind: 'effect' },
        uniform: 'u_trackDesaturate',
      },
    ],
  },
};

export const POST_EFFECT_IDS = Object.keys(POST_EFFECTS) as PostEffectId[];

const TIER_RANK: Record<Exclude<QualityTier, 'AUTO'>, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  ULTRA: 3,
};

export function tierMeetsMinimum(
  current: Exclude<QualityTier, 'AUTO'>,
  required: Exclude<QualityTier, 'AUTO'>,
): boolean {
  return TIER_RANK[current] >= TIER_RANK[required];
}
