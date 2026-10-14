import type { Vector2D } from '../../../math/Vector2D';
import { ShapeId } from '../../gl/shaders';
import type { PrimitiveLayer } from '../../PrimitiveLayer';
import { parseColor, type SpawnPriority } from '../ParticleBackend';
import { makeParticle } from './particleSim';
import type { SimParticle } from './types';
import {
  FLASH_INTENSITY,
  RING_INTENSITY,
  SPARK_INTENSITY,
  STREAK_INTENSITY,
} from '../../emissive';

export interface WebGLSpawnCtx {
  particles: SimParticle[];
  primitives: PrimitiveLayer;
  spawnParticle: (p: SimParticle, priority: SpawnPriority) => void;
  canSpawn: (priority: SpawnPriority) => boolean;
  emissiveMul?: number;
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
  intensity = RING_INTENSITY,
): void {
  if (!ctx.canSpawn(priority)) return;
  const [r, g, b] = parseColor(color);
  const mul = ctx.emissiveMul ?? 1;
  ctx.primitives.spawnRing(
    pos.x,
    pos.y,
    radius,
    thickness,
    r,
    g,
    b,
    alpha,
    life,
    true,
    0,
    1,
    intensity * mul,
  );
}

const STREAK_CAP_R = 0.06;
const STREAK_HALF_LEN = 0.35;

function streakParams(): [number, number, number, number] {
  const capR = STREAK_CAP_R;
  const halfLen = Math.max(STREAK_HALF_LEN, capR * 2.5);
  return [capR, halfLen, 0, 0];
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
  intensity = STREAK_INTENSITY,
): void {
  const [r, g, b] = parseColor(color);
  const hot = intensity * (ctx.emissiveMul ?? 1);
  const rot = Math.atan2(vel.y, vel.x);
  if (length <= 4) {
    ctx.spawnParticle(
      makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: vel.x,
        velY: vel.y,
        life,
        size: length,
        rot: 0,
        angVel: 0,
        drag: 0.9,
        gravity: 0,
        shapeId: ShapeId.GLOW,
        r,
        g,
        b,
        peakAlpha: alpha,
        additive: true,
        intensity: hot,
      }),
      priority,
    );
    return;
  }
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
      params: streakParams(),
      intensity: hot,
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
  intensity = FLASH_INTENSITY,
): void {
  if (!ctx.canSpawn(priority)) return;
  const [r, g, b] = parseColor(color);
  ctx.primitives.spawnFlash(
    pos.x,
    pos.y,
    size,
    r,
    g,
    b,
    alpha,
    life,
    intensity * (ctx.emissiveMul ?? 1),
  );
}

export function burstSparks(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  count: number,
  color: string,
  priority: SpawnPriority = 'SECONDARY',
  intensity = SPARK_INTENSITY,
): void {
  const [r, g, b] = parseColor(color);
  const hot = intensity * (ctx.emissiveMul ?? 1);
  for (let i = 0; i < count; i++) {
    if (!ctx.canSpawn(priority)) break;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 80 + Math.random() * 120;
    const size = 2 + Math.random() * 3;
    const useGlow = size <= 4;
    ctx.particles.push(
      makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: Math.cos(angle) * speed,
        velY: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3,
        size,
        rot: useGlow ? 0 : angle,
        angVel: 0,
        drag: 0.95,
        gravity: 0,
        shapeId: useGlow ? ShapeId.GLOW : ShapeId.STREAK,
        r,
        g,
        b,
        peakAlpha: 1,
        additive: true,
        intensity: hot,
        params: useGlow ? [0, 0, 0, 0] : streakParams(),
      }),
    );
  }
}
