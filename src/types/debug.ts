import { Vector2D } from '../math/Vector2D';

export type DebugVectorType = 'IMPULSE' | 'FIELD' | 'CONSTRAINT' | 'COLLISION' | 'STEERING';

export interface DebugForceVector {
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  magnitude: number;
  color: string;
  label?: string;
  lifetimeMs?: number;
}

export const DEBUG_VECTOR_COLORS = {
  IMPULSE: '#22c55e',
  FIELD: '#a855f7',
  CONSTRAINT: '#06b6d4',
  COLLISION: '#eab308',
  STEERING: '#f97316',
} as const;

export function makeDebugVector(
  origin: Vector2D,
  direction: Vector2D,
  magnitude: number,
  color: string,
  label?: string,
): DebugForceVector {
  const dir = direction.magSq() > 0 ? direction.normalize() : Vector2D.zero();
  return {
    originX: origin.x,
    originY: origin.y,
    dirX: dir.x,
    dirY: dir.y,
    magnitude,
    color,
    label,
  };
}
