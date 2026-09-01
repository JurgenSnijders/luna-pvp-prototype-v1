import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { getHexVertices } from '../../math/HexMath';
import { RETRO_COLORS } from '../../ui/tokens';
import type { CanvasRenderCtx } from './renderCtx';

function withNeonStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
  draw: () => void,
): void {
  ctx.save();
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  draw();
  ctx.restore();
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
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#12121e';
  ctx.fill();

  withNeonStroke(ctx, RETRO_COLORS.neonCyan, 16, () => {
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.lineWidth = 9;
    ctx.stroke();
  });

  withNeonStroke(ctx, RETRO_COLORS.neonCyan, 8, () => {
    ctx.strokeStyle = RETRO_COLORS.neonCyan;
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  if (isShrinking) {
    const pulse = 0.4 + 0.4 * Math.sin(performance.now() * 0.006);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    const width = 3 + 3 * shrinkProgress;
    withNeonStroke(ctx, RETRO_COLORS.borderHot, 12, () => {
      ctx.strokeStyle = `rgba(255, 40, 40, ${0.35 * pulse})`;
      ctx.lineWidth = width * 3;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 40, 40, ${pulse})`;
      ctx.lineWidth = width;
      ctx.stroke();
    });
  }
}
