import { Z_TO_SCREEN } from '../../engine/verticalConstants';
import {
  resolveCursorGroundRange,
  shouldApplyCursorBallisticSolver,
} from '../../math/ballisticSolver';
import { Vector2D } from '../../math/Vector2D';
import type { AbilitySchema, PathPoint, TrajectoryConfig } from '../../types/schema';
import { resolveArcFacingRad } from '../../primitives/arcWedge';
import { resolveLiveAimingPaths } from './aimingRollout';
import {
  abilityUsesGroundReticle,
  collectGroundImpactFieldRadii,
  deployableTangentAngle,
  isPlacedDeployableAimTarget,
  resolveDeployableInfo,
  resolveRootTrajectory,
  type DeployableTargetInfo,
  type PredictivePath,
} from './trajectoryTracer';
import { useCheapCanvasEffects } from '../cheapCanvasEffects';
import { TELEGRAPH_COLORS } from './colors';
import {
  drawGlowDisc,
  drawRimArc,
  drawRimTicks,
  drawWedgeEdges,
  rgbToHex,
} from './glowDisc';

export type AimingMode = 'directional' | 'radial' | 'draw';

/** Aiming is always the local player's own cast, so every telegraph reads as neutral intent. */
const TELEGRAPH_HEX = rgbToHex(TELEGRAPH_COLORS.NEUTRAL);

const DRAW_POINT_MIN_SPACING = 8;
const DRAW_POINT_MAX_SAMPLES = 256;

export function resolveAimIndicatorOrigin(
  pos: { x: number; y: number },
  z = 0,
): { x: number; y: number } {
  return { x: pos.x, y: pos.y - z * Z_TO_SCREEN };
}

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
  drawnPoints: PathPoint[];
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
  if (state.mode === 'draw') {
    const last = state.drawnPoints[state.drawnPoints.length - 1];
    const dx = state.cursor.x - (last?.x ?? casterPos.x);
    const dy = state.cursor.y - (last?.y ?? casterPos.y);
    if (
      state.drawnPoints.length < DRAW_POINT_MAX_SAMPLES &&
      (!last || Math.hypot(dx, dy) >= DRAW_POINT_MIN_SPACING)
    ) {
      state.drawnPoints.push({ x: state.cursor.x, y: state.cursor.y });
    }
    return;
  }

  const ox = casterPos.x;
  const oy = casterPos.y;
  const dx = state.cursor.x - ox;
  const dy = state.cursor.y - oy;
  const dist = Math.hypot(dx, dy);
  const angle = dist > 0.01 ? Math.atan2(dy, dx) : state.angle;

  if (abilityUsesGroundReticle(state.ability) || isPlacedDeployableAimTarget(state.ability)) {
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

  if (abilityUsesGroundReticle(state.ability) || isPlacedDeployableAimTarget(state.ability)) {
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
  if (abilityUsesGroundReticle(ability)) {
    return 'radial';
  }

  const trajectory = resolveRootTrajectory(ability);
  if (trajectory?.type === 'DRAWN_PATH') {
    return 'draw';
  }
  if (trajectory) {
    return 'directional';
  }

  if (hasOnCastTeleport(ability)) return null;

  const fieldRadii = collectOnCastFieldRadii(ability);
  if (fieldRadii.length > 0) return 'radial';

  if (isPlacedDeployableAimTarget(ability)) return 'radial';

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

  if (abilityUsesGroundReticle(ability)) {
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

  if (isPlacedDeployableAimTarget(ability)) {
    const info = resolveDeployableInfo(ability);
    let radialRadius = 60;
    if (info) {
      if (info.shape === 'BOX') {
        radialRadius = Math.max(info.width, info.height) / 2;
      } else if (info.radius > 0) {
        radialRadius = info.radius;
      } else {
        radialRadius = (ability.visuals?.size ?? 14) * 3.5;
      }
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
    // Dashed = planar ground track; solid stroke above = height-baked arc (one projectile).
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
  startZ = 0,
  planarOrigin?: { x: number; y: number },
): void {
  const color = TELEGRAPH_HEX;

  if (state.mode === 'draw') {
    if (state.drawnPoints.length < 2) return;
    drawPredictivePath(
      ctx,
      {
        points: state.drawnPoints.map((p) => ({ x: p.x, y: p.y, z: startZ })),
        isClosed: false,
        trajectoryType: 'DRAWN_PATH',
      },
      color,
    );
    return;
  }

  const muzzleOffset =
    state.playerRadius + Math.max(4, state.ability.visuals?.size ?? 8);
  const origin = planarOrigin ?? state.origin;
  const rootTrajectory = resolveRootTrajectory(state.ability);
  let aimGroundRange: number | undefined;
  if (rootTrajectory && shouldApplyCursorBallisticSolver(rootTrajectory, state.ability)) {
    const heading = Vector2D.fromAngle(state.angle);
    aimGroundRange = resolveCursorGroundRange(
      Vector2D.create(origin.x, origin.y),
      Vector2D.create(state.target.x, state.target.y),
      heading,
      muzzleOffset,
      rootTrajectory.maxRange ?? 500,
    );
  }
  const paths = resolveLiveAimingPaths(
    state.ability,
    origin,
    state.angle,
    muzzleOffset,
    startZ,
    aimGroundRange,
  );

  if (paths.length === 0) return;

  for (const path of paths) {
    drawPredictivePath(ctx, path, color);
  }
}

function drawRectCornerBrackets(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  arm: number,
  color: string,
): void {
  const hw = width / 2;
  const hh = height / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  const drawCorner = (cx: number, cy: number, sx: number, sy: number) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + sx * arm, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + sy * arm);
    ctx.stroke();
  };

  drawCorner(-hw, -hh, 1, 1);
  drawCorner(hw, -hh, -1, 1);
  drawCorner(hw, hh, -1, -1);
  drawCorner(-hw, hh, 1, -1);
}

function resolveGhostFacingRad(
  info: DeployableTargetInfo,
  dx: number,
  dy: number,
  fallbackAngle: number,
): number {
  const distSq = dx * dx + dy * dy;
  const aimAngle = distSq > 0.01 ? Math.atan2(dy, dx) : fallbackAngle;

  if (info.shape === 'WEDGE_FIELD') {
    return resolveArcFacingRad(info.arcFacing ?? 'CAST_HEADING', info.arcOffsetDeg ?? 0, {
      entityFacingRad: fallbackAngle,
      castHeadingRad: aimAngle,
    });
  }

  switch (info.orientationMode) {
    case 'TANGENT':
      return distSq > 0.01 ? deployableTangentAngle(dx, dy) : fallbackAngle + Math.PI / 2;
    case 'RADIAL_OUTWARD':
      return aimAngle;
    case 'FIXED':
    default:
      return ((info.arcOffsetDeg ?? 0) * Math.PI) / 180;
  }
}

function drawOmniCircleGhost(
  ctx: CanvasRenderingContext2D,
  radius: number,
  color: string,
  isDestructible: boolean,
  nowSec: number,
): void {
  const intentRgb = TELEGRAPH_COLORS.NEUTRAL;
  drawGlowDisc(ctx, 0, 0, radius, intentRgb);
  drawRimArc(ctx, 0, 0, radius, intentRgb, nowSec);

  ctx.strokeStyle = hexToRgba(color, 0.55);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(-radius * 0.35, 0);
  ctx.lineTo(radius * 0.35, 0);
  ctx.moveTo(0, -radius * 0.35);
  ctx.lineTo(0, radius * 0.35);
  ctx.stroke();

  if (isDestructible) {
    const pip = Math.max(3, radius * 0.12);
    const pipR = radius * 0.72;
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * pipR, Math.sin(a) * pipR, pip, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawDeployableGhost(
  ctx: CanvasRenderingContext2D,
  info: DeployableTargetInfo,
  center: { x: number; y: number },
  origin: { x: number; y: number },
  color: string,
  fallbackAngle = 0,
  nowSec = performance.now() * 0.001,
): void {
  const dx = center.x - origin.x;
  const dy = center.y - origin.y;
  const rotation = resolveGhostFacingRad(info, dx, dy, fallbackAngle);

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(rotation);

  if (info.shape === 'BOX') {
    const halfW = info.width / 2;
    const halfH = info.height / 2;
    ctx.fillStyle = hexToRgba(color, 0.12);
    ctx.fillRect(-halfW, -halfH, info.width, info.height);
    ctx.strokeStyle = hexToRgba(color, 0.85);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-halfW, -halfH, info.width, info.height);
    drawRectCornerBrackets(ctx, info.width, info.height, 6, color);
    ctx.beginPath();
    ctx.arc(0, -halfH - 4, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else if (info.shape === 'TURRET') {
    const half = info.radius;
    ctx.fillStyle = hexToRgba(color, 0.12);
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.strokeStyle = hexToRgba(color, 0.85);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    const barrelTip = half + 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(barrelTip, 0);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(color, 0.45);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(barrelTip, 0);
    ctx.lineTo(barrelTip + half * 1.4, 0);
    ctx.stroke();
  } else if (info.shape === 'WEDGE_FIELD') {
    const halfArc = (((info.arcDeg ?? 90) * Math.PI) / 180) / 2;
    const startAngle = -halfArc;
    const endAngle = halfArc;
    const intentRgb = TELEGRAPH_COLORS.NEUTRAL;
    drawGlowDisc(ctx, 0, 0, info.radius, intentRgb, {
      wedge: true,
      startAngle,
      endAngle,
    });
    drawWedgeEdges(ctx, 0, 0, info.radius, intentRgb, startAngle, endAngle);
    drawRimArc(ctx, 0, 0, info.radius, intentRgb, nowSec, {
      wedge: true,
      startAngle,
      endAngle,
    });

    const tickLen = info.radius * 0.12;
    for (const edgeAngle of [-halfArc, 0, halfArc]) {
      ctx.strokeStyle = hexToRgba(color, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(edgeAngle) * (info.radius - tickLen), Math.sin(edgeAngle) * (info.radius - tickLen));
      ctx.lineTo(Math.cos(edgeAngle) * (info.radius + tickLen * 0.5), Math.sin(edgeAngle) * (info.radius + tickLen * 0.5));
      ctx.stroke();
    }
  } else {
    drawOmniCircleGhost(
      ctx,
      info.radius,
      color,
      info.isDestructible === true || info.shape === 'DECOY',
      nowSec,
    );
  }

  ctx.restore();
}

function resolveTerminalLandingPoint(
  state: AimingState,
  planarOrigin?: { x: number; y: number },
  startZ = 0,
): { x: number; y: number } | null {
  const muzzleOffset =
    state.playerRadius + Math.max(4, state.ability.visuals?.size ?? 8);
  const origin = planarOrigin ?? state.origin;
  const rootTrajectory = resolveRootTrajectory(state.ability);
  let aimGroundRange: number | undefined;
  if (rootTrajectory && shouldApplyCursorBallisticSolver(rootTrajectory, state.ability)) {
    const heading = Vector2D.fromAngle(state.angle);
    aimGroundRange = resolveCursorGroundRange(
      Vector2D.create(origin.x, origin.y),
      Vector2D.create(state.target.x, state.target.y),
      heading,
      muzzleOffset,
      rootTrajectory.maxRange ?? 500,
    );
  }
  const paths = resolveLiveAimingPaths(
    state.ability,
    origin,
    state.angle,
    muzzleOffset,
    startZ,
    aimGroundRange,
  );
  if (paths.length === 0) return state.target;

  const lastPath = paths[paths.length - 1];
  if (lastPath.groundPoints && lastPath.groundPoints.length > 0) {
    const gp = lastPath.groundPoints[lastPath.groundPoints.length - 1];
    return { x: gp.x, y: gp.y };
  }
  if (lastPath.points.length > 0) {
    const p = lastPath.points[lastPath.points.length - 1];
    return { x: p.x, y: p.y };
  }
  return state.target;
}

export function drawAoERadial(
  ctx: CanvasRenderingContext2D,
  state: AimingState,
  now = performance.now(),
): void {
  const color = TELEGRAPH_HEX;
  const deployableInfo = resolveDeployableInfo(state.ability);
  const placedDeployable = isPlacedDeployableAimTarget(state.ability);
  const radius = state.radialRadius > 0 ? state.radialRadius : state.range;
  const center =
    abilityUsesGroundReticle(state.ability) || placedDeployable
      ? state.target
      : state.mode === 'radial' && state.radialRadius > 0 && !state.ability.trajectory
        ? state.origin
        : state.target;

  const spawnAltitude = state.ability.trajectory?.spawnAltitude ?? 0;
  const nowSec = now / 1000;

  if (spawnAltitude > 0) {
    ctx.save();
    ctx.strokeStyle = hexToRgba(color, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - 120);
    ctx.lineTo(center.x, center.y);
    ctx.stroke();
    ctx.restore();
  }

  if (deployableInfo) {
    drawDeployableGhost(ctx, deployableInfo, center, state.origin, color, state.angle, nowSec);
    return;
  }

  const intentRgb = TELEGRAPH_COLORS.NEUTRAL;
  drawGlowDisc(ctx, center.x, center.y, radius, intentRgb);
  drawRimArc(ctx, center.x, center.y, radius, intentRgb, nowSec);
  drawRimTicks(ctx, center.x, center.y, radius, intentRgb, now);
}

export class AimingIndicatorRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    state: AimingState,
    planarOrigin?: { x: number; y: number },
    casterZ = 0,
  ): void {
    const now = performance.now();
    if (state.mode === 'directional') {
      const layoutOrigin = planarOrigin ?? state.origin;
      const visual = planarOrigin ? layoutAimingVisual(state, layoutOrigin) : state;
      drawPredictivePaths(ctx, visual, casterZ, planarOrigin);
      const deployableInfo = resolveDeployableInfo(visual.ability);
      if (deployableInfo) {
        const landing = resolveTerminalLandingPoint(visual, planarOrigin, casterZ);
        if (landing) {
          drawDeployableGhost(
            ctx,
            deployableInfo,
            landing,
            visual.origin,
            TELEGRAPH_HEX,
            visual.angle,
          );
        }
      }
    } else {
      const visual = planarOrigin ? layoutAimingVisual(state, planarOrigin) : state;
      drawAoERadial(ctx, visual, now);
    }
  }
}
