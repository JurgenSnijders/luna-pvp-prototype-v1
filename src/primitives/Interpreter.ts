import { clampToHex } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import { MAX_ENTITIES, type PhysicsWorld } from '../engine/PhysicsWorld';
import { getGraphicsSettings } from '../devtools/graphicsSettings';
import type { Entity } from '../entities/Entity';
import { Obstacle } from '../entities/Obstacle';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { ConstraintJoint } from '../entities/ConstraintJoint';
import { SpatialZone } from '../entities/SpatialZone';
import { Summon } from '../entities/Summon';
import type { ParticleSystem } from '../render/ParticleSystem';
import type {
  AbilitySchema,
  ActionPayload,
  ActionTarget,
  ComparisonOperator,
  ConditionNode,
  EmitterConfig,
  ImpulseDirectionMode,
  TrajectoryConfig,
  TriggerNode,
  TriggerType,
  VisualDescriptor,
} from '../types/schema';
import type { TriggerContext, ExecutionOverrides } from '../types/triggerContext';
import { updateTrajectory } from './Trajectories';

const MAX_DEPTH = 3;

const DEFAULT_EMITTER: EmitterConfig = {
  count: 1,
  spreadDeg: 0,
  distribution: 'FAN',
};

const DEFAULT_VISUALS: VisualDescriptor = {
  color: '#00e5ff',
  size: 8,
  projectileStyle: 'DISC',
  trailType: 'NONE',
  impactVfx: 'SPARKS',
};

// Degenerate-case fallback (e.g. caster and target at the same point) so relational
// direction math never divides by zero / produces NaN velocities.
const FALLBACK_DIR = new Vector2D(0, 1);

function safeNormalize(v: Vector2D, fallback: Vector2D = FALLBACK_DIR): Vector2D {
  return v.magSq() > 0 ? v.normalize() : fallback;
}

export function buildTriggerMap(triggers: TriggerNode[]): Map<string, TriggerNode[]> {
  const map = new Map<string, TriggerNode[]>();
  for (const node of triggers) {
    const existing = map.get(node.trigger) ?? [];
    existing.push(node);
    map.set(node.trigger, existing);
  }
  return map;
}

function trailColor(visuals: VisualDescriptor | null | undefined): string | null {
  if (!visuals || visuals.trailType === 'NONE') return null;
  switch (visuals.trailType) {
    case 'SMOKE':
      return '#8899aa';
    case 'ICE_GLOW':
      return '#88ddff';
    case 'MAGMA_SPARKS':
      return '#ff6622';
    case 'NEON_RIBBON':
      return visuals.color;
    default:
      return visuals.color;
  }
}

export class Interpreter {
  particles: ParticleSystem | null = null;
  private returnTriggeredProjectiles: Projectile[] = [];
  private activeCastVisuals: VisualDescriptor | null = null;

  setParticleSystem(particles: ParticleSystem): void {
    this.particles = particles;
  }

  executeAbility(
    schema: AbilitySchema,
    ctx: TriggerContext,
    world: PhysicsWorld,
    overrides?: ExecutionOverrides,
  ): void {
    const depth = overrides?.depth ?? ctx.depth;
    if (depth > MAX_DEPTH) return;
    if (world.getEntityCount() >= MAX_ENTITIES) return;

    const origin = overrides?.originOverride?.clone() ?? ctx.origin.clone();
    const heading =
      overrides?.aimDirOverride && overrides.aimDirOverride.magSq() > 0
        ? safeNormalize(overrides.aimDirOverride)
        : ctx.heading.magSq() > 0
          ? ctx.heading.normalize()
          : Vector2D.fromAngle(0);
    const castCtx: TriggerContext = {
      ...ctx,
      heading,
      origin,
      depth,
      chargeRatio: overrides?.chargeRatio ?? ctx.chargeRatio,
      comboStep: overrides?.comboStep ?? ctx.comboStep,
    };

    const visuals = schema.visuals ?? DEFAULT_VISUALS;
    this.activeCastVisuals = visuals;
    this.particles?.triggerMuzzleFlash(castCtx.origin, heading, visuals.color);

    if (schema.recoilKick > 0 && depth === 0) {
      world.applyKnockback(castCtx.caster, heading.scale(-1), schema.recoilKick);
    }

    const onCastNodes = schema.triggers.filter((t) => t.trigger === 'ON_CAST');
    for (const node of onCastNodes) {
      this.dispatchTriggerNode(node, castCtx, world);
    }

    if (schema.trajectory) {
      const spawnPos =
        depth === 0
          ? castCtx.caster.pos.add(heading.scale(castCtx.caster.radius + 12))
          : castCtx.origin.clone();
      const aimAngle = Math.atan2(heading.y, heading.x);
      const triggerMap = buildTriggerMap(
        schema.triggers.filter((t) => t.trigger !== 'ON_CAST'),
      );
      const projectile = new Projectile(
        spawnPos,
        schema.trajectory,
        castCtx.caster.id,
        aimAngle,
        triggerMap,
        depth,
        visuals,
        schema.name,
      );
      if (schema.trajectory.type === 'ORBIT_ANCHOR') {
        projectile.maxLifetimeMs = 3000;
      }
      world.addProjectile(projectile);
    }

    this.activeCastVisuals = null;
  }

  private executeEmitter(
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

    this.particles?.burstSparks(ctx.origin, Math.min(6, count * 2), vfx.color);
  }

  private dispatchActions(
    actions: ActionPayload[],
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): void {
    for (const action of actions) {
      this.dispatchAction(action, ctx, world);
    }
  }

  /** Resolves which entity an action should act on: the struck target, the caster, or the acting projectile itself. */
  private resolveActionTarget(
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
  private resolveTrajectoryDirection(ctx: TriggerContext): Vector2D {
    if (ctx.sourceEntity && ctx.sourceEntity.vel.magSq() > 0) {
      return safeNormalize(ctx.sourceEntity.vel);
    }
    if (ctx.heading.magSq() > 0) {
      return safeNormalize(ctx.heading);
    }
    return FALLBACK_DIR;
  }

  /** Computes a dynamic physics direction (pull toward caster, along trajectory, etc.) instead of a static world vector. */
  private resolveRelationalDirection(
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
        return this.resolveTrajectoryDirection(ctx);
      case 'PERPENDICULAR_TRAJECTORY': {
        const v = this.resolveTrajectoryDirection(ctx);
        return safeNormalize(new Vector2D(-v.y, v.x));
      }
      default:
        // Legacy default: outward collision normal, else away from the cast origin.
        if (ctx.normal && ctx.normal.magSq() > 0) return ctx.normal;
        return safeNormalize(target.pos.sub(ctx.origin));
    }
  }

  private dispatchAction(
    action: ActionPayload,
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): void {
    const scale = 1.0 + (ctx.chargeRatio ?? 0);

    switch (action.type) {
      case 'ADD_INSTABILITY': {
        const t = this.resolveActionTarget(action.target, ctx);
        if (!t) break;
        t.instabilityPct = Math.min(500, t.instabilityPct + action.amount * scale);
        break;
      }
      case 'APPLY_IMPULSE': {
        const t = this.resolveActionTarget(action.target, ctx);
        if (!t) break;
        const dir = this.resolveRelationalDirection(action.directionMode, ctx, t, action.direction);
        world.applyKnockback(t, dir, action.baseForce * scale);
        this.particles?.burstSparks(ctx.origin, 8, '#ffaa44');
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
        this.particles?.expandingRing(spawnPos, field.radius, '#aa44ff');
        break;
      }
      case 'SPAWN_CONSTRAINT': {
        const { constraint } = action;
        let bodyA: Entity | null;
        let bodyB: Entity | undefined;
        let anchorB: Vector2D | undefined;

        if (constraint.type === 'SURFACE_PIN') {
          bodyA = this.resolveActionTarget(action.target ?? 'TARGET', ctx);
          if (!bodyA || bodyA.isDead) break;
          anchorB = bodyA.pos.clone();
        } else {
          bodyA = this.resolveActionTarget(action.source ?? 'SELF', ctx);
          bodyB = this.resolveActionTarget(action.target ?? 'TARGET', ctx) ?? undefined;
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
          this.activeCastVisuals ??
          DEFAULT_VISUALS;
        this.executeEmitter(
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
        const t = this.resolveActionTarget(action.target, ctx);
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
        this.particles?.burstSparks(t.pos, 12, '#44ffff');
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
          const t = this.resolveActionTarget(action.target, ctx);
          if (t) {
            const dir = t.pos.sub(spawnOrigin);
            if (dir.magSq() > 0) aimDirOverride = dir.normalize();
          }
        } else if (ctx.heading.magSq() > 0) {
          aimDirOverride = ctx.heading.clone();
        }

        this.executeAbility(action.payload, ctx, world, {
          originOverride: spawnOrigin,
          aimDirOverride,
          depth: currentDepth + 1,
        });
        break;
      }
      case 'MODIFY_STAT': {
        const t = this.resolveActionTarget(action.target, ctx);
        if (!t) break;
        this.applyModifyStat(t, action.stat, action.value * scale, action.mode);
        break;
      }
      case 'APPLY_STASIS': {
        const t = this.resolveActionTarget(action.target, ctx);
        if (!t) break;
        t.stasisRemainingMs = Math.max(t.stasisRemainingMs, action.durationMs);
        t.forceAccumulatorScale = action.forceAccumulatorScale ?? 1.0;
        t.vel = Vector2D.zero();
        break;
      }
      case 'RELEASE_STASIS': {
        const t = this.resolveActionTarget(action.target, ctx);
        if (!t || t.stasisRemainingMs <= 0) break;
        t.stasisRemainingMs = 0;
        t.dischargeStasis();
        break;
      }
      case 'REFLECT_PROJECTILES': {
        const t = this.resolveActionTarget(action.target ?? 'SELF', ctx);
        if (!t) break;

        if (t instanceof Projectile) {
          this.reflectProjectile(t, ctx.caster.id);
          break;
        }

        const radius = action.radius ?? 150;
        const radiusSq = radius * radius;
        let reflected = 0;
        for (const proj of world.projectiles) {
          if (proj.isDead) continue;
          if (proj.sourceEntityId === ctx.caster.id) continue;
          if (proj.pos.distSq(t.pos) > radiusSq) continue;
          this.reflectProjectile(proj, ctx.caster.id);
          reflected++;
        }
        if (reflected > 0) {
          this.particles?.expandingRing(t.pos, radius, '#88ccff');
        }
        break;
      }
      case 'SPAWN_OBSTACLE': {
        const t = this.resolveActionTarget(action.target, ctx);
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
        const t = this.resolveActionTarget(action.target, ctx);
        const pos = (t ?? ctx.caster).pos.clone();
        world.addTerrainPatch(pos, action.mutation);
        break;
      }
      case 'MORPH_ENTITY': {
        const t = this.resolveActionTarget(action.target ?? 'CASTER', ctx);
        if (!t) break;
        t.activeMorph = action.morph;
        t.morphRemainingMs = action.morph.durationMs;
        break;
      }
      case 'APPLY_STEALTH': {
        const t = this.resolveActionTarget(action.target ?? 'CASTER', ctx);
        if (!t) break;
        t.stealthRemainingMs = action.durationMs;
        t.stealthRevealOnCast = action.revealOnCast ?? true;
        break;
      }
      case 'SPAWN_ACTOR': {
        const t = this.resolveActionTarget(action.target, ctx);
        const pos = t ? t.pos.clone() : ctx.origin.clone();
        const summon = new Summon(pos, action.actor, ctx.caster.id);
        world.addSummon(summon);
        break;
      }
    }
  }

  private reflectProjectile(projectile: Projectile, newOwnerId: string): void {
    projectile.vel = projectile.vel.scale(-1);
    projectile.sourceEntityId = newOwnerId;
    projectile.isDead = false;
    projectile.expiryReason = null;
  }

  private applyModifyStat(
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

  private compareNumeric(
    current: number,
    op: ComparisonOperator,
    threshold: number,
  ): boolean {
    switch (op) {
      case 'LT':
        return current < threshold;
      case 'GT':
        return current > threshold;
      case 'EQ':
        return current === threshold;
      case 'LTE':
        return current <= threshold;
      case 'GTE':
        return current >= threshold;
    }
  }

  private evaluateCondition(
    cond: ConditionNode,
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): boolean {
    if (cond.query === 'COMBO_STEP') {
      return this.compareNumeric(
        ctx.comboStep ?? 0,
        cond.comparison ?? 'EQ',
        Number(cond.value),
      );
    }

    const t = this.resolveActionTarget(cond.target ?? 'TARGET', ctx);
    if (!t || t.isDead) return false;

    switch (cond.query) {
      case 'STAT_THRESHOLD': {
        const current = cond.stat === 'health' ? t.health : t.instabilityPct;
        return this.compareNumeric(
          current,
          cond.comparison ?? 'LT',
          Number(cond.value),
        );
      }
      case 'TAG_CHECK':
        return t.tags.has(String(cond.value));
      case 'PROXIMITY_COUNT': {
        const r = cond.radius ?? 100;
        const count = world
          .getEntitiesInRadius(t.pos, r)
          .filter((e) => e.id !== t.id).length;
        return this.compareNumeric(count, cond.comparison ?? 'GTE', Number(cond.value));
      }
      case 'SURFACE_TYPE': {
        const surface = world.getSurfaceTypeAt(t.pos);
        return surface.toUpperCase() === String(cond.value).toUpperCase();
      }
    }
  }

  private evaluateConditions(
    conditions: ConditionNode[],
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): boolean {
    return conditions.every((c) => this.evaluateCondition(c, ctx, world));
  }

  private dispatchTriggerNode(
    node: TriggerNode,
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): void {
    let passed = true;
    if (node.conditions && node.conditions.length > 0) {
      passed = this.evaluateConditions(node.conditions, ctx, world);
    }

    const actionsToRun = passed ? node.actions : (node.ifFalseActions ?? []);
    this.dispatchActions(actionsToRun, ctx, world);

    if (node.children) {
      for (const child of node.children) {
        this.dispatchTriggerNode(child, ctx, world);
      }
    }
  }

  private projectileHeading(projectile: Projectile): Vector2D {
    return projectile.vel.magSq() > 0
      ? projectile.vel.normalize()
      : Vector2D.fromAngle(projectile.aimAngle);
  }

  private buildLifecycleContext(
    projectile: Projectile,
    target: Entity | null,
    origin: Vector2D,
    depthOverride?: number,
    world?: PhysicsWorld,
  ): TriggerContext | null {
    const caster =
      world?.getEntityById(projectile.sourceEntityId) ?? null;
    if (!caster) return null;

    const heading = this.projectileHeading(projectile);
    let normal: Vector2D | undefined;
    if (target) {
      const n = target.pos.sub(projectile.pos);
      if (n.magSq() > 0) normal = n.normalize();
    }

    return {
      origin: origin.clone(),
      heading,
      normal,
      caster,
      sourceEntity: projectile,
      targetEntity: target ?? undefined,
      depth: depthOverride ?? projectile.depth + 1,
    };
  }

  private dispatchProjectileTriggers(
    projectile: Projectile,
    triggerType: TriggerType,
    target: Entity | null,
    world: PhysicsWorld,
    origin: Vector2D,
    depthOverride?: number,
    filter?: (node: TriggerNode) => boolean,
  ): void {
    const nodes = projectile.getTriggers(triggerType);
    if (nodes.length === 0) return;

    const ctx = this.buildLifecycleContext(
      projectile,
      target,
      origin,
      depthOverride,
      world,
    );
    if (!ctx) return;

    for (const node of nodes) {
      if (filter && !filter(node)) continue;
      this.dispatchTriggerNode(node, ctx, world);
    }
  }

  /** Broadcasts ON_RECAST to every live, root-cast projectile the caster owns for this ability
   * (root-only: emitter-spawned children never carry an abilityName). Used to let players
   * "remote detonate" or otherwise retrigger in-flight projectiles by pressing the hotkey
   * again while the ability is on cooldown. */
  dispatchRecast(casterId: string, abilityName: string, world: PhysicsWorld): void {
    for (const proj of world.projectiles) {
      if (proj.isDead) continue;
      if (proj.sourceEntityId !== casterId) continue;
      if (proj.abilityName !== abilityName) continue;
      if (proj.getTriggers('ON_RECAST').length === 0) continue;
      this.dispatchProjectileTriggers(proj, 'ON_RECAST', null, world, proj.pos, proj.depth);
    }
  }

  processLifecycleEvents(world: PhysicsWorld, dt: number): void {
    for (const hit of world.pendingHits) {
      const color = hit.projectile.visuals?.color ?? '#ff6644';
      const vfx = hit.projectile.visuals?.impactVfx ?? 'SPARKS';
      this.particles?.triggerImpactBurst(hit.hitPos, color, vfx);
      this.dispatchProjectileTriggers(
        hit.projectile,
        'ON_HIT',
        hit.target,
        world,
        hit.hitPos,
        hit.projectile.depth + 1,
      );
    }

    for (const projectile of this.returnTriggeredProjectiles) {
      this.particles?.expandingRing(projectile.pos, 60, projectile.visuals?.color ?? '#aa44ff');
      this.dispatchProjectileTriggers(
        projectile,
        'ON_RETURN',
        null,
        world,
        projectile.pos,
        projectile.depth + 1,
      );
    }
    this.returnTriggeredProjectiles = [];

    for (const projectile of world.pendingExpirations) {
      const reason = projectile.expiryReason;
      // 'return' is exclusively handled by the ON_RETURN block above.
      if (reason === 'return') continue;

      if (reason === 'range' || reason === 'lifetime') {
        const color = projectile.visuals?.color ?? '#ff4488';
        this.particles?.triggerImpactBurst(projectile.pos, color, 'SHOCKWAVE');
        this.dispatchProjectileTriggers(
          projectile,
          'ON_EXPIRY',
          null,
          world,
          projectile.pos,
          projectile.depth + 1,
        );
      } else if (reason === 'hit') {
        // ON_HIT already rendered impact VFX for this death above; only gate whether
        // "detonate on hit" (ON_EXPIRY) also fires per-node via fireOnHitDeath.
        this.dispatchProjectileTriggers(
          projectile,
          'ON_EXPIRY',
          null,
          world,
          projectile.pos,
          projectile.depth + 1,
          (node) => node.fireOnHitDeath !== false,
        );
      } else if (reason === 'wall') {
        this.dispatchProjectileTriggers(
          projectile,
          'ON_HIT_WALL',
          null,
          world,
          projectile.pos,
          projectile.depth + 1,
        );
      }
    }

    for (const projectile of world.projectiles) {
      if (projectile.isDead) continue;
      const tickNodes = projectile.getTriggers('ON_TICK');
      if (tickNodes.length > 0) {
        // Throttled per-node: each ON_TICK node fires independently once its own
        // tickIntervalMs elapses, instead of every physics frame (~16ms), to prevent
        // attached-field/entity-count flooding on long-lived projectiles.
        let ctx: TriggerContext | null | undefined;
        for (let i = 0; i < tickNodes.length; i++) {
          const node = tickNodes[i];
          const interval = Math.max(16, node.tickIntervalMs ?? 100);
          const elapsed = (projectile.tickAccumulatorsMs.get(i) ?? 0) + dt * 1000;
          if (elapsed < interval) {
            projectile.tickAccumulatorsMs.set(i, elapsed);
            continue;
          }
          projectile.tickAccumulatorsMs.set(i, elapsed % interval);
          if (ctx === undefined) {
            ctx = this.buildLifecycleContext(
              projectile,
              null,
              projectile.pos,
              projectile.depth,
              world,
            );
          }
          if (ctx) this.dispatchTriggerNode(node, ctx, world);
        }
      }

      const distNodes = projectile.getTriggers('ON_DISTANCE_TRAVELED');
      if (distNodes.length > 0) {
        // Fired-once per node: distanceTraveled only grows, so once a threshold is crossed
        // it stays crossed — without the registry this would redispatch every frame.
        let distCtx: TriggerContext | null | undefined;
        for (let i = 0; i < distNodes.length; i++) {
          if (projectile.firedDistanceTriggers.has(i)) continue;
          const threshold = distNodes[i].triggerDistance ?? 0;
          if (projectile.distanceTraveled < threshold) continue;
          projectile.firedDistanceTriggers.add(i);
          if (distCtx === undefined) {
            distCtx = this.buildLifecycleContext(
              projectile,
              null,
              projectile.pos,
              projectile.depth,
              world,
            );
          }
          if (distCtx) this.dispatchTriggerNode(distNodes[i], distCtx, world);
        }
      }

      const hazardNodes = projectile.getTriggers('ON_HAZARD_CONTACT');
      if (hazardNodes.length > 0) {
        const nowInHazard = world.getSurfaceTypeAt(projectile.pos) === 'LAVA';
        if (nowInHazard && !projectile.inHazard) {
          const hazardCtx = this.buildLifecycleContext(
            projectile,
            null,
            projectile.pos,
            projectile.depth,
            world,
          );
          if (hazardCtx) {
            for (const node of hazardNodes) {
              this.dispatchTriggerNode(node, hazardCtx, world);
            }
          }
        }
        projectile.inHazard = nowInHazard;
      }

      const visuals = projectile.visuals;
      const TRAIL_MIN_DIST_SQ = 100; // ~10px; prevents stationary/orbit pool starvation
      if (
        getGraphicsSettings().particleTrails &&
        projectile.pos.distSq(projectile.lastTrailPos) > TRAIL_MIN_DIST_SQ
      ) {
        if (visuals?.trailType === 'NEON_RIBBON') {
          this.particles?.neonRibbon(projectile.pos, visuals.color);
        } else {
          const color = trailColor(visuals);
          if (color) {
            this.particles?.trail(projectile.pos, color);
          }
        }
        projectile.lastTrailPos.copyFrom(projectile.pos);
      }
    }
  }

  updateTrajectories(world: PhysicsWorld, dt: number): void {
    for (const projectile of world.projectiles) {
      if (projectile.isDead) continue;
      updateTrajectory(projectile, dt, world);
      if (projectile.onReturnTriggered && projectile.isDead) {
        this.returnTriggeredProjectiles.push(projectile);
      }
    }
  }
}
