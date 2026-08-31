import type { Vector2D } from '../../../math/Vector2D';
import { ShapeId } from '../../gl/shaders';
import type { PrimitiveLayer } from '../../PrimitiveLayer';
import { parseColor, type SpawnPriority } from '../ParticleBackend';
import { makeParticle } from './particleSim';
import type { SimParticle } from './types';

export interface WebGLSpawnCtx {
  particles: SimParticle[];
  primitives: PrimitiveLayer;
  spawnParticle: (p: SimParticle, priority: SpawnPriority) => void;
  canSpawn: (priority: SpawnPriority) => boolean;
}

export function spawnDisc(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  size: number,
  color: string,
  alpha: number,
  additive: boolean,
  priority: SpawnPriority,
): void {
  const [r, g, b] = parseColor(color);
  ctx.spawnParticle(
    makeParticle({
      posX: pos.x,
      posY: pos.y,
      velX: 0,
      velY: 0,
      life: 0.4,
      size,
      rot: 0,
      angVel: 0,
      drag: 0.95,
      gravity: 0,
      shapeId: ShapeId.DISC,
      r,
      g,
      b,
      peakAlpha: alpha,
      additive,
    }),
    priority,
  );
}

export function spawnGlow(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  size: number,
  color: string,
  alpha: number,
  additive: boolean,
  priority: SpawnPriority,
): void {
  const [r, g, b] = parseColor(color);
  ctx.spawnParticle(
    makeParticle({
      posX: pos.x,
      posY: pos.y,
      velX: 0,
      velY: 0,
      life: 0.35,
      size,
      rot: 0,
      angVel: 0,
      drag: 0.92,
      gravity: 0,
      shapeId: ShapeId.GLOW,
      r,
      g,
      b,
      peakAlpha: alpha,
      additive,
    }),
    priority,
  );
}

export function spawnRing(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  radius: number,
  thickness: number,
  color: string,
  alpha: number,
  life: number,
  priority: SpawnPriority,
): void {
  if (!ctx.canSpawn(priority)) return;
  const [r, g, b] = parseColor(color);
  ctx.primitives.spawnRing(pos.x, pos.y, radius, thickness, r, g, b, alpha, life, true);
}

export function spawnStreak(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  vel: Vector2D,
  length: number,
  color: string,
  alpha: number,
  life: number,
  priority: SpawnPriority,
): void {
  const [r, g, b] = parseColor(color);
  const rot = Math.atan2(vel.y, vel.x);
  ctx.spawnParticle(
    makeParticle({
      posX: pos.x,
      posY: pos.y,
      velX: vel.x,
      velY: vel.y,
      life,
      size: length,
      rot,
      angVel: 0,
      drag: 0.9,
      gravity: 0,
      shapeId: ShapeId.STREAK,
      r,
      g,
      b,
      peakAlpha: alpha,
      additive: true,
    }),
    priority,
  );
}

export function spawnFlash(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  size: number,
  color: string,
  alpha: number,
  life: number,
  priority: SpawnPriority,
): void {
  if (!ctx.canSpawn(priority)) return;
  const [r, g, b] = parseColor(color);
  ctx.primitives.spawnFlash(pos.x, pos.y, size, r, g, b, alpha, life);
}

export function burstSparks(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  count: number,
  color: string,
  priority: SpawnPriority = 'SECONDARY',
): void {
  const [r, g, b] = parseColor(color);
  for (let i = 0; i < count; i++) {
    if (!ctx.canSpawn(priority)) break;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 80 + Math.random() * 120;
    ctx.particles.push(
      makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: Math.cos(angle) * speed,
        velY: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3,
        size: 2 + Math.random() * 3,
        rot: angle,
        angVel: 0,
        drag: 0.95,
        gravity: 0,
        shapeId: ShapeId.STREAK,
        r,
        g,
        b,
        peakAlpha: 1,
        additive: true,
      }),
    );
  }
}
