import type { SkillCategory } from '../../types/cards';
import type { TrajectoryType } from '../../types/schema';

export const CATEGORY_BUDGETS: Record<
  SkillCategory,
  { targetPower: number; minCdMs: number; baseCdScale: number }
> = {
  PRIMARY: { targetPower: 70, minCdMs: 500, baseCdScale: 900 },
  SECONDARY: { targetPower: 110, minCdMs: 1200, baseCdScale: 1500 },
  UTILITY: { targetPower: 120, minCdMs: 2500, baseCdScale: 2000 },
  ULTIMATE: { targetPower: 240, minCdMs: 6000, baseCdScale: 3500 },
  MOBILITY: { targetPower: 90, minCdMs: 2000, baseCdScale: 1800 },
};

export const TRAJECTORY_WEIGHTS: Record<TrajectoryType, number> = {
  LINEAR: 1.0,
  RETURN_TO_SOURCE: 1.4,
  HOMING_SLERP: 1.8,
  ORBIT_ANCHOR: 1.3,
  DISCONTINUOUS_BLINK: 1.6,
};

export const MAX_DEPTH = 3;
export const MODIFY_STAT_COST = 5.0;

export const TRAJECTORY_TYPES = new Set([
  'LINEAR',
  'RETURN_TO_SOURCE',
  'ORBIT_ANCHOR',
  'HOMING_SLERP',
  'DISCONTINUOUS_BLINK',
]);

export const EMITTER_DISTRIBUTIONS = new Set([
  'FAN',
  'RADIAL',
  'RANDOM_CONE',
  'PARALLEL',
]);

export const PROJECTILE_STYLES = new Set([
  'DISC',
  'BEAM',
  'PULSING_ORB',
  'SHURIKEN',
  'CHAOS_LIGHTNING',
  'PRISM',
  'RUNE_SIGIL',
  'PLASMA_TENDRIL',
  'VOID_RIFT',
  'CRYSTAL_SHARD',
]);
export const TRAIL_TYPES = new Set([
  'NONE',
  'SMOKE',
  'ICE_GLOW',
  'MAGMA_SPARKS',
  'NEON_RIBBON',
  'EMBER_SPIRAL',
  'FROST_CRYSTALS',
  'VOID_TENDRIL',
  'PLASMA_ARC',
  'DUST_PUFF',
]);
export const IMPACT_VFX_TYPES = new Set([
  'SPARKS',
  'SHOCKWAVE',
  'ICE_BURST',
  'VORTEX_SWIRL',
  'MINI_NUKE',
  'PLASMA_BLOOM',
  'SHATTER',
  'IMPLOSION',
  'LIGHTNING_FORK',
  'RUNE_FLASH',
]);
export const FIELD_TYPES = new Set([
  'RADIAL_IMPULSE',
  'VORTEX_TANGENT',
  'FRICTION_OVERRIDE',
  'MASS_ATTRACTOR',
]);
export const CONSTRAINT_TYPES = new Set(['SPRING_TETHER', 'DISTANCE_ROD', 'SURFACE_PIN']);
export const CONDITION_QUERIES = new Set([
  'STAT_THRESHOLD',
  'TAG_CHECK',
  'PROXIMITY_COUNT',
  'SURFACE_TYPE',
  'COMBO_STEP',
]);
export const INPUT_PROFILE_MODES = new Set([
  'INSTANT',
  'CHARGE_AND_RELEASE',
  'CHANNELED',
  'COMBO_CHAIN',
]);
export const COMPARISON_OPERATORS = new Set(['LT', 'GT', 'EQ', 'LTE', 'GTE']);
export const ACTION_TARGETS = new Set(['TARGET', 'CASTER', 'SELF']);
export const IMPULSE_DIRECTION_MODES = new Set([
  'AWAY_FROM_ORIGIN',
  'TOWARDS_CASTER',
  'TOWARDS_ORIGIN',
  'ALONG_TRAJECTORY',
  'PERPENDICULAR_TRAJECTORY',
  'CUSTOM',
]);
