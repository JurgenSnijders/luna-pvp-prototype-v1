import type { QualityTier } from '../../devtools/graphicsSettings';

export type PostEffectId = 'SCANLINES' | 'PHOSPHOR' | 'CURVATURE' | 'VIGNETTE' | 'TINT';

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
}

export type PostEffectGroup = 'CRT' | 'ANALOG' | 'RETRO' | 'REACTIVE' | 'GRADE';

export interface PostEffectDef {
  id: PostEffectId;
  label: string;
  group: PostEffectGroup;
  minTier: Exclude<QualityTier, 'AUTO'>;
  conflictsWith: PostEffectId[];
  costHint: number;
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
    params: [],
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
