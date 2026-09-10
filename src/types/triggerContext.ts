import type { Vector2D } from '../math/Vector2D';
import type { Entity } from '../entities/Entity';
import type { AbilitySchema, PathPoint } from './schema/types';

export interface ExecutionOverrides {
  originOverride?: Vector2D;
  aimDirOverride?: Vector2D;
  depth?: number;
  chargeRatio?: number;
  comboStep?: number;
  drawnPath?: PathPoint[];
}

export interface TriggerContext {
  origin: Vector2D;
  heading: Vector2D;
  aimPoint?: Vector2D;
  normal?: Vector2D;
  caster: Entity;
  sourceEntity?: Entity;
  targetEntity?: Entity;
  depth: number;
  chargeRatio?: number;
  comboStep?: number;
  ability?: Partial<AbilitySchema>;
}
