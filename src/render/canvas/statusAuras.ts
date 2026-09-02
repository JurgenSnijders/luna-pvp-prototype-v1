import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Entity } from '../../entities/Entity';
import { Vector2D } from '../../math/Vector2D';
import type { SpellArchetype } from '../../types/schema';

export interface AuraCtx {
  ctx: CanvasRenderingContext2D;
  entity: Entity;
  pos: Vector2D;
  physicsPos: Vector2D;
  nowMs: number;
  progress: number;
  world: PhysicsWorld;
}

type AuraRenderer = (a: AuraCtx) => void;

function intensityAlpha(progress: number, base = 0.6): number {
  return base * (0.4 + 0.6 * progress);
}

function drawFrostAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress } = a;
  const radius = entity.effectiveRadius;
  const ringAlpha = intensityAlpha(progress, 0.6);
  const ringR = radius + 4;
  const rotation = nowMs * 0.001;

  ctx.strokeStyle = `rgba(0, 229, 255, ${ringAlpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, ringR, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 6; i++) {
    const angle = rotation + (i * Math.PI * 2) / 6;
    const inner = ringR - 3;
    const outer = ringR + 5;
    ctx.beginPath();
    ctx.moveTo(pos.x + Math.cos(angle) * inner, pos.y + Math.sin(angle) * inner);
    ctx.lineTo(pos.x + Math.cos(angle) * outer, pos.y + Math.sin(angle) * outer);
    ctx.stroke();
  }

  if (entity.vel.magSq() > 100) {
    const back = entity.vel.normalize().scale(-1);
    const treadStart = pos.add(back.scale(radius * 0.6));
    const treadEnd = treadStart.add(back.scale(18));
    ctx.strokeStyle = `rgba(180, 240, 255, ${ringAlpha * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(treadStart.x, treadStart.y);
    ctx.lineTo(treadEnd.x, treadEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawKineticAura(a: AuraCtx): void {
  const { ctx, entity, pos } = a;
  if (entity.vel.magSq() <= 200) return;
  const radius = entity.effectiveRadius;
  const back = entity.vel.normalize().scale(-1);
  const perp = new Vector2D(-back.y, back.x);
  const base = pos.add(back.scale(radius * 0.5));
  for (const off of [-3, 3]) {
    const start = base.add(perp.scale(off));
    const end = start.add(back.scale(24));
    ctx.strokeStyle = off < 0 ? 'rgba(224, 248, 255, 0.85)' : 'rgba(0, 229, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
}

function drawEarthAura(a: AuraCtx): void {
  const { ctx, entity, pos, progress } = a;
  const radius = entity.effectiveRadius;
  const alpha = intensityAlpha(progress, 0.75);
  const bracketR = radius + 6;
  ctx.strokeStyle = `rgba(212, 163, 115, ${alpha})`;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8 - Math.PI / 2;
    const x = pos.x + Math.cos(angle) * bracketR;
    const y = pos.y + Math.sin(angle) * bracketR;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 2 + ((i - 1.5) * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(
      pos.x + Math.cos(angle) * (radius + 2),
      pos.y + Math.sin(angle) * (radius + 2),
    );
    ctx.lineTo(
      pos.x + Math.cos(angle) * (radius + 14),
      pos.y + Math.sin(angle) * (radius + 14),
    );
    ctx.stroke();
  }
}

function drawGravityAura(a: AuraCtx): void {
  const { ctx, entity, pos, physicsPos, progress } = a;
  const radius = entity.effectiveRadius;
  const haloAlpha = intensityAlpha(progress, 0.4);
  ctx.strokeStyle = `rgba(179, 136, 255, ${haloAlpha})`;
  ctx.fillStyle = `rgba(179, 136, 255, ${haloAlpha * 0.25})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y - radius - 8, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(
    physicsPos.x,
    physicsPos.y + radius * 0.15,
    radius * 0.7,
    radius * 0.2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

function drawFireAura(a: AuraCtx): void {
  const { ctx, entity, pos } = a;
  const radius = entity.effectiveRadius;
  const speedFactor = Math.min(1, entity.vel.mag() / 400);
  if (speedFactor <= 0.05) return;

  const back = entity.vel.magSq() > 0 ? entity.vel.normalize().scale(-1) : Vector2D.fromAngle(Math.PI, 1);
  const flareStart = pos.add(back.scale(radius));
  const flareEnd = flareStart.add(back.scale(8 + speedFactor * 22));
  ctx.strokeStyle = `rgba(255, 68, 0, ${0.35 + speedFactor * 0.55})`;
  ctx.lineWidth = 2 + speedFactor * 3;
  ctx.beginPath();
  ctx.moveTo(flareStart.x, flareStart.y);
  ctx.lineTo(flareEnd.x, flareEnd.y);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 170, 0, ${0.25 + speedFactor * 0.4})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius + 2 + speedFactor * 4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlasmaAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs } = a;
  if (entity.instabilityPct < 70) return;
  const radius = entity.effectiveRadius;
  const sparkAlpha = 0.5 + 0.5 * Math.sin(nowMs * 0.02);
  ctx.strokeStyle = `rgba(255, 0, 127, ${sparkAlpha})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const edgeAngle = (nowMs * 0.003 + i * Math.PI * 0.5) % (Math.PI * 2);
    const edgeX = pos.x + Math.cos(edgeAngle) * radius;
    const edgeY = pos.y + Math.sin(edgeAngle) * radius;
    ctx.beginPath();
    ctx.moveTo(edgeX, edgeY);
    ctx.lineTo(edgeX + (Math.random() - 0.5) * 8, pos.y + radius + 6 + Math.random() * 10);
    ctx.stroke();
  }
}

function drawNatureAura(a: AuraCtx): void {
  const { ctx, entity, pos, progress } = a;
  if (!entity.natureAnchor) return;
  const alpha = intensityAlpha(progress, 0.55);
  const anchor = entity.natureAnchor;
  const radius = entity.effectiveRadius;

  ctx.strokeStyle = `rgba(68, 204, 102, ${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(anchor.x, anchor.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(68, 204, 102, ${alpha * 0.35})`;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 100, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius + 3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawChronoAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress } = a;
  if (!entity.chronoSnapshot) return;
  const alpha = intensityAlpha(progress, 0.5);
  const snap = entity.chronoSnapshot.pos;
  const radius = entity.effectiveRadius;

  ctx.fillStyle = `rgba(255, 204, 68, ${alpha * 0.25})`;
  ctx.strokeStyle = `rgba(255, 204, 68, ${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(snap.x, snap.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const handAngle = nowMs * 0.002;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(pos.x + Math.cos(handAngle) * (radius + 10), pos.y + Math.sin(handAngle) * (radius + 10));
  ctx.stroke();
}

function drawArcaneAura(a: AuraCtx): void {
  const { ctx, entity, pos, progress } = a;
  const buffer = entity.arcaneBuffer;
  if (!buffer || buffer.magSq() < 1) return;
  const alpha = intensityAlpha(progress, 0.65);
  const dir = buffer.normalize();
  const length = Math.min(entity.effectiveRadius * 2.2, buffer.mag() * 0.12);
  const tip = pos.add(dir.scale(length));

  ctx.strokeStyle = `rgba(187, 102, 255, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  const angle = Math.atan2(dir.y, dir.x);
  const headLen = 7;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - headLen * Math.cos(angle - Math.PI / 6), tip.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - headLen * Math.cos(angle + Math.PI / 6), tip.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawBloodAura(a: AuraCtx): void {
  const { ctx, entity, pos, progress, world } = a;
  const alpha = intensityAlpha(progress, 0.7);
  const radius = entity.effectiveRadius;
  ctx.strokeStyle = `rgba(204, 34, 68, ${alpha})`;
  ctx.lineWidth = 1.5;

  for (let i = 0; i < 3; i++) {
    const dripX = pos.x + (i - 1) * 6;
    const dripY = pos.y + radius + 4;
    ctx.beginPath();
    ctx.moveTo(dripX, dripY);
    ctx.lineTo(dripX + (Math.random() - 0.5) * 3, dripY + 10 + Math.random() * 8);
    ctx.stroke();
  }

  const sourceId = entity.activeStatuses.get('BLOOD')?.sourceId;
  const source = sourceId ? world.getEntityById(sourceId) : null;
  if (source && !source.isDead) {
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(source.pos.x, source.pos.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawHolyAura(a: AuraCtx): void {
  const { ctx, entity, pos, progress } = a;
  const alpha = intensityAlpha(progress, 0.35);
  ctx.strokeStyle = `rgba(255, 248, 192, ${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 180, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, entity.effectiveRadius + 5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMagneticAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress, world } = a;
  const alpha = intensityAlpha(progress, 0.55);
  const radius = entity.effectiveRadius;
  ctx.strokeStyle = `rgba(68, 170, 255, ${alpha})`;
  ctx.lineWidth = 1.5;

  for (let i = 0; i < 3; i++) {
    const arcR = radius + 6 + i * 5;
    const start = nowMs * 0.001 + i * 0.8;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, arcR, start, start + Math.PI * 0.9);
    ctx.stroke();
  }

  for (const other of world.getCombatants()) {
    if (other.id === entity.id || other.isDead) continue;
    if (!other.activeStatuses.has('MAGNETIC')) continue;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(other.pos.x, other.pos.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawChaosAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress } = a;
  const alpha = intensityAlpha(progress, 0.6);
  const radius = entity.effectiveRadius;
  const verts = 8;
  ctx.strokeStyle = `rgba(255, 0, 127, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= verts; i++) {
    const angle = (i * Math.PI * 2) / verts;
    const jitter = 0.75 + 0.25 * Math.sin(nowMs * 0.01 + i * 1.7);
    const r = (radius + 5) * jitter;
    const x = pos.x + Math.cos(angle) * r;
    const y = pos.y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawLightningAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress } = a;
  const alpha = intensityAlpha(progress, 0.75);
  const radius = entity.effectiveRadius + 4;
  ctx.strokeStyle = `rgba(255, 238, 0, ${alpha})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const baseAngle = nowMs * 0.004 + (i * Math.PI * 2) / 4;
    let x = pos.x + Math.cos(baseAngle) * radius;
    let y = pos.y + Math.sin(baseAngle) * radius;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let seg = 0; seg < 3; seg++) {
      const step = (seg + 1) / 3;
      const nextAngle = baseAngle + step * 0.6 + Math.sin(nowMs * 0.02 + i) * 0.3;
      const nextR = radius * (1 - step * 0.3);
      x = pos.x + Math.cos(nextAngle) * nextR;
      y = pos.y + Math.sin(nextAngle) * nextR;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawVoidAura(a: AuraCtx): void {
  const { ctx, entity, pos, progress } = a;
  const alpha = intensityAlpha(progress, 0.55);
  const radius = entity.effectiveRadius + 3;
  const speed = Math.min(1, entity.vel.mag() / 300);
  ctx.strokeStyle = `rgba(204, 68, 255, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  const tickCount = 6 + Math.floor(speed * 4);
  for (let i = 0; i < tickCount; i++) {
    const angle = (i * Math.PI * 2) / tickCount;
    const outerX = pos.x + Math.cos(angle) * (radius + 6);
    const outerY = pos.y + Math.sin(angle) * (radius + 6);
    const innerX = pos.x + Math.cos(angle) * (radius - 4);
    const innerY = pos.y + Math.sin(angle) * (radius - 4);
    ctx.beginPath();
    ctx.moveTo(outerX, outerY);
    ctx.lineTo(innerX, innerY);
    ctx.stroke();
  }
}

function drawToxicAura(a: AuraCtx): void {
  const { ctx, entity, pos, progress } = a;
  const alpha = intensityAlpha(progress, 0.5);
  const radius = entity.effectiveRadius + 4;
  const bubbleScale = 0.4 + progress * 0.6;
  ctx.strokeStyle = `rgba(102, 255, 68, ${alpha})`;
  ctx.fillStyle = `rgba(102, 255, 68, ${alpha * 0.2})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    const bx = pos.x + Math.cos(angle) * radius;
    const by = pos.y + Math.sin(angle) * radius;
    const br = 3 * bubbleScale;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawSonicAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress } = a;
  const alpha = intensityAlpha(progress, 0.45);
  const radius = entity.effectiveRadius;
  const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.012);
  ctx.strokeStyle = `rgba(136, 255, 204, ${alpha})`;
  ctx.lineWidth = 1.5;
  for (let ring = 0; ring < 3; ring++) {
    const r = radius + 6 + ring * 8 + pulse * 4;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawAeroAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress } = a;
  const speedFactor = Math.min(1, entity.vel.mag() / 350);
  const alpha = intensityAlpha(progress, 0.4 + speedFactor * 0.35);
  const radius = entity.effectiveRadius;
  ctx.strokeStyle = `rgba(170, 221, 255, ${alpha})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const angle = nowMs * 0.003 + (i * Math.PI) / 2;
    const len = 12 + speedFactor * 18;
    const start = pos.add(Vector2D.fromAngle(angle, radius + 2));
    const end = start.add(Vector2D.fromAngle(angle + Math.PI * 0.5, len));
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
}

function drawPhaseAura(a: AuraCtx): void {
  const { ctx, entity, pos, nowMs, progress } = a;
  const alpha = intensityAlpha(progress, 0.4);
  const radius = entity.effectiveRadius;
  const offset = Math.sin(nowMs * 0.008) * 4;
  ctx.strokeStyle = `rgba(68, 255, 255, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x + offset, pos.y - offset * 0.5, radius + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(68, 255, 255, ${alpha * 0.5})`;
  ctx.beginPath();
  ctx.arc(pos.x - offset, pos.y + offset * 0.5, radius + 5, 0, Math.PI * 2);
  ctx.stroke();
}

const AURA_REGISTRY: Partial<Record<SpellArchetype, AuraRenderer>> = {
  FROST: drawFrostAura,
  KINETIC: drawKineticAura,
  EARTH: drawEarthAura,
  GRAVITY: drawGravityAura,
  FIRE: drawFireAura,
  PLASMA: drawPlasmaAura,
  NATURE: drawNatureAura,
  CHRONO: drawChronoAura,
  ARCANE: drawArcaneAura,
  BLOOD: drawBloodAura,
  HOLY: drawHolyAura,
  MAGNETIC: drawMagneticAura,
  CHAOS: drawChaosAura,
  LIGHTNING: drawLightningAura,
  VOID: drawVoidAura,
  TOXIC: drawToxicAura,
  SONIC: drawSonicAura,
  AERO: drawAeroAura,
  PHASE: drawPhaseAura,
};

export function drawStatusAuras(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  pos: Vector2D,
  nowMs: number,
  physicsPos: Vector2D,
  world: PhysicsWorld,
): void {
  const statuses = entity.getActiveStatusTimers();
  if (statuses.length === 0) return;

  for (const status of statuses) {
    const renderer = AURA_REGISTRY[status.archetype];
    if (!renderer) continue;
    renderer({
      ctx,
      entity,
      pos,
      physicsPos,
      nowMs,
      progress: status.progress,
      world,
    });
  }
}
