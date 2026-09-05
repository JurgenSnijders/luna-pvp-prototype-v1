import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { Vector2D } from '../../math/Vector2D';
import type { Entity } from '../../entities/Entity';
import { Projectile } from '../../entities/Projectile';
import type { ActionPayload, ActionTarget, ImpulseDirectionMode } from '../../types/schema';
import type { TriggerContext } from '../../types/triggerContext';
import { FALLBACK_DIR } from './constants';
import { safeNormalize } from './helpers';

/** True when an action resolves against a struck combatant rather than the environment. */
export function actionRequiresTarget(action: ActionPayload): boolean {
  return 'target' in action && action.target === 'TARGET';
}

/** Returns living combatants within radius of center, excluding projectiles/zones and an optional id. */
export function queryCombatantsInRadius(
  world: PhysicsWorld,
  center: Vector2D,
  radius: number,
  excludeId?: string,
): Entity[] {
  const radiusSq = radius * radius;
  const results: Entity[] = [];
  for (const entity of world.getCombatants()) {
    if (entity.isDead) continue;
    if (excludeId && entity.id === excludeId) continue;
    if (entity.tags.has('projectile') || entity.tags.has('zone')) continue;
    if (entity.pos.distSq(center) <= radiusSq) {
      results.push(entity);
    }
  }
  return results;
}

/** Max SPAWN_FIELD radius on ON_GROUND_SLAM nodes; defaults to 48 when none authored. */
export function resolveSlamBlastRadius(projectile: Projectile): number {
  let maxRadius = 48;
  for (const node of projectile.getTriggers('ON_GROUND_SLAM')) {
    for (const action of node.actions) {
      if (action.type === 'SPAWN_FIELD' && action.field.radius) {
        maxRadius = Math.max(maxRadius, action.field.radius);
      }
    }
    if (node.ifFalseActions) {
      for (const action of node.ifFalseActions) {
        if (action.type === 'SPAWN_FIELD' && action.field.radius) {
          maxRadius = Math.max(maxRadius, action.field.radius);
        }
      }
    }
  }
  return maxRadius;
}

/** Resolves which entity an action should act on: the struck target, the caster, or the acting projectile itself. */
export function resolveActionTarget(
  mode: ActionTarget | undefined,
  ctx: TriggerContext,
): Entity | null {
  switch (mode) {
    case 'CASTER':
      return ctx.caster;
    case 'SELF':
      return ctx.sourceEntity ?? ctx.caster;
    case 'TARGET':
    default:
      return ctx.targetEntity ?? ctx.caster;
  }
}

/** Unit direction used by ALONG_TRAJECTORY / PERPENDICULAR_TRAJECTORY: the acting projectile's velocity, falling back to cast heading. */
export function resolveTrajectoryDirection(ctx: TriggerContext): Vector2D {
  if (ctx.sourceEntity && ctx.sourceEntity.vel.magSq() > 0) {
    return safeNormalize(ctx.sourceEntity.vel);
  }
  if (ctx.heading.magSq() > 0) {
    return safeNormalize(ctx.heading);
  }
  return FALLBACK_DIR;
}

/** Computes a dynamic physics direction (pull toward caster, along trajectory, etc.) instead of a static world vector. */
export function resolveRelationalDirection(
  mode: ImpulseDirectionMode | undefined,
  ctx: TriggerContext,
  target: Entity,
  customFallback?: { x: number; y: number },
): Vector2D {
  // Legacy payloads set only `direction` with no `directionMode` — honor it as CUSTOM.
  if ((mode === 'CUSTOM' || mode === undefined) && customFallback) {
    return safeNormalize(new Vector2D(customFallback.x, customFallback.y));
  }

  switch (mode) {
    case 'TOWARDS_CASTER':
      if (!ctx.caster || ctx.caster.id === target.id) return FALLBACK_DIR;
      return safeNormalize(ctx.caster.pos.sub(target.pos));
    case 'TOWARDS_ORIGIN':
      return safeNormalize(ctx.origin.sub(target.pos));
    case 'AWAY_FROM_ORIGIN':
      return safeNormalize(target.pos.sub(ctx.origin));
    case 'ALONG_TRAJECTORY':
      return resolveTrajectoryDirection(ctx);
    case 'PERPENDICULAR_TRAJECTORY': {
      const v = resolveTrajectoryDirection(ctx);
      return safeNormalize(new Vector2D(-v.y, v.x));
    }
    default:
      // Legacy default: outward collision normal, else away from the cast origin.
      if (ctx.normal && ctx.normal.magSq() > 0) return ctx.normal;
      return safeNormalize(target.pos.sub(ctx.origin));
  }
}
