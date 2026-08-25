import { Vector2D } from '../math/Vector2D';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Projectile } from '../entities/Projectile';

const RETURN_CONTACT_RADIUS = 24;
const BLINK_INTERVAL_MS = 150;

function rotateToward(current: Vector2D, target: Vector2D, maxRadians: number): Vector2D {
  const curMag = current.mag();
  if (curMag === 0) return target;
  const curAngle = Math.atan2(current.y, current.x);
  const targetAngle = Math.atan2(target.y, target.x);
  let delta = targetAngle - curAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const clamped = Math.max(-maxRadians, Math.min(maxRadians, delta));
  return Vector2D.fromAngle(curAngle + clamped, curMag);
}

export function updateTrajectory(
  proj: Projectile,
  dt: number,
  world: PhysicsWorld,
): void {
  if (proj.isDead) return;

  proj.prevPos.copyFrom(proj.pos);

  const config = proj.config;
  const speed = config.speed ?? 400;
  const maxRange = config.maxRange ?? 600;
  const turnAccel = config.turnAccel ?? 800;

  switch (config.type) {
    case 'LINEAR':
      updateLinear(proj, dt, speed, maxRange);
      break;
    case 'RETURN_TO_SOURCE':
      updateReturnToSource(proj, dt, world, speed, maxRange, turnAccel);
      break;
    case 'ORBIT_ANCHOR':
      updateOrbitAnchor(proj, dt, world, config.orbitRadius ?? 80, config.orbitSpeed ?? 3);
      break;
    case 'HOMING_SLERP':
      updateHomingSlerp(proj, dt, world, speed, turnAccel);
      break;
    case 'DISCONTINUOUS_BLINK':
      updateDiscontinuousBlink(proj, dt, speed, config.blinkDistance ?? 60);
      break;
  }
}

function updateLinear(
  proj: Projectile,
  dt: number,
  speed: number,
  maxRange: number,
): void {
  proj.vel = Vector2D.fromAngle(proj.aimAngle, speed);
  proj.pos = proj.pos.add(proj.vel.scale(dt));
  proj.distanceTraveled += speed * dt;

  if (proj.distanceTraveled >= maxRange) {
    proj.isDead = true;
    proj.expiryReason = 'range';
  }
}

function updateReturnToSource(
  proj: Projectile,
  dt: number,
  world: PhysicsWorld,
  speed: number,
  maxRange: number,
  turnAccel: number,
): void {
  const halfRange = maxRange * 0.5;

  if (!proj.isReturning) {
    proj.vel = Vector2D.fromAngle(proj.aimAngle, speed);
    proj.pos = proj.pos.add(proj.vel.scale(dt));
    proj.distanceTraveled += speed * dt;

    if (proj.distanceTraveled >= halfRange) {
      proj.isReturning = true;
    }
    return;
  }

  const caster = world.getEntityById(proj.sourceEntityId);
  if (!caster) {
    proj.isDead = true;
    proj.expiryReason = 'return';
    return;
  }

  const toCaster = caster.pos.sub(proj.pos);
  const dist = toCaster.mag();

  if (dist <= RETURN_CONTACT_RADIUS) {
    proj.onReturnTriggered = true;
    proj.isDead = true;
    proj.expiryReason = 'return';
    return;
  }

  const dir = toCaster.normalize();
  proj.vel = dir.scale(speed);
  proj.accel = dir.scale(turnAccel);
  proj.pos = proj.pos.add(proj.vel.scale(dt));
  proj.distanceTraveled += speed * dt;
}

function updateOrbitAnchor(
  proj: Projectile,
  dt: number,
  world: PhysicsWorld,
  orbitRadius: number,
  orbitSpeed: number,
): void {
  const anchor = world.getEntityById(proj.sourceEntityId);
  if (!anchor) {
    proj.isDead = true;
    proj.expiryReason = 'lifetime';
    return;
  }

  proj.orbitAngle += orbitSpeed * dt;
  const newPos = anchor.pos.add(Vector2D.fromAngle(proj.orbitAngle, orbitRadius));
  const delta = newPos.sub(proj.pos);
  proj.vel = delta.scale(1 / Math.max(dt, 0.001));
  proj.pos = newPos;
  proj.distanceTraveled += delta.mag();
}

function updateHomingSlerp(
  proj: Projectile,
  dt: number,
  world: PhysicsWorld,
  speed: number,
  turnAccel: number,
): void {
  const combatants = world.getCombatants();
  let nearestDistSq = Infinity;
  let nearestPos: Vector2D | null = null;

  for (const target of combatants) {
    if (target.id === proj.sourceEntityId) continue;
    const distSq = proj.pos.distSq(target.pos);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearestPos = target.pos;
    }
  }

  if (nearestPos) {
    const toTarget = nearestPos.sub(proj.pos).normalize().scale(speed);
    proj.vel = rotateToward(proj.vel.mag() > 0 ? proj.vel : toTarget, toTarget, turnAccel * dt);
  } else if (proj.vel.magSq() === 0) {
    proj.vel = Vector2D.fromAngle(proj.aimAngle, speed);
  } else {
    proj.vel = proj.vel.normalize().scale(speed);
  }

  proj.pos = proj.pos.add(proj.vel.scale(dt));
  proj.distanceTraveled += speed * dt;

  const maxRange = proj.config.maxRange ?? 600;
  if (proj.distanceTraveled >= maxRange) {
    proj.isDead = true;
    proj.expiryReason = 'range';
  }
}

function updateDiscontinuousBlink(
  proj: Projectile,
  dt: number,
  speed: number,
  blinkDistance: number,
): void {
  proj.blinkTimerMs += dt * 1000;

  if (proj.vel.magSq() === 0) {
    proj.vel = Vector2D.fromAngle(proj.aimAngle, speed);
  }

  if (proj.blinkTimerMs >= BLINK_INTERVAL_MS) {
    proj.blinkTimerMs = 0;
    const dir = proj.vel.normalize();
    proj.pos = proj.pos.add(dir.scale(blinkDistance));
    proj.distanceTraveled += blinkDistance;
  } else {
    proj.pos = proj.pos.add(proj.vel.scale(dt));
    proj.distanceTraveled += speed * dt;
  }

  const maxRange = proj.config.maxRange ?? 600;
  if (proj.distanceTraveled >= maxRange) {
    proj.isDead = true;
    proj.expiryReason = 'range';
  }
}
