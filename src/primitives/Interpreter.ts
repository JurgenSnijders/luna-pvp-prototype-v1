import { Vector2D } from '../math/Vector2D';
import { MAX_ENTITIES, type PhysicsWorld } from '../engine/PhysicsWorld';
import { getGraphicsSettings, getTierLimits } from '../devtools/graphicsSettings';
import { screenShake } from '../render/ScreenShake';
import type { Entity } from '../entities/Entity';
import { Projectile } from '../entities/Projectile';
import type { ParticleSystem } from '../render/ParticleSystem';
import type {
  AbilitySchema,
  ActionPayload,
  TriggerNode,
  TriggerType,
  VisualDescriptor,
} from '../types/schema';
import type { TriggerContext, ExecutionOverrides } from '../types/triggerContext';
import { updateTrajectory } from './Trajectories';
import { dispatchAction } from './interpreter/actions';
import { DEFAULT_VISUALS, MAX_DEPTH } from './interpreter/constants';
import { evaluateConditions } from './interpreter/conditions';
import {
  buildTriggerMap,
  getActionPriority,
  safeNormalize,
  secondaryColor,
  trailColor,
} from './interpreter/helpers';

export { buildTriggerMap } from './interpreter/helpers';

export class Interpreter {
  particles: ParticleSystem | null = null;
  returnTriggeredProjectiles: Projectile[] = [];
  activeCastVisuals: VisualDescriptor | null = null;

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

  private dispatchActions(
    actions: ActionPayload[],
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): void {
    for (const action of actions) {
      dispatchAction(this, action, ctx, world);
    }
  }

  private dispatchTriggerNode(
    node: TriggerNode,
    ctx: TriggerContext,
    world: PhysicsWorld,
  ): void {
    let passed = true;
    if (node.conditions && node.conditions.length > 0) {
      passed = evaluateConditions(node.conditions, ctx, world);
    }

    const actionsToRun = passed ? node.actions : (node.ifFalseActions ?? []);
    const sortedActions = [...actionsToRun].sort(
      (a, b) => getActionPriority(a.type) - getActionPriority(b.type),
    );
    this.dispatchActions(sortedActions, ctx, world);

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
      const visuals = hit.projectile.visuals;
      const color = visuals?.color ?? '#ff6644';
      const vfx = visuals?.impactVfx ?? 'SPARKS';
      const sec = secondaryColor(visuals, '#ffffff');
      const scale = visuals?.vfx?.impactScale ?? 1;
      this.particles?.triggerImpactBurst(hit.hitPos, color, vfx, sec, scale);
      const shake = visuals?.vfx?.shakeIntensity ?? 0.4;
      if (shake > 0) screenShake.trigger(shake * 4, 0.12);
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
        const visuals = projectile.visuals;
        const color = visuals?.color ?? '#ff4488';
        const sec = secondaryColor(visuals, '#ffffff');
        const scale = visuals?.vfx?.impactScale ?? 1;
        this.particles?.triggerImpactBurst(projectile.pos, color, 'SHOCKWAVE', sec, scale);
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
      const trailDensity =
        (visuals?.vfx?.trailDensity ?? 1) * getTierLimits().trailDensity;
      const trailThreshold = TRAIL_MIN_DIST_SQ / Math.max(0.3, trailDensity);
      if (
        getGraphicsSettings().particleTrails &&
        projectile.pos.distSq(projectile.lastTrailPos) > trailThreshold
      ) {
        if (visuals?.trailType === 'NEON_RIBBON') {
          this.particles?.neonRibbon(projectile.pos, visuals.color);
        } else {
          const color = trailColor(visuals);
          if (color && visuals) {
            this.particles?.trail(projectile.pos, color, visuals.trailType);
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
