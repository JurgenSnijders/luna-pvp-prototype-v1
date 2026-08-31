import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Entity } from '../../entities/Entity';
import { getClosestEdgeNormal, getHexVertices } from '../../math/HexMath';
import { lerpPos } from './helpers';

export interface DebugOptions {
  showVectors: boolean;
  showRadii: boolean;
  showIds: boolean;
}

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  alpha: number,
  debug: DebugOptions,
): void {
  const all: Entity[] = [
    ...world.players,
    ...world.dummies,
    ...world.projectiles,
  ].filter((e) => !e.isDead);

  if (debug.showRadii) {
    const { width: vw, height: vh } = world.viewportBounds;
    ctx.strokeStyle = 'rgba(255, 170, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(0, 0, vw, vh);
    ctx.setLineDash([]);

    const hexVerts = getHexVertices(world.hexCenter, world.hexRadius);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(hexVerts[0].x, hexVerts[0].y);
    for (let i = 1; i < hexVerts.length; i++) {
      ctx.lineTo(hexVerts[i].x, hexVerts[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  for (const entity of all) {
    const pos = lerpPos(entity, alpha);

    if (debug.showRadii) {
      ctx.strokeStyle = 'rgba(0, 255, 128, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, entity.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (debug.showVectors && entity.vel.magSq() > 1) {
      const velEnd = pos.add(entity.vel.scale(0.1));
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(velEnd.x, velEnd.y);
      ctx.stroke();
    }

    if (debug.showIds) {
      ctx.fillStyle = '#aaa';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(entity.id, pos.x + entity.radius + 2, pos.y);
    }
  }

  if (debug.showVectors && world.players.length > 0) {
    const player = world.players[0];
    const pos = lerpPos(player, alpha);
    const normal = getClosestEdgeNormal(pos, world.hexCenter, world.hexRadius);
    const normalEnd = pos.add(normal.scale(40));
    ctx.strokeStyle = '#ff00ff';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(normalEnd.x, normalEnd.y);
    ctx.stroke();
  }
}
