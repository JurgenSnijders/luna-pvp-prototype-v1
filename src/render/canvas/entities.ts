import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Entity } from '../../entities/Entity';
import { Vector2D } from '../../math/Vector2D';
import { getActiveColors } from '../../ui/tokens';
import { lerpPos } from './helpers';
import type { CanvasRenderCtx } from './renderCtx';

function withNeonStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
  draw: () => void,
): void {
  ctx.save();
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  draw();
  ctx.restore();
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
    const isBot = player.tags.has('bot');
    const baseColor = isBot ? '#ff8844' : '#00ccff';
    drawCombatantBody(ctx, state, player, pos, baseColor, isBot ? '#ffbb88' : '#88eeff');
  }

  for (const dummy of world.dummies) {
    if (dummy.isDead) continue;
    const pos = lerpPos(dummy, alpha);
    drawCombatantBody(ctx, state, dummy, pos, '#ff8844');
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

  ctx.fillStyle = drawColor;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  withNeonStroke(ctx, drawColor, 10, () => {
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  });

  if (entity.activeMorph) {
    const morphPulse = 0.5 + 0.5 * Math.sin(state.ringRotation * 4);
    const colors = getActiveColors();
    withNeonStroke(ctx, colors.neonCyan, 8, () => {
      ctx.strokeStyle = `rgba(160, 200, 255, ${0.35 + morphPulse * 0.45})`;
      ctx.lineWidth = 2 + morphPulse * 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 3 + morphPulse * 2, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  if (aimColor && 'facingAngle' in entity) {
    const facing = (entity as { facingAngle: number }).facingAngle;
    const aimEnd = pos.add(Vector2D.fromAngle(facing, radius + 14));
    withNeonStroke(ctx, aimColor, 6, () => {
      ctx.strokeStyle = aimColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(aimEnd.x, aimEnd.y);
      ctx.stroke();
    });
  }

  ctx.globalAlpha = prevAlpha;
  drawStasisOverlay(ctx, state, entity, pos);
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
      withNeonStroke(ctx, turretColor, 8, () => {
        ctx.strokeStyle = 'rgba(180, 255, 120, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - half - 2, pos.y - half - 2, half * 2 + 4, half * 2 + 4);
      });
      const barrelEnd = pos.add(Vector2D.fromAngle(summon.facingAngle, half + 12));
      withNeonStroke(ctx, turretColor, 8, () => {
        ctx.strokeStyle = turretColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(barrelEnd.x, barrelEnd.y);
        ctx.stroke();
      });
    } else {
      ctx.fillStyle = decoyColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, half, 0, Math.PI * 2);
      ctx.fill();
      withNeonStroke(ctx, decoyColor, 8, () => {
        ctx.strokeStyle = 'rgba(255, 180, 220, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, half, 0, Math.PI * 2);
        ctx.stroke();
      });
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
    const colors = getActiveColors();
    withNeonStroke(ctx, '#fcd34d', 6, () => {
      ctx.strokeStyle = `rgba(255, 215, 80, ${0.55 + crystal * 0.4})`;
      ctx.lineWidth = 2 + crystal * 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, entity.effectiveRadius + 4, 0, Math.PI * 2);
      ctx.stroke();
    });
    withNeonStroke(ctx, colors.neonCyan, 6, () => {
      ctx.strokeStyle = `rgba(180, 230, 255, ${0.25 + crystal * 0.35})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, entity.effectiveRadius + 7, state.ringRotation, state.ringRotation + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });
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
