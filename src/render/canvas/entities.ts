import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Entity } from '../../entities/Entity';
import { Vector2D } from '../../math/Vector2D';
import { hitFeedbackConfig } from '../../render/hitFeedbackConfig';
import { getActiveColors } from '../../ui/tokens';
import { lerpPos } from './helpers';
import type { CanvasRenderCtx } from './renderCtx';

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

  const radius = entity.effectiveRadius;
  const drawColor = entity.activeMorph ? '#6a7a8a' : fillColor;

  let drawPos = pos;
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
    drawPos = pos.add(new Vector2D(tx * jitter, ty * jitter));
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
    const aimEnd = drawPos.add(Vector2D.fromAngle(facing, radius + 14));
    ctx.strokeStyle = aimColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(drawPos.x, drawPos.y);
    ctx.lineTo(aimEnd.x, aimEnd.y);
    ctx.stroke();
  }

  ctx.globalAlpha = prevAlpha;
  drawStasisOverlay(ctx, state, entity, drawPos);
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
