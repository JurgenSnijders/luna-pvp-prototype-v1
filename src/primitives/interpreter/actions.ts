import { clampToHex } from '../../math/HexMath';
import { Vector2D } from '../../math/Vector2D';
import { MAX_ENTITIES, type PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Entity } from '../../entities/Entity';
import { Obstacle } from '../../entities/Obstacle';
import { Player } from '../../entities/Player';
import { Projectile } from '../../entities/Projectile';
import { ConstraintJoint } from '../../entities/ConstraintJoint';
import { SpatialZone } from '../../entities/SpatialZone';
import { Summon } from '../../entities/Summon';
import type {
  ActionPayload,
  EmitterConfig,
  TrajectoryConfig,
  TriggerNode,
  VisualDescriptor,
} from '../../types/schema';
import type { TriggerContext } from '../../types/triggerContext';
import type { Interpreter } from './Interpreter';
import { DEFAULT_EMITTER, DEFAULT_VISUALS, MAX_DEPTH } from './constants';
import { buildTriggerMap, safeNormalize, secondaryColor } from './helpers';
import { resolveActionTarget, resolveRelationalDirection } from './targeting';

export function executeEmitter(
  interp: Interpreter,
  emitter: EmitterConfig,
  trajectory: TrajectoryConfig,
  triggers: TriggerNode[] | undefined,
  visuals: VisualDescriptor | undefined,
  ctx: TriggerContext,
  world: PhysicsWorld,
): void {
  if (ctx.depth >= MAX_DEPTH) return;
  if (world.getEntityCount() >= MAX_ENTITIES) return;

  const count = Math.max(1, Math.min(12, emitter.count));
  const spreadRad = (emitter.spreadDeg * Math.PI) / 180;
  const aimOffsetRad = ((emitter.aimOffsetDeg ?? 0) * Math.PI) / 180;
  const baseHeading =
    ctx.heading.magSq() > 0 ? ctx.heading.normalize() : Vector2D.fromAngle(0);
  const baseAngle = Math.atan2(baseHeading.y, baseHeading.x) + aimOffsetRad;
  const triggerMap = buildTriggerMap(triggers ?? []);
  const vfx = visuals ?? DEFAULT_VISUALS;
  const inherit = emitter.inheritVelocityRatio ?? 0;

  for (let i = 0; i < count; i++) {
    if (!world.canAddEntity()) break;

    let theta: number;
    switch (emitter.distribution) {
      case 'RADIAL':
        theta = baseAngle + (i * (Math.PI * 2)) / count;
        break;
      case 'RANDOM_CONE':
        theta = baseAngle + (Math.random() - 0.5) * spreadRad;
        break;
      case 'PARALLEL':
        theta = baseAngle;
        break;
      case 'FAN':
      default:
        if (count === 1) {
          theta = baseAngle;
        } else {
          theta = baseAngle - spreadRad / 2 + i * (spreadRad / (count - 1));
        }
        break;
    }

    const fireDir = Vector2D.fromAngle(theta);
    const projectile = new Projectile(
      ctx.origin.clone(),
      structuredClone(trajectory),
      ctx.caster.id,
      theta,
      triggerMap,
      ctx.depth + 1,
      vfx,
    );

    if (inherit > 0 && ctx.sourceEntity) {
      const inherited = ctx.sourceEntity.vel.scale(inherit);
      projectile.vel = projectile.vel.add(inherited);
    }

    if (trajectory.type === 'ORBIT_ANCHOR') {
      projectile.maxLifetimeMs = 3000;
      projectile.orbitAngle = theta;
    }

    world.addProjectile(projectile);
  }

  interp.particles?.burstSparks(ctx.origin, Math.min(6, count * 2), vfx.color);
}

export function dispatchAction(
  interp: Interpreter,
  action: ActionPayload,
  ctx: TriggerContext,
  world: PhysicsWorld,
): void {
  const scale = 1.0 + (ctx.chargeRatio ?? 0);

  switch (action.type) {
    case 'ADD_INSTABILITY': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      t.instabilityPct = Math.min(500, t.instabilityPct + action.amount * scale);
      break;
    }
    case 'APPLY_IMPULSE': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      const dir = resolveRelationalDirection(action.directionMode, ctx, t, action.direction);
      world.applyKnockback(t, dir, action.baseForce * scale);
      interp.particles?.burstSparks(ctx.origin, 8, interp.activeCastVisuals?.color ?? '#ffaa44');
      break;
    }
    case 'SPAWN_FIELD': {
      const field = { ...action.field, strength: action.field.strength * scale };
      const parent = field.attachToSource ? (ctx.sourceEntity ?? ctx.caster) : null;

      // Option A dedup: a parent may only carry one live attached zone per fieldType, so
      // repeated ON_TICK spawns refresh the existing well instead of stacking pull forces.
      if (parent) {
        const existing = world.zones.find(
          (z) => !z.isDead && z.parentRef === parent && z.config.fieldType === field.fieldType,
        );
        if (existing) {
          existing.remainingDurationMs = Math.max(existing.remainingDurationMs, field.durationMs);
          break;
        }
      }

      const offset = field.offset ? new Vector2D(field.offset.x, field.offset.y) : Vector2D.zero();
      const spawnPos = parent ? parent.pos.add(offset) : ctx.origin.clone();
      const zone = new SpatialZone(spawnPos, field, ctx.caster.id);
      if (parent) {
        zone.parentRef = parent;
        zone.offset = offset;
        zone.detachOnParentDeath = field.detachOnParentDeath ?? true;
      }
      world.addZone(zone);
      interp.particles?.expandingRing(spawnPos, field.radius, interp.activeCastVisuals?.color ?? '#aa44ff');
      break;
    }
    case 'SPAWN_CONSTRAINT': {
      const { constraint } = action;
      let bodyA: Entity | null;
      let bodyB: Entity | undefined;
      let anchorB: Vector2D | undefined;

      if (constraint.type === 'SURFACE_PIN') {
        bodyA = resolveActionTarget(action.target ?? 'TARGET', ctx);
        if (!bodyA || bodyA.isDead) break;
        anchorB = bodyA.pos.clone();
      } else {
        bodyA = resolveActionTarget(action.source ?? 'SELF', ctx);
        bodyB = resolveActionTarget(action.target ?? 'TARGET', ctx) ?? undefined;
        if (!bodyA || bodyA.isDead || !bodyB || bodyB.isDead) break;
        if (bodyA.id === bodyB.id) break;
      }

      world.addConstraint(new ConstraintJoint(constraint, bodyA, bodyB, anchorB));
      break;
    }
    case 'SPAWN_PROJECTILE': {
      const inheritedVisuals =
        action.visuals ??
        (ctx.sourceEntity instanceof Projectile ? ctx.sourceEntity.visuals : null) ??
        interp.activeCastVisuals ??
        DEFAULT_VISUALS;
      executeEmitter(
        interp,
        action.emitter ?? DEFAULT_EMITTER,
        action.projectileTrajectory,
        action.triggers,
        inheritedVisuals,
        ctx,
        world,
      );
      break;
    }
    case 'TELEPORT': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      let dir: Vector2D;
      if (action.direction) {
        dir = new Vector2D(action.direction.x, action.direction.y).normalize();
      } else {
        dir =
          ctx.heading.magSq() > 0
            ? ctx.heading.normalize()
            : Vector2D.fromAngle(
                ctx.caster instanceof Player ? ctx.caster.facingAngle : 0,
              );
      }
      const dest = t.pos.add(dir.scale(action.distance));
      t.pos = clampToHex(dest, world.hexCenter, world.hexRadius);
      interp.particles?.burstSparks(t.pos, 12, secondaryColor(interp.activeCastVisuals, '#44ffff'));
      break;
    }
    case 'CAST_CHILD_PAYLOAD': {
      const currentDepth = ctx.depth;
      const maxDepth = Math.min(action.maxRecursionDepth ?? 1, MAX_DEPTH);
      if (currentDepth >= maxDepth) break;

      const spawnOrigin = (ctx.sourceEntity ?? ctx.caster).pos.clone();

      let aimDirOverride: Vector2D | undefined;
      const sourceEntity = ctx.sourceEntity;
      if (action.inheritVelocity && sourceEntity && sourceEntity.vel.magSq() > 0) {
        aimDirOverride = safeNormalize(sourceEntity.vel);
      } else if (action.target) {
        const t = resolveActionTarget(action.target, ctx);
        if (t) {
          const dir = t.pos.sub(spawnOrigin);
          if (dir.magSq() > 0) aimDirOverride = dir.normalize();
        }
      } else if (ctx.heading.magSq() > 0) {
        aimDirOverride = ctx.heading.clone();
      }

      interp.executeAbility(action.payload, ctx, world, {
        originOverride: spawnOrigin,
        aimDirOverride,
        depth: currentDepth + 1,
      });
      break;
    }
    case 'MODIFY_STAT': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      applyModifyStat(t, action.stat, action.value * scale, action.mode);
      break;
    }
    case 'APPLY_STASIS': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      t.stasisRemainingMs = Math.max(t.stasisRemainingMs, action.durationMs);
      t.forceAccumulatorScale = action.forceAccumulatorScale ?? 1.0;
      t.vel = Vector2D.zero();
      break;
    }
    case 'RELEASE_STASIS': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t || t.stasisRemainingMs <= 0) break;
      t.stasisRemainingMs = 0;
      t.dischargeStasis();
      break;
    }
    case 'REFLECT_PROJECTILES': {
      const t = resolveActionTarget(action.target ?? 'SELF', ctx);
      if (!t) break;

      if (t instanceof Projectile) {
        reflectProjectile(t, ctx.caster.id);
        break;
      }

      const radius = action.radius ?? 150;
      const radiusSq = radius * radius;
      let reflected = 0;
      for (const proj of world.projectiles) {
        if (proj.isDead) continue;
        if (proj.sourceEntityId === ctx.caster.id) continue;
        if (proj.pos.distSq(t.pos) > radiusSq) continue;
        reflectProjectile(proj, ctx.caster.id);
        reflected++;
      }
      if (reflected > 0) {
        interp.particles?.expandingRing(t.pos, radius, secondaryColor(interp.activeCastVisuals, '#88ccff'));
      }
      break;
    }
    case 'SPAWN_OBSTACLE': {
      const t = resolveActionTarget(action.target, ctx);
      const pos = (t ?? ctx.caster).pos.clone();
      const obstacleConfig = { ...action.obstacle };
      if (obstacleConfig.shape === 'BOX' && obstacleConfig.angle === undefined) {
        const aim = t ? t.pos.sub(ctx.caster.pos) : ctx.heading;
        if (aim.magSq() > 0) {
          obstacleConfig.angle = Math.atan2(aim.y, aim.x);
        }
      }
      world.addObstacle(new Obstacle(pos, obstacleConfig));
      break;
    }
    case 'MUTATE_TERRAIN': {
      const t = resolveActionTarget(action.target, ctx);
      const pos = (t ?? ctx.caster).pos.clone();
      world.addTerrainPatch(pos, action.mutation);
      break;
    }
    case 'MORPH_ENTITY': {
      const t = resolveActionTarget(action.target ?? 'CASTER', ctx);
      if (!t) break;
      t.activeMorph = action.morph;
      t.morphRemainingMs = action.morph.durationMs;
      break;
    }
    case 'APPLY_STEALTH': {
      const t = resolveActionTarget(action.target ?? 'CASTER', ctx);
      if (!t) break;
      t.stealthRemainingMs = action.durationMs;
      t.stealthRevealOnCast = action.revealOnCast ?? true;
      break;
    }
    case 'SPAWN_ACTOR': {
      const t = resolveActionTarget(action.target, ctx);
      const pos = t ? t.pos.clone() : ctx.origin.clone();
      const summon = new Summon(pos, action.actor, ctx.caster.id);
      world.addSummon(summon);
      break;
    }
  }
}

export function reflectProjectile(projectile: Projectile, newOwnerId: string): void {
  projectile.vel = projectile.vel.scale(-1);
  projectile.sourceEntityId = newOwnerId;
  projectile.isDead = false;
  projectile.expiryReason = null;
}

export function applyModifyStat(
  entity: Entity,
  stat: 'mass' | 'linearDrag' | 'moveSpeed' | 'instabilityPct',
  value: number,
  mode: 'add' | 'set' | 'multiply',
): void {
  const apply = (current: number): number => {
    switch (mode) {
      case 'add':
        return current + value;
      case 'set':
        return value;
      case 'multiply':
        return current * value;
    }
  };

  switch (stat) {
    case 'mass':
      entity.mass = apply(entity.mass);
      break;
    case 'linearDrag':
      entity.linearDrag = apply(entity.linearDrag);
      entity.baseLinearDrag = entity.linearDrag;
      break;
    case 'instabilityPct':
      entity.instabilityPct = Math.min(500, Math.max(0, apply(entity.instabilityPct)));
      break;
    case 'moveSpeed':
      if (entity instanceof Player) {
        entity.moveSpeed = apply(entity.moveSpeed);
      }
      break;
  }
}
