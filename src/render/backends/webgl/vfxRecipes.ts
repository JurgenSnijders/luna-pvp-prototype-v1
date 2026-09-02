import { isInsideHex } from '../../../math/HexMath';
import { Vector2D } from '../../../math/Vector2D';
import type { ImpactVfx } from '../../../types/schema';
import { ShapeId } from '../../gl/shaders';
import { parseColor } from '../ParticleBackend';
import { makeParticle } from './particleSim';
import {
  burstSparks,
  spawnFlash,
  spawnRing,
  spawnStreak,
  type WebGLSpawnCtx,
} from './spawnPrimitives';

export function triggerMuzzleFlash(ctx: WebGLSpawnCtx, pos: Vector2D, dir: Vector2D, color: string): void {
  const heading = dir.magSq() > 0 ? dir.normalize() : Vector2D.fromAngle(0);
  const baseAngle = Math.atan2(heading.y, heading.x);
  const flashPos = pos.add(heading.scale(10));
  spawnFlash(ctx, flashPos, 28, color, 0.9, 0.12, 'CORE');
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const cone = -0.55 + t * 1.1;
    const speed = 90 + Math.random() * 140;
    spawnStreak(
      ctx,
      flashPos,
      Vector2D.fromAngle(baseAngle + cone, speed),
      12 + Math.random() * 8,
      color,
      0.85,
      0.18 + Math.random() * 0.15,
      'PRIMARY',
    );
  }
}

export function triggerImpactBurst(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  color: string,
  secondaryColor: string,
  vfxType: ImpactVfx,
  scale = 1,
): void {
  switch (vfxType) {
    case 'SHOCKWAVE':
      spawnRing(ctx, pos, 50 * scale, 3, color, 0.85, 0.45, 'CORE');
      break;
    case 'ICE_BURST':
      spawnRing(ctx, pos, 55 * scale, 2.5, secondaryColor, 0.9, 0.4, 'CORE');
      spawnFlash(ctx, pos, 40 * scale, secondaryColor, 0.7, 0.2, 'CORE');
      burstSparks(ctx, pos, 10, color, 'PRIMARY');
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        spawnStreak(ctx, pos, Vector2D.fromAngle(a, 100), 14, secondaryColor, 0.8, 0.35, 'SECONDARY');
      }
      break;
    case 'MINI_NUKE':
      spawnRing(ctx, pos, 50 * scale, 4, color, 0.95, 0.5, 'CORE');
      spawnRing(ctx, pos, 90 * scale, 2, color, 0.6, 0.65, 'CORE');
      spawnFlash(ctx, pos, 55 * scale, secondaryColor, 0.85, 0.25, 'CORE');
      burstSparks(ctx, pos, 14, color, 'PRIMARY');
      burstSparks(ctx, pos, 6, secondaryColor, 'SECONDARY');
      break;
    case 'VORTEX_SWIRL': {
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12;
        const radial = Vector2D.fromAngle(angle, 40);
        const tangent = new Vector2D(-radial.y, radial.x).normalize().scale(90);
        spawnStreak(
          ctx,
          pos.add(radial.scale(0.3)),
          tangent.add(radial.scale(-0.4)),
          10,
          color,
          0.75,
          0.45,
          'PRIMARY',
        );
      }
      break;
    }
    case 'PLASMA_BLOOM':
      spawnFlash(ctx, pos, 45 * scale, color, 0.9, 0.3, 'CORE');
      spawnRing(ctx, pos, 35 * scale, 5, secondaryColor, 0.7, 0.35, 'PRIMARY');
      burstSparks(ctx, pos, 12, color, 'SECONDARY');
      break;
    case 'SHATTER':
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.2;
        spawnStreak(ctx, pos, Vector2D.fromAngle(a, 120 + Math.random() * 80), 16, color, 0.9, 0.4, 'PRIMARY');
      }
      break;
    case 'IMPLOSION':
      spawnRing(ctx, pos, 60 * scale, 2, color, 0.8, 0.5, 'CORE');
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        spawnStreak(ctx, pos, Vector2D.fromAngle(a, -80), 12, secondaryColor, 0.7, 0.35, 'PRIMARY');
      }
      break;
    case 'LIGHTNING_FORK':
      for (let i = 0; i < 5; i++) {
        const a = -0.8 + Math.random() * 1.6;
        spawnStreak(ctx, pos, Vector2D.fromAngle(a, 150), 20, secondaryColor, 0.95, 0.15, 'CORE');
      }
      spawnFlash(ctx, pos, 30 * scale, color, 0.8, 0.1, 'CORE');
      break;
    case 'RUNE_FLASH':
      spawnFlash(ctx, pos, 50 * scale, secondaryColor, 0.85, 0.35, 'CORE');
      spawnRing(ctx, pos, 40 * scale, 1.5, color, 0.75, 0.4, 'PRIMARY');
      break;
    case 'SPARKS':
    default:
      burstSparks(ctx, pos, 10, color, 'PRIMARY');
      break;
  }
}

export function trail(ctx: WebGLSpawnCtx, pos: Vector2D, color: string, trailKind: string): void {
  const [r, g, b] = parseColor(color);
  if (trailKind === 'SMOKE') {
    ctx.spawnParticle(
      makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: (Math.random() - 0.5) * 20,
        velY: (Math.random() - 0.5) * 20,
        life: 0.7,
        size: 8 + Math.random() * 4,
        rot: 0,
        angVel: 0,
        drag: 0.98,
        gravity: -5,
        shapeId: ShapeId.SMOKE,
        r,
        g,
        b,
        peakAlpha: 0.5,
        additive: false,
      }),
      'SECONDARY',
    );
    return;
  }
  if (trailKind === 'ICE_GLOW' || trailKind === 'FROST_CRYSTALS') {
    const a = Math.random() * Math.PI * 2;
    ctx.spawnParticle(
      makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: Math.cos(a) * 15,
        velY: Math.sin(a) * 15,
        life: 0.5,
        size: 5,
        rot: a,
        angVel: 2,
        drag: 0.99,
        gravity: 0,
        shapeId: ShapeId.SHARD,
        r,
        g,
        b,
        peakAlpha: 0.8,
        additive: true,
      }),
      'SECONDARY',
    );
    return;
  }
  if (trailKind === 'MAGMA_SPARKS' || trailKind === 'EMBER_SPIRAL') {
    ember(ctx, pos);
    return;
  }
  if (trailKind === 'NEON_RIBBON' || trailKind === 'VOID_TENDRIL' || trailKind === 'PLASMA_ARC') {
    neonRibbon(ctx, pos, color);
    return;
  }
  if (trailKind === 'DUST_PUFF') {
    ctx.spawnParticle(
      makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: (Math.random() - 0.5) * 8,
        velY: (Math.random() - 0.5) * 8,
        life: 0.9,
        size: 10,
        rot: 0,
        angVel: 0,
        drag: 0.99,
        gravity: -2,
        shapeId: ShapeId.SMOKE,
        r,
        g,
        b,
        peakAlpha: 0.35,
        additive: false,
      }),
      'SECONDARY',
    );
    return;
  }
  ctx.spawnParticle(
    makeParticle({
      posX: pos.x,
      posY: pos.y,
      velX: (Math.random() - 0.5) * 10,
      velY: (Math.random() - 0.5) * 10,
      life: 0.4,
      size: 3,
      rot: 0,
      angVel: 0,
      drag: 0.95,
      gravity: 0,
      shapeId: ShapeId.DISC,
      r,
      g,
      b,
      peakAlpha: 0.7,
      additive: false,
    }),
    'SECONDARY',
  );
}

export function neonRibbon(ctx: WebGLSpawnCtx, pos: Vector2D, color: string): void {
  const [r, g, b] = parseColor(color);
  ctx.spawnParticle(
    makeParticle({
      posX: pos.x,
      posY: pos.y,
      velX: (Math.random() - 0.5) * 6,
      velY: (Math.random() - 0.5) * 6,
      life: 0.55,
      size: 9,
      rot: 0,
      angVel: 0,
      drag: 0.96,
      gravity: 0,
      shapeId: ShapeId.GLOW,
      r,
      g,
      b,
      peakAlpha: 0.95,
      additive: true,
    }),
    'SECONDARY',
  );
}

export function ember(ctx: WebGLSpawnCtx, pos: Vector2D): void {
  const colors = ['#ff5500', '#ffaa00'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const [r, g, b] = parseColor(color);
  ctx.spawnParticle(
    makeParticle({
      posX: pos.x,
      posY: pos.y,
      velX: (Math.random() - 0.5) * 30,
      velY: -10 - Math.random() * 20,
      life: 0.5,
      size: 3,
      rot: 0,
      angVel: 0,
      drag: 0.96,
      gravity: -15,
      shapeId: ShapeId.GLOW,
      r,
      g,
      b,
      peakAlpha: 0.9,
      additive: true,
    }),
    'AMBIENT',
  );
}

export function spawnAmbientEmber(
  ctx: WebGLSpawnCtx,
  bounds: { minX: number; minY: number; width: number; height: number },
  safeCenter: Vector2D,
  safeRadius: number,
): void {
  for (let attempt = 0; attempt < 6; attempt++) {
    const x = bounds.minX + Math.random() * bounds.width;
    const y = bounds.minY + Math.random() * bounds.height;
    const pos = new Vector2D(x, y);
    if (isInsideHex(pos, safeCenter, safeRadius)) continue;
    ember(ctx, pos);
    return;
  }
}

export function expandingRing(ctx: WebGLSpawnCtx, pos: Vector2D, radius: number, color: string): void {
  spawnRing(ctx, pos, radius, 3, color, 0.8, 0.5, 'CORE');
}

export function spawnDirectionalImpactRing(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  normal: Vector2D,
  color: string,
): void {
  const heading = normal.magSq() > 0 ? normal.normalize() : Vector2D.fromAngle(0);
  const rot = Math.atan2(heading.y, heading.x);
  const [r, g, b] = parseColor(color);
  ctx.primitives.spawnDirectionalRing(pos.x, pos.y, 45, 3, rot, r, g, b, 0.85, 0.4);
}

export function zoneVortexTick(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  radius: number,
  color: string,
): void {
  const count = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius * (0.85 + Math.random() * 0.1)));
    const inward = pos.sub(edge).normalize().scale(60 + Math.random() * 40);
    spawnStreak(ctx, edge, inward, 10 + Math.random() * 6, color, 0.7, 0.35, 'SECONDARY');
  }
}

export function zoneHazardPulse(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  radius: number,
  color: string,
): void {
  spawnRing(ctx, pos, radius * 0.9, 2, color, 0.55, 0.4, 'SECONDARY');
  const [r, g, b] = parseColor(color);
  ctx.spawnParticle(
    makeParticle({
      posX: pos.x,
      posY: pos.y,
      velX: 0,
      velY: 0,
      life: 0.45,
      size: radius * 1.8,
      rot: 0,
      angVel: 0,
      drag: 1,
      gravity: 0,
      shapeId: ShapeId.ANNULUS,
      r,
      g,
      b,
      peakAlpha: 0.35,
      additive: true,
    }),
    'SECONDARY',
  );
}

export function statusFrostOrbit(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  radius: number,
): void {
  const count = 1 + Math.floor(Math.random() * 2);
  const color = '#00e5ff';
  const [r, g, b] = parseColor(color);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius * (0.9 + Math.random() * 0.15)));
    const tangent = new Vector2D(-Math.sin(angle), Math.cos(angle));
    const speed = 80 + Math.random() * 40;
    const vel = tangent.scale(speed);
    ctx.spawnParticle(
      makeParticle({
        posX: edge.x,
        posY: edge.y,
        velX: vel.x,
        velY: vel.y,
        life: 0.35,
        size: 3 + Math.random() * 2,
        rot: angle,
        angVel: 4,
        drag: 0.96,
        gravity: 0,
        shapeId: ShapeId.SHARD,
        r,
        g,
        b,
        peakAlpha: 0.85,
        additive: true,
      }),
      'SECONDARY',
    );
  }
}

export function statusThermalSparks(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  radius: number,
  intensity: number,
): void {
  const maxSpawns = Math.min(3, Math.ceil(intensity * 3));
  for (let i = 0; i < maxSpawns; i++) {
    if (Math.random() > intensity) continue;
    const color = Math.random() > 0.5 ? '#ff4400' : '#ffaa00';
    const [r, g, b] = parseColor(color);
    const angle = Math.random() * Math.PI * 2;
    const spawn = pos.add(Vector2D.fromAngle(angle, radius * 0.3 * Math.random()));
    ctx.spawnParticle(
      makeParticle({
        posX: spawn.x,
        posY: spawn.y,
        velX: (Math.random() - 0.5) * 20,
        velY: -20 - Math.random() * 30,
        life: 0.4,
        size: 2 + Math.random() * 2,
        rot: 0,
        angVel: 0,
        drag: 0.97,
        gravity: -8,
        shapeId: ShapeId.GLOW,
        r,
        g,
        b,
        peakAlpha: 0.9,
        additive: true,
      }),
      'SECONDARY',
    );
  }
}

export function statusVoidCollapse(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  radius: number,
): void {
  const count = 1 + Math.floor(Math.random() * 2);
  const color = '#bf00ff';
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius * 1.5));
    const inward = pos.sub(edge).normalize().scale(70 + Math.random() * 30);
    spawnStreak(ctx, edge, inward, 8 + Math.random() * 4, color, 0.75, 0.3, 'SECONDARY');
  }
}

export function statusKineticSlipstream(
  ctx: WebGLSpawnCtx,
  pos: Vector2D,
  velocity: Vector2D,
): void {
  if (velocity.magSq() <= 50 * 50) return;
  const back = velocity.normalize().scale(-1);
  const slipPos = pos.add(back.scale(8));
  const slipVel = back.scale(velocity.mag() * 0.15);
  spawnStreak(ctx, slipPos, slipVel, 12, '#e0f8ff', 0.7, 0.2, 'SECONDARY');
}
