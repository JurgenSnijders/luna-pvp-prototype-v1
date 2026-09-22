import type { PhysicsWorld, ParryShieldOverlay } from '../../engine/PhysicsWorld';
import { parryShieldShowsStamina } from '../../engine/PhysicsWorld';
import type { Obstacle } from '../../entities/Obstacle';
import type { SpatialZone } from '../../entities/SpatialZone';
import type { Entity } from '../../entities/Entity';
import type { FieldType } from '../../types/schema';
import { TELEGRAPH_COLORS, healthBarColor } from './colors';
import {
  computeZoneRingFade,
  drawGlowDisc,
  drawRimArc,
  drawTrackedCastRing,
  drawWedgeEdges,
  getZoneAgeMs,
} from './glowDisc';
import type { CanvasRenderCtx } from './renderCtx';
import { resolveParryIntent, resolveZoneIntent } from './telegraphIntent';

export interface TimerBarOptions {
  ctx: CanvasRenderingContext2D;
  centerX: number;
  topY: number;
  width: number;
  height?: number;
  ratio: number;
  color?: string;
  urgencyThreshold?: number;
  remainingMs?: number;
  nowMs?: number;
}

export function drawHorizontalTimerBar({
  ctx,
  centerX,
  topY,
  width,
  height = 2.5,
  ratio,
  color = '#00e5ff',
  urgencyThreshold = 0.2,
  remainingMs,
  nowMs = performance.now(),
}: TimerBarOptions): void {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const leftX = centerX - width / 2;

  ctx.fillStyle = 'rgba(4, 6, 12, 0.85)';
  ctx.fillRect(leftX - 1, topY - 1, width + 2, height + 2);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(leftX - 1, topY - 1, width + 2, height + 2);

  if (clampedRatio <= 0) return;

  const isUrgent =
    clampedRatio <= urgencyThreshold ||
    (remainingMs !== undefined && remainingMs < 400);
  let barColor = color;
  let alpha = 0.95;

  if (isUrgent) {
    const pulse = Math.sin(nowMs * 0.03) > 0;
    barColor = pulse ? '#ff3366' : '#ffaa00';
    alpha = pulse ? 1.0 : 0.6;
  }

  ctx.fillStyle = barColor;
  ctx.globalAlpha = alpha;
  ctx.fillRect(leftX, topY, width * clampedRatio, height);
  ctx.globalAlpha = 1.0;
}

function fieldAccentRgb(fieldType: FieldType): { r: number; g: number; b: number } {
  switch (fieldType) {
    case 'RADIAL_IMPULSE':
      return { r: 255, g: 120, b: 80 };
    case 'FRICTION_OVERRIDE':
      return { r: 68, g: 170, b: 255 };
    case 'VORTEX_TANGENT':
      return { r: 170, g: 100, b: 255 };
    case 'MASS_ATTRACTOR':
      return { r: 120, g: 140, b: 255 };
    default:
      return { r: 200, g: 200, b: 220 };
  }
}

function drawHologramFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: { r: number; g: number; b: number },
  startAngle = 0,
  endAngle = Math.PI * 2,
  wedge = false,
  alphaBoost = 0,
  alphaScale = 1,
): void {
  drawGlowDisc(ctx, x, y, radius, rgb, {
    startAngle,
    endAngle,
    wedge,
    alphaBoost,
    alphaScale,
  });
}

function drawInnerReticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rot: number,
  rgb: { r: number; g: number; b: number },
  startAngle = 0,
  endAngle = Math.PI * 2,
  wedge = false,
): void {
  const innerR = radius * 0.4;
  const tickLen = radius * 0.08;
  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
  ctx.lineWidth = 1.5;

  const span = endAngle - startAngle;
  const tickCount = wedge ? 3 : 4;
  for (let i = 0; i < tickCount; i++) {
    const angle = wedge
      ? startAngle + (span * i) / Math.max(1, tickCount - 1)
      : (Math.PI / 2) * i;
    const cx = x + Math.cos(angle) * innerR;
    const cy = y + Math.sin(angle) * innerR;
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    ctx.beginPath();
    ctx.moveTo(cx - perpX * tickLen, cy - perpY * tickLen);
    ctx.lineTo(cx + perpX * tickLen, cy + perpY * tickLen);
    ctx.moveTo(cx + Math.cos(angle) * tickLen, cy + Math.sin(angle) * tickLen);
    ctx.lineTo(cx + Math.cos(angle) * tickLen * 2.2, cy + Math.sin(angle) * tickLen * 2.2);
    ctx.stroke();
  }

  const ringR = radius * 0.55;
  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, ringR, startAngle, endAngle);
  ctx.stroke();

  const marks = wedge ? 6 : 12;
  for (let i = 0; i < marks; i++) {
    const t = i / marks;
    const angle = wedge ? startAngle + span * t : rot + (Math.PI * 2 * i) / 12;
    if (wedge && (t <= 0 || t >= 1)) continue;
    const ix = x + Math.cos(angle) * ringR;
    const iy = y + Math.sin(angle) * ringR;
    const ox = x + Math.cos(angle) * (ringR + radius * 0.04);
    const oy = y + Math.sin(angle) * (ringR + radius * 0.04);
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ox, oy);
    ctx.stroke();
  }
}

function drawOuterPerimeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  now: number,
  rgb: { r: number; g: number; b: number },
  fieldType: FieldType,
  startAngle = 0,
  endAngle = Math.PI * 2,
  wedge = false,
  alphaScale = 1,
): void {
  const fastSpin = fieldType === 'VORTEX_TANGENT';
  drawRimArc(ctx, x, y, radius, rgb, now, {
    startAngle,
    endAngle,
    wedge,
    fastSpin,
    alphaScale,
  });
  if (wedge) {
    drawWedgeEdges(ctx, x, y, radius, rgb, startAngle, endAngle);
  }
}

function drawSingularityCore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  rgb: { r: number; g: number; b: number },
): void {
  const coreR = 8 + Math.sin(now * 6) * 2;
  ctx.beginPath();
  ctx.arc(x, y, coreR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5, 5, 15, 0.9)';
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.95)`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Alpha multiplier for the zone hologram tail — full strength until the final fade window. */
function computeZoneExpiryFade(remainingMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const fadeWindowMs = Math.max(40, Math.min(400, durationMs * 0.2));
  if (remainingMs >= fadeWindowMs) return 1;
  return Math.max(0, remainingMs / fadeWindowMs);
}

function drawZoneHologram(
  ctx: CanvasRenderingContext2D,
  zone: SpatialZone,
  localEntity: Entity | null,
  now: number,
  nowMs: number,
): void {
  const { pos, config } = zone;
  const radius = config.radius;
  const intent = resolveZoneIntent(zone, localEntity);
  const intentRgb = TELEGRAPH_COLORS[intent];
  const singularityAccent = fieldAccentRgb(config.fieldType);
  const rot = now * (config.fieldType === 'FRICTION_OVERRIDE' ? 0.25 : 0.5);
  const wedge = zone.isPartialArc();
  const facing = zone.getArcFacingRad();
  const half = (((config.arcDeg ?? 360) * Math.PI) / 180) / 2;
  const startAngle = wedge ? facing - half : 0;
  const endAngle = wedge ? facing + half : Math.PI * 2;
  const expiryFade = computeZoneExpiryFade(zone.remainingDurationMs, config.durationMs);
  const landedFade = computeZoneRingFade(getZoneAgeMs(zone, nowMs));

  ctx.save();
  ctx.globalAlpha = expiryFade;

  drawHologramFill(
    ctx,
    pos.x,
    pos.y,
    radius,
    intentRgb,
    startAngle,
    endAngle,
    wedge,
    0,
    landedFade,
  );
  drawInnerReticle(ctx, pos.x, pos.y, radius, rot, intentRgb, startAngle, endAngle, wedge);
  drawOuterPerimeter(
    ctx,
    pos.x,
    pos.y,
    radius,
    now,
    intentRgb,
    config.fieldType,
    startAngle,
    endAngle,
    wedge,
    landedFade,
  );

  if (config.fieldType === 'MASS_ATTRACTOR' || config.fieldType === 'VORTEX_TANGENT') {
    drawSingularityCore(ctx, pos.x, pos.y, now, singularityAccent);
  }

  ctx.restore();
}

export function drawZones(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  world: PhysicsWorld,
): void {
  const nowMs = performance.now();
  const now = nowMs * 0.001;
  const localEntity = state.localEntity;
  for (const zone of world.zones) {
    if (zone.isDead) continue;
    drawZoneHologram(ctx, zone, localEntity, now, nowMs);
  }
  drawParryShieldOverlays(ctx, world, now, localEntity);
}

function drawParryShieldHologram(
  ctx: CanvasRenderingContext2D,
  overlay: ParryShieldOverlay,
  localEntity: Entity | null,
  facingRad: number,
  now: number,
  remainingMs = 0,
  showStamina = false,
  nowMs = performance.now(),
): void {
  const { pos, radius, arcDeg } = overlay;
  const intentRgb = TELEGRAPH_COLORS[resolveParryIntent(overlay, localEntity)];
  const wedge = arcDeg !== undefined && arcDeg < 360;
  const half = (((arcDeg ?? 360) * Math.PI) / 180) / 2;
  const startAngle = wedge ? facingRad - half : 0;
  const endAngle = wedge ? facingRad + half : Math.PI * 2;
  const rot = now * 0.5;
  const lowStaminaPulse =
    showStamina && remainingMs > 0 && remainingMs < 400
      ? 0.12 + 0.08 * Math.sin(now * 12)
      : 0;

  drawHologramFill(
    ctx,
    pos.x,
    pos.y,
    radius,
    intentRgb,
    startAngle,
    endAngle,
    wedge,
    lowStaminaPulse,
  );
  drawInnerReticle(ctx, pos.x, pos.y, radius, rot, intentRgb, startAngle, endAngle, wedge);
  drawOuterPerimeter(
    ctx,
    pos.x,
    pos.y,
    radius,
    now,
    intentRgb,
    'FRICTION_OVERRIDE',
    startAngle,
    endAngle,
    wedge,
  );
  drawTrackedCastRing(ctx, overlay, pos.x, pos.y, radius, intentRgb, nowMs);
}

export function drawParryShieldOverlays(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  now: number,
  localEntity: Entity | null,
): void {
  const nowMs = performance.now();
  for (const overlay of world.parryShieldOverlays) {
    if (overlay.remainingMs <= 0) continue;
    const facing = world.getParryShieldFacingRad(overlay);
    const showStamina = parryShieldShowsStamina(overlay);
    drawParryShieldHologram(
      ctx,
      overlay,
      localEntity,
      facing,
      now,
      overlay.remainingMs,
      showStamina,
      nowMs,
    );
  }
}

export function drawTerrainPatches(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
  const now = performance.now() * 0.001;

  for (const patch of world.terrainPatches) {
    const { pos, config } = patch;
    const r = config.radius;
    const edgePhase = (now + pos.x * 0.01) % 1;

    if (config.type === 'SAFE') {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(180, 255, 255, ${0.25 + edgePhase * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * (0.85 + edgePhase * 0.1), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const pulse = (Math.sin(now * 3) + 1) / 2;
      ctx.fillStyle = `rgba(255, 80, 20, ${0.22 + pulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 140, 60, ${0.2 + edgePhase * 0.4})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * (0.7 + edgePhase * 0.15), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca.r + (cb.r - ca.r) * t);
  const g = Math.round(ca.g + (cb.g - ca.g) * t);
  const bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function getObstacleTopY(obstacle: Obstacle): number {
  const { pos, config } = obstacle;
  if (config.shape === 'CIRCLE') return pos.y - config.width / 2;
  return pos.y - config.height / 2;
}

function drawObstacleOverheadBars(
  ctx: CanvasRenderingContext2D,
  obstacle: Obstacle,
  nowMs: number,
): void {
  const lifeRatio = obstacle.getLifeRatio();
  const obstacleTop = getObstacleTopY(obstacle);
  const barW = Math.max(32, obstacle.getCollisionRadius() * 1.2);
  const healthBarH = 3;
  const lifetimeBarH = 2.5;
  const gap = 2;
  let stackY = obstacleTop - 8;

  if (lifeRatio !== null) {
    stackY -= lifetimeBarH;
    drawHorizontalTimerBar({
      ctx,
      centerX: obstacle.pos.x,
      topY: stackY,
      width: barW,
      height: lifetimeBarH,
      ratio: lifeRatio,
      color: '#ffaa00',
      remainingMs: obstacle.remainingDurationMs,
      nowMs,
    });
  }

  if (obstacle.config.isDestructible) {
    stackY -= gap + healthBarH;
    const maxHealth = obstacle.config.maxHealth ?? 100;
    const healthRatio = Math.max(0, obstacle.health / maxHealth);
    drawHorizontalTimerBar({
      ctx,
      centerX: obstacle.pos.x,
      topY: stackY,
      width: barW,
      height: healthBarH,
      ratio: healthRatio,
      color: healthBarColor(healthRatio),
      urgencyThreshold: 0,
      nowMs,
    });
  }
}

function drawDestructibleMine(
  ctx: CanvasRenderingContext2D,
  obstacle: Obstacle,
  now: number,
): void {
  const { pos, config } = obstacle;
  const radius = config.width / 2;
  const rimColor = '#aa8844';
  const pulse = 0.25 + 0.2 * Math.sin(now * 8);

  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = `rgba(170, 136, 68, ${pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
  grad.addColorStop(0, '#141926');
  grad.addColorStop(0.7, '#1a2030');
  grad.addColorStop(1, rimColor);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  const maxHealth = config.maxHealth ?? 100;
  const ratio = Math.max(0, obstacle.health / maxHealth);
  const pipColor = lerpColor('#ff3366', '#00ff88', ratio);
  const pipCount = 4;
  const pipArc = (Math.PI * 2) / pipCount * 0.55;
  const pipR = radius + 10;
  for (let i = 0; i < pipCount; i++) {
    const filled = ratio > (pipCount - 1 - i) / pipCount;
    if (!filled) continue;
    const start = -Math.PI / 2 + (Math.PI * 2 * i) / pipCount - pipArc / 2;
    ctx.strokeStyle = pipColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 2, pipR, start, start + pipArc);
    ctx.stroke();
  }

  const coreAlpha = 0.5 + 0.5 * Math.sin(now * 10);
  ctx.fillStyle = `rgba(255, 200, 80, ${coreAlpha})`;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawStaticObstacle(
  ctx: CanvasRenderingContext2D,
  obstacle: Obstacle,
  state: CanvasRenderCtx,
): void {
  const { pos, config } = obstacle;
  const spawnPulse = 0.5 + 0.5 * Math.sin(state.ringRotation * 3 + pos.x * 0.02);
  ctx.fillStyle = '#64748b';
  ctx.strokeStyle = `rgba(200, 220, 255, ${0.35 + spawnPulse * 0.4})`;
  ctx.lineWidth = 2;

  if (config.shape === 'CIRCLE') {
    const radius = config.width / 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const angle = config.angle ?? 0;
    const halfW = config.width / 2;
    const halfH = config.height / 2;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.fillRect(-halfW, -halfH, config.width, config.height);
    ctx.strokeRect(-halfW, -halfH, config.width, config.height);
    ctx.restore();
  }
}

function drawDestructibleBox(
  ctx: CanvasRenderingContext2D,
  obstacle: Obstacle,
  now: number,
): void {
  const { pos, config } = obstacle;
  const angle = config.angle ?? 0;
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const rimColor = '#aa8844';
  const pulse = 0.25 + 0.2 * Math.sin(now * 8);
  const diag = Math.hypot(config.width, config.height) / 2;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);

  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = `rgba(170, 136, 68, ${pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, diag + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const grad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
  grad.addColorStop(0, '#1a2030');
  grad.addColorStop(0.5, '#141926');
  grad.addColorStop(1, rimColor);
  ctx.fillStyle = grad;
  ctx.fillRect(-halfW, -halfH, config.width, config.height);
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(-halfW, -halfH, config.width, config.height);

  const maxHealth = config.maxHealth ?? 100;
  const ratio = Math.max(0, obstacle.health / maxHealth);
  const pipColor = lerpColor('#ff3366', '#00ff88', ratio);
  ctx.strokeStyle = pipColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -halfH - 8, 6, Math.PI * 0.15, Math.PI * 0.15 + Math.PI * ratio);
  ctx.stroke();

  ctx.fillStyle = `rgba(255, 200, 80, ${0.5 + 0.5 * Math.sin(now * 10)})`;
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  world: PhysicsWorld,
): void {
  const nowMs = performance.now();
  const now = nowMs * 0.001;
  for (const obstacle of world.obstacles) {
    if (obstacle.isDead) continue;
    drawObstacleOverheadBars(ctx, obstacle, nowMs);
    if (obstacle.config.isDestructible) {
      if (obstacle.config.shape === 'CIRCLE') {
        drawDestructibleMine(ctx, obstacle, now);
      } else {
        drawDestructibleBox(ctx, obstacle, now);
      }
    } else {
      drawStaticObstacle(ctx, obstacle, state);
    }
  }
}

export function drawConstraints(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
  for (const c of world.getConstraints()) {
    if (c.isDead) continue;

    const p1 = c.bodyA.pos;
    const p2 = c.bodyB?.pos ?? c.anchorB;
    if (!p2) continue;

    switch (c.config.type) {
      case 'SPRING_TETHER':
        ctx.strokeStyle = 'rgba(0, 255, 150, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        break;

      case 'DISTANCE_ROD':
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        break;

      case 'SURFACE_PIN': {
        ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const size = 8;
        ctx.beginPath();
        ctx.moveTo(p2.x - size, p2.y - size);
        ctx.lineTo(p2.x + size, p2.y + size);
        ctx.moveTo(p2.x + size, p2.y - size);
        ctx.lineTo(p2.x - size, p2.y + size);
        ctx.stroke();
        break;
      }
    }
  }
  ctx.setLineDash([]);
}
