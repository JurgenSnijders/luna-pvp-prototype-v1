import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { healthBarColor, instabilityColor } from './colors';
import { lerpPos } from './helpers';

export function drawOverheadHUD(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  alpha: number,
): void {
  const entities = [...world.players, ...world.dummies, ...world.summons].filter(
    (e) => !e.isDead && !e.isStealthed(),
  );
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';

  const barWidth = 40;
  const barHeight = 5;
  const fillMaxWidth = barWidth - 2;

  for (const entity of entities) {
    const pos = lerpPos(entity, alpha);
    const barX = pos.x - barWidth / 2;
    const barY = pos.y - entity.effectiveRadius - 14;

    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const healthRatio = entity.health / entity.maxHealth;
    const fillWidth = fillMaxWidth * Math.min(1, Math.max(0, healthRatio));
    if (fillWidth > 0) {
      ctx.beginPath();
      ctx.roundRect(barX + 1, barY + 1, fillWidth, barHeight - 2, 1);
      ctx.fillStyle = healthBarColor(healthRatio);
      ctx.fill();
    }

    const pct = entity.instabilityPct;
    ctx.fillStyle = instabilityColor(pct);
    ctx.globalAlpha = pct >= 200 ? 0.7 + 0.3 * Math.sin(performance.now() / 200) : 1;
    ctx.fillText(`${Math.round(pct)}%`, pos.x, pos.y - entity.effectiveRadius - 4);
    ctx.globalAlpha = 1;
  }
}
