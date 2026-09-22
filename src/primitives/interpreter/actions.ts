import { resolveCursorBallisticTrajectory } from '../../math/ballisticSolver';
import { clampToHex } from '../../math/HexMath';
import { Vector2D } from '../../math/Vector2D';
import { MAX_ENTITIES, getInstabilityScale, type PhysicsWorld } from '../../engine/PhysicsWorld';
import { MAX_ABS_VZ, WORLD_GRAVITY } from '../../engine/verticalConstants';
import { Entity } from '../../entities/Entity';
import { Obstacle } from '../../entities/Obstacle';
import { Player } from '../../entities/Player';
import { Projectile } from '../../entities/Projectile';
import { ConstraintJoint } from '../../entities/ConstraintJoint';
import { SpatialZone } from '../../entities/SpatialZone';
import { Summon } from '../../entities/Summon';
import type {
  ActionPayload,
  EmitterConfig,
  FieldArcFacing,
  SpellArchetype,
  TrajectoryConfig,
  TriggerNode,
  VisualDescriptor,
} from '../../types/schema';
import type { TriggerContext } from '../../types/triggerContext';
import { deltaVec, vecTelemetry } from '../../types/telemetry';
import { CombatLogger } from '../../telemetry/CombatLogger';
import type { Interpreter } from './Interpreter';
import { hasBallisticParams, initBallisticKinematics } from '../Trajectories';
import { DEFAULT_EMITTER, DEFAULT_VISUALS, MAX_DEPTH, ARCHETYPE_TUNING } from './constants';
import {
  buildTriggerMap,
  resolveCastAnchor,
  resolvePlacedDeployAnchor,
  safeNormalize,
  secondaryColor,
} from './helpers';
import { entityFacingAngle, isPointInArcWedge, resolveArcFacingRad } from '../arcWedge';
import { getArchetypeColor } from '../../render/canvas/SpellIconGenerator';
import { resolveActionTarget, resolveRelationalDirection } from './targeting';

function getArchetypeTuning(ctx: TriggerContext) {
  return ARCHETYPE_TUNING[ctx.ability?.archetype ?? 'KINETIC'];
}

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
  const muzzleEntity = ctx.sourceEntity ?? ctx.caster;
  const muzzleOffset = muzzleEntity.radius + Math.max(4, vfx.size ?? 8);
  const spawnTrajectory =
    ctx.depth === 0 && ctx.aimPoint
      ? resolveCursorBallisticTrajectory(
          trajectory,
          ctx.origin,
          ctx.aimPoint,
          muzzleOffset,
          baseHeading,
          ctx.ability,
        )
      : trajectory;

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
    const isSkyDrop = (spawnTrajectory.spawnAltitude ?? 0) > 0;
    const spawnAtAnchor =
      ctx.ability?.targetingMode === 'GROUND_POINT' &&
      isSkyDrop &&
      !(ctx.sourceEntity instanceof Projectile);
    const isGroundTargeted = spawnAtAnchor;
    const anchor = resolveCastAnchor(ctx, world, ctx.origin);
    const basePos = isGroundTargeted ? anchor : ctx.origin;
    const useDiskScatter = isGroundTargeted && isSkyDrop && count > 1;

    let spawnPos: Vector2D;
    let aimAngle: number;
    if (useDiskScatter) {
      const scatterRadius = Math.min(120, (vfx.size ?? 14) * 4 + count * 15);
      const angle = (i / count) * Math.PI * 2 + i * 1.618;
      const dist = i === 0 ? 0 : scatterRadius * Math.sqrt((i + 0.5) / count);
      const offset = new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist);
      spawnPos = basePos.add(offset);
      aimAngle = 0;
    } else {
      spawnPos = isGroundTargeted
        ? basePos.add(fireDir.scale(i * 4))
        : basePos.add(fireDir.scale(muzzleOffset));
      aimAngle = theta;
    }

    const projectile = new Projectile(
      spawnPos,
      structuredClone(spawnTrajectory),
      ctx.caster.id,
      aimAngle,
      triggerMap,
      ctx.depth + 1,
      vfx,
      '',
      ctx.ability?.archetype,
      i,
    );

    if (inherit > 0 && ctx.sourceEntity) {
      const inherited = ctx.sourceEntity.vel.scale(inherit);
      projectile.vel = projectile.vel.add(inherited);
    }

    if (spawnTrajectory.type === 'ORBIT_ANCHOR') {
      projectile.maxLifetimeMs = 3000;
      projectile.orbitAngle = theta;
    }

    if (hasBallisticParams(spawnTrajectory)) {
      initBallisticKinematics(projectile, spawnTrajectory);
    }

    if (ctx.sourceEntity instanceof Projectile) {
      projectile.z = ctx.sourceEntity.z;
      projectile.prevZ = ctx.sourceEntity.z;
      if (ctx.sourceEntity.z > 0) {
        projectile.obstacleGraceFrames = 2;
      }
    }

    if (ctx.sourceEntity) projectile.registerHit(ctx.sourceEntity.id);
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
      t.addInstability(action.amount * scale, world);
      break;
    }
    case 'APPLY_IMPULSE': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      const tuning = getArchetypeTuning(ctx);
      const implicitSpike = (action.baseForce * 0.02) * tuning.impactInstabilityScale * scale;
      t.addInstability(implicitSpike, world);
      const dir = resolveRelationalDirection(action.directionMode, ctx, t, action.direction);
      const velocityBefore = vecTelemetry(t.vel);
      const normalized = dir.magSq() > 0 ? dir.normalize() : Vector2D.zero();
      const instabilityScale = getInstabilityScale(t.instabilityPct);
      const resistance = Math.min(0.75, t.knockbackResistance ?? 0);
      const deltaVel = normalized.scale(
        ((action.baseForce * scale) / t.effectiveMass) * instabilityScale * (1 - resistance),
      );
      t.applyKineticImpulse(deltaVel, world);
      const velocityAfter = vecTelemetry(t.vel);
      CombatLogger.getInstance().record({
        type: 'IMPULSE_APPLIED',
        sourceId: ctx.caster.id,
        targetId: t.id,
        abilityId: ctx.ability?.name,
        baseForce: action.baseForce * scale,
        directionMode: action.directionMode ?? 'NONE',
        appliedDirection: vecTelemetry(normalized),
        targetMass: t.effectiveMass,
        deltaVelocity: deltaVec(velocityBefore, velocityAfter),
        velocityBefore,
        velocityAfter,
      });
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
      let spawnPos: Vector2D;
      if (parent) {
        if (field.arcFacing === 'CASTER_FACING') {
          const withFacing = parent as { facingAngle?: number };
          const a =
            typeof withFacing.facingAngle === 'number'
              ? withFacing.facingAngle
              : Math.atan2(ctx.heading.y, ctx.heading.x);
          const c = Math.cos(a);
          const s = Math.sin(a);
          spawnPos = parent.pos.add(
            new Vector2D(offset.x * c - offset.y * s, offset.x * s + offset.y * c),
          );
        } else {
          spawnPos = parent.pos.add(offset);
        }
      } else {
        spawnPos = ctx.aimPoint
          ? resolvePlacedDeployAnchor(ctx, world, ctx.origin)
          : resolveCastAnchor(ctx, world, ctx.origin);
      }
      const archetype = ctx.ability?.archetype ?? 'KINETIC';
      const zone = new SpatialZone(spawnPos, field, ctx.caster.id, archetype);
      const defaultHeading =
        ctx.heading.magSq() > 0.01 ? ctx.heading.normalize() : Vector2D.fromAngle(0);
      zone.castHeading = defaultHeading;
      if (!parent) {
        const arcFacing = field.arcFacing ?? 'CAST_HEADING';
        if (arcFacing === 'CAST_HEADING') {
          const disp = spawnPos.sub(ctx.caster.pos);
          if (disp.magSq() > 0.01) {
            zone.castHeading = disp.normalize();
          }
        }
      }
      if (parent) {
        zone.parentRef = parent;
        zone.offset = offset;
        zone.detachOnParentDeath = field.detachOnParentDeath ?? true;
      }
      world.addZone(zone);
      interp.particles?.expandingRing(
        spawnPos,
        field.radius,
        interp.activeCastVisuals?.color ?? getArchetypeColor(archetype),
      );
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
        (ctx.sourceEntity instanceof Summon ? ctx.sourceEntity.visuals : null) ??
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
      const scaledValue = action.value * scale;
      if (action.stat === 'health' && scaledValue < 0) {
        const tuning = getArchetypeTuning(ctx);
        const implicitSpike = Math.abs(scaledValue) * 0.5 * tuning.impactInstabilityScale;
        t.addInstability(implicitSpike, world);
      }
      const prevHealth = t.health;
      applyModifyStat(t, action.stat, scaledValue, action.mode);
      if (action.stat === 'health' && world) {
        const healAmount = t.health - prevHealth;
        if (healAmount > 0) {
          world.emitCombatVisualEvent({
            type: 'HEAL',
            pos: { x: t.pos.x, y: t.pos.y },
            value: healAmount,
            archetype: ctx.ability?.archetype,
            targetId: t.id,
          });
        }
      }
      break;
    }
    case 'APPLY_STASIS': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      if (t.stasisRemainingMs <= 0) {
        t.enterStasisVertical();
      }
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

      const radius = action.radius ?? 150;
      const castHeadingRad = Math.atan2(ctx.heading.y, ctx.heading.x);
      const shieldColor = secondaryColor(interp.activeCastVisuals, '#88ccff');
      const durationMs = action.durationMs ?? 0;
      const whileHeld = action.whileHeld ?? false;
      const slotIndex = ctx.slotIndex;
      const playerCaster = ctx.caster instanceof Player ? ctx.caster : null;
      const slotHeld =
        whileHeld &&
        playerCaster !== null &&
        slotIndex !== undefined &&
        playerCaster.isSlotInputHeld(slotIndex);

      let live = false;
      let overlayWhileHeld = false;
      let overlaySlotIndex: number | undefined;
      let overlayDurationMs = 250;
      let holdCapMs: number | undefined;

      if (whileHeld && slotHeld) {
        live = true;
        overlayWhileHeld = true;
        overlaySlotIndex = slotIndex;
        if (durationMs > 0) {
          holdCapMs = durationMs;
          overlayDurationMs = durationMs;
        }
        world.removeWhileHeldParryShields(ctx.caster.id, slotIndex!);
      } else if (whileHeld) {
        const fallbackMs = durationMs > 0 ? durationMs : 350;
        live = true;
        overlayDurationMs = fallbackMs;
      } else {
        live = durationMs > 0;
        overlayDurationMs = live ? durationMs : 250;
      }

      world.spawnParryShieldOverlay({
        followEntityId: t.id,
        radius,
        arcDeg: action.arcDeg,
        arcFacing: action.arcFacing,
        arcOffsetDeg: action.arcOffsetDeg,
        castHeadingRad,
        color: shieldColor,
        durationMs: overlayDurationMs,
        live,
        casterId: ctx.caster.id,
        spellArchetype: ctx.ability?.archetype,
        parryRadius: t.radius,
        whileHeld: overlayWhileHeld,
        slotIndex: overlaySlotIndex,
        holdCapMs,
      });

      const emitDeflected = (proj: Projectile): void => {
        world.emitCombatVisualEvent({
          type: 'STATUS_APPLIED',
          pos: { x: proj.pos.x, y: proj.pos.y },
          label: 'DEFLECTED',
          archetype: ctx.ability?.archetype,
          targetId: t.id,
        });
      };

      if (t instanceof Projectile) {
        reflectProjectile(t, ctx.caster.id, { parryCenter: t.pos, parryRadius: t.radius });
        emitDeflected(t);
        break;
      }

      scanReflectProjectilesInWedge(world, t, ctx.caster.id, {
        radius,
        arcDeg: action.arcDeg,
        arcFacing: action.arcFacing,
        arcOffsetDeg: action.arcOffsetDeg,
        castHeadingRad,
        spellArchetype: ctx.ability?.archetype,
        targetId: t.id,
      });
      break;
    }
    case 'SPAWN_OBSTACLE': {
      const t = resolveActionTarget(action.target, ctx);
      let pos: Vector2D;
      if (ctx.aimPoint) {
        pos = resolvePlacedDeployAnchor(ctx, world, (t ?? ctx.caster).pos);
      } else if (ctx.ability?.targetingMode === 'GROUND_POINT') {
        pos = resolveCastAnchor(ctx, world, ctx.origin);
      } else {
        pos = (t ?? ctx.caster).pos.clone();
      }
      const obstacleConfig = { ...action.obstacle };
      if (obstacleConfig.shape === 'BOX') {
        const disp = pos.sub(ctx.caster.pos);
        const aim = disp.magSq() > 0.01 ? disp : ctx.heading;
        if (aim.magSq() > 0.01) {
          obstacleConfig.angle = Math.atan2(aim.y, aim.x) + Math.PI / 2;
        } else if (obstacleConfig.angle === undefined) {
          obstacleConfig.angle = 0;
        }
      }
      world.addObstacle(
        Object.assign(new Obstacle(pos, obstacleConfig), {
          spawnArchetype: ctx.ability?.archetype,
        }),
      );
      break;
    }
    case 'MUTATE_TERRAIN': {
      const t = resolveActionTarget(action.target, ctx);
      let pos: Vector2D;
      if (ctx.ability?.targetingMode === 'GROUND_POINT') {
        pos = resolveCastAnchor(ctx, world, ctx.origin);
      } else {
        pos = (t ?? ctx.caster).pos.clone();
      }
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
    case 'APPLY_STATUS': {
      const t = resolveActionTarget(action.target, ctx);
      if (!t) break;
      t.applyStatus(action.archetype, action.durationMs, action.stacks ?? 1, world);
      break;
    }
    case 'LAUNCH_VERTICAL': {
      const t = resolveActionTarget(action.target ?? 'CASTER', ctx);
      if (!t) break;
      if (t instanceof Summon && t.isImmovable()) break;
      let vz: number;
      if (action.targetApex !== undefined) {
        vz = Math.sqrt(2 * WORLD_GRAVITY * action.targetApex);
      } else {
        vz = action.verticalImpulse ?? 0;
      }
      vz = Math.max(-MAX_ABS_VZ, Math.min(MAX_ABS_VZ, vz));
      t.vz = vz;
      t.gravityScale = 1;
      t.isGrounded = false;
      break;
    }
    case 'SET_GRAVITY_SCALE': {
      const t = resolveActionTarget(action.target ?? 'CASTER', ctx);
      if (!t) break;
      const scale = Math.max(0, Math.min(8, action.scale));
      t.gravityScale = scale;
      if (action.durationMs !== undefined && action.durationMs > 0) {
        t.gravityScaleTimerMs = action.durationMs;
        t.gravityScaleBase = scale;
      }
      break;
    }
    case 'PLAY_VFX': {
      const visuals = ctx.ability?.visuals;
      const primary = visuals?.color ?? '#ff6644';
      const sec = secondaryColor(visuals, '#ffffff');
      const burstScale = action.scale ?? visuals?.vfx?.impactScale ?? 1;
      let pos = ctx.origin.clone();
      if (action.target) {
        const t = resolveActionTarget(action.target, ctx);
        if (t) pos = t.pos.clone();
      } else if (ctx.sourceEntity) {
        pos = ctx.sourceEntity.pos.clone();
      }
      if (action.layers && action.layers.length > 0) {
        interp.particles?.triggerImpactBurst(
          pos,
          primary,
          action.vfx ?? 'SPARKS',
          sec,
          burstScale,
          action.layers,
        );
      } else if (action.vfx) {
        interp.particles?.triggerImpactBurst(pos, primary, action.vfx, sec, burstScale);
      }
      break;
    }
    case 'SPAWN_ACTOR': {
      const t = resolveActionTarget(action.target, ctx);
      let pos: Vector2D;
      if (ctx.aimPoint) {
        pos = resolvePlacedDeployAnchor(ctx, world, t ? t.pos : ctx.origin);
      } else {
        pos = t ? t.pos.clone() : ctx.origin.clone();
        if (ctx.heading.magSq() > 0.01) {
          const actorRadius = action.actor.radius ?? 15;
          const hostRadius = t?.radius ?? ctx.caster.radius;
          pos = pos.add(ctx.heading.normalize().scale(hostRadius + actorRadius + 4));
        }
      }
      const summon = new Summon(pos, action.actor, ctx.caster.id, {
        depth: ctx.depth,
        spellArchetype: ctx.ability?.archetype,
        abilityName: ctx.ability?.name,
        visuals: action.actor.visuals ?? ctx.ability?.visuals ?? null,
      });
      if (action.actor.actorArchetype === 'TURRET') {
        const disp = pos.sub(ctx.caster.pos);
        const facing = disp.magSq() > 0.01 ? disp : ctx.heading;
        if (facing.magSq() > 0.01) {
          summon.facingAngle = Math.atan2(facing.y, facing.x);
        }
      }
      world.addSummon(summon);
      break;
    }
  }
}

export interface ReflectWedgeOptions {
  radius: number;
  arcDeg?: number;
  arcFacing?: FieldArcFacing;
  arcOffsetDeg?: number;
  castHeadingRad: number;
  spellArchetype?: SpellArchetype;
  targetId: string;
}

export function scanReflectProjectilesInWedge(
  world: PhysicsWorld,
  center: Entity,
  casterId: string,
  options: ReflectWedgeOptions,
): number {
  const radiusSq = options.radius * options.radius;
  const facingRad = resolveArcFacingRad(
    options.arcFacing ?? 'CAST_HEADING',
    options.arcOffsetDeg ?? 0,
    {
      entityFacingRad: entityFacingAngle(center),
      castHeadingRad: options.castHeadingRad,
    },
  );
  const parryCtx = { parryCenter: center.pos, parryRadius: center.radius };
  let reflected = 0;
  for (const proj of world.projectiles) {
    if (proj.isDead) continue;
    if (proj.sourceEntityId === casterId) continue;
    if (proj.pos.distSq(center.pos) > radiusSq) continue;
    if (!isPointInArcWedge(center.pos, proj.pos, options.arcDeg, facingRad)) continue;
    reflectProjectile(proj, casterId, parryCtx);
    world.emitCombatVisualEvent({
      type: 'STATUS_APPLIED',
      pos: { x: proj.pos.x, y: proj.pos.y },
      label: 'DEFLECTED',
      archetype: options.spellArchetype,
      targetId: options.targetId,
    });
    reflected++;
  }
  return reflected;
}

export function tickLiveParryShields(_interp: Interpreter, world: PhysicsWorld): void {
  for (const overlay of world.parryShieldOverlays) {
    if (!overlay.live || overlay.remainingMs <= 0) continue;
    const follow = world.getEntityById(overlay.followEntityId);
    if (!follow || follow.isDead) continue;
    scanReflectProjectilesInWedge(world, follow, overlay.casterId, {
      radius: overlay.radius,
      arcDeg: overlay.arcDeg,
      arcFacing: overlay.arcFacing,
      arcOffsetDeg: overlay.arcOffsetDeg,
      castHeadingRad: overlay.castHeadingRad,
      spellArchetype: overlay.spellArchetype,
      targetId: overlay.followEntityId,
    });
  }
}

export interface ReflectParryContext {
  parryCenter: Vector2D;
  parryRadius: number;
}

export function reflectProjectile(
  projectile: Projectile,
  newOwnerId: string,
  parry?: ReflectParryContext,
): void {
  const originalType = projectile.config.type;
  const speed = projectile.config.speed ?? 400;

  projectile.vel = projectile.vel.scale(-1);
  if (projectile.vel.magSq() > 1e-6) {
    projectile.aimAngle = Math.atan2(projectile.vel.y, projectile.vel.x);
  } else {
    projectile.aimAngle += Math.PI;
    projectile.vel = Vector2D.fromAngle(projectile.aimAngle, speed);
  }

  if (originalType === 'DRAWN_PATH' || originalType === 'ORBIT_ANCHOR') {
    projectile.config = { ...projectile.config, type: 'LINEAR' };
    projectile.pathWorldPoints = null;
    projectile.pathCumulative = null;
    projectile.pathTotalLength = 0;
  }

  if (originalType === 'RETURN_TO_SOURCE' && projectile.isReturning) {
    projectile.isReturning = false;
  }

  projectile.sourceEntityId = newOwnerId;
  projectile.isDead = false;
  projectile.expiryReason = null;

  if (parry) {
    const away =
      projectile.vel.magSq() > 0
        ? projectile.vel.normalize()
        : projectile.pos.sub(parry.parryCenter).normalize();
    const minSep = parry.parryRadius + projectile.radius + 2;
    if (projectile.pos.distSq(parry.parryCenter) < minSep * minSep) {
      projectile.pos = parry.parryCenter.add(away.scale(minSep));
    }
  }
}

export function applyModifyStat(
  entity: Entity,
  stat: 'mass' | 'linearDrag' | 'moveSpeed' | 'instabilityPct' | 'health',
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
      entity.instabilityPct = Math.min(
        Entity.maxInstability,
        Math.max(0, apply(entity.instabilityPct)),
      );
      break;
    case 'moveSpeed':
      if (entity instanceof Player) {
        entity.moveSpeed = apply(entity.moveSpeed);
      }
      break;
    case 'health':
      entity.health = Math.max(0, apply(entity.health));
      break;
  }
}
