import { Vector2D } from '../../math/Vector2D';
import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { getGraphicsSettings, getTierLimits } from '../../devtools/graphicsSettings';
import { screenShake } from '../../render/ScreenShake';
import type { Entity } from '../../entities/Entity';
import { Projectile } from '../../entities/Projectile';
import { Summon } from '../../entities/Summon';
import type { ActionPayload, TriggerNode, TriggerType } from '../../types/schema';
import type { TriggerContext } from '../../types/triggerContext';
import { updateTrajectory } from '../Trajectories';
import type { Interpreter } from './Interpreter';
import { MAX_DEPTH } from './constants';
import { safeNormalize, secondaryColor, trailColor } from './helpers';
import type { TriggerHost } from './TriggerHost';
import { dispatchTriggerNode } from './triggers';

function projectileHeading(projectile: Projectile): Vector2D {
  return projectile.vel.magSq() > 0
    ? projectile.vel.normalize()
    : Vector2D.fromAngle(projectile.aimAngle);
}

function buildLifecycleContext(
  projectile: Projectile,
  target: Entity | null,
  origin: Vector2D,
  depthOverride: number | undefined,
  world: PhysicsWorld | undefined,
): TriggerContext | null {
  const caster =
    world?.getEntityById(projectile.sourceEntityId) ?? null;
  if (!caster) return null;

  const heading = projectileHeading(projectile);
  let normal: Vector2D | undefined;
  if (target) {
    const n = target.pos.sub(projectile.pos);
    if (n.magSq() > 0) normal = n.normalize();
  }

  const ability =
    projectile.spellArchetype !== undefined
      ? { archetype: projectile.spellArchetype }
      : undefined;

  return {
    origin: origin.clone(),
    heading,
    normal,
    caster,
    sourceEntity: projectile,
    targetEntity: target ?? undefined,
    depth: depthOverride ?? projectile.depth + 1,
    ability,
  };
}

function dispatchProjectileTriggers(
  interp: Interpreter,
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

  const ctx = buildLifecycleContext(
    projectile,
    target,
    origin,
    depthOverride,
    world,
  );
  if (!ctx) return;

  for (const node of nodes) {
    if (filter && !filter(node)) continue;
    dispatchTriggerNode(interp, node, ctx, world);
  }
}

function nodeRequiresTarget(node: TriggerNode): boolean {
  const check = (actions: ActionPayload[]): boolean =>
    actions.some((a) => 'target' in a && a.target === 'TARGET');
  if (check(node.actions)) return true;
  if (node.ifFalseActions && check(node.ifFalseActions)) return true;
  return false;
}

function dispatchHostTicks(
  interp: Interpreter,
  host: TriggerHost,
  world: PhysicsWorld,
  dt: number,
  buildCtx: () => TriggerContext | null,
  shouldSkipNode?: (node: TriggerNode, ctx: TriggerContext | null) => boolean,
): void {
  const tickNodes = host.getTriggers('ON_TICK');
  if (tickNodes.length === 0) return;

  let ctx: TriggerContext | null | undefined;
  for (let i = 0; i < tickNodes.length; i++) {
    const node = tickNodes[i];
    const interval = Math.max(16, node.tickIntervalMs ?? 100);
    const elapsed = (host.tickAccumulatorsMs.get(i) ?? 0) + dt * 1000;
    if (elapsed < interval) {
      host.tickAccumulatorsMs.set(i, elapsed);
      continue;
    }
    host.tickAccumulatorsMs.set(i, elapsed % interval);
    if (ctx === undefined) ctx = buildCtx();
    if (shouldSkipNode?.(node, ctx ?? null)) continue;
    if (ctx) dispatchTriggerNode(interp, node, ctx, world);
  }
}

function buildSummonContext(summon: Summon, world: PhysicsWorld): TriggerContext | null {
  const owner = world.getEntityById(summon.ownerId);
  if (!owner || summon.depth >= MAX_DEPTH) return null;

  const target = summon.findNearestEnemy(world, summon.config.targetingRange);
  const heading = target
    ? safeNormalize(target.pos.sub(summon.pos))
    : Vector2D.fromAngle(summon.facingAngle);

  if (target) {
    summon.facingAngle = Math.atan2(heading.y, heading.x);
  }

  return {
    origin: summon.pos.clone(),
    heading,
    caster: owner,
    sourceEntity: summon,
    targetEntity: target ?? undefined,
    depth: summon.depth + 1,
    ability: { archetype: summon.spellArchetype, name: summon.abilityName },
  };
}

/** Broadcasts ON_RECAST to every live, root-cast projectile the caster owns for this ability
 * (root-only: emitter-spawned children never carry an abilityName). Used to let players
 * "remote detonate" or otherwise retrigger in-flight projectiles by pressing the hotkey
 * again while the ability is on cooldown. */
export function dispatchRecast(
  interp: Interpreter,
  casterId: string,
  abilityName: string,
  world: PhysicsWorld,
): void {
  for (const proj of world.projectiles) {
    if (proj.isDead) continue;
    if (proj.sourceEntityId !== casterId) continue;
    if (proj.abilityName !== abilityName) continue;
    if (proj.getTriggers('ON_RECAST').length === 0) continue;
    dispatchProjectileTriggers(interp, proj, 'ON_RECAST', null, world, proj.pos, proj.depth);
  }
}

export function processLifecycleEvents(
  interp: Interpreter,
  world: PhysicsWorld,
  dt: number,
): void {
  for (const hit of world.pendingHits) {
    const visuals = hit.projectile.visuals;
    const color = visuals?.color ?? '#ff6644';
    const vfx = visuals?.impactVfx ?? 'SPARKS';
    const sec = secondaryColor(visuals, '#ffffff');
    const scale = visuals?.vfx?.impactScale ?? 1;
    interp.particles?.triggerImpactBurst(hit.hitPos, color, vfx, sec, scale);
    const shake = visuals?.vfx?.shakeIntensity ?? 0.4;
    if (shake > 0) screenShake.trigger(shake * 4, 0.12);
    dispatchProjectileTriggers(
      interp,
      hit.projectile,
      'ON_HIT',
      hit.target,
      world,
      hit.hitPos,
      hit.projectile.depth + 1,
    );
  }

  for (const projectile of interp.returnTriggeredProjectiles) {
    interp.particles?.expandingRing(projectile.pos, 60, projectile.visuals?.color ?? '#aa44ff');
    dispatchProjectileTriggers(
      interp,
      projectile,
      'ON_RETURN',
      null,
      world,
      projectile.pos,
      projectile.depth + 1,
    );
  }
  interp.returnTriggeredProjectiles = [];

  for (const projectile of world.pendingExpirations) {
    const reason = projectile.expiryReason;
    // 'return' is exclusively handled by the ON_RETURN block above.
    if (reason === 'return') continue;

    if (reason === 'range' || reason === 'lifetime') {
      const visuals = projectile.visuals;
      const color = visuals?.color ?? '#ff4488';
      const sec = secondaryColor(visuals, '#ffffff');
      const scale = visuals?.vfx?.impactScale ?? 1;
      interp.particles?.triggerImpactBurst(projectile.pos, color, 'SHOCKWAVE', sec, scale);
      dispatchProjectileTriggers(
        interp,
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
      dispatchProjectileTriggers(
        interp,
        projectile,
        'ON_EXPIRY',
        null,
        world,
        projectile.pos,
        projectile.depth + 1,
        (node) => node.fireOnHitDeath !== false,
      );
    } else if (reason === 'wall') {
      dispatchProjectileTriggers(
        interp,
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
    dispatchHostTicks(interp, projectile, world, dt, () =>
      buildLifecycleContext(projectile, null, projectile.pos, projectile.depth, world),
    );

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
          distCtx = buildLifecycleContext(
            projectile,
            null,
            projectile.pos,
            projectile.depth,
            world,
          );
        }
        if (distCtx) dispatchTriggerNode(interp, distNodes[i], distCtx, world);
      }
    }

    const hazardNodes = projectile.getTriggers('ON_HAZARD_CONTACT');
    if (hazardNodes.length > 0) {
      const nowInHazard = world.getSurfaceTypeAt(projectile.pos) === 'LAVA';
      if (nowInHazard && !projectile.inHazard) {
        const hazardCtx = buildLifecycleContext(
          projectile,
          null,
          projectile.pos,
          projectile.depth,
          world,
        );
        if (hazardCtx) {
          for (const node of hazardNodes) {
            dispatchTriggerNode(interp, node, hazardCtx, world);
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
        interp.particles?.neonRibbon(projectile.pos, visuals.color);
      } else {
        const color = trailColor(visuals);
        if (color && visuals) {
          interp.particles?.trail(projectile.pos, color, visuals.trailType);
        }
      }
      projectile.lastTrailPos.copyFrom(projectile.pos);
    }
  }

  for (const summon of world.summons) {
    if (summon.isDead) continue;
    dispatchHostTicks(
      interp,
      summon,
      world,
      dt,
      () => buildSummonContext(summon, world),
      (node, ctx) => !ctx?.targetEntity && nodeRequiresTarget(node),
    );
  }
}

export function updateTrajectories(
  interp: Interpreter,
  world: PhysicsWorld,
  dt: number,
): void {
  for (const projectile of world.projectiles) {
    if (projectile.isDead) continue;
    updateTrajectory(projectile, dt, world);
    if (projectile.onReturnTriggered && projectile.isDead) {
      interp.returnTriggeredProjectiles.push(projectile);
    }
  }
}
