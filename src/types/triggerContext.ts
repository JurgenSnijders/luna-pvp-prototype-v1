import type { Vector2D } from '../math/Vector2D';
import type { Entity } from '../entities/Entity';

export interface TriggerContext {
  origin: Vector2D;
  heading: Vector2D;
  normal?: Vector2D;
  caster: Entity;
  sourceEntity?: Entity;
  targetEntity?: Entity;
  depth: number;
}
