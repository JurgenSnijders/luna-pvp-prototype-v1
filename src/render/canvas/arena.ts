import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { getHexVertices } from '../../math/HexMath';
import { Vector2D } from '../../math/Vector2D';
import { getActiveColors } from '../../ui/tokens';
import type { CanvasRenderCtx } from './renderCtx';

const LIP_HEIGHT = 14;
const SHADOW_OFFSET_Y = 24;

function traceHexPath(ctx: CanvasRenderingContext2D, vertices: { x: number; y: number }[]): void {
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
}

function drawSteppedShadow(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  center: Vector2D,
): void {
  const steps = [
    { scale: 1.02, alpha: 0.12 },
    { scale: 1.04, alpha: 0.18 },
    { scale: 1.06, alpha: 0.22 },
    { scale: 1.08, alpha: 0.15 },
  ];
  for (const step of steps) {
    ctx.save();
    ctx.translate(0, SHADOW_OFFSET_Y);
    ctx.translate(center.x, center.y);
    ctx.scale(step.scale, step.scale);
    ctx.translate(-center.x, -center.y);
    traceHexPath(ctx, vertices);
    ctx.fillStyle = `rgba(0, 0, 0, ${step.alpha})`;
    ctx.fill();
    ctx.restore();
  }
}

function drawExtrudedLip(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  centerY: number,
): void {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    if (a.y < centerY && b.y < centerY) continue;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x, b.y + LIP_HEIGHT);
    ctx.lineTo(a.x, a.y + LIP_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = '#090912';
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 30, 48, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawShrinkHazardRim(
  ctx: CanvasRenderingContext2D,
  vertices: { x: number; y: number }[],
  center: Vector2D,
  hexRadius: number,
  shrinkProgress: number,
): void {
  const pulse = 0.4 + 0.4 * Math.sin(performance.now() * 0.006);
  const tickCount = 12;
  const radius = hexRadius;

  for (let i = 0; i < tickCount; i++) {
    const t = i / tickCount;
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const inner = center.add(Vector2D.fromAngle(angle, radius + 2));
    const outer = center.add(Vector2D.fromAngle(angle, radius + 10 + shrinkProgress * 6));
    ctx.strokeStyle = `rgba(255, 40, 40, ${pulse * 0.85})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.stroke();
  }

  traceHexPath(ctx, vertices);
  const width = 3 + 3 * shrinkProgress;
  ctx.strokeStyle = `rgba(255, 40, 40, ${0.35 * pulse})`;
  ctx.lineWidth = width * 3;
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 40, 40, ${pulse})`;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function drawHexPlatform(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  world: PhysicsWorld,
  shrinkProgress: number,
  isShrinking: boolean,
): void {
  if (
    world.hexRadius !== state.cachedHexRadius ||
    world.hexCenter.x !== state.cachedHexCenterX ||
    world.hexCenter.y !== state.cachedHexCenterY
  ) {
    state.cachedHexVertices = getHexVertices(world.hexCenter, world.hexRadius);
    state.cachedHexRadius = world.hexRadius;
    state.cachedHexCenterX = world.hexCenter.x;
    state.cachedHexCenterY = world.hexCenter.y;
  }
  const vertices = state.cachedHexVertices;
  const center = world.hexCenter;

  drawSteppedShadow(ctx, vertices, center);
  drawExtrudedLip(ctx, vertices, center.y);

  traceHexPath(ctx, vertices);
  ctx.fillStyle = '#12121e';
  ctx.fill();

  const colors = getActiveColors();
  const neonRgb = hexToRgb(colors.neonCyan);
  traceHexPath(ctx, vertices);
  ctx.strokeStyle = `rgba(${neonRgb.r}, ${neonRgb.g}, ${neonRgb.b}, 0.3)`;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = colors.neonCyan;
  ctx.lineWidth = 3;
  ctx.stroke();

  if (isShrinking) {
    drawShrinkHazardRim(ctx, vertices, center, world.hexRadius, shrinkProgress);
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
