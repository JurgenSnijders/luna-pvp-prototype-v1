import type { GameApp } from './GameApp';
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
  const world = screenToWorldFromApp(app, screenX, screenY);
  updatePlayerAimTarget(app, world);
}
