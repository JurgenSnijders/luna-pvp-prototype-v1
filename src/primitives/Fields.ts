import { Vector2D } from '../math/Vector2D';
import { getInstabilityScale, type PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
import type { SpatialZone } from '../entities/SpatialZone';
import { CombatLogger } from '../telemetry/CombatLogger';
import { vecTelemetry } from '../types/telemetry';
import { DEBUG_VECTOR_COLORS, makeDebugVector } from '../types/debug';
import { ARCHETYPE_TUNING } from './interpreter/constants';

function recordFieldForce(
  world: PhysicsWorld,
  entity: Entity,
  zone: SpatialZone,
  force: Vector2D,
): void {
  if (!world.debugPhysicsEnabled || force.magSq() === 0) return;
  world.recordDebugVector(
    makeDebugVector(
      entity.pos,
      force,
      force.mag(),
      DEBUG_VECTOR_COLORS.FIELD,
      `${zone.config.fieldType}:${Math.round(zone.config.strength)}`,
    ),
  );
}

function recordFieldTick(
  zone: SpatialZone,
  entity: Entity,
  force: Vector2D,
  dist: number,
  dt: number,
): void {
  if (force.magSq() === 0) return;
  const velocityBefore = vecTelemetry(entity.vel);
  const projectedVel = entity.vel.add(force.scale(dt));
  CombatLogger.getInstance().record({
    type: 'FIELD_ACCEL_TICK',
    zoneId: zone.id,
    fieldType: zone.config.fieldType,
    targetId: entity.id,
    fieldCenter: { x: zone.pos.x, y: zone.pos.y },
    distance: dist,
    strength: zone.config.strength,
    acceleration: vecTelemetry(force),
    velocityBefore,
    velocityAfter: vecTelemetry(projectedVel),
  });
}

export function applyField(
  zone: SpatialZone,
  entity: Entity,
  dt: number,
  world: PhysicsWorld,
): void {
  if (entity.tags.has('projectile') || entity.tags.has('zone')) return;
  if (!entity.tags.has('combatant')) return;

  const dist = entity.pos.dist(zone.pos);
  if (dist > zone.config.radius + entity.radius) return;

  const falloff = Math.max(0, 1 - dist / zone.config.radius);
  const radial = entity.pos.sub(zone.pos);
  const radialDir = radial.magSq() > 0 ? radial.normalize() : null;
  const tuning = ARCHETYPE_TUNING[zone.spellArchetype ?? 'KINETIC'];

  switch (zone.config.fieldType) {
    case 'RADIAL_IMPULSE': {
      if (!radialDir) break;
      entity.instabilityPct = Math.min(
        500,
        entity.instabilityPct +
          Math.abs(zone.config.strength) * 0.005 * dt * tuning.tickInstabilityScale,
      );
      const forceScale = getInstabilityScale(entity.instabilityPct) * tuning.fieldStrengthScale;
      const sign = zone.config.strength >= 0 ? 1 : -1;
      const force = radialDir
        .scale(Math.abs(zone.config.strength) * falloff * sign)
        .scale(forceScale);
      entity.accel = entity.accel.add(force);
      recordFieldForce(world, entity, zone, force);
      recordFieldTick(zone, entity, force, dist, dt);
      break;
    }
    case 'VORTEX_TANGENT': {
      if (!radialDir) break;
      entity.instabilityPct = Math.min(
        500,
        entity.instabilityPct +
          Math.abs(zone.config.strength) * 0.005 * dt * tuning.tickInstabilityScale,
      );
      const forceScale = getInstabilityScale(entity.instabilityPct) * tuning.fieldStrengthScale;
      const tangent = new Vector2D(-radialDir.y, radialDir.x);
      const tangentSign = zone.config.strength >= 0 ? 1 : -1;
      const tangentForce = tangent
        .scale(Math.abs(zone.config.strength) * falloff * tangentSign)
        .scale(forceScale);
      const inward = radialDir
        .scale(-Math.abs(zone.config.strength) * falloff * 0.2)
        .scale(forceScale);
      const combined = tangentForce.add(inward);
      entity.accel = entity.accel.add(combined);
      recordFieldForce(world, entity, zone, combined);
      recordFieldTick(zone, entity, combined, dist, dt);
      break;
    }
    case 'FRICTION_OVERRIDE':
      entity.linearDrag = zone.config.frictionValue ?? 0.02;
      break;
    case 'MASS_ATTRACTOR': {
      entity.instabilityPct = Math.min(
        500,
        entity.instabilityPct +
          Math.abs(zone.config.strength) * 0.005 * dt * tuning.tickInstabilityScale,
      );
      const forceScale = getInstabilityScale(entity.instabilityPct) * tuning.fieldStrengthScale;
      const toZone = zone.pos.sub(entity.pos);
      if (toZone.magSq() === 0) break;
      const dir = toZone.normalize();
      const sign = zone.config.strength >= 0 ? 1 : -1;
      const pull = dir
        .scale(Math.abs(zone.config.strength) * falloff * sign)
        .scale(forceScale);
      entity.accel = entity.accel.add(pull);
      recordFieldForce(world, entity, zone, pull);
      recordFieldTick(zone, entity, pull, dist, dt);
      break;
    }
  }
}
