export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface GlowDiscOptions {
  startAngle?: number;
  endAngle?: number;
  wedge?: boolean;
  alphaBoost?: number;
  glowScale?: number;
  alphaScale?: number;
}

export interface RimArcOptions {
  startAngle?: number;
  endAngle?: number;
  wedge?: boolean;
  fastSpin?: boolean;
  alphaScale?: number;
}

const CAST_RING_DURATION_MS = 160;
const GLOW_SCALE = 1.07;

/** How long a live zone ring takes to drop from full strength to its residual outline. */
export const ZONE_RING_FADE_MS = 400;
/**
 * Floor the ring fade above zero: once the archetype VFX goes sparse the hazard
 * boundary still has to read, so keep a faint outline that can be dialed here.
 */
export const ZONE_RING_RESIDUAL = 0.15;

const zoneFirstSeenMs = new WeakMap<object, number>();

function rgba(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function mixTowardWhite(rgb: Rgb, t: number): Rgb {
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * t),
    g: Math.round(rgb.g + (255 - rgb.g) * t),
    b: Math.round(rgb.b + (255 - rgb.b) * t),
  };
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return {
    r: parseInt(full.substring(0, 2), 16),
    g: parseInt(full.substring(2, 4), 16),
    b: parseInt(full.substring(4, 6), 16),
  };
}

export function rgbToHex(rgb: Rgb): string {
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/** Milliseconds since this zone/overlay was first drawn, registering it on first sight. */
export function getZoneAgeMs(key: object, nowMs: number): number {
  let firstSeen = zoneFirstSeenMs.get(key);
  if (firstSeen === undefined) {
    firstSeen = nowMs;
    zoneFirstSeenMs.set(key, firstSeen);
  }
  return nowMs - firstSeen;
}

/** Ramps a landed zone's telegraph ring from full strength down to the residual outline. */
export function computeZoneRingFade(ageMs: number): number {
  if (ageMs <= 0) return 1;
  if (ageMs >= ZONE_RING_FADE_MS) return ZONE_RING_RESIDUAL;
  const t = ageMs / ZONE_RING_FADE_MS;
  return 1 - (1 - ZONE_RING_RESIDUAL) * t;
}

function beginDiscPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
  wedge: boolean,
): void {
  ctx.beginPath();
  if (wedge) {
    ctx.moveTo(x, y);
    ctx.arc(x, y, outerR, startAngle, endAngle);
    ctx.closePath();
  } else {
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
  }
}

/** Radial disc: dim center, hot rim on gameplay radius, soft falloff past the edge. */
export function drawGlowDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: Rgb,
  options: GlowDiscOptions = {},
): void {
  const {
    startAngle = 0,
    endAngle = Math.PI * 2,
    wedge = false,
    alphaBoost = 0,
    glowScale = GLOW_SCALE,
    alphaScale = 1,
  } = options;

  const outerR = radius * glowScale;
  const rimT = radius / outerR;
  const shoulderT = rimT * 0.97;
  const hot = mixTowardWhite(rgb, 0.1);
  const a = Math.max(0, alphaScale);

  const grad = ctx.createRadialGradient(x, y, 0, x, y, outerR);
  grad.addColorStop(0, rgba(rgb, (0.05 + alphaBoost) * a));
  grad.addColorStop(0.45, rgba(rgb, (0.03 + alphaBoost * 0.5) * a));
  grad.addColorStop(shoulderT, rgba(rgb, (0.12 + alphaBoost * 0.3) * a));
  grad.addColorStop(rimT, rgba(hot, 0.4 * a));
  grad.addColorStop(1, rgba(rgb, 0));

  ctx.fillStyle = grad;
  beginDiscPath(ctx, x, y, outerR, startAngle, endAngle, wedge);
  ctx.fill();
}

/** Rotating bright arc on the rim — replaces marching dashes. */
export function drawRimArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: Rgb,
  now: number,
  options: RimArcOptions = {},
): void {
  const {
    startAngle = 0,
    endAngle = Math.PI * 2,
    wedge = false,
    fastSpin = false,
    alphaScale = 1,
  } = options;

  const arcSpan = (40 * Math.PI) / 180;
  const rotSpeed = fastSpin ? 2.5 : 0.8;
  const spinAngle = now * rotSpeed;

  let arcStart = spinAngle;
  let arcEnd = spinAngle + arcSpan;

  if (wedge) {
    const span = endAngle - startAngle;
    const localStart = startAngle + ((spinAngle % span) + span) % span;
    arcStart = localStart;
    arcEnd = Math.min(localStart + arcSpan, endAngle);
    if (arcEnd <= arcStart) return;
  }

  ctx.save();
  ctx.strokeStyle = rgba(rgb, 0.22 * Math.max(0, alphaScale));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, arcStart, arcEnd);
  ctx.stroke();
  ctx.restore();
}

/** Expanding cast ring that fades over ~160ms. */
export function drawCastRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: Rgb,
  ageMs: number,
): void {
  if (ageMs >= CAST_RING_DURATION_MS) return;

  const t = ageMs / CAST_RING_DURATION_MS;
  const ringR = radius * (0.85 + 0.3 * t);
  const alpha = (1 - t) * 0.35;
  const hot = mixTowardWhite(rgb, 0.7);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(hot, alpha);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Record first-seen time per zone/overlay and draw the cast flash. */
export function drawTrackedCastRing(
  ctx: CanvasRenderingContext2D,
  key: object,
  x: number,
  y: number,
  radius: number,
  rgb: Rgb,
  nowMs: number,
): void {
  drawCastRing(ctx, x, y, radius, rgb, getZoneAgeMs(key, nowMs));
}

/** Thin solid strokes along wedge radial edges. */
export function drawWedgeEdges(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: Rgb,
  startAngle: number,
  endAngle: number,
): void {
  ctx.strokeStyle = rgba(rgb, 0.75);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(startAngle) * radius, y + Math.sin(startAngle) * radius);
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(endAngle) * radius, y + Math.sin(endAngle) * radius);
  ctx.stroke();
}

/** Short solid ticks on the gameplay-radius rim. */
export function drawRimTicks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: Rgb,
  now: number,
  tickCount = 8,
): void {
  const rotation = (now / 2000) * Math.PI * 2;
  ctx.strokeStyle = rgba(rgb, 0.25);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < tickCount; i++) {
    const angle = rotation + (i / tickCount) * Math.PI * 2;
    const inner = radius - 10;
    const outer = radius + 6;
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
  }
  ctx.stroke();
}
