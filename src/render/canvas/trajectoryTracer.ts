import type {
  AbilitySchema,
  ActionPayload,
  TrajectoryConfig,
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

function resolveRootTrajectory(ability: AbilitySchema): TrajectoryConfig | undefined {
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
