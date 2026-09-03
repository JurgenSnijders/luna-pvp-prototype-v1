import type { QualityTier } from '../../devtools/graphicsSettings';
import { GRADE_LUTS } from './gradeLuts';
import {
  DEFAULT_BLUR_HALF_LIFE,
  DEFAULT_GLITCH_HALF_LIFE,
  DEFAULT_HEAVY_PULSE,
  DEFAULT_LIGHT_PULSE,
  DEFAULT_SHOCK_DURATION,
} from './reactiveFx';
import { RETRO_PALETTES } from './retroPalettes';

const PALETTE_SELECT_OPTIONS = RETRO_PALETTES.map((palette, index) => ({
  value: index,
  label: palette.label,
}));

const LUT_SELECT_OPTIONS = GRADE_LUTS.map((lut, index) => ({
  value: index,
  label: lut.label,
}));

const MASK_TYPE_OPTIONS = [
  { value: 0, label: 'Aperture Grille' },
  { value: 1, label: 'Slot Mask' },
  { value: 2, label: 'Shadow Mask' },
];

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
  | 'ANAMORPHIC'
  | 'LUT'
  | 'HALATION'
  | 'BEAM_BLUR'
  | 'CONVERGENCE'
  | 'GLASS_GLARE';

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
  widget?: 'slider' | 'select' | 'numberSlider';
  options?: { value: number; label: string }[];
  unit?: string;
}

export type PostEffectGroup = 'CRT' | 'RETRO' | 'REACTIVE' | 'GRADE';

export type StreakTarget =
  | 'COMBAT_ONLY'
  | 'COMBAT_NO_ENTITIES'
  | 'ALL_NO_ENTITIES'
  | 'ALL';

export const STREAK_BODY_CAP = 48;

export const STREAK_TARGET_OPTIONS = [
  { value: 0, label: 'Combat VFX Only' },
  { value: 2, label: 'Combat VFX (no entities)' },
  { value: 3, label: 'Full Scene (no entities)' },
  { value: 1, label: 'Full Scene' },
] as const;

export function resolveStreakTarget(value: number): StreakTarget {
  if (value === 1) return 'ALL';
  if (value === 2) return 'COMBAT_NO_ENTITIES';
  if (value === 3) return 'ALL_NO_ENTITIES';
  return 'COMBAT_ONLY';
}

export function streakTargetNeedsExtract(target: StreakTarget): boolean {
  return target !== 'ALL';
}

export function streakTargetFiltersArena(target: StreakTarget): boolean {
  return target === 'COMBAT_ONLY' || target === 'COMBAT_NO_ENTITIES';
}

export function streakTargetFiltersEntities(target: StreakTarget): boolean {
  return target === 'COMBAT_NO_ENTITIES' || target === 'ALL_NO_ENTITIES';
}

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
      {
        key: 'type',
        label: 'Mask Type',
        min: 0,
        max: 2,
        step: 1,
        defaultValue: 0,
        storage: { kind: 'effect' },
        widget: 'select',
        options: MASK_TYPE_OPTIONS,
      },
    ],
  },
  HALATION: {
    id: 'HALATION',
    label: 'CRT Halation',
    group: 'CRT',
    minTier: 'HIGH',
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
        defaultValue: 0.35,
        storage: { kind: 'effect' },
        uniform: 'u_halation',
      },
    ],
  },
  BEAM_BLUR: {
    id: 'BEAM_BLUR',
    label: 'Beam Blur',
    group: 'CRT',
    minTier: 'HIGH',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'amount',
    params: [
      {
        key: 'amount',
        label: 'Amount',
        min: 0,
        max: 4,
        step: 0.25,
        defaultValue: 1.5,
        storage: { kind: 'effect' },
        uniform: 'u_beamBlur',
      },
    ],
  },
  CONVERGENCE: {
    id: 'CONVERGENCE',
    label: 'RGB Convergence',
    group: 'CRT',
    minTier: 'HIGH',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'amount',
    params: [
      {
        key: 'amount',
        label: 'Amount',
        min: 0,
        max: 4,
        step: 0.1,
        defaultValue: 0.8,
        storage: { kind: 'effect' },
        uniform: 'u_convergence',
      },
    ],
  },
  GLASS_GLARE: {
    id: 'GLASS_GLARE',
    label: 'Glass Glare',
    group: 'CRT',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 0,
    defaultEnabled: false,
    masterParam: 'intensity',
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        storage: { kind: 'effect' },
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
        max: 4,
        step: 0.01,
        defaultValue: 0.45,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'halfLife',
        label: 'Half-Life',
        min: 0.01,
        max: 2,
        step: 0.01,
        defaultValue: DEFAULT_BLUR_HALF_LIFE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
        unit: 's',
      },
      {
        key: 'light',
        label: 'Light Hit',
        min: 0,
        max: 4,
        step: 0.01,
        defaultValue: DEFAULT_LIGHT_PULSE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'heavy',
        label: 'Heavy Hit',
        min: 0,
        max: 4,
        step: 0.01,
        defaultValue: DEFAULT_HEAVY_PULSE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
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
        max: 4,
        step: 0.01,
        defaultValue: 0.35,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'speed',
        label: 'Speed',
        min: 0.05,
        max: 8,
        step: 0.01,
        defaultValue: 1.1,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'width',
        label: 'Width',
        min: 0.001,
        max: 1,
        step: 0.001,
        defaultValue: 0.06,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'duration',
        label: 'Duration',
        min: 0.05,
        max: 3,
        step: 0.01,
        defaultValue: DEFAULT_SHOCK_DURATION,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
        unit: 's',
      },
      {
        key: 'light',
        label: 'Light Hit',
        min: 0,
        max: 4,
        step: 0.01,
        defaultValue: DEFAULT_LIGHT_PULSE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'heavy',
        label: 'Heavy Hit',
        min: 0,
        max: 4,
        step: 0.01,
        defaultValue: DEFAULT_HEAVY_PULSE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
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
        max: 4,
        step: 0.01,
        defaultValue: 0.4,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'slices',
        label: 'Slices',
        min: 1,
        max: 120,
        step: 1,
        defaultValue: 12,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'chroma',
        label: 'Chroma',
        min: 0,
        max: 4,
        step: 0.01,
        defaultValue: 0.5,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'halfLife',
        label: 'Half-Life',
        min: 0.01,
        max: 2,
        step: 0.01,
        defaultValue: DEFAULT_GLITCH_HALF_LIFE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
        unit: 's',
      },
      {
        key: 'light',
        label: 'Light Hit',
        min: 0,
        max: 4,
        step: 0.01,
        defaultValue: DEFAULT_LIGHT_PULSE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
      {
        key: 'heavy',
        label: 'Heavy Hit',
        min: 0,
        max: 4,
        step: 0.01,
        defaultValue: DEFAULT_HEAVY_PULSE,
        storage: { kind: 'effect' },
        widget: 'numberSlider',
      },
    ],
  },
  ANAMORPHIC: {
    id: 'ANAMORPHIC',
    label: 'Anamorphic Streaks',
    group: 'GRADE',
    minTier: 'HIGH',
    conflictsWith: [],
    costHint: 2,
    defaultEnabled: false,
    masterParam: 'intensity',
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.7,
        storage: { kind: 'effect' },
      },
      {
        key: 'length',
        label: 'Length',
        min: 2,
        max: 24,
        step: 1,
        defaultValue: 8,
        storage: { kind: 'effect' },
      },
      {
        key: 'target',
        label: 'Streak Target',
        min: 0,
        max: 3,
        step: 1,
        defaultValue: 0,
        storage: { kind: 'effect' },
        widget: 'select',
        options: [...STREAK_TARGET_OPTIONS],
      },
    ],
  },
  LUT: {
    id: 'LUT',
    label: 'LUT Color Grade',
    group: 'GRADE',
    minTier: 'MEDIUM',
    conflictsWith: [],
    costHint: 1,
    defaultEnabled: false,
    masterParam: 'mix',
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
        label: 'LUT',
        min: 0,
        max: 3,
        step: 1,
        defaultValue: 0,
        storage: { kind: 'effect' },
        widget: 'select',
        options: LUT_SELECT_OPTIONS,
      },
      {
        key: 'saturation',
        label: 'Saturation',
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 1,
        storage: { kind: 'effect' },
      },
      {
        key: 'contrast',
        label: 'Contrast',
        min: 0.5,
        max: 2,
        step: 0.05,
        defaultValue: 1,
        storage: { kind: 'effect' },
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
