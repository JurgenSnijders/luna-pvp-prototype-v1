import { Vector2D } from '../../math/Vector2D';
import { MAX_ENTITIES, type PhysicsWorld } from '../../engine/PhysicsWorld';
import { Projectile } from '../../entities/Projectile';
import type { ParticleSystem } from '../../render/ParticleSystem';
import { CombatLogger } from '../../telemetry/CombatLogger';
import type { AbilitySchema, VisualDescriptor } from '../../types/schema';
import type { TriggerContext, ExecutionOverrides } from '../../types/triggerContext';
import { vecTelemetry } from '../../types/telemetry';
import { DEFAULT_VISUALS, MAX_DEPTH } from './constants';
import { buildTriggerMap, safeNormalize } from './helpers';
import {
  dispatchRecast as dispatchRecastImpl,
  processLifecycleEvents as processLifecycleEventsImpl,
  updateTrajectories as updateTrajectoriesImpl,
  type LifecycleFx,
} from './lifecycle';
import { dispatchTriggerNode } from './triggers';

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
      ability: schema,
    };

    const visuals = schema.visuals ?? DEFAULT_VISUALS;
    this.activeCastVisuals = visuals;
    this.particles?.triggerMuzzleFlash(castCtx.origin, heading, visuals.color);

    if (depth === 0) {
      CombatLogger.getInstance().record({
        type: 'ABILITY_CAST',
        casterId: castCtx.caster.id,
        abilityId: schema.name,
        archetype: schema.archetype,
        aimDirection: vecTelemetry(heading),
        recoilKick: schema.recoilKick,
        cooldownMs: schema.cooldownMs,
      });
    }

    if (schema.recoilKick > 0 && depth === 0) {
      world.applyKnockback(castCtx.caster, heading.scale(-1), schema.recoilKick);
    }

    const onCastNodes = schema.triggers.filter((t) => t.trigger === 'ON_CAST');
    for (const node of onCastNodes) {
      dispatchTriggerNode(this, node, castCtx, world);
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
        schema.archetype,
      );
      if (schema.trajectory.type === 'ORBIT_ANCHOR') {
        projectile.maxLifetimeMs = 3000;
      }
      world.addProjectile(projectile);
    }

    this.activeCastVisuals = null;
  }

  dispatchRecast(casterId: string, abilityName: string, world: PhysicsWorld): void {
    dispatchRecastImpl(this, casterId, abilityName, world);
  }

  processLifecycleEvents(world: PhysicsWorld, dt: number, fx?: LifecycleFx): void {
    processLifecycleEventsImpl(this, world, dt, fx);
  }

  updateTrajectories(world: PhysicsWorld, dt: number): void {
    updateTrajectoriesImpl(this, world, dt);
  }
}
