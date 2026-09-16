import { Vector2D } from '../math/Vector2D';
import type { Entity } from '../entities/Entity';
import type { FieldArcFacing } from '../types/schema';

/** World-space facing angle (radians) for an entity, with velocity fallback. */
export function entityFacingAngle(entity: Entity): number {
  const withFacing = entity as Entity & { facingAngle?: number };
  if (typeof withFacing.facingAngle === 'number' && Number.isFinite(withFacing.facingAngle)) {
    return withFacing.facingAngle;
  }
  if (entity.vel.magSq() > 0.01) {
    return Math.atan2(entity.vel.y, entity.vel.x);
  }
  return 0;
}

/** Resolve arc bisector angle (radians) from facing mode and offsets. */
export function resolveArcFacingRad(
  arcFacing: FieldArcFacing,
  arcOffsetDeg: number,
  ctx: { entityFacingRad: number; castHeadingRad: number },
): number {
  const offset = (arcOffsetDeg * Math.PI) / 180;
  switch (arcFacing) {
    case 'CASTER_FACING':
      return ctx.entityFacingRad + offset;
    case 'FIXED':
      return offset;
    case 'CAST_HEADING':
    default:
      return ctx.castHeadingRad + offset;
  }
}

/** True when point lies inside the arc wedge (or wedge is disabled). */
export function isPointInArcWedge(
  center: Vector2D,
  point: Vector2D,
  arcDeg: number | undefined,
  facingRad: number,
): boolean {
  if (arcDeg === undefined || arcDeg >= 360) return true;
  if (arcDeg <= 0) return false;
  const radial = point.sub(center);
  if (radial.magSq() <= 1e-6) return true;
  const facing = Vector2D.fromAngle(facingRad);
  const dir = radial.normalize();
  const cosHalf = Math.cos((arcDeg * Math.PI) / 360);
  return facing.dot(dir) >= cosHalf - 1e-6;
}
