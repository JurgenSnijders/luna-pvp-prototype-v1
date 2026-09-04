import { getEffectiveDprCap, isCheapUi } from '../devtools/graphicsSettings';
import { Vector2D } from '../math/Vector2D';
import {
  clearUserZoomOverride,
  fitArenaToSafeView,
} from '../camera/cameraArenaFit';
import {
  applyViewportLayout,
  getSafeViewInsets,
  isCompactViewport,
} from '../ui/viewportLayout';
import type { GameApp } from './GameApp';
import { getStoredHexRadius } from './settings';

export function getHexCenter(): Vector2D {
  return new Vector2D(0, 0);
}

function getInspectorExpanded(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('LUNA_INSPECTOR_COLLAPSED') !== 'true';
}

export function resize(app: GameApp): void {
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const dpr = getEffectiveDprCap(cssW, cssH);
  const pixelW = Math.max(1, Math.floor(cssW * dpr));
  const pixelH = Math.max(1, Math.floor(cssH * dpr));
  app.canvas.width = pixelW;
  app.canvas.height = pixelH;
  app.canvas.style.width = `${cssW}px`;
  app.canvas.style.height = `${cssH}px`;
  app.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.camera?.setViewport(cssW, cssH);
  app.world?.setViewportBounds(cssW, cssH);
  app.arenaShrink?.resize(getStoredHexRadius());
  app.particles?.resize(cssW, cssH);
  app.backgroundRenderer?.resize(cssW, cssH);
  app.physicsDebugLayer?.resize(cssW, cssH);

  applyViewportLayout(isCheapUi());

  if (app.camera) {
    const insets = getSafeViewInsets(undefined, getInspectorExpanded());
    fitArenaToSafeView(app.camera, app.world?.hexRadius ?? getStoredHexRadius(), insets);
  }
}

export function resetCameraView(app: GameApp): void {
  if (!app.camera) return;
  clearUserZoomOverride();
  app.camera.mode = 'LOCKED';
  app.camera.snapTo(app.player.pos.x, app.player.pos.y);
  if (isCompactViewport()) {
    const insets = getSafeViewInsets(undefined, getInspectorExpanded());
    fitArenaToSafeView(app.camera, app.world?.hexRadius ?? getStoredHexRadius(), insets, {
      force: true,
    });
  } else {
    app.camera.setZoom(1);
  }
}

export function resetArena(app: GameApp): void {
  const center = getHexCenter();
  app.matchManager.resetRoundEntities(app.player, app.bot, app.world, app.arenaShrink, center);
  app.world.dummies = [];
}

export function respawnCombatants(app: GameApp): void {
  app.matchManager.respawnAllCombatants(
    app.player,
    app.bot,
    app.world,
    app.arenaShrink,
    getHexCenter(),
  );
  for (const dummy of app.world.dummies) {
    if (dummy.isDead) continue;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * app.arenaShrink.initialRadius * 0.5;
    const pos = getHexCenter().add(Vector2D.fromAngle(angle, dist));
    dummy.pos = pos.clone();
    dummy.prevPos = pos.clone();
    dummy.vel = Vector2D.zero();
    dummy.instabilityPct = 0;
    dummy.health = dummy.maxHealth;
  }
  app.world.setCombatantRadius(app.world.getCombatantRadius());
}
