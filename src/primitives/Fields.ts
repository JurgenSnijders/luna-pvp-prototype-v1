import { Vector2D } from '../math/Vector2D';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
import type { SpatialZone } from '../entities/SpatialZone';

export function applyField(
  zone: SpatialZone,
  entity: Entity,
  _dt: number,
  _world: PhysicsWorld,
): void {
  if (entity.tags.has('projectile') || entity.tags.has('zone')) return;
  if (!entity.tags.has('combatant')) return;

  const dist = entity.pos.dist(zone.pos);
  if (dist > zone.config.radius + entity.radius) return;

  const falloff = Math.max(0, 1 - dist / zone.config.radius);
  const radial = entity.pos.sub(zone.pos);
  const radialDir = radial.magSq() > 0 ? radial.normalize() : null;

  switch (zone.config.fieldType) {
    case 'RADIAL_IMPULSE': {
      if (!radialDir) break;
      const sign = zone.config.strength >= 0 ? 1 : -1;
      const force = radialDir.scale(Math.abs(zone.config.strength) * falloff * sign);
      entity.accel = entity.accel.add(force);
      break;
    }
    case 'VORTEX_TANGENT': {
      if (!radialDir) break;
      const tangent = new Vector2D(-radialDir.y, radialDir.x);
      const tangentSign = zone.config.strength >= 0 ? 1 : -1;
      const tangentForce = tangent.scale(Math.abs(zone.config.strength) * falloff * tangentSign);
      const inward = radialDir.scale(-Math.abs(zone.config.strength) * falloff * 0.2);
      entity.accel = entity.accel.add(tangentForce).add(inward);
      break;
    }
    case 'FRICTION_OVERRIDE':
      entity.linearDrag = zone.config.frictionValue ?? 0.02;
      break;
    case 'MASS_ATTRACTOR': {
      const toZone = zone.pos.sub(entity.pos);
      const distSq = Math.max(toZone.magSq(), 400);
      const pull = toZone.normalize().scale((zone.config.strength / distSq) * falloff);
      entity.accel = entity.accel.add(pull);
      break;
    }
  }
}
