import { Vector2D } from '../../math/Vector2D';
import type { EmitterConfig, SpellArchetype, VisualDescriptor } from '../../types/schema';

export const MAX_DEPTH = 3;

export interface ArchetypeTuning {
  impactInstabilityScale: number;
  tickInstabilityScale: number;
  fieldStrengthScale: number;
}

export const ARCHETYPE_TUNING: Record<SpellArchetype, ArchetypeTuning> = {
  KINETIC: { impactInstabilityScale: 1.5, tickInstabilityScale: 0.5, fieldStrengthScale: 1.0 },
  FIRE: { impactInstabilityScale: 0.6, tickInstabilityScale: 2.0, fieldStrengthScale: 0.8 },
  FROST: { impactInstabilityScale: 0.4, tickInstabilityScale: 0.8, fieldStrengthScale: 0.5 },
  LIGHTNING: { impactInstabilityScale: 1.2, tickInstabilityScale: 1.2, fieldStrengthScale: 1.2 },
  VOID: { impactInstabilityScale: 0.5, tickInstabilityScale: 1.0, fieldStrengthScale: 2.5 },
  HOLY: { impactInstabilityScale: 1.0, tickInstabilityScale: 0.8, fieldStrengthScale: 1.0 },
  TOXIC: { impactInstabilityScale: 0.5, tickInstabilityScale: 1.8, fieldStrengthScale: 0.7 },
  ARCANE: { impactInstabilityScale: 1.0, tickInstabilityScale: 1.0, fieldStrengthScale: 1.0 },
  MAGNETIC: { impactInstabilityScale: 1.0, tickInstabilityScale: 1.0, fieldStrengthScale: 1.8 },
  SONIC: { impactInstabilityScale: 2.2, tickInstabilityScale: 1.0, fieldStrengthScale: 1.2 },
  AERO: { impactInstabilityScale: 0.2, tickInstabilityScale: 0.5, fieldStrengthScale: 2.0 },
  GRAVITY: { impactInstabilityScale: 0.4, tickInstabilityScale: 1.0, fieldStrengthScale: 2.2 },
  EARTH: { impactInstabilityScale: 1.4, tickInstabilityScale: 0.3, fieldStrengthScale: 1.0 },
  CHRONO: { impactInstabilityScale: 0.8, tickInstabilityScale: 1.5, fieldStrengthScale: 1.5 },
  PLASMA: { impactInstabilityScale: 1.3, tickInstabilityScale: 1.5, fieldStrengthScale: 1.0 },
  NATURE: { impactInstabilityScale: 0.3, tickInstabilityScale: 1.2, fieldStrengthScale: 1.4 },
  BLOOD: { impactInstabilityScale: 1.8, tickInstabilityScale: 1.8, fieldStrengthScale: 1.0 },
  PHASE: { impactInstabilityScale: 1.0, tickInstabilityScale: 1.0, fieldStrengthScale: 1.0 },
  CHAOS: { impactInstabilityScale: 1.5, tickInstabilityScale: 1.5, fieldStrengthScale: 1.5 },
};

/** Archetypes whose status is a debuff, safe to auto-apply from field overlap.
 * Excludes KINETIC (fallback), AERO (mobility), and self/exotic sets. */
export const FIELD_STATUS_ARCHETYPES: ReadonlySet<SpellArchetype> = new Set([
  'FROST',
  'FIRE',
  'TOXIC',
  'VOID',
  'GRAVITY',
  'EARTH',
  'PLASMA',
  'LIGHTNING',
  'SONIC',
  'MAGNETIC',
  'CHAOS',
]);

export const FIELD_STATUS_INTERVAL_MS = 300;
export const FIELD_STATUS_DURATION_MS = 1200;
/** Rim deadband: the occupant's center must be inside ~85% of the zone radius. */
export const FIELD_STATUS_MIN_FALLOFF = 0.15;

export const DEFAULT_EMITTER: EmitterConfig = {
  count: 1,
  spreadDeg: 0,
  distribution: 'FAN',
};

export const DEFAULT_VISUALS: VisualDescriptor = {
  color: '#00e5ff',
  size: 8,
  projectileStyle: 'DISC',
  trailType: 'NONE',
  impactVfx: 'SPARKS',
};

// Degenerate-case fallback (e.g. caster and target at the same point) so relational
// direction math never divides by zero / produces NaN velocities.
export const FALLBACK_DIR = new Vector2D(0, 1);
