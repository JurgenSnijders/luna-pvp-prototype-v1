import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
import { lerpPos } from './canvas/helpers';
import type { ShadowOccluder } from './shadowGeometry';

export const SHADOW_MAX_Z = 40;
export const MAX_SHADOW_OCCLUDERS = 64;

function pushCircle(
  out: ShadowOccluder[],
  x: number,
  y: number,
  r: number,
): void {
  if (out.length >= MAX_SHADOW_OCCLUDERS) return;
  if (r <= 0) return;
  out.push({ kind: 'CIRCLE', x, y, r });
}

function tryEntityCircle(out: ShadowOccluder[], entity: Entity, alpha: number): void {
  if (entity.isDead) return;
  if (entity.z > SHADOW_MAX_Z) return;
  const pos = lerpPos(entity, alpha);
  pushCircle(out, pos.x, pos.y, entity.radius);
}

export function collectShadowOccluders(
  world: PhysicsWorld,
  alpha: number,
  out: ShadowOccluder[] = [],
): ShadowOccluder[] {
  out.length = 0;
  for (const obstacle of world.obstacles) {
    if (obstacle.isDead) continue;
    const { shape, width, height, angle } = obstacle.config;
    if (out.length >= MAX_SHADOW_OCCLUDERS) break;
    if (shape === 'CIRCLE') {
      pushCircle(out, obstacle.pos.x, obstacle.pos.y, width / 2);
    } else {
      out.push({
        kind: 'BOX',
        x: obstacle.pos.x,
        y: obstacle.pos.y,
        hw: width / 2,
        hh: height / 2,
        angle: angle ?? 0,
      });
    }
  }
  for (const player of world.players) {
    if (out.length >= MAX_SHADOW_OCCLUDERS) break;
    tryEntityCircle(out, player, alpha);
  }
  for (const dummy of world.dummies) {
    if (out.length >= MAX_SHADOW_OCCLUDERS) break;
    tryEntityCircle(out, dummy, alpha);
  }
  for (const summon of world.summons) {
    if (out.length >= MAX_SHADOW_OCCLUDERS) break;
    tryEntityCircle(out, summon, alpha);
  }
  return out;
}
