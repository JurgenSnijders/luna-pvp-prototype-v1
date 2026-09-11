import type { GameApp } from './GameApp';
import { abilityUsesGroundReticle } from '../render/canvas/trajectoryTracer';
import { updatePlayerAimTarget } from './input';

/** Returns true when the event target is inside UI that should not receive game camera input. */
export function isCameraInputBlocked(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    '#inspector-root, .telemetry-overlay, [data-panel], input, textarea, select, button',
  );
}

export function screenToWorldFromApp(
  app: GameApp,
  screenX: number,
  screenY: number,
): { x: number; y: number } {
  return app.camera.screenToWorld(screenX, screenY);
}

export function updatePlayerAimFromScreen(
  app: GameApp,
  screenX: number,
  screenY: number,
): void {
  const camWorld = screenToWorldFromApp(app, screenX, screenY);
  const aiming = app.player.activeAimingState;
  const world =
    aiming && !abilityUsesGroundReticle(aiming.ability)
      ? {
          x: app.player.pos.x + (camWorld.x - app.camera.pos.x),
          y: app.player.pos.y + (camWorld.y - app.camera.pos.y),
        }
      : camWorld;
  updatePlayerAimTarget(app, world);
}
