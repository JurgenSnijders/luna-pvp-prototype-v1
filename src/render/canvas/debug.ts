import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Entity } from '../../entities/Entity';
import { getClosestEdgeNormal, getHexVertices } from '../../math/HexMath';
import type { DebugForceVector } from '../../types/debug';
import { FIELD_COLORS } from './colors';
import { lerpPos } from './helpers';

export interface DebugOptions {
  showVectors: boolean;
  showRadii: boolean;
  showIds: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  size: number,
): void {
  const perpX = -dirY;
  const perpY = dirX;
  const baseX = tipX - dirX * size;
  const baseY = tipY - dirY * size;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + perpX * size * 0.4, baseY + perpY * size * 0.4);
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX - perpX * size * 0.4, baseY - perpY * size * 0.4);
  ctx.stroke();
}

function drawForceVector(ctx: CanvasRenderingContext2D, vec: DebugForceVector): void {
  const visualScale = clamp(vec.magnitude * 0.08, 12, 100);
  const endX = vec.originX + vec.dirX * visualScale;
  const endY = vec.originY + vec.dirY * visualScale;

  ctx.strokeStyle = vec.color;
  ctx.fillStyle = vec.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(vec.originX, vec.originY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  drawArrowhead(ctx, endX, endY, vec.dirX, vec.dirY, 6);

  const label = vec.label
    ? `${vec.label} ${Math.round(vec.magnitude)}`
    : `${Math.round(vec.magnitude)}`;
  const midX = (vec.originX + endX) * 0.5;
  const midY = (vec.originY + endY) * 0.5;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, midX, midY - 4);
}

export function drawPhysicsDebugBadge(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
): void {
  const zoneCount = world.zones.filter((z) => !z.isDead).length;
  const vectorCount = world.debugVectors.length;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(8, 8, 248, 30);
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, 248, 30);
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `PHYSICS DEBUG  zones:${zoneCount}  vectors:${vectorCount}`,
    16,
    23,
  );
  ctx.restore();
}

export function drawPhysicsDebugOverlay(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  _alpha: number,
): void {
  for (const zone of world.zones) {
    if (zone.isDead) continue;
    const fill = FIELD_COLORS[zone.config.fieldType] ?? 'rgba(168, 85, 247, 0.12)';
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(zone.pos.x, zone.pos.y, zone.config.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(zone.pos.x, zone.pos.y, zone.config.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const vec of world.debugVectors) {
    drawForceVector(ctx, vec);
  }
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
