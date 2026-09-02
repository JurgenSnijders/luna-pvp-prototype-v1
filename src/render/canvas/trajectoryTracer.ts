import { DEFAULT_EMITTER } from '../../primitives/interpreter/constants';
import type {
  AbilitySchema,
  ActionPayload,
  EmitterConfig,
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

export interface PredictivePath {
  points: { x: number; y: number }[];
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

function resolveLiveCastConfig(ability: AbilitySchema): LiveCastConfig | null {
  if (ability.trajectory) {
    return { trajectory: ability.trajectory, emitter: DEFAULT_EMITTER };
  }
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

function buildPredictivePath(
  trajectory: TrajectoryConfig,
  origin: Point,
  theta: number,
  muzzleOffset: number,
): PredictivePath {
  const maxRange = trajectory.maxRange ?? 500;

  switch (trajectory.type) {
    case 'LINEAR':
      return {
        points: buildLinearPath(origin, theta, muzzleOffset, maxRange),
        isClosed: false,
        trajectoryType: 'LINEAR',
      };
    case 'DISCONTINUOUS_BLINK':
      return {
        points: buildDiscontinuousBlinkPath(origin, theta, muzzleOffset, trajectory),
        isClosed: false,
        trajectoryType: 'DISCONTINUOUS_BLINK',
      };
    case 'RETURN_TO_SOURCE':
      return {
        points: buildReturnToSourcePath(origin, theta, muzzleOffset, trajectory),
        isClosed: false,
        trajectoryType: 'RETURN_TO_SOURCE',
      };
    case 'HOMING_SLERP':
      return {
        points: buildHomingSlerpPath(origin, theta, muzzleOffset, trajectory),
        isClosed: false,
        trajectoryType: 'HOMING_SLERP',
      };
    case 'ORBIT_ANCHOR':
      return {
        points: buildOrbitAnchorPath(origin, theta, trajectory),
        isClosed: true,
        trajectoryType: 'ORBIT_ANCHOR',
      };
    default:
      return {
        points: buildLinearPath(origin, theta, muzzleOffset, maxRange),
        isClosed: false,
        trajectoryType: trajectory.type,
      };
  }
}

export function resolveLiveAimingPaths(
  ability: AbilitySchema,
  origin: { x: number; y: number },
  aimAngle: number,
  muzzleOffset = 0,
): PredictivePath[] {
  const config = resolveLiveCastConfig(ability);
  if (!config) return [];

  const originPt = { x: origin.x, y: origin.y };
  const angles = computeSpreadAngles(config.emitter, aimAngle);

  return angles.map((theta) =>
    buildPredictivePath(config.trajectory, originPt, theta, muzzleOffset),
  );
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
  return { x: p.x * scale + offsetX, y: p.y * scale + offsetY };
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

  const config = resolveLiveCastConfig(ability);
  if (!config) return emptyResult;

  const canonicalAngle =
    config.trajectory.type === 'ORBIT_ANCHOR' ? 0 : -Math.PI / 4;
  const rawPaths = resolveLiveAimingPaths(
    ability,
    { x: 0, y: 0 },
    canonicalAngle,
    0,
  );
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
  const endpoints: Point[] = [];
  for (const path of paths) {
    if (path.isClosed || path.points.length === 0) continue;
    endpoints.push(path.points[path.points.length - 1]);
  }

  return {
    origin,
    paths,
    endpoints,
    trajectoryType: config.trajectory.type,
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
