import type { Entity } from '../../entities/Entity';
import { Vector2D } from '../../math/Vector2D';

export function lerpPos(entity: Entity, alpha: number): Vector2D {
  return entity.prevPos.lerp(entity.pos, alpha);
}
