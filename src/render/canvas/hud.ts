import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { Entity } from '../../entities/Entity';
import { hitFeedbackConfig } from '../../render/hitFeedbackConfig';
import { healthBarColor, instabilityColor } from './colors';
import { lerpPos } from './helpers';
import { canvasFont } from '../../ui/tokens';

export const OVERHEAD_BAR_TOP_OFFSET = 14;
export const OVERHEAD_BAR_HEIGHT = 5;
export const OVERHEAD_INSTABILITY_BAR_HEIGHT = 3;
export const OVERHEAD_INSTABILITY_BAR_GAP = 2;
const OVERHEAD_INSTABILITY_LABEL_GAP = 6;
const OVERHEAD_INSTABILITY_FONT_SIZE = 16;
export const OVERHEAD_INSTABILITY_LABEL_OFFSET =
  OVERHEAD_BAR_TOP_OFFSET +
  OVERHEAD_BAR_HEIGHT +
  OVERHEAD_INSTABILITY_BAR_GAP +
  OVERHEAD_INSTABILITY_BAR_HEIGHT +
  OVERHEAD_INSTABILITY_LABEL_GAP;

function getInstabilityBarCap(): number {
  return Math.max(1, Entity.maxInstability);
}

export function drawOverheadHUD(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  alpha: number,
): void {
  const entities = [...world.players, ...world.dummies, ...world.summons].filter(
    (e) => !e.isDead && !e.isStealthed(),
  );
  ctx.font = canvasFont(OVERHEAD_INSTABILITY_FONT_SIZE);
  ctx.textAlign = 'center';

  const barWidth = 40;
  const fillMaxWidth = barWidth - 2;

  for (const entity of entities) {
    const pos = lerpPos(entity, alpha);
    const barX = pos.x - barWidth / 2;
    const barY = pos.y - entity.effectiveRadius - OVERHEAD_BAR_TOP_OFFSET;

    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, OVERHEAD_BAR_HEIGHT, 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const healthRatio = entity.health / entity.maxHealth;
    const fillWidth = fillMaxWidth * Math.min(1, Math.max(0, healthRatio));
    if (fillWidth > 0) {
      ctx.beginPath();
      ctx.roundRect(barX + 1, barY + 1, fillWidth, OVERHEAD_BAR_HEIGHT - 2, 1);
      ctx.fillStyle = healthBarColor(healthRatio);
      ctx.fill();
    }

    const instabBarY = barY + OVERHEAD_BAR_HEIGHT + OVERHEAD_INSTABILITY_BAR_GAP;
    ctx.beginPath();
    ctx.roundRect(barX, instabBarY, barWidth, OVERHEAD_INSTABILITY_BAR_HEIGHT, 1);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (hitFeedbackConfig.ghostInstabilityBar) {
      const barCap = getInstabilityBarCap();
      const ghostRatio = Math.min(1, Math.max(0, entity.ghostInstability / barCap));
      const ghostWidth = fillMaxWidth * ghostRatio;
      if (ghostWidth > 0) {
        ctx.beginPath();
        ctx.roundRect(
          barX + 1,
          instabBarY + 1,
          ghostWidth,
          OVERHEAD_INSTABILITY_BAR_HEIGHT - 2,
          1,
        );
        ctx.fillStyle = 'rgba(255, 220, 140, 0.85)';
        ctx.fill();
      }
    }

    const pct = entity.instabilityPct;
    const barCap = getInstabilityBarCap();
    const instabRatio = Math.min(1, Math.max(0, pct / barCap));
    const instabWidth = fillMaxWidth * instabRatio;
    if (instabWidth > 0) {
      ctx.beginPath();
      ctx.roundRect(
        barX + 1,
        instabBarY + 1,
        instabWidth,
        OVERHEAD_INSTABILITY_BAR_HEIGHT - 2,
        1,
      );
      ctx.fillStyle = instabilityColor(pct);
      ctx.fill();
    }

    ctx.fillStyle = instabilityColor(pct);
    ctx.globalAlpha = pct >= 200 ? 0.7 + 0.3 * Math.sin(performance.now() / 200) : 1;
    ctx.fillText(
      `${Math.round(pct)}`,
      pos.x,
      pos.y - entity.effectiveRadius - OVERHEAD_INSTABILITY_LABEL_OFFSET,
    );
    ctx.globalAlpha = 1;
  }
}
