import { clampToHex } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import { MAX_ENTITIES, type PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SpatialZone } from '../entities/SpatialZone';
import type { ParticleSystem } from '../render/ParticleSystem';
import type {
  AbilitySchema,
  ActionPayload,
  EmitterConfig,
  TrajectoryConfig,
  TriggerNode,
  TriggerType,
  VisualDescriptor,
} from '../types/schema';
import type { TriggerContext } from '../types/triggerContext';
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
  ): void {
    if (ctx.depth > MAX_DEPTH) return;
    if (world.getEntityCount() >= MAX_ENTITIES) return;

    const heading =
      ctx.heading.magSq() > 0 ? ctx.heading.normalize() : Vector2D.fromAngle(0);
    const castCtx: TriggerContext = {
      ...ctx,
      heading,
      origin: ctx.origin.clone(),
    };

    const visuals = schema.visuals ?? DEFAULT_VISUALS;
    this.activeCastVisuals = visuals;
    this.particles?.triggerMuzzleFlash(castCtx.origin, heading, visuals.color);

    if (schema.recoilKick > 0 && ctx.depth === 0) {
      world.applyKnockback(ctx.caster, heading.scale(-1), schema.recoilKick);
    }

    const onCastNodes = schema.triggers.filter((t) => t.trigger === 'ON_CAST');
    for (const node of onCastNodes) {
      this.dispatchTriggerNode(node, castCtx, world);
    }

    if (schema.trajectory) {
      const spawnPos =
        ctx.depth === 0
          ? ctx.caster.pos.add(heading.scale(ctx.caster.radius + 12))
          : castCtx.origin.clone();
      const aimAngle = Math.atan2(heading.y, heading.x);
      const triggerMap = buildTriggerMap(
        schema.triggers.filter((t) => t.trigger !== 'ON_CAST'),
      );
      const projectile = new Projectile(
        spawnPos,
        schema.trajectory,
        ctx.caster.id,
        aimAngle,
        triggerMap,
        ctx.depth,
        visuals,
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

  private dispatchAction(
    action: ActionPayload,
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): void {
    switch (action.type) {
      case 'ADD_INSTABILITY': {
        const t = ctx.targetEntity ?? ctx.caster;
        t.instabilityPct = Math.min(500, t.instabilityPct + action.amount);
        break;
      }
      case 'APPLY_IMPULSE': {
        const t = ctx.targetEntity ?? ctx.caster;
        let dir: Vector2D;
        if (action.direction) {
          dir = new Vector2D(action.direction.x, action.direction.y);
        } else if (ctx.normal && ctx.normal.magSq() > 0) {
          dir = ctx.normal;
        } else {
          dir = t.pos.sub(ctx.origin);
        }
        world.applyKnockback(t, dir, action.baseForce);
        this.particles?.burstSparks(ctx.origin, 8, '#ffaa44');
        break;
      }
      case 'SPAWN_FIELD': {
        world.addZone(new SpatialZone(ctx.origin.clone(), action.field, ctx.caster.id));
        this.particles?.expandingRing(ctx.origin, action.field.radius, '#aa44ff');
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
        const dest = ctx.caster.pos.add(dir.scale(action.distance));
        ctx.caster.pos = clampToHex(dest, world.hexCenter, world.hexRadius);
        this.particles?.burstSparks(ctx.caster.pos, 12, '#44ffff');
        break;
      }
      case 'MODIFY_STAT':
        this.applyModifyStat(ctx.caster, action.stat, action.value, action.mode);
        break;
    }
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

  private dispatchTriggerNode(
    node: TriggerNode,
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): void {
    this.dispatchActions(node.actions, ctx, world);
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
      this.dispatchTriggerNode(node, ctx, world);
    }
  }

  processLifecycleEvents(world: PhysicsWorld): void {
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
      if (
        projectile.expiryReason === 'range' ||
        projectile.expiryReason === 'lifetime'
      ) {
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
      }
    }

    for (const projectile of world.projectiles) {
      if (projectile.isDead) continue;
      const tickNodes = projectile.getTriggers('ON_TICK');
      if (tickNodes.length > 0) {
        this.dispatchProjectileTriggers(
          projectile,
          'ON_TICK',
          null,
          world,
          projectile.pos,
          projectile.depth,
        );
      }
      const visuals = projectile.visuals;
      const TRAIL_MIN_DIST_SQ = 100; // ~10px; prevents stationary/orbit pool starvation
      if (projectile.pos.distSq(projectile.lastTrailPos) > TRAIL_MIN_DIST_SQ) {
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
