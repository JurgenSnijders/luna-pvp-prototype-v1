import type { AbilitySchema, TrajectoryConfig } from '../../types/schema';
import { getArchetypeColor } from './SpellIconGenerator';
import {
  collectGroundImpactFieldRadii,
  resolveLiveAimingPaths,
  resolveRootTrajectory,
  type PredictivePath,
} from './trajectoryTracer';
import { useCheapCanvasEffects } from '../cheapCanvasEffects';

export type AimingMode = 'directional' | 'radial';

export interface AimingState {
  slotIndex: number;
  ability: AbilitySchema;
  mode: AimingMode;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  /** Unclamped mouse world position; overlay length/angle is rebuilt from this at draw time. */
  cursor: { x: number; y: number };
  angle: number;
  range: number;
  width: number;
  radialRadius: number;
  playerRadius: number;
}

function clampGroundPointTarget(
  state: AimingState,
  origin: { x: number; y: number },
): { angle: number; clampedDist: number } {
  const maxRange = state.ability.maxTargetRange ?? 500;
  const dx = state.cursor.x - origin.x;
  const dy = state.cursor.y - origin.y;
  const dist = Math.hypot(dx, dy);
  const angle = dist > 0.01 ? Math.atan2(dy, dx) : state.angle;
  const clampedDist = Math.min(dist, maxRange);
  return { angle, clampedDist };
}

export function syncAimFromCursorState(
  state: AimingState,
  casterPos: { x: number; y: number },
): void {
  const ox = casterPos.x;
  const oy = casterPos.y;
  const dx = state.cursor.x - ox;
  const dy = state.cursor.y - oy;
  const dist = Math.hypot(dx, dy);
  const angle = dist > 0.01 ? Math.atan2(dy, dx) : state.angle;

  if (state.ability.targetingMode === 'GROUND_POINT') {
    const { angle: groundAngle, clampedDist } = clampGroundPointTarget(state, casterPos);
    state.angle = groundAngle;
    state.target = {
      x: ox + Math.cos(groundAngle) * clampedDist,
      y: oy + Math.sin(groundAngle) * clampedDist,
    };
    state.range = clampedDist;
    return;
  }

  const clampedDist =
    state.mode === 'directional' ? Math.min(dist, state.range) : dist;
  state.angle = angle;
  state.target = {
    x: ox + Math.cos(angle) * clampedDist,
    y: oy + Math.sin(angle) * clampedDist,
  };
}

export function layoutAimingVisual(
  state: AimingState,
  origin: { x: number; y: number },
): AimingState {
  const dx = state.cursor.x - origin.x;
  const dy = state.cursor.y - origin.y;
  const dist = Math.hypot(dx, dy);
  const angle = dist > 0.01 ? Math.atan2(dy, dx) : state.angle;

  if (state.ability.targetingMode === 'GROUND_POINT') {
    const { angle: groundAngle, clampedDist } = clampGroundPointTarget(state, origin);
    return {
      ...state,
      origin: { x: origin.x, y: origin.y },
      angle: groundAngle,
      range: clampedDist,
      target: {
        x: origin.x + Math.cos(groundAngle) * clampedDist,
        y: origin.y + Math.sin(groundAngle) * clampedDist,
      },
    };
  }

  const clampedDist =
    state.mode === 'directional' ? Math.min(dist, state.range) : dist;
  return {
    ...state,
    origin: { x: origin.x, y: origin.y },
    angle,
    target: {
      x: origin.x + Math.cos(angle) * clampedDist,
      y: origin.y + Math.sin(angle) * clampedDist,
    },
  };
}

function collectOnCastFieldRadii(ability: AbilitySchema): number[] {
  const radii: number[] = [];
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_FIELD') {
        radii.push(action.field.radius);
      }
    }
  }
  return radii;
}

function hasOnCastTeleport(ability: AbilitySchema): boolean {
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'TELEPORT') return true;
    }
  }
  return false;
}

/** Trajectory/field visual mode from schema alone (ignores input profile). */
export function resolveTrajectoryVisualMode(ability: AbilitySchema): AimingMode | null {
  if (ability.targetingMode === 'GROUND_POINT') {
    return 'radial';
  }

  const trajectory = resolveRootTrajectory(ability);
  if (trajectory) {
    return 'directional';
  }

  if (hasOnCastTeleport(ability)) return null;

  const fieldRadii = collectOnCastFieldRadii(ability);
  if (fieldRadii.length > 0) return 'radial';

  return null;
}

export function classifyAimingMode(ability: AbilitySchema): AimingMode | null {
  const profile = ability.inputProfile ?? { mode: 'INSTANT' };
  if (profile.mode !== 'INSTANT') return null;
  return resolveTrajectoryVisualMode(ability);
}

export function resolveAbilityAimParams(ability: AbilitySchema): {
  trajectory?: TrajectoryConfig;
  range: number;
  width: number;
  radialRadius: number;
} {
  const trajectory = resolveRootTrajectory(ability);
  const fieldRadii = collectOnCastFieldRadii(ability);
  const width = Math.max(28, (ability.visuals?.size ?? 14) * 2);

  if (ability.targetingMode === 'GROUND_POINT') {
    const impactRadii = collectGroundImpactFieldRadii(ability);
    let radialRadius = 60;
    if (fieldRadii.length > 0) {
      radialRadius = Math.max(...fieldRadii);
    } else if (impactRadii.length > 0) {
      radialRadius = Math.max(...impactRadii);
    } else {
      radialRadius = (ability.visuals?.size ?? 14) * 3.5;
    }
    return {
      trajectory,
      range: ability.maxTargetRange ?? 500,
      width,
      radialRadius,
    };
  }

  const range = trajectory?.maxRange ?? trajectory?.orbitRadius ?? 350;
  let radialRadius = 0;
  if (trajectory?.type === 'ORBIT_ANCHOR') {
    radialRadius = trajectory.orbitRadius ?? 100;
  } else if (fieldRadii.length > 0) {
    radialRadius = Math.max(...fieldRadii);
  }
  return { trajectory, range, width, radialRadius };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function distanceT(
  dist: number,
  startDist: number,
  endDist: number,
): number {
  return Math.max(0, Math.min(1, (dist - startDist) / Math.max(1, endDist - startDist)));
}

function fadeAlphaByDistance(
  dist: number,
  startDist: number,
  endDist: number,
  maxAlpha: number,
): number {
  return Math.pow(distanceT(dist, startDist, endDist), 1.6) * maxAlpha;
}

function gradientEndpoints(path: PredictivePath): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const start = path.points[0];
  if (path.isClosed && path.points.length > 2) {
    const mid = path.points[Math.floor(path.points.length / 2)];
    return { start, end: mid };
  }
  return { start, end: path.points[path.points.length - 1] };
}

function createStrokeGradient(
  ctx: CanvasRenderingContext2D,
  color: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): CanvasGradient {
  const strokeGrad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  strokeGrad.addColorStop(0, hexToRgba(color, 0));
  strokeGrad.addColorStop(0.25, hexToRgba(color, 0.15));
  strokeGrad.addColorStop(0.65, hexToRgba(color, 0.65));
  strokeGrad.addColorStop(1, hexToRgba(color, 1));
  return strokeGrad;
}

function drawLinearChevrons(
  ctx: CanvasRenderingContext2D,
  path: PredictivePath,
  color: string,
): void {
  if (path.points.length < 2) return;

  const start = path.points[0];
  const end = path.points[path.points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 40) return;

  const angle = Math.atan2(dy, dx);
  const ux = dx / length;
  const uy = dy / length;
  const chevronSpacing = 32;
  const chevronSize = 8;

  ctx.save();
  ctx.lineWidth = 2;

  for (let dist = 28; dist < length - 20; dist += chevronSpacing) {
    const alpha = fadeAlphaByDistance(dist, 0, length, 0.85);
    const cx = start.x + ux * dist;
    const cy = start.y + uy * dist;
    ctx.strokeStyle = hexToRgba(color, alpha);
    ctx.beginPath();
    ctx.moveTo(
      cx - Math.cos(angle) * chevronSize * 0.3 - Math.sin(angle) * chevronSize * 0.5,
      cy - Math.sin(angle) * chevronSize * 0.3 + Math.cos(angle) * chevronSize * 0.5,
    );
    ctx.lineTo(cx, cy);
    ctx.lineTo(
      cx - Math.cos(angle) * chevronSize * 0.3 + Math.sin(angle) * chevronSize * 0.5,
      cy - Math.sin(angle) * chevronSize * 0.3 - Math.cos(angle) * chevronSize * 0.5,
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawEndpointDiamond(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  angle: number,
  color: string,
  alpha: number,
): void {
  const size = 6;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle + Math.PI / 4);
  ctx.strokeStyle = hexToRgba(color, alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(-size / 2, -size / 2, size, size);
  ctx.stroke();
  ctx.restore();
}

function drawBallisticArcMarkers(
  ctx: CanvasRenderingContext2D,
  path: PredictivePath,
  color: string,
): void {
  if (path.groundPoints && path.groundPoints.length >= 2) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(color, 0.25);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(path.groundPoints[0].x, path.groundPoints[0].y);
    for (let i = 1; i < path.groundPoints.length; i++) {
      ctx.lineTo(path.groundPoints[i].x, path.groundPoints[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (path.apexIndex !== undefined && path.points[path.apexIndex]) {
    const apex = path.points[path.apexIndex];
    ctx.save();
    ctx.strokeStyle = hexToRgba(color, 0.9);
    ctx.fillStyle = hexToRgba(color, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(apex.x, apex.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (path.impactIndex !== undefined && path.points[path.impactIndex]) {
    const impact = path.points[path.impactIndex];
    const ground =
      path.groundPoints?.[path.groundPoints.length - 1] ?? impact;
    const prev =
      path.groundPoints && path.groundPoints.length >= 2
        ? path.groundPoints[path.groundPoints.length - 2]
        : path.points[Math.max(0, path.impactIndex - 1)];
    const tipAngle = Math.atan2(ground.y - prev.y, ground.x - prev.x);
    drawEndpointDiamond(ctx, ground, tipAngle, color, 1);
  }
}

function drawPredictivePath(
  ctx: CanvasRenderingContext2D,
  path: PredictivePath,
  color: string,
): void {
  if (path.points.length < 2) return;

  const { start, end } = gradientEndpoints(path);
  const strokeGrad = createStrokeGradient(ctx, color, start, end);

  ctx.save();
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!useCheapCanvasEffects()) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
  }

  ctx.beginPath();
  ctx.moveTo(path.points[0].x, path.points[0].y);
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(path.points[i].x, path.points[i].y);
  }
  if (path.isClosed) {
    ctx.closePath();
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.restore();

  if (path.trajectoryType === 'LINEAR') {
    drawLinearChevrons(ctx, path, color);
  }

  if (path.trajectoryType === 'BALLISTIC_ARC') {
    drawBallisticArcMarkers(ctx, path, color);
  }

  if (!path.isClosed && path.trajectoryType !== 'BALLISTIC_ARC') {
    const last = path.points[path.points.length - 1];
    const prev = path.points[path.points.length - 2];
    const tipAngle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const tipDist = Math.hypot(last.x - start.x, last.y - start.y);
    const pathLen = Math.hypot(end.x - start.x, end.y - start.y);
    const alpha = fadeAlphaByDistance(tipDist, 0, pathLen, 1);
    drawEndpointDiamond(ctx, last, tipAngle, color, alpha);
  }
}

export function drawPredictivePaths(
  ctx: CanvasRenderingContext2D,
  state: AimingState,
): void {
  const archetype = state.ability.archetype ?? 'KINETIC';
  const color = getArchetypeColor(archetype, state.ability.visuals?.color);
  const muzzleOffset =
    state.playerRadius + Math.max(4, state.ability.visuals?.size ?? 8);
  const paths = resolveLiveAimingPaths(
    state.ability,
    state.origin,
    state.angle,
    muzzleOffset,
  );

  if (paths.length === 0) return;

  for (const path of paths) {
    drawPredictivePath(ctx, path, color);
  }
}

export function drawAoERadial(
  ctx: CanvasRenderingContext2D,
  state: AimingState,
  now = performance.now(),
): void {
  const archetype = state.ability.archetype ?? 'KINETIC';
  const color = getArchetypeColor(archetype, state.ability.visuals?.color);
  const radius = state.radialRadius > 0 ? state.radialRadius : state.range;
  const center =
    state.ability.targetingMode === 'GROUND_POINT'
      ? state.target
      : state.mode === 'radial' && state.radialRadius > 0 && !state.ability.trajectory
        ? state.origin
        : state.target;

  const spawnAltitude = state.ability.trajectory?.spawnAltitude ?? 0;
  if (spawnAltitude > 0) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(color, 0.25);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - 120);
    ctx.lineTo(center.x, center.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = hexToRgba(color, 0.35);
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  const rotation = (now / 2000) * Math.PI * 2;
  const tickCount = 8;
  ctx.beginPath();
  for (let i = 0; i < tickCount; i++) {
    const angle = rotation + (i / tickCount) * Math.PI * 2;
    const inner = radius - 10;
    const outer = radius + 6;
    ctx.moveTo(
      center.x + Math.cos(angle) * inner,
      center.y + Math.sin(angle) * inner,
    );
    ctx.lineTo(
      center.x + Math.cos(angle) * outer,
      center.y + Math.sin(angle) * outer,
    );
  }
  ctx.stroke();

  ctx.fillStyle = hexToRgba(color, 0.12);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export class AimingIndicatorRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    state: AimingState,
    origin?: { x: number; y: number },
  ): void {
    const visual = origin ? layoutAimingVisual(state, origin) : state;
    const now = performance.now();
    if (visual.mode === 'directional') {
      drawPredictivePaths(ctx, visual);
    } else {
      drawAoERadial(ctx, visual, now);
    }
  }
}
