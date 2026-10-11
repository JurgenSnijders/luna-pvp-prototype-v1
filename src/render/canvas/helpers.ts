import type { Entity } from '../../entities/Entity';
import { lerpEntityPos, lerpEntityZ } from '../../sim/ecs/slots';

export function lerpPos(entity: Entity, alpha: number) {
  return lerpEntityPos(entity, alpha);
}

export function lerpZ(entity: Entity, alpha: number): number {
  return lerpEntityZ(entity, alpha);
}
