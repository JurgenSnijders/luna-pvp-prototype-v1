import { Vector2D } from '../../math/Vector2D';
import { GROUND_SLAM_VZ } from '../../engine/verticalConstants';
import { getArchetypeColor } from '../../render/canvas/SpellIconGenerator';
import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { isInsideHex, clampToHex } from '../../math/HexMath';
import { getEffectiveCrtSettings, getGraphicsSettings, getTierLimits } from '../../devtools/graphicsSettings';
import { hitFeedbackConfig } from '../../render/hitFeedbackConfig';
import { requestHitstop } from '../../game/simulation';
import { reactiveFx } from '../../render/gl/reactiveFx';
import { screenShake } from '../../render/ScreenShake';
import { decalManager, mapArchetypeToDecal, type DecalType } from '../../render/canvas/decals';
import { floorGridManager } from '../../render/canvas/floorGrid';
import { FIELD_COLORS } from '../../render/canvas/colors';
import type { Entity } from '../../entities/Entity';
import { Projectile } from '../../entities/Projectile';
import { Summon } from '../../entities/Summon';
import type { AbilitySchema, ActionPayload, ImpactVfx, SpellArchetype, TriggerNode, TriggerType } from '../../types/schema';
import type { TriggerContext } from '../../types/triggerContext';
import { updateTrajectory } from '../Trajectories';
import type { Interpreter } from './Interpreter';
import { MAX_DEPTH } from './constants';
import { safeNormalize, secondaryColor, trailColor } from './helpers';
import type { TriggerHost } from './TriggerHost';
import { dispatchTriggerNode } from './triggers';

function resolveImpactColor(archetype?: SpellArchetype): string {
  return getArchetypeColor(archetype, '#00e5ff');
}

function buildCasterSlamContext(
  caster: Entity,
  ability: AbilitySchema,
  origin: Vector2D,
  depth: number,
): TriggerContext {
  const heading =
    caster.vel.magSq() > 0 ? caster.vel.normalize() : Vector2D.fromAngle(0);
  return {
    origin: origin.clone(),
    heading,
    caster,
    sourceEntity: caster,
    depth: depth + 1,
    ability: { archetype: ability.archetype, name: ability.name },
  };
}

function projectileHeading(projectile: Projectile): Vector2D {
  return projectile.vel.magSq() > 0
    ? projectile.vel.normalize()
    : Vector2D.fromAngle(projectile.aimAngle);
}

const ARCHETYPE_IMPACT_VFX: Partial<Record<SpellArchetype, ImpactVfx>> = {
  KINETIC: 'SHOCKWAVE',
  VOID: 'IMPLOSION',
  FROST: 'SHATTER',
  LIGHTNING: 'LIGHTNING_FORK',
  PLASMA: 'PLASMA_BLOOM',
  EARTH: 'SHATTER',
  SONIC: 'SHOCKWAVE',
  GRAVITY: 'IMPLOSION',
  MAGNETIC: 'IMPLOSION',
  AERO: 'VORTEX_SWIRL',
  TOXIC: 'VORTEX_SWIRL',
  ARCANE: 'RUNE_FLASH',
  HOLY: 'RUNE_FLASH',
  CHRONO: 'RUNE_FLASH',
  PHASE: 'IMPLOSION',
  FIRE: 'MINI_NUKE',
  BLOOD: 'SPARKS',
  NATURE: 'SPARKS',
};

const CHAOS_IMPACT_POOL: ImpactVfx[] = ['SHOCKWAVE', 'LIGHTNING_FORK', 'VORTEX_SWIRL', 'SPARKS'];

const DIRECTIONAL_RING_ARCHETYPES = new Set<SpellArchetype>(['KINETIC', 'SONIC', 'EARTH', 'BLOOD']);

const stampedZoneIds = new Set<string>();
const wasOnPlatform = new Map<string, boolean>();
let zoneVfxFrame = 0;
let statusVfxFrame = 0;

export interface LifecycleFx {
  /** False for sandbox runs: also skips the modules that memoize entity ids. */
  readonly persistsWorldFx: boolean;
  decal(x: number, y: number, radius: number, type: DecalType, color: string): void;
  ripple(x: number, y: number, radius: number, intensity: number, color: string): void;
  shake(intensity: number, durationSec: number): void;
  reactivePulse(x: number, y: number, isHeavy: boolean): void;
  hitstop(frames: number): void;
}

export const LIVE_LIFECYCLE_FX: LifecycleFx = {
  persistsWorldFx: true,
  decal(x, y, radius, type, color) {
    decalManager.addDecal(x, y, radius, type, color);
  },
  ripple(x, y, radius, intensity, color) {
    floorGridManager.addRipple(x, y, radius, intensity, color);
  },
  shake(intensity, durationSec) {
    screenShake.trigger(intensity, durationSec);
  },
  reactivePulse(x, y, isHeavy) {
    reactiveFx.setTuning(getEffectiveCrtSettings().reactive);
    reactiveFx.pulse(x, y, isHeavy);
  },
  hitstop(frames) {
    requestHitstop(frames);
  },
};

export const HEADLESS_LIFECYCLE_FX: LifecycleFx = {
  persistsWorldFx: false,
  decal() {},
  ripple() {},
  shake() {},
  reactivePulse() {},
  hitstop() {},
};

function stampImpactDecal(
  hit: { projectile: Projectile; hitPos: Vector2D },
  scale: number,
  isHeavy: boolean,
  fx: LifecycleFx,
): void {
  const velocity = hit.projectile.vel.mag();
  if (!isHeavy && velocity < 300) return;

  const archetype = hit.projectile.spellArchetype;
  const type = mapArchetypeToDecal(archetype);
  const color = hit.projectile.visuals?.color ?? '#ff6644';
  const radius = 12 + scale * 8;
  fx.decal(hit.hitPos.x, hit.hitPos.y, radius, type, color);
}

function stampZoneExpirationDecals(world: PhysicsWorld, fx: LifecycleFx): void {
  const liveIds = new Set(world.zones.map((z) => z.id));

  for (const zone of world.zones) {
    if (!zone.isDead || stampedZoneIds.has(zone.id)) continue;
    stampedZoneIds.add(zone.id);

    if (!isInsideHex(zone.pos, world.hexCenter, world.hexRadius)) continue;

    const radius = zone.config.radius * 0.35;
    const color = FIELD_COLORS[zone.config.fieldType] ?? '#aa44ff';
    let type = mapArchetypeToDecal(zone.spellArchetype);
    if (zone.config.fieldType === 'RADIAL_IMPULSE') {
      type = 'KINETIC_CRATER';
    } else if (
      zone.config.fieldType === 'VORTEX_TANGENT' ||
      zone.config.fieldType === 'MASS_ATTRACTOR'
    ) {
      type = 'VOID_STAIN';
    } else if (zone.config.fieldType === 'FRICTION_OVERRIDE') {
      type = 'FROST_CRACK';
    }
    fx.decal(zone.pos.x, zone.pos.y, radius, type, color);
  }

  for (const id of stampedZoneIds) {
    if (!liveIds.has(id)) stampedZoneIds.delete(id);
  }
}

function processObstacleDestructions(
  interp: Interpreter,
  world: PhysicsWorld,
  fx: LifecycleFx,
): void {
  for (const death of world.pendingObstacleDestructions) {
    if (!death.isDestructible) continue;
    if (!isInsideHex(death.pos, world.hexCenter, world.hexRadius)) continue;

    fx.decal(
      death.pos.x,
      death.pos.y,
      death.radius * 1.2,
      'KINETIC_CRATER',
      '#aa8844',
    );
    fx.ripple(death.pos.x, death.pos.y, 260, 1.0, '#aa8844');
    interp.particles?.triggerImpactBurst(death.pos, '#aa8844', 'SPARKS', '#ffcc66', 0.8);
  }
}

function processZoneParticleTicks(interp: Interpreter, world: PhysicsWorld): void {
  zoneVfxFrame++;
  if (zoneVfxFrame % 3 !== 0) return;
  if (!getGraphicsSettings().particleTrails) return;

  for (const zone of world.zones) {
    if (zone.isDead) continue;
    const color = FIELD_COLORS[zone.config.fieldType] ?? '#aa44ff';
    if (
      zone.config.fieldType === 'MASS_ATTRACTOR' ||
      zone.config.fieldType === 'VORTEX_TANGENT'
    ) {
      interp.particles?.zoneVortexTick(zone.pos, zone.config.radius, color);
    } else if (zone.config.fieldType === 'RADIAL_IMPULSE') {
      interp.particles?.zoneHazardPulse(zone.pos, zone.config.radius, color);
    } else if (Math.abs(zone.config.strength) >= 2000) {
      interp.particles?.ember(zone.pos);
    }
  }
}

function processLavaBoundaryRipples(world: PhysicsWorld, fx: LifecycleFx): void {
  const liveIds = new Set<string>();

  for (const entity of world.getCombatants()) {
    liveIds.add(entity.id);
    const onPlatform = isInsideHex(entity.pos, world.hexCenter, world.hexRadius);
    if (wasOnPlatform.get(entity.id) === true && !onPlatform) {
      const boundary = clampToHex(entity.pos, world.hexCenter, world.hexRadius);
      fx.ripple(boundary.x, boundary.y, 200, 0.85, '#ffaa00');
    }
    wasOnPlatform.set(entity.id, onPlatform);
  }

  for (const id of wasOnPlatform.keys()) {
    if (!liveIds.has(id)) {
      wasOnPlatform.delete(id);
    }
  }
}

function processStatusParticleTicks(interp: Interpreter, world: PhysicsWorld): void {
  statusVfxFrame++;
  if (statusVfxFrame % 5 !== 0) return;
  if (!getGraphicsSettings().particleTrails) return;

  for (const entity of world.getCombatants()) {
    if (entity.isDead || entity.isStealthed()) continue;
    const pos = entity.pos;
    const r = entity.effectiveRadius;

    if (entity.activeStatuses.has('FROST')) {
      interp.particles?.statusFrost(pos, r);
    }
    if (entity.activeStatuses.has('FIRE') || entity.activeStatuses.has('PLASMA')) {
      const intensity = entity.activeStatuses.has('PLASMA')
        ? Math.min(1, entity.instabilityPct / 100)
        : Math.min(1, entity.vel.mag() / 250);
      if (intensity > 0.08) {
        interp.particles?.statusThermal(pos, r, intensity);
      }
    }
    if (entity.activeStatuses.has('VOID') || entity.activeStatuses.has('GRAVITY')) {
      interp.particles?.statusVoid(pos, r);
    }
    if (entity.activeStatuses.has('KINETIC') && entity.vel.mag() > 50) {
      interp.particles?.statusKinetic(pos, entity.vel);
    }
  }
}

function resolveImpactVfx(archetype: SpellArchetype | undefined, authoredVfx: ImpactVfx): ImpactVfx {
  const isGeneric = authoredVfx === 'SPARKS';
  if (!isGeneric) return authoredVfx;
  if (!archetype) return authoredVfx;
  if (archetype === 'CHAOS') {
    return CHAOS_IMPACT_POOL[Math.floor(Math.random() * CHAOS_IMPACT_POOL.length)];
  }
  return ARCHETYPE_IMPACT_VFX[archetype] ?? authoredVfx;
}

function emitArchetypeImpact(
  interp: Interpreter,
  hit: { projectile: Projectile; hitPos: Vector2D },
  color: string,
  sec: string,
  scale: number,
  authoredVfx: ImpactVfx,
): void {
  const archetype = hit.projectile.spellArchetype;
  const heading = projectileHeading(hit.projectile);
  const vfx = resolveImpactVfx(archetype, authoredVfx);

  interp.particles?.triggerImpactBurst(hit.hitPos, color, vfx, sec, scale);

  const useDirectionalRing =
    (archetype !== undefined && DIRECTIONAL_RING_ARCHETYPES.has(archetype)) ||
    (hitFeedbackConfig.directionalBlastRings &&
      archetype !== 'VOID' &&
      archetype !== 'FROST');

  if (useDirectionalRing) {
    interp.particles?.spawnDirectionalImpactRing(hit.hitPos, heading, color);
  }
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
  fx: LifecycleFx = LIVE_LIFECYCLE_FX,
): void {
  for (const hit of world.pendingHits) {
    const visuals = hit.projectile.visuals;
    const color = visuals?.color ?? '#ff6644';
    const vfx = visuals?.impactVfx ?? 'SPARKS';
    const sec = secondaryColor(visuals, '#ffffff');
    const scale = visuals?.vfx?.impactScale ?? 1;
    const instabBefore = hit.target.instabilityPct;
    const detonatedBefore = hit.target.plasmaDetonatedThisFrame;

    emitArchetypeImpact(interp, hit, color, sec, scale, vfx);
    const shake = visuals?.vfx?.shakeIntensity ?? 0.4;
    if (shake > 0) fx.shake(shake * 4, 0.12);

    const detonated = hit.target.plasmaDetonatedThisFrame || detonatedBefore;
    hit.target.plasmaDetonatedThisFrame = false;
    const instabDelta = hit.target.instabilityPct - instabBefore;
    const isHeavy = instabDelta >= 25 || detonated;

    if (isInsideHex(hit.hitPos, world.hexCenter, world.hexRadius)) {
      if (fx.persistsWorldFx) {
        stampImpactDecal(hit, scale, isHeavy, fx);
      }
      const forceProxy = hit.projectile.vel.mag();
      if (isHeavy || forceProxy >= 300) {
        fx.ripple(
          hit.hitPos.x,
          hit.hitPos.y,
          Math.min(320, 160 + forceProxy * 0.2),
          isHeavy ? 1.0 : 0.7,
          color,
        );
      }
    }
    fx.reactivePulse(hit.hitPos.x, hit.hitPos.y, isHeavy);

    dispatchProjectileTriggers(
      interp,
      hit.projectile,
      'ON_HIT',
      hit.target,
      world,
      hit.hitPos,
      hit.projectile.depth + 1,
    );

    if (hitFeedbackConfig.microHitstop && isHeavy) {
      fx.hitstop(2);
    }

    world.emitHitMarkerEvent({
      sourceId: hit.projectile.sourceEntityId,
      isHeavy,
    });
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

  for (const projectile of world.pendingApexEvents) {
    if (projectile.isDead) continue;
    dispatchProjectileTriggers(
      interp,
      projectile,
      'ON_AIR_APEX',
      null,
      world,
      projectile.pos,
      projectile.depth + 1,
    );
  }
  world.pendingApexEvents = [];

  for (const event of world.pendingBounceEvents) {
    if (event.proj.isDead) continue;
    dispatchProjectileTriggers(
      interp,
      event.proj,
      'ON_BOUNCE',
      null,
      world,
      event.proj.pos,
      event.proj.depth + 1,
      (node) => {
        if (node.minBounceSpeed !== undefined && event.impactSpeed < node.minBounceSpeed) {
          return false;
        }
        if (node.bounceIndex !== undefined && node.bounceIndex !== event.bounceIndex) {
          return false;
        }
        return true;
      },
    );
  }
  world.pendingBounceEvents = [];

  for (const impact of world.pendingGroundImpacts) {
    const intensity = Math.min(2.5, impact.vz / GROUND_SLAM_VZ);
    const color = resolveImpactColor(impact.archetype);

    if (fx.persistsWorldFx) {
      fx.ripple(
        impact.pos.x,
        impact.pos.y,
        Math.min(360, 160 + impact.vz * 0.25),
        intensity,
        color,
      );
      fx.shake(intensity * 3.5, 0.14);
      if (impact.vz >= 600) {
        const decalType: DecalType =
          impact.archetype === 'FIRE' || impact.archetype === 'PLASMA'
            ? 'SCORCH'
            : 'KINETIC_CRATER';
        fx.decal(
          impact.pos.x,
          impact.pos.y,
          Math.min(48, 20 + intensity * 8),
          decalType,
          color,
        );
      }
    }

    const entity = world.getEntityById(impact.entityId);
    if (!entity || entity.isDead) continue;

    if (entity instanceof Projectile) {
      dispatchProjectileTriggers(
        interp,
        entity,
        'ON_GROUND_SLAM',
        null,
        world,
        impact.pos,
        entity.depth + 1,
      );
    } else if (entity instanceof Summon) {
      const nodes = entity.getTriggers('ON_GROUND_SLAM');
      if (nodes.length > 0) {
        const ctx = buildSummonContext(entity, world);
        if (ctx) {
          for (const node of nodes) {
            dispatchTriggerNode(interp, node, ctx, world);
          }
        }
      }
    } else if (entity.groundSlamArmed) {
      const { ability, depth } = entity.groundSlamArmed;
      const slamNodes = ability.triggers.filter((t) => t.trigger === 'ON_GROUND_SLAM');
      const ctx = buildCasterSlamContext(entity, ability, impact.pos, depth);
      for (const node of slamNodes) {
        dispatchTriggerNode(interp, node, ctx, world);
      }
      entity.groundSlamArmed = undefined;
    }
  }
  world.pendingGroundImpacts = [];

  for (const projectile of world.pendingExpirations) {
    const reason = projectile.expiryReason;
    // 'return' is exclusively handled by the ON_RETURN block above.
    if (reason === 'return') continue;

    if (reason === 'range' || reason === 'lifetime' || reason === 'ground') {
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

  if (fx.persistsWorldFx) {
    stampZoneExpirationDecals(world, fx);
    processObstacleDestructions(interp, world, fx);
    processLavaBoundaryRipples(world, fx);
  }
  processZoneParticleTicks(interp, world);
  processStatusParticleTicks(interp, world);
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
