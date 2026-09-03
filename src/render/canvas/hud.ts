import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { ActiveStatusTimer } from '../../entities/Entity';
import { Entity } from '../../entities/Entity';
import { hitFeedbackConfig } from '../../render/hitFeedbackConfig';
import { healthBarColor, instabilityColor } from './colors';
import { lerpPos } from './helpers';
import { getArchetypeColor } from './SpellIconGenerator';
import { canvasFont } from '../../ui/tokens';

export const OVERHEAD_BAR_TOP_OFFSET = 14;
export const OVERHEAD_BAR_HEIGHT = 5;
export const OVERHEAD_INSTABILITY_BAR_HEIGHT = 3;
export const OVERHEAD_INSTABILITY_BAR_GAP = 2;
const OVERHEAD_INSTABILITY_LABEL_GAP = 6;
export const OVERHEAD_INSTABILITY_FONT_SIZE = 16;
export const OVERHEAD_STATUS_BAR_GAP = 6;
export const OVERHEAD_STATUS_BAR_HEIGHT = 3;
export const OVERHEAD_STATUS_BAR_TOTAL_WIDTH = 48;
const OVERHEAD_STATUS_BAR_SPACING = 2;
export const OVERHEAD_INSTABILITY_LABEL_OFFSET =
  OVERHEAD_BAR_TOP_OFFSET +
  OVERHEAD_BAR_HEIGHT +
  OVERHEAD_INSTABILITY_BAR_GAP +
  OVERHEAD_INSTABILITY_BAR_HEIGHT +
  OVERHEAD_INSTABILITY_LABEL_GAP;

function getInstabilityBarCap(): number {
  return Math.max(1, Entity.maxInstability);
}

function drawStatusDurationBars(
  ctx: CanvasRenderingContext2D,
  statuses: ActiveStatusTimer[],
  startX: number,
  startY: number,
): void {
  const count = statuses.length;
  if (count === 0) return;

  const segmentWidth = Math.max(
    4,
    Math.floor(
      (OVERHEAD_STATUS_BAR_TOTAL_WIDTH - OVERHEAD_STATUS_BAR_SPACING * (count - 1)) / count,
    ),
  );

  let x = startX;
  for (const status of statuses) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x, startY, segmentWidth, OVERHEAD_STATUS_BAR_HEIGHT);

    const fillW = Math.max(0, Math.round(segmentWidth * status.progress));
    const color = getArchetypeColor(status.archetype);
    if (fillW > 0) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.fillRect(x, startY, fillW, OVERHEAD_STATUS_BAR_HEIGHT);
      ctx.shadowBlur = 0;
    }

    x += segmentWidth + OVERHEAD_STATUS_BAR_SPACING;
  }

  ctx.shadowColor = 'transparent';
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

    const activeStatuses = entity.getActiveStatusTimers();
    if (activeStatuses.length > 0) {
      const statusStartY =
        pos.y - entity.effectiveRadius - OVERHEAD_INSTABILITY_LABEL_OFFSET + OVERHEAD_STATUS_BAR_GAP;
      const statusStartX = pos.x - OVERHEAD_STATUS_BAR_TOTAL_WIDTH / 2;
      drawStatusDurationBars(ctx, activeStatuses, statusStartX, statusStartY);
    }
  }
}
