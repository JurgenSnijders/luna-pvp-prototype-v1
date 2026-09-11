import { PhysicsWorld } from '../../engine/PhysicsWorld';
import { Z_TO_SCREEN } from '../../engine/verticalConstants';
import { Dummy } from '../../entities/Dummy';
import { Player } from '../../entities/Player';
import { Vector2D } from '../../math/Vector2D';
import { applyField } from '../../primitives/Fields';
import { Interpreter } from '../../primitives/Interpreter';
import { HEADLESS_LIFECYCLE_FX } from '../../primitives/interpreter/lifecycle';
import type { AbilitySchema, TrajectoryType, TriggerNode, ActionPayload } from '../../types/schema';
import {
  abilityUsesGroundReticle,
  resolveLiveCastConfig,
  resolveRootTrajectory,
  type PredictivePath,
  type TrajectorySample,
} from './trajectoryTracer';

const AIM_ROLLOUT_DT = 1 / 60;
const AIM_ROLLOUT_MAX_FRAMES = 90;
const AIM_ROLLOUT_EARLY_EXIT = 8;
const AIM_ROLLOUT_HEX_RADIUS = 2000;
const AIM_ANGLE_QUANTUM = Math.PI / 90;
const AIM_ROLLOUT_SEED = 0x5c0be3;

const aimingPathCache = new Map<string, PredictivePath[]>();

function walkTriggers(
  nodes: TriggerNode[],
  visit: (node: TriggerNode, action: ActionPayload) => void,
): void {
  for (const node of nodes) {
    for (const action of node.actions) {
      visit(node, action);
      if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
        walkTriggers(action.triggers, visit);
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.triggers) {
        walkTriggers(action.payload.triggers, visit);
      }
    }
    if (node.children) walkTriggers(node.children, visit);
  }
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function quantizeAimAngle(angle: number): number {
  return Math.round(angle / AIM_ANGLE_QUANTUM) * AIM_ANGLE_QUANTUM;
}

function abilitySchemaFingerprint(ability: AbilitySchema): string {
  const rootTrajectory = resolveRootTrajectory(ability);
  const traj = rootTrajectory?.type ?? 'NONE';
  const pathPoints = rootTrajectory?.pathPoints?.length ?? 0;
  const triggers = (ability.triggers ?? []).map((t) => t.trigger).join(',');
  let spawnCount = 0;
  walkTriggers(ability.triggers ?? [], (_node, action) => {
    if (action.type === 'SPAWN_PROJECTILE') {
      spawnCount += action.emitter?.count ?? 1;
    }
  });
  return `${ability.id ?? ability.name}|${traj}|path:${pathPoints}|${triggers}|spawns:${spawnCount}`;
}

function applyRolloutFields(world: PhysicsWorld, dt: number): void {
  const combatants = world.getCombatants();
  for (const entity of combatants) {
    entity.linearDrag = entity.baseLinearDrag;
  }
  for (const zone of world.zones) {
    if (zone.isDead) continue;
    for (const entity of combatants) {
      if (entity.isDead) continue;
      applyField(zone, entity, dt, world);
    }
  }
}

interface PathBuilder {
  trajectoryType: TrajectoryType;
  points: TrajectorySample[];
  groundPoints: Array<{ x: number; y: number }>;
  maxZ: number;
  apexIndex: number;
  lastBounceCount: number;
  impactIndex?: number;
}

function finalizePathBuilder(builder: PathBuilder): PredictivePath | null {
  if (builder.points.length < 2) return null;
  if (builder.apexIndex < builder.points.length) {
    builder.points[builder.apexIndex] = {
      ...builder.points[builder.apexIndex],
      isApex: true,
    };
  }
  return {
    points: builder.points,
    groundPoints: builder.groundPoints,
    apexIndex: builder.apexIndex,
    impactIndex: builder.impactIndex,
    isClosed: builder.trajectoryType === 'ORBIT_ANCHOR',
    trajectoryType: builder.trajectoryType,
  };
}

function runAimingRollout(
  ability: AbilitySchema,
  aimAngle: number,
  startZ: number,
  muzzleOffset: number,
): PredictivePath[] {
  const world = new PhysicsWorld(Vector2D.zero(), AIM_ROLLOUT_HEX_RADIUS);
  const caster = new Player(Vector2D.zero(), ['player', 'combatant', 'kinematic']);
  caster.z = startZ;
  caster.prevZ = startZ;
  world.addPlayer(caster);

  const trajectory = resolveRootTrajectory(ability);
  const maxRange = trajectory?.maxRange ?? ability.trajectory?.maxRange ?? 480;
  const heading = Vector2D.fromAngle(aimAngle);
  const muzzleOrigin = heading.scale(muzzleOffset);
  const targetPos = heading.scale(maxRange * 0.7);
  const dummy = new Dummy(targetPos);
  dummy.tags.add('kinematic');
  world.addDummy(dummy);

  const interp = new Interpreter();
  const nativeRandom = Math.random;
  Math.random = createSeededRandom(AIM_ROLLOUT_SEED);
  try {
    interp.executeAbility(
      ability,
      {
        origin: muzzleOrigin,
        heading,
        aimPoint: targetPos.clone(),
        caster,
        depth: 0,
        ability,
      },
      world,
    );
  } finally {
    Math.random = nativeRandom;
  }

  const builders = new Map<string, PathBuilder>();
  let idleFrames = 0;

  for (let frame = 0; frame < AIM_ROLLOUT_MAX_FRAMES; frame++) {
    interp.updateTrajectories(world, AIM_ROLLOUT_DT);
    // Apex/bounce queues are populated during trajectory update but cleared at step start.
    interp.processLifecycleEvents(world, AIM_ROLLOUT_DT, HEADLESS_LIFECYCLE_FX);
    world.updateSpatialZones(AIM_ROLLOUT_DT);
    applyRolloutFields(world, AIM_ROLLOUT_DT);
    world.step(AIM_ROLLOUT_DT);
    interp.processLifecycleEvents(world, AIM_ROLLOUT_DT, HEADLESS_LIFECYCLE_FX);

    let anyLive = false;
    for (const proj of world.projectiles) {
      if (proj.isDead) continue;
      anyLive = true;
      let builder = builders.get(proj.id);
      if (!builder) {
        builder = {
          trajectoryType: proj.config.type,
          points: [],
          groundPoints: [],
          maxZ: -1,
          apexIndex: 0,
          lastBounceCount: 0,
        };
        builders.set(proj.id, builder);
      }

      const screenY = proj.pos.y - proj.z * Z_TO_SCREEN;
      const sample: TrajectorySample = {
        x: proj.pos.x,
        y: screenY,
        z: proj.z,
      };

      if (proj.bounceCount > builder.lastBounceCount) {
        sample.isImpact = true;
        builder.lastBounceCount = proj.bounceCount;
        builder.impactIndex = builder.points.length;
      }

      builder.groundPoints.push({ x: proj.pos.x, y: proj.pos.y });

      if (proj.z > builder.maxZ) {
        builder.maxZ = proj.z;
        builder.apexIndex = builder.points.length;
      }

      builder.points.push(sample);
    }

    if (world.zones.some((z) => !z.isDead)) anyLive = true;
    if (world.summons.some((s) => !s.isDead)) anyLive = true;

    if (!anyLive) {
      idleFrames++;
      if (idleFrames >= AIM_ROLLOUT_EARLY_EXIT) break;
    } else {
      idleFrames = 0;
    }
  }

  const paths: PredictivePath[] = [];
  for (const builder of builders.values()) {
    const path = finalizePathBuilder(builder);
    if (path) paths.push(path);
  }
  return paths;
}

function clonePredictivePaths(paths: PredictivePath[]): PredictivePath[] {
  return paths.map((p) => ({
    ...p,
    points: p.points.map((pt) => ({ ...pt })),
    groundPoints: p.groundPoints?.map((gp) => ({ ...gp })),
  }));
}

function translatePredictivePaths(
  paths: PredictivePath[],
  dx: number,
  dy: number,
): PredictivePath[] {
  return paths.map((p) => ({
    ...p,
    points: p.points.map((pt) => ({ ...pt, x: pt.x + dx, y: pt.y + dy })),
    groundPoints: p.groundPoints?.map((gp) => ({ ...gp, x: gp.x + dx, y: gp.y + dy })),
  }));
}

export function resolveLiveAimingPaths(
  ability: AbilitySchema,
  origin: { x: number; y: number },
  aimAngle: number,
  muzzleOffset = 0,
  startZ = 0,
): PredictivePath[] {
  if (abilityUsesGroundReticle(ability)) return [];

  const config = resolveLiveCastConfig(ability);
  if (!config) return [];

  const qAngle = quantizeAimAngle(aimAngle);
  const qStartZ = Math.round(startZ);
  const cacheKey = `${abilitySchemaFingerprint(ability)}|${qAngle.toFixed(4)}|${qStartZ}|${muzzleOffset}`;

  let canonical = aimingPathCache.get(cacheKey);
  if (!canonical) {
    canonical = runAimingRollout(ability, qAngle, qStartZ, muzzleOffset);
    aimingPathCache.set(cacheKey, clonePredictivePaths(canonical));
  }

  return translatePredictivePaths(clonePredictivePaths(canonical), origin.x, origin.y);
}

/** Test-only: clear rollout cache between deterministic assertions. */
export function clearAimingPathCache(): void {
  aimingPathCache.clear();
}
