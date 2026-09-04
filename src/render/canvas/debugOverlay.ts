import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { Z_TO_SCREEN } from '../../engine/verticalConstants';
import type { Entity } from '../../entities/Entity';
import { getGraphicsSettings } from '../../devtools/graphicsSettings';
import { lerpPos, lerpZ } from './helpers';

export function drawVerticalTelemetry(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  alpha: number,
): void {
  if (!getGraphicsSettings().showVerticalVectors) return;

  const entities: Entity[] = [
    ...world.players,
    ...world.dummies,
    ...world.summons,
    ...world.projectiles,
  ].filter((e) => !e.isDead);

  ctx.save();
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.75)';
  ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
  ctx.lineWidth = 1;
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  for (const entity of entities) {
    if (entity.z <= 0 && entity.vz === 0) continue;

    const ground = lerpPos(entity, alpha);
    const z = lerpZ(entity, alpha);
    const airY = ground.y - z * Z_TO_SCREEN;

    ctx.beginPath();
    ctx.moveTo(ground.x, ground.y);
    ctx.lineTo(ground.x, airY);
    ctx.stroke();

    const label = `Z:${Math.round(z)} | VZ:${Math.round(entity.vz)}`;
    ctx.fillText(label, ground.x + entity.radius + 4, airY - 2);
  }

  ctx.restore();
}
