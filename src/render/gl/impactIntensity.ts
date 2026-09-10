import { CATEGORY_BUDGETS } from '../../ai/budget/constants';
import { scoreAbilitySchema } from '../../ai/budget/score';
import { getTierLimits } from '../../devtools/graphicsSettings';
import type { SkillCategory } from '../../types/cards';
import type { AbilitySchema } from '../../types/schema';

const STORAGE_KEY = 'luna_impact_intensity_tuning';

export interface ImpactIntensityTuning {
  /** Asymptotic curve constant for x / (x + k). Higher k = slower saturation. */
  curveK: number;
  /** Weight of static scope floor vs runtime punch (0..1). */
  scopeWeight: number;
  blurCeiling: number;
  glitchCeiling: number;
  shockCeiling: number;
  /** Shake gets a lower ceiling than blur/glitch (Q12). */
  shakeCeiling: number;
  particleCeiling: number;
}

export const DEFAULT_IMPACT_INTENSITY_TUNING: ImpactIntensityTuning = {
  curveK: 1.35,
  scopeWeight: 0.45,
  blurCeiling: 1,
  glitchCeiling: 1,
  shockCeiling: 1,
  shakeCeiling: 0.55,
  particleCeiling: 1,
};

export let impactIntensityTuning: ImpactIntensityTuning = {
  ...DEFAULT_IMPACT_INTENSITY_TUNING,
};

export function loadImpactIntensityTuning(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ImpactIntensityTuning>;
    impactIntensityTuning = { ...DEFAULT_IMPACT_INTENSITY_TUNING, ...parsed };
  } catch {
    impactIntensityTuning = { ...DEFAULT_IMPACT_INTENSITY_TUNING };
  }
}

export function saveImpactIntensityTuning(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(impactIntensityTuning));
  } catch {
    /* ignore */
  }
}

export function resetImpactIntensityTuning(): void {
  impactIntensityTuning = { ...DEFAULT_IMPACT_INTENSITY_TUNING };
  saveImpactIntensityTuning();
}

/** Asymptotic map x / (x + k) into 0..1 (never quite reaches 1 for finite x). */
export function asymptotic01(x: number, k = impactIntensityTuning.curveK): number {
  const v = Math.max(0, x);
  const kk = k > 0 ? k : DEFAULT_IMPACT_INTENSITY_TUNING.curveK;
  return v / (v + kk);
}

export function normalizeScopePower(
  ability: AbilitySchema,
  category: SkillCategory = 'SECONDARY',
): number {
  const target = CATEGORY_BUDGETS[category]?.targetPower ?? CATEGORY_BUDGETS.SECONDARY.targetPower;
  const power = scoreAbilitySchema(ability);
  return asymptotic01(power / Math.max(1, target));
}

export interface ImpactRuntimeSignals {
  instabilityDelta?: number;
  projectileSpeed?: number;
  closingSpeed?: number;
  plasmaDetonated?: boolean;
  verticalImpactSpeed?: number;
}

/**
 * Scope sets the floor; runtime punch raises intensity above it.
 * Returns a 0..1 signal that never saturates to exactly 1.0 for finite inputs.
 */
export function computeImpactIntensity(
  scopeNorm: number,
  runtime: ImpactRuntimeSignals = {},
  tuning: ImpactIntensityTuning = impactIntensityTuning,
): number {
  const scope = Math.max(0, Math.min(1.5, scopeNorm));
  const instab = Math.max(0, runtime.instabilityDelta ?? 0) / 50;
  const speed = Math.max(0, runtime.projectileSpeed ?? 0) / 800;
  const closing = Math.max(0, runtime.closingSpeed ?? 0) / 600;
  const vertical = Math.max(0, runtime.verticalImpactSpeed ?? 0) / 800;
  const plasma = runtime.plasmaDetonated ? 0.35 : 0;
  const punch = asymptotic01(instab + speed + closing + vertical + plasma, tuning.curveK);

  const w = Math.max(0, Math.min(1, tuning.scopeWeight));
  // Scope floor + punch into remaining headroom — larger spells stay louder on grazes.
  const floor = scope * w;
  const combined = floor + punch * (1 - floor * 0.5);
  return Math.max(0, Math.min(0.999, asymptotic01(combined, tuning.curveK)));
}

export function channelIntensity(
  intensity: number,
  channel: 'blur' | 'glitch' | 'shock' | 'shake' | 'particle',
  tuning: ImpactIntensityTuning = impactIntensityTuning,
): number {
  const ceilings: Record<typeof channel, number> = {
    blur: tuning.blurCeiling,
    glitch: tuning.glitchCeiling,
    shock: tuning.shockCeiling,
    shake: tuning.shakeCeiling,
    particle: tuning.particleCeiling,
  };
  return Math.max(0, Math.min(ceilings[channel], intensity * ceilings[channel]));
}

/** Scale particle demand by intensity without exceeding tier particle budget headroom. */
export function intensityParticleScale(intensity: number, authoredScale = 1): number {
  const particle = channelIntensity(intensity, 'particle');
  const budget = getTierLimits().particleBudget;
  const headroom = Math.min(1, budget / 1024);
  return Math.max(0.25, authoredScale * (0.35 + particle * 0.65) * Math.min(1, headroom));
}
