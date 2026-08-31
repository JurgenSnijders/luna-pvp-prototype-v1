import { Vector2D } from '../../math/Vector2D';
import type { EmitterConfig, VisualDescriptor } from '../../types/schema';

export const MAX_DEPTH = 3;

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
