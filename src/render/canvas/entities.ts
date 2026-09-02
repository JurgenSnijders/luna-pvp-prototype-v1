import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Entity } from '../../entities/Entity';
import type { ActiveStatusTimer } from '../../entities/Entity';
import type { SpellArchetype } from '../../types/schema';
import { Vector2D } from '../../math/Vector2D';
import { hitFeedbackConfig } from '../../render/hitFeedbackConfig';
import { getActiveColors } from '../../ui/tokens';
import { lerpPos } from './helpers';
import type { CanvasRenderCtx } from './renderCtx';

function statusProgress(entity: Entity, archetype: SpellArchetype): number {
  const timers = entity.getActiveStatusTimers();
  const match = timers.find((t) => t.archetype === archetype);
  return match?.progress ?? 1;
}

function intensityAlpha(progress: number, base = 0.6): number {
  return base * (0.4 + 0.6 * progress);
}

function drawStatusAuras(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  pos: Vector2D,
  nowMs: number,
  physicsPos: Vector2D,
): void {
  const radius = entity.effectiveRadius;
  const statuses = entity.getActiveStatusTimers();
  if (statuses.length === 0) return;

  const statusSet = new Set(statuses.map((s: ActiveStatusTimer) => s.archetype));

  if (statusSet.has('FROST')) {
    const progress = statusProgress(entity, 'FROST');
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
      const ix = pos.x + Math.cos(angle) * inner;
      const iy = pos.y + Math.sin(angle) * inner;
      const ox = pos.x + Math.cos(angle) * outer;
      const oy = pos.y + Math.sin(angle) * outer;
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }

    if (entity.vel.magSq() > 100) {
      const back = entity.vel.magSq() > 0 ? entity.vel.normalize().scale(-1) : Vector2D.fromAngle(0, -1);
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

  if (statusSet.has('KINETIC') && entity.vel.magSq() > 200) {
    const back = entity.vel.normalize().scale(-1);
    const perp = new Vector2D(-back.y, back.x);
    const base = pos.add(back.scale(radius * 0.5));
    const skidLen = 24;
    const offsets = [-3, 3];
    for (const off of offsets) {
      const start = base.add(perp.scale(off));
      const end = start.add(back.scale(skidLen));
      ctx.strokeStyle = off < 0 ? 'rgba(224, 248, 255, 0.85)' : 'rgba(0, 229, 255, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  if (statusSet.has('EARTH')) {
    const progress = statusProgress(entity, 'EARTH');
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
      const baseX = pos.x + Math.cos(angle) * (radius + 2);
      const baseY = pos.y + Math.sin(angle) * (radius + 2);
      const tipX = pos.x + Math.cos(angle) * (radius + 14);
      const tipY = pos.y + Math.sin(angle) * (radius + 14);
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
  }

  if (statusSet.has('GRAVITY')) {
    const progress = statusProgress(entity, 'GRAVITY');
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

  if (statusSet.has('FIRE')) {
    const speedFactor = Math.min(1, entity.vel.mag() / 400);
    if (speedFactor > 0.05) {
      const back = entity.vel.magSq() > 0 ? entity.vel.normalize().scale(-1) : Vector2D.fromAngle(Math.PI, 1);
      const flareLen = 8 + speedFactor * 22;
      const flareStart = pos.add(back.scale(radius));
      const flareEnd = flareStart.add(back.scale(flareLen));
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
  }

  if (statusSet.has('PLASMA') && entity.instabilityPct >= 70) {
    const sparkAlpha = 0.5 + 0.5 * Math.sin(nowMs * 0.02);
    ctx.strokeStyle = `rgba(255, 0, 127, ${sparkAlpha})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const edgeAngle = (nowMs * 0.003 + i * Math.PI * 0.5) % (Math.PI * 2);
      const edgeX = pos.x + Math.cos(edgeAngle) * radius;
      const edgeY = pos.y + Math.sin(edgeAngle) * radius;
      const floorX = edgeX + (Math.random() - 0.5) * 8;
      const floorY = pos.y + radius + 6 + Math.random() * 10;
      ctx.beginPath();
      ctx.moveTo(edgeX, edgeY);
      ctx.lineTo(floorX, floorY);
      ctx.stroke();
    }
  }
}

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

export function drawCombatants(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  world: PhysicsWorld,
  alpha: number,
): void {
  for (const player of world.players) {
    if (player.isDead) continue;
    const pos = lerpPos(player, alpha);
    const colors = getActiveColors();
    const isBot = player.tags.has('bot');
    const baseColor = isBot ? colors.botOrange : colors.playerCyan;
    const aimColor = isBot ? colors.botOrangeAim : colors.playerCyanAim;
    drawCombatantBody(ctx, state, player, pos, baseColor, aimColor);
  }

  for (const dummy of world.dummies) {
    if (dummy.isDead) continue;
    const pos = lerpPos(dummy, alpha);
    drawCombatantBody(ctx, state, dummy, pos, getActiveColors().botOrange);
  }
}

function drawCombatantBody(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  entity: Entity,
  pos: Vector2D,
  fillColor: string,
  aimColor?: string,
): void {
  const prevAlpha = ctx.globalAlpha;
  if (entity.isStealthed()) {
    const shimmer = 0.22 + 0.12 * Math.sin(performance.now() * 0.008);
    ctx.globalAlpha = shimmer;
  }

  const nowMs = performance.now();
  const physicsPos = pos;
  const hasGravity = entity.activeStatuses.has('GRAVITY');
  const gravityBob = hasGravity ? Math.sin(nowMs * 0.006) * 3 : 0;
  const visualPos = physicsPos.add(new Vector2D(0, gravityBob));

  drawStatusAuras(ctx, entity, visualPos, nowMs, physicsPos);

  const radius = entity.effectiveRadius;
  const drawColor = entity.activeMorph ? '#6a7a8a' : fillColor;

  let drawPos = visualPos;
  let useDeform = false;
  let squash = 1;
  let stretch = 1;
  let rot = 0;

  if (hitFeedbackConfig.bodyDeform && entity.hitDeformTimer > 0) {
    const t = entity.hitDeformTimer / 0.12;
    squash = 1 - 0.25 * t;
    stretch = 1 + 0.2 * t;
    const nx = entity.hitImpactNormal.x;
    const ny = entity.hitImpactNormal.y;
    const tx = -ny;
    const ty = nx;
    const jitter = Math.sin(t * 60) * 3 * t;
    drawPos = visualPos.add(new Vector2D(tx * jitter, ty * jitter));
    rot = Math.atan2(ny, nx);
    useDeform = true;
  }

  const drawBody = (): void => {
    const glow = state.spriteCache.getSprite('COMBATANT', drawColor, radius);
    ctx.drawImage(glow.canvas, -glow.w / 2, -glow.h / 2, glow.w, glow.h);

    ctx.fillStyle = drawColor;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    if (hitFeedbackConfig.targetFlash && entity.hitFlashTimer > 0) {
      const flashT = 1 - entity.hitFlashTimer / 0.08;
      let flashColor = '#ffffff';
      if (entity.hitFlashTimer <= 0.04) {
        flashColor = lerpColor('#ffffff', entity.hitFlashColor, 1 - entity.hitFlashTimer / 0.04);
      }
      const prevShadow = ctx.shadowBlur;
      ctx.shadowBlur = entity.hitFlashTimer > 0.04 ? 16 : 8;
      ctx.shadowColor = flashColor;
      ctx.fillStyle = flashColor;
      ctx.globalAlpha = Math.min(prevAlpha, 0.55 + flashT * 0.45);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = prevShadow;
      ctx.globalAlpha = prevAlpha;
      ctx.strokeStyle = flashColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  if (useDeform) {
    ctx.save();
    ctx.translate(drawPos.x, drawPos.y);
    ctx.rotate(rot);
    ctx.scale(squash, stretch);
    drawBody();
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(drawPos.x, drawPos.y);
    drawBody();
    ctx.restore();
  }

  if (entity.activeMorph) {
    const morphPulse = 0.5 + 0.5 * Math.sin(state.ringRotation * 4);
    ctx.strokeStyle = `rgba(160, 200, 255, ${0.35 + morphPulse * 0.45})`;
    ctx.lineWidth = 2 + morphPulse * 2;
    ctx.beginPath();
    ctx.arc(drawPos.x, drawPos.y, radius + 3 + morphPulse * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (aimColor && 'facingAngle' in entity) {
    const facing = (entity as { facingAngle: number }).facingAngle;
    const aimEnd = physicsPos.add(Vector2D.fromAngle(facing, radius + 14));
    ctx.strokeStyle = aimColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(physicsPos.x, physicsPos.y);
    ctx.lineTo(aimEnd.x, aimEnd.y);
    ctx.stroke();
  }

  ctx.globalAlpha = prevAlpha;
  drawStasisOverlay(ctx, state, entity, physicsPos);
}

export function drawSummons(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  alpha: number,
): void {
  for (const summon of world.summons) {
    if (summon.isDead) continue;
    const pos = lerpPos(summon, alpha);
    const half = summon.config.radius ?? summon.radius;
    const turretColor = summon.visuals?.color ?? summon.config.visuals?.color ?? '#88aa44';
    const decoyColor = summon.visuals?.color ?? summon.config.visuals?.color ?? '#aa6688';

    if (summon.config.actorArchetype === 'TURRET') {
      ctx.fillStyle = turretColor;
      ctx.fillRect(pos.x - half, pos.y - half, half * 2, half * 2);
      ctx.strokeStyle = 'rgba(180, 255, 120, 0.5)';
      ctx.strokeRect(pos.x - half - 2, pos.y - half - 2, half * 2 + 4, half * 2 + 4);
      const barrelEnd = pos.add(Vector2D.fromAngle(summon.facingAngle, half + 12));
      ctx.strokeStyle = turretColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(barrelEnd.x, barrelEnd.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = decoyColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, half, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 180, 220, 0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawStasisOverlay(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  entity: Entity,
  pos: Vector2D,
): void {
  if (entity.stasisRemainingMs > 0) {
    const crystal = 0.5 + 0.5 * Math.sin(state.ringRotation * 5);
    ctx.strokeStyle = `rgba(255, 215, 80, ${0.55 + crystal * 0.4})`;
    ctx.lineWidth = 2 + crystal * 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, entity.effectiveRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(180, 230, 255, ${0.25 + crystal * 0.35})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, entity.effectiveRadius + 7, state.ringRotation, state.ringRotation + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (entity.stashedMomentum.magSq() > 0) {
    const dir = entity.stashedMomentum.normalize();
    const length = Math.min(
      entity.effectiveRadius * 2.5,
      entity.stashedMomentum.mag() * 0.15,
    );
    const tip = pos.add(dir.scale(length));
    ctx.strokeStyle = '#ff2222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();

    const headLen = 6;
    const angle = Math.atan2(dir.y, dir.x);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x - headLen * Math.cos(angle - Math.PI / 6),
      tip.y - headLen * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x - headLen * Math.cos(angle + Math.PI / 6),
      tip.y - headLen * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  }
}
