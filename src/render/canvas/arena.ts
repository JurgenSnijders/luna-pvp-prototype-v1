import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { getHexVertices } from '../../math/HexMath';
import { getActiveColors } from '../../ui/tokens';
import type { CanvasRenderCtx } from './renderCtx';

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
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#12121e';
  ctx.fill();
  const colors = getActiveColors();
  const neonRgb = hexToRgb(colors.neonCyan);
  ctx.strokeStyle = `rgba(${neonRgb.r}, ${neonRgb.g}, ${neonRgb.b}, 0.3)`;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = colors.neonCyan;
  ctx.lineWidth = 3;
  ctx.stroke();

  if (isShrinking) {
    const pulse = 0.4 + 0.4 * Math.sin(performance.now() * 0.006);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    const width = 3 + 3 * shrinkProgress;
    ctx.strokeStyle = `rgba(255, 40, 40, ${0.35 * pulse})`;
    ctx.lineWidth = width * 3;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 40, 40, ${pulse})`;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
