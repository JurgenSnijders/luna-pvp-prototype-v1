import { useCheapCanvasEffects } from '../cheapCanvasEffects';
import { hexToRgb, rgbToHex, type Rgb } from './glowDisc';

export const DEPLOYABLE_SPAWN_SNAP_MS = 120;
export const DEPLOYABLE_HIT_FLASH_MS = 100;
export const DEPLOYABLE_EXPIRY_FADE_MS = 500;

const SPAWN_OVERSCALE = 0.08;
const BODY_SHADE: Rgb = { r: 0x14, g: 0x19, b: 0x26 };
const INNER_INSET = 3;
const RIM_WIDTH = 2;
const RIM_GLOW_BLUR = 8;
const HIT_TICK_HALF_LEN = 7;
const HIT_TICK_HALF_ARC = 0.35;

export type DeployableBoxShape = { kind: 'BOX'; halfW: number; halfH: number; angle: number };
export type DeployableCircleShape = { kind: 'CIRCLE'; radius: number };
export type DeployableShape = DeployableBoxShape | DeployableCircleShape;

export interface DeployableFrameOptions {
  x: number;
  y: number;
  shape: DeployableShape;
  /** Ownership color (telegraph intent). Only the rim carries team. */
  rim: Rgb;
  /** Muted archetype fill, see `muteDeployableBody`. */
  body: string;
  /** 1 on the hit frame, decaying to 0. */
  hitFlash: number;
  /** 0 on the spawn frame, reaching 1 once the snap settles. */
  spawnT: number;
  /** Alpha multiplier for the expiry fade. */
  fade: number;
  /** World-space point of the last hit, for the struck-face tick. */
  hitX?: number;
  hitY?: number;
}

const bodyCache = new Map<string, string>();

/** Archetype color pulled toward the arena shade so the body never outshouts projectiles. */
export function muteDeployableBody(hex: string, shade = 0.7): string {
  const key = `${hex}|${shade}`;
  let cached = bodyCache.get(key);
  if (cached === undefined) {
    const c = hexToRgb(hex);
    cached = rgbToHex({
      r: c.r + (BODY_SHADE.r - c.r) * shade,
      g: c.g + (BODY_SHADE.g - c.g) * shade,
      b: c.b + (BODY_SHADE.b - c.b) * shade,
    });
    bodyCache.set(key, cached);
  }
  return cached;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function computeSpawnT(spawnedAtMs: number, nowMs: number): number {
  return clamp01((nowMs - spawnedAtMs) / DEPLOYABLE_SPAWN_SNAP_MS);
}

export function computeHitFlash(lastHitAtMs: number, nowMs: number): number {
  if (lastHitAtMs <= 0) return 0;
  return clamp01(1 - (nowMs - lastHitAtMs) / DEPLOYABLE_HIT_FLASH_MS);
}

/** Permanent deployables (`totalMs <= 0`) never fade. */
export function computeExpiryFade(remainingMs: number, totalMs: number): number {
  if (totalMs <= 0) return 1;
  return clamp01(remainingMs / DEPLOYABLE_EXPIRY_FADE_MS);
}

function rgbaMixWhite(rgb: Rgb, t: number, alpha: number): string {
  const r = Math.round(rgb.r + (255 - rgb.r) * t);
  const g = Math.round(rgb.g + (255 - rgb.g) * t);
  const b = Math.round(rgb.b + (255 - rgb.b) * t);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function traceShape(ctx: CanvasRenderingContext2D, shape: DeployableShape, inset: number): void {
  ctx.beginPath();
  if (shape.kind === 'CIRCLE') {
    ctx.arc(0, 0, Math.max(0, shape.radius - inset), 0, Math.PI * 2);
  } else {
    const w = Math.max(0, shape.halfW - inset);
    const h = Math.max(0, shape.halfH - inset);
    ctx.rect(-w, -h, w * 2, h * 2);
  }
}

function drawHitTick(
  ctx: CanvasRenderingContext2D,
  shape: DeployableShape,
  lx: number,
  ly: number,
): void {
  ctx.beginPath();
  if (shape.kind === 'CIRCLE') {
    const a = Math.atan2(ly, lx);
    ctx.arc(0, 0, shape.radius, a - HIT_TICK_HALF_ARC, a + HIT_TICK_HALF_ARC);
  } else {
    const { halfW, halfH } = shape;
    const onVerticalFace = halfW - Math.abs(lx) < halfH - Math.abs(ly);
    if (onVerticalFace) {
      const x = lx < 0 ? -halfW : halfW;
      const y = Math.max(-halfH, Math.min(halfH, ly));
      ctx.moveTo(x, Math.max(-halfH, y - HIT_TICK_HALF_LEN));
      ctx.lineTo(x, Math.min(halfH, y + HIT_TICK_HALF_LEN));
    } else {
      const y = ly < 0 ? -halfH : halfH;
      const x = Math.max(-halfW, Math.min(halfW, lx));
      ctx.moveTo(Math.max(-halfW, x - HIT_TICK_HALF_LEN), y);
      ctx.lineTo(Math.min(halfW, x + HIT_TICK_HALF_LEN), y);
    }
  }
  ctx.stroke();
}

/**
 * One deployable silhouette: muted archetype body, crisp intent rim on the exact
 * collision edge, spawn snap, hit flash and expiry fade. The drawn edge is the hitbox.
 */
export function drawDeployableFrame(
  ctx: CanvasRenderingContext2D,
  opts: DeployableFrameOptions,
): void {
  if (opts.fade <= 0) return;
  const { shape, rim, hitFlash } = opts;
  const snap = 1 - opts.spawnT;
  const scale = 1 + SPAWN_OVERSCALE * snap * snap;
  const angle = shape.kind === 'BOX' ? shape.angle : 0;

  ctx.save();
  ctx.globalAlpha *= opts.fade;
  ctx.translate(opts.x, opts.y);
  if (angle !== 0) ctx.rotate(angle);
  if (scale !== 1) ctx.scale(scale, scale);

  traceShape(ctx, shape, 0);
  ctx.fillStyle = opts.body;
  ctx.fill();

  traceShape(ctx, shape, INNER_INSET);
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + hitFlash * 0.5})`;
  ctx.stroke();

  const rimWhite = Math.max(hitFlash * 0.85, snap * 0.6);
  const cheap = useCheapCanvasEffects();
  if (!cheap) {
    ctx.shadowBlur = RIM_GLOW_BLUR * (1 + snap + hitFlash);
    ctx.shadowColor = rgbaMixWhite(rim, rimWhite, 0.7);
  }
  traceShape(ctx, shape, 0);
  ctx.lineWidth = RIM_WIDTH;
  ctx.strokeStyle = rgbaMixWhite(rim, rimWhite, 1);
  ctx.stroke();
  if (!cheap) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  if (hitFlash > 0 && opts.hitX !== undefined && opts.hitY !== undefined) {
    const dx = opts.hitX - opts.x;
    const dy = opts.hitY - opts.y;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255, 255, 255, ${hitFlash})`;
    drawHitTick(ctx, shape, dx * cos - dy * sin, dx * sin + dy * cos);
  }

  ctx.restore();
}
