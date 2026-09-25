import { WORLD_GRAVITY, Z_TO_SCREEN } from '../../engine/verticalConstants';
import { DEFAULT_EMITTER } from '../../primitives/interpreter/constants';
import type {
  AbilitySchema,
  ActionPayload,
  EmitterConfig,
  FieldArcFacing,
  TrajectoryConfig,
  TrajectoryType,
  TriggerNode,
} from '../../types/schema';

export interface TrajectoryTrace {
  points: Array<{ x: number; y: number }>;
  fields: Array<{ x: number; y: number; radius: number; fieldType: string }>;
  hasReturn: boolean;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
}

interface Point {
  x: number;
  y: number;
}

const LINEAR_DIR = { x: 0.8, y: -0.6 };
const LINEAR_LEN = Math.hypot(LINEAR_DIR.x, LINEAR_DIR.y);

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

export interface TrajectorySample {
  x: number;
  y: number;
  z?: number;
  isApex?: boolean;
  isImpact?: boolean;
}

export interface PredictivePath {
  points: TrajectorySample[];
  groundPoints?: { x: number; y: number }[];
  apexIndex?: number;
  impactIndex?: number;
  isClosed: boolean;
  trajectoryType: TrajectoryType;
}

interface LiveCastConfig {
  trajectory: TrajectoryConfig;
  emitter: EmitterConfig;
}

export function resolveRootTrajectory(ability: AbilitySchema): TrajectoryConfig | undefined {
  if (ability.trajectory) return ability.trajectory;
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        return action.projectileTrajectory;
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.trajectory) {
        return action.payload.trajectory;
      }
    }
  }
  return undefined;
}

/** True when GROUND_POINT means "drop/place at cursor" rather than a player-thrown projectile. */
export function abilityUsesGroundReticle(ability: AbilitySchema): boolean {
  if (ability.targetingMode !== 'GROUND_POINT') return false;
  const traj = resolveRootTrajectory(ability);
  if (!traj) return true;
  return (traj.spawnAltitude ?? 0) > 0;
}

export type DeployableOrientationMode = 'TANGENT' | 'RADIAL_OUTWARD' | 'FIXED';

export interface DeployableTargetInfo {
  kind: 'OBSTACLE' | 'ACTOR' | 'FIELD';
  shape: 'BOX' | 'CIRCLE' | 'TURRET' | 'DECOY' | 'WEDGE_FIELD' | 'OMNI_FIELD';
  width: number;
  height: number;
  radius: number;
  arcDeg?: number;
  arcFacing?: FieldArcFacing;
  arcOffsetDeg?: number;
  color: string;
  orientationMode: DeployableOrientationMode;
  isThrown: boolean;
  isDestructible?: boolean;
  attachToSource?: boolean;
}

/** Tangent angle so a box wall's wide face is perpendicular to caster→target (shield orientation). */
export function deployableTangentAngle(dx: number, dy: number): number {
  return Math.atan2(dy, dx) + Math.PI / 2;
}

function deployableFromAction(
  action: ActionPayload,
  ability: AbilitySchema,
): Omit<DeployableTargetInfo, 'isThrown'> | null {
  const color = ability.visuals?.color ?? '#aa8844';

  if (action.type === 'SPAWN_OBSTACLE') {
    const obs = action.obstacle;
    if (obs.shape === 'BOX') {
      return {
        kind: 'OBSTACLE',
        shape: 'BOX',
        width: obs.width ?? 80,
        height: obs.height ?? 24,
        radius: 0,
        color,
        orientationMode: 'TANGENT',
        isDestructible: obs.isDestructible === true,
      };
    }
    if (obs.shape === 'CIRCLE') {
      const w = obs.width ?? 40;
      return {
        kind: 'OBSTACLE',
        shape: 'CIRCLE',
        width: w,
        height: obs.height ?? w,
        radius: w / 2,
        color,
        orientationMode: 'FIXED',
        isDestructible: obs.isDestructible === true,
      };
    }
    return null;
  }

  if (action.type === 'SPAWN_ACTOR') {
    const actor = action.actor;
    if (actor.actorArchetype === 'TURRET') {
      const r = actor.radius ?? 15;
      return {
        kind: 'ACTOR',
        shape: 'TURRET',
        width: r * 2,
        height: r * 2,
        radius: r,
        color,
        orientationMode: 'RADIAL_OUTWARD',
      };
    }
    if (actor.actorArchetype === 'DECOY') {
      const r = actor.radius ?? 15;
      return {
        kind: 'ACTOR',
        shape: 'DECOY',
        width: 0,
        height: 0,
        radius: r,
        color,
        orientationMode: 'FIXED',
      };
    }
  }

  if (action.type === 'SPAWN_FIELD') {
    const field = action.field;
    const radius = field.radius ?? 60;
    const arcDeg = field.arcDeg;
    const arcFacing = field.arcFacing ?? 'CAST_HEADING';
    const arcOffsetDeg = field.arcOffsetDeg ?? 0;

    if (arcDeg !== undefined && arcDeg < 360) {
      return {
        kind: 'FIELD',
        shape: 'WEDGE_FIELD',
        width: 0,
        height: 0,
        radius,
        arcDeg,
        arcFacing,
        arcOffsetDeg,
        color,
        orientationMode: arcFacing === 'FIXED' ? 'FIXED' : 'RADIAL_OUTWARD',
        attachToSource: field.attachToSource === true,
      };
    }

    return {
      kind: 'FIELD',
      shape: 'OMNI_FIELD',
      width: 0,
      height: 0,
      radius,
      color,
      orientationMode: 'FIXED',
      attachToSource: field.attachToSource === true,
    };
  }

  return null;
}

type DeployableTrigger = 'ON_CAST' | 'ON_EXPIRY' | 'ON_HIT' | 'ON_GROUND_SLAM';

function shouldSkipOnCastOrbitAura(
  ability: AbilitySchema,
  action: ActionPayload,
): boolean {
  if (action.type !== 'SPAWN_FIELD') return false;
  if (!action.field.attachToSource) return false;
  return resolveRootTrajectory(ability) !== undefined;
}

function findDeployableOnTrigger(
  ability: AbilitySchema,
  trigger: DeployableTrigger,
  isThrown: boolean,
): DeployableTargetInfo | null {
  for (const node of ability.triggers ?? []) {
    if (node.trigger !== trigger) continue;
    for (const action of node.actions ?? []) {
      if (trigger === 'ON_CAST' && shouldSkipOnCastOrbitAura(ability, action)) {
        continue;
      }
      const info = deployableFromAction(action, ability);
      if (info) return { ...info, isThrown };
    }
  }
  return null;
}

/** Footprint metadata for deployables at aim/landing points. Null when no terminal payload exists. */
export function resolveDeployableInfo(ability: AbilitySchema): DeployableTargetInfo | null {
  const onCast = findDeployableOnTrigger(ability, 'ON_CAST', false);
  if (onCast) return onCast;

  for (const trigger of ['ON_EXPIRY', 'ON_HIT', 'ON_GROUND_SLAM'] as const) {
    const found = findDeployableOnTrigger(ability, trigger, true);
    if (found) return found;
  }

  return null;
}

/** Placed (non-thrown) deployables that open a radial footprint ghost before cast. */
export function isPlacedDeployableAimTarget(ability: AbilitySchema): boolean {
  const info = resolveDeployableInfo(ability);
  if (!info || info.isThrown) return false;
  if (info.attachToSource) return false;
  return true;
}

const GROUND_IMPACT_TRIGGERS = new Set(['ON_GROUND_SLAM', 'ON_EXPIRY', 'ON_HIT']);

export function collectGroundImpactFieldRadii(ability: AbilitySchema): number[] {
  const radii: number[] = [];
  walkTriggers(ability.triggers ?? [], (node, action) => {
    if (!GROUND_IMPACT_TRIGGERS.has(node.trigger)) return;
    if (action.type === 'SPAWN_FIELD' && action.field?.radius) {
      radii.push(action.field.radius);
    }
  });
  return radii;
}

export interface CollectedCastProjectile {
  trajectory: TrajectoryConfig;
  emitter: EmitterConfig;
  aimOffsetDeg: number;
}

/** Root trajectory plus every top-level ON_CAST SPAWN_PROJECTILE (not nested sub-munitions). */
export function collectAllCastProjectiles(ability: AbilitySchema): CollectedCastProjectile[] {
  const results: CollectedCastProjectile[] = [];

  if (ability.trajectory) {
    results.push({
      trajectory: ability.trajectory,
      emitter: DEFAULT_EMITTER,
      aimOffsetDeg: 0,
    });
  }

  const castTrigger = ability.triggers?.find((t) => t.trigger === 'ON_CAST');
  if (castTrigger?.actions) {
    for (const action of castTrigger.actions) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        results.push({
          trajectory: action.projectileTrajectory,
          emitter: action.emitter ?? DEFAULT_EMITTER,
          aimOffsetDeg: action.emitter?.aimOffsetDeg ?? 0,
        });
      }
    }
  }

  return results;
}

export function spreadAnglesForCastShot(shot: CollectedCastProjectile): number[] {
  const baseAngle = shot.trajectory.type === 'ORBIT_ANCHOR' ? 0 : -Math.PI / 4;
  const emitter: EmitterConfig = {
    ...shot.emitter,
    aimOffsetDeg: shot.aimOffsetDeg,
  };
  return computeSpreadAngles(emitter, baseAngle);
}

function findOnCastProjectileConfig(ability: AbilitySchema): LiveCastConfig | null {
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        return {
          trajectory: action.projectileTrajectory,
          emitter: action.emitter ?? DEFAULT_EMITTER,
        };
      }
    }
  }
  return null;
}

function emitterHasSpread(emitter: EmitterConfig): boolean {
  return (
    emitter.count > 1 ||
    emitter.spreadDeg > 0 ||
    (emitter.aimOffsetDeg !== undefined && emitter.aimOffsetDeg !== 0)
  );
}

export function resolveLiveCastConfig(ability: AbilitySchema): LiveCastConfig | null {
  const onCast = findOnCastProjectileConfig(ability);

  if (onCast && (!ability.trajectory || emitterHasSpread(onCast.emitter))) {
    return onCast;
  }

  if (ability.trajectory) {
    return {
      trajectory: ability.trajectory,
      emitter: onCast?.emitter ?? DEFAULT_EMITTER,
    };
  }

  return onCast;
}

function dirFromAngle(angle: number): Point {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function muzzlePoint(
  origin: Point,
  angle: number,
  muzzleOffset: number,
): Point {
  const d = dirFromAngle(angle);
  return {
    x: origin.x + d.x * muzzleOffset,
    y: origin.y + d.y * muzzleOffset,
  };
}

function computeSpreadAngles(
  emitter: EmitterConfig,
  aimAngle: number,
): number[] {
  const count = Math.max(1, Math.min(12, emitter.count));
  const spreadRad = (emitter.spreadDeg * Math.PI) / 180;
  const aimOffsetRad = ((emitter.aimOffsetDeg ?? 0) * Math.PI) / 180;
  const baseAngle = aimAngle + aimOffsetRad;
  const angles: number[] = [];

  for (let i = 0; i < count; i++) {
    let theta: number;
    switch (emitter.distribution) {
      case 'RADIAL':
        theta = baseAngle + (i * (Math.PI * 2)) / count;
        break;
      case 'RANDOM_CONE':
        theta =
          count === 1
            ? baseAngle
            : baseAngle +
              (i - (count - 1) / 2) * (spreadRad / Math.max(1, count - 1));
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
    angles.push(theta);
  }

  return angles;
}

function buildLinearPath(
  origin: Point,
  theta: number,
  muzzleOffset: number,
  maxRange: number,
): Point[] {
  const muzzle = muzzlePoint(origin, theta, muzzleOffset);
  const d = dirFromAngle(theta);
  return [
    muzzle,
    { x: muzzle.x + d.x * maxRange, y: muzzle.y + d.y * maxRange },
  ];
}

function buildDiscontinuousBlinkPath(
  origin: Point,
  theta: number,
  muzzleOffset: number,
  trajectory: TrajectoryConfig,
): Point[] {
  const maxRange = trajectory.maxRange ?? 500;
  const blinkDist = trajectory.blinkDistance ?? 80;
  const muzzle = muzzlePoint(origin, theta, muzzleOffset);
  const d = dirFromAngle(theta);
  const points: Point[] = [muzzle];
  let dist = 0;
  while (dist < maxRange) {
    dist += blinkDist;
    if (dist > maxRange) dist = maxRange;
    points.push({
      x: muzzle.x + d.x * dist,
      y: muzzle.y + d.y * dist,
    });
  }
  return points;
}

function buildReturnToSourcePath(
  origin: Point,
  theta: number,
  muzzleOffset: number,
  trajectory: TrajectoryConfig,
  steps = 15,
): Point[] {
  const maxRange = trajectory.maxRange ?? 500;
  const halfRange = maxRange * 0.5;
  const muzzle = muzzlePoint(origin, theta, muzzleOffset);
  const d = dirFromAngle(theta);
  const apex = {
    x: muzzle.x + d.x * halfRange,
    y: muzzle.y + d.y * halfRange,
  };
  const points: Point[] = [];
  const outSteps = Math.floor(steps * 0.45);
  const returnSteps = steps - outSteps;

  for (let i = 0; i <= outSteps; i++) {
    const t = i / outSteps;
    points.push({
      x: muzzle.x + (apex.x - muzzle.x) * t,
      y: muzzle.y + (apex.y - muzzle.y) * t,
    });
  }

  const perp = { x: -d.y, y: d.x };
  const bulge = halfRange * 0.25;
  const control = {
    x: apex.x + perp.x * bulge,
    y: apex.y + perp.y * bulge,
  };

  for (let i = 1; i <= returnSteps; i++) {
    const t = i / returnSteps;
    const mt = 1 - t;
    points.push({
      x:
        mt * mt * apex.x +
        2 * mt * t * control.x +
        t * t * muzzle.x,
      y:
        mt * mt * apex.y +
        2 * mt * t * control.y +
        t * t * muzzle.y,
    });
  }

  return points;
}

function buildHomingSlerpPath(
  origin: Point,
  theta: number,
  muzzleOffset: number,
  trajectory: TrajectoryConfig,
  steps = 20,
): Point[] {
  const maxRange = trajectory.maxRange ?? 600;
  const muzzle = muzzlePoint(origin, theta, muzzleOffset);
  const d = dirFromAngle(theta);
  const bendAngle = theta + Math.PI / 10;
  const bend = dirFromAngle(bendAngle);
  const end = {
    x: muzzle.x + d.x * maxRange,
    y: muzzle.y + d.y * maxRange,
  };
  const control = {
    x: muzzle.x + bend.x * maxRange * 0.55,
    y: muzzle.y + bend.y * maxRange * 0.55,
  };
  const points: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * muzzle.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * muzzle.y + 2 * mt * t * control.y + t * t * end.y,
    });
  }

  return points;
}

function buildOrbitAnchorPath(
  origin: Point,
  theta: number,
  trajectory: TrajectoryConfig,
  steps = 32,
): Point[] {
  const radius = trajectory.orbitRadius ?? 100;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = theta + (i / steps) * Math.PI * 2;
    points.push({
      x: origin.x + Math.cos(angle) * radius,
      y: origin.y + Math.sin(angle) * radius,
    });
  }
  return points;
}

export function buildBallisticArcPath(
  trajectory: TrajectoryConfig,
  origin: Point,
  theta: number,
  muzzleOffset: number,
  steps = 24,
  startZ = 0,
): PredictivePath {
  const g = WORLD_GRAVITY * (trajectory.gravityScale ?? 1);
  const lobApex = trajectory.lobApex ?? 80;
  const speed = trajectory.speed ?? 400;
  const maxRange = trajectory.maxRange ?? 500;
  const vz0 = Math.sqrt(2 * g * lobApex);
  const tImpact = (2 * vz0) / g;

  const muzzle = muzzlePoint(origin, theta, muzzleOffset);
  const d = dirFromAngle(theta);

  const points: TrajectorySample[] = [];
  const groundPoints: { x: number; y: number }[] = [];
  let apexIndex = 0;
  let impactIndex = 0;
  let maxZ = -1;

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * tImpact;
    const planarDist = speed * t;
    const x = muzzle.x + d.x * planarDist;
    const y = muzzle.y + d.y * planarDist;
    let z = startZ + vz0 * t - 0.5 * g * t * t;

    if (planarDist >= maxRange) {
      const clampedDist = maxRange;
      const clampedX = muzzle.x + d.x * clampedDist;
      const clampedY = muzzle.y + d.y * clampedDist;
      const clampedT = clampedDist / speed;
      const clampedZ = Math.max(0, startZ + vz0 * clampedT - 0.5 * g * clampedT * clampedT);
      groundPoints.push({ x: clampedX, y: clampedY });
      points.push({
        x: clampedX,
        y: clampedY - clampedZ * Z_TO_SCREEN,
        z: clampedZ,
        isImpact: clampedZ <= 0,
      });
      impactIndex = points.length - 1;
      break;
    }

    if (z <= 0 && t > 0) {
      groundPoints.push({ x, y });
      points.push({
        x,
        y: y - z * Z_TO_SCREEN,
        z: 0,
        isImpact: true,
      });
      impactIndex = points.length - 1;
      break;
    }

    if (z > maxZ) {
      maxZ = z;
      apexIndex = points.length;
    }

    groundPoints.push({ x, y });
    points.push({
      x,
      y: y - z * Z_TO_SCREEN,
      z,
    });
  }

  if (points.length > 0 && apexIndex < points.length) {
    points[apexIndex] = { ...points[apexIndex], isApex: true };
  }

  return {
    points,
    groundPoints,
    apexIndex,
    impactIndex,
    isClosed: false,
    trajectoryType: 'BALLISTIC_ARC',
  };
}

function buildPredictivePath(
  trajectory: TrajectoryConfig,
  origin: Point,
  theta: number,
  muzzleOffset: number,
  startZ = 0,
): PredictivePath {
  const maxRange = trajectory.maxRange ?? 500;
  const visualOrigin: Point =
    startZ > 0
      ? { x: origin.x, y: origin.y - startZ * Z_TO_SCREEN }
      : origin;

  switch (trajectory.type) {
    case 'LINEAR':
      return {
        points: buildLinearPath(visualOrigin, theta, muzzleOffset, maxRange),
        isClosed: false,
        trajectoryType: 'LINEAR',
      };
    case 'DISCONTINUOUS_BLINK':
      return {
        points: buildDiscontinuousBlinkPath(visualOrigin, theta, muzzleOffset, trajectory),
        isClosed: false,
        trajectoryType: 'DISCONTINUOUS_BLINK',
      };
    case 'RETURN_TO_SOURCE':
      return {
        points: buildReturnToSourcePath(visualOrigin, theta, muzzleOffset, trajectory),
        isClosed: false,
        trajectoryType: 'RETURN_TO_SOURCE',
      };
    case 'HOMING_SLERP':
      return {
        points: buildHomingSlerpPath(visualOrigin, theta, muzzleOffset, trajectory),
        isClosed: false,
        trajectoryType: 'HOMING_SLERP',
      };
    case 'ORBIT_ANCHOR':
      return {
        points: buildOrbitAnchorPath(visualOrigin, theta, trajectory),
        isClosed: true,
        trajectoryType: 'ORBIT_ANCHOR',
      };
    case 'BALLISTIC_ARC':
      return buildBallisticArcPath(trajectory, origin, theta, muzzleOffset, 24, startZ);
    default:
      return {
        points: buildLinearPath(visualOrigin, theta, muzzleOffset, maxRange),
        isClosed: false,
        trajectoryType: trajectory.type,
      };
  }
}

export interface IconTrajectoryResult {
  origin: { x: number; y: number };
  paths: { points: { x: number; y: number }[]; isClosed: boolean }[];
  endpoints: { x: number; y: number }[];
  trajectoryType: TrajectoryType;
}

function mapIconPoint(
  p: Point,
  scale: number,
  offsetX: number,
  offsetY: number,
): Point {
  return {
    x: Math.round((p.x * scale + offsetX) * 100) / 100,
    y: Math.round((p.y * scale + offsetY) * 100) / 100,
  };
}

export function resolveIconTrajectoryPaths(
  ability: AbilitySchema,
  logicalSize: number,
  padding = 8,
): IconTrajectoryResult {
  const center = logicalSize / 2;
  const emptyResult: IconTrajectoryResult = {
    origin: { x: center, y: center },
    paths: [],
    endpoints: [],
    trajectoryType: 'LINEAR',
  };

  const shots = collectAllCastProjectiles(ability);
  if (shots.length === 0) return emptyResult;

  const originPt = { x: 0, y: 0 };
  const rawPaths: PredictivePath[] = [];
  const rawBeads: Point[] = [];

  for (const shot of shots) {
    const angles = spreadAnglesForCastShot(shot);
    for (const theta of angles) {
      const path = buildPredictivePath(shot.trajectory, originPt, theta, 0, 0);
      rawPaths.push(path);
      if (path.isClosed && shot.trajectory.type === 'ORBIT_ANCHOR') {
        const radius = shot.trajectory.orbitRadius ?? 100;
        rawBeads.push({
          x: Math.cos(theta) * radius,
          y: Math.sin(theta) * radius,
        });
      }
    }
  }

  if (rawPaths.length === 0) return emptyResult;

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (const path of rawPaths) {
    for (const p of path.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  for (const bead of rawBeads) {
    minX = Math.min(minX, bead.x);
    minY = Math.min(minY, bead.y);
    maxX = Math.max(maxX, bead.x);
    maxY = Math.max(maxY, bead.y);
  }

  const boxW = Math.max(maxX - minX, 1);
  const boxH = Math.max(maxY - minY, 1);
  const avail = logicalSize - padding * 2;
  const scale = Math.min(avail / boxW, avail / boxH);
  const offsetX = padding - minX * scale;
  const offsetY = padding - minY * scale;

  const paths = rawPaths.map((path) => ({
    points: path.points.map((p) => mapIconPoint(p, scale, offsetX, offsetY)),
    isClosed: path.isClosed,
  }));

  const origin = mapIconPoint({ x: 0, y: 0 }, scale, offsetX, offsetY);
  const endpoints: Point[] = rawBeads.map((bead) =>
    mapIconPoint(bead, scale, offsetX, offsetY),
  );
  for (const path of paths) {
    if (path.isClosed || path.points.length === 0) continue;
    endpoints.push(path.points[path.points.length - 1]);
  }

  const primaryType = shots[0].trajectory.type;

  return {
    origin,
    paths,
    endpoints,
    trajectoryType: primaryType,
  };
}

function collectOnCastProjectiles(
  ability: AbilitySchema,
): Array<{ trajectory: TrajectoryConfig; aimOffsetDeg: number }> {
  const projectiles: Array<{ trajectory: TrajectoryConfig; aimOffsetDeg: number }> = [];
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        projectiles.push({
          trajectory: action.projectileTrajectory,
          aimOffsetDeg: action.emitter?.aimOffsetDeg ?? 0,
        });
      }
    }
  }
  return projectiles;
}

function sampleLinear(trajectory: TrajectoryConfig, steps = 15): Point[] {
  const range = trajectory.maxRange ?? 500;
  const ux = LINEAR_DIR.x / LINEAR_LEN;
  const uy = LINEAR_DIR.y / LINEAR_LEN;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ x: ux * range * t, y: uy * range * t });
  }
  return points;
}

function sampleReturnToSource(trajectory: TrajectoryConfig, steps = 24): Point[] {
  const range = trajectory.maxRange ?? 500;
  const points: Point[] = [];
  const cx = range * 0.35;
  const cy = -range * 0.25;
  const rx = range * 0.45;
  const ry = range * 0.35;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * Math.PI * 1.4 - Math.PI * 0.2;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
    });
  }
  return points;
}

function sampleHomingSlerp(steps = 20): Point[] {
  const start = { x: 0, y: 0 };
  const control = { x: 40, y: -60 };
  const end = { x: 120, y: -140 };
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    });
  }
  return points;
}

function sampleOrbit(trajectory: TrajectoryConfig, aimOffsetDeg = 0, steps = 24): Point[] {
  const radius = trajectory.orbitRadius ?? 100;
  const offsetRad = (aimOffsetDeg * Math.PI) / 180;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = offsetRad + (i / steps) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return points;
}

function sampleDiscontinuousBlink(trajectory: TrajectoryConfig, steps = 12): Point[] {
  const range = trajectory.maxRange ?? 500;
  const blinkDist = trajectory.blinkDistance ?? 80;
  const ux = LINEAR_DIR.x / LINEAR_LEN;
  const uy = LINEAR_DIR.y / LINEAR_LEN;
  const points: Point[] = [{ x: 0, y: 0 }];
  let dist = 0;
  while (dist < range) {
    dist += blinkDist;
    if (dist > range) dist = range;
    points.push({ x: ux * dist, y: uy * dist });
  }
  return points;
}

function sampleInstantImpulse(): Point[] {
  return [
    { x: 0, y: 0 },
    { x: 0, y: -40 },
  ];
}

function sampleTrajectoryPath(
  trajectory: TrajectoryConfig | undefined,
  aimOffsetDeg = 0,
): { points: Point[]; hasReturn: boolean } {
  if (!trajectory) {
    return { points: sampleInstantImpulse(), hasReturn: false };
  }
  switch (trajectory.type) {
    case 'LINEAR':
      return { points: sampleLinear(trajectory), hasReturn: false };
    case 'RETURN_TO_SOURCE':
      return { points: sampleReturnToSource(trajectory), hasReturn: true };
    case 'HOMING_SLERP':
      return { points: sampleHomingSlerp(), hasReturn: false };
    case 'ORBIT_ANCHOR':
      return { points: sampleOrbit(trajectory, aimOffsetDeg), hasReturn: false };
    case 'DISCONTINUOUS_BLINK':
      return { points: sampleDiscontinuousBlink(trajectory), hasReturn: false };
    case 'BALLISTIC_ARC': {
      const arc = buildBallisticArcPath(
        trajectory,
        { x: 0, y: 0 },
        -Math.PI / 4,
        0,
      );
      return {
        points: arc.points.map((p) => ({ x: p.x, y: p.y })),
        hasReturn: false,
      };
    }
    default:
      return { points: sampleLinear(trajectory), hasReturn: false };
  }
}

export function sampleAbilityTrajectory(ability: AbilitySchema): TrajectoryTrace {
  const points: Point[] = [];
  const fields: TrajectoryTrace['fields'] = [];
  let hasReturn = false;

  const rootTrajectory = ability.trajectory;
  const onCastProjectiles = collectOnCastProjectiles(ability);

  if (rootTrajectory) {
    const sampled = sampleTrajectoryPath(rootTrajectory);
    points.push(...sampled.points);
    hasReturn = sampled.hasReturn;
  } else if (onCastProjectiles.length > 0) {
    for (const proj of onCastProjectiles) {
      const sampled = sampleTrajectoryPath(proj.trajectory, proj.aimOffsetDeg);
      if (points.length > 0) points.push({ x: NaN, y: NaN });
      points.push(...sampled.points);
      hasReturn = hasReturn || sampled.hasReturn;
    }
  } else {
    const sampled = sampleTrajectoryPath(undefined);
    points.push(...sampled.points);
  }

  let endPoint: Point = points.length > 0
    ? { ...points[points.length - 1] }
    : { x: 0, y: 0 };

  let hasTeleport = false;
  let hasSpawnActor = false;

  walkTriggers(ability.triggers ?? [], (_node, action) => {
    if (action.type === 'TELEPORT') {
      hasTeleport = true;
      const dist = action.distance;
      const dir = action.direction;
      const tx = dir ? dir.x * dist : dist;
      const ty = dir ? dir.y * dist : 0;
      if (points.length > 0) points.push({ x: NaN, y: NaN });
      points.push({ x: 0, y: 0 }, { x: tx, y: ty });
      endPoint = { x: tx, y: ty };
    }
    if (action.type === 'SPAWN_FIELD') {
      const atEndpoint = rootTrajectory || onCastProjectiles.length > 0;
      const fx = atEndpoint ? endPoint.x : 0;
      const fy = atEndpoint ? endPoint.y : 0;
      fields.push({
        x: fx,
        y: fy,
        radius: action.field.radius,
        fieldType: action.field.fieldType,
      });
    }
    if (action.type === 'SPAWN_ACTOR') {
      hasSpawnActor = true;
    }
  });

  if (hasSpawnActor) {
    if (points.length > 0) points.push({ x: NaN, y: NaN });
    points.push({ x: 0, y: -30 }, { x: 40, y: -30 });
  }

  const validPoints = points.filter((p) => !Number.isNaN(p.x));
  const startPoint = validPoints.length > 0 ? { ...validPoints[0] } : { x: 0, y: 0 };
  if (!hasTeleport) {
    endPoint = validPoints.length > 0
      ? { ...validPoints[validPoints.length - 1] }
      : { x: 0, y: 0 };
  }

  return {
    points,
    fields,
    hasReturn,
    startPoint,
    endPoint,
  };
}
