import { getEffectiveDprCap } from '../devtools/graphicsSettings';
import { Vector2D } from '../math/Vector2D';
import type { GameApp } from './GameApp';
import { getStoredHexRadius } from './settings';

export function getHexCenter(): Vector2D {
  return new Vector2D(window.innerWidth / 2, window.innerHeight / 2);
}

export function resize(app: GameApp): void {
  const dpr = getEffectiveDprCap();
  app.canvas.width = window.innerWidth * dpr;
  app.canvas.height = window.innerHeight * dpr;
  app.canvas.style.width = `${window.innerWidth}px`;
  app.canvas.style.height = `${window.innerHeight}px`;
  app.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  app.world?.setViewportBounds(window.innerWidth, window.innerHeight);
  app.arenaShrink?.resize(getStoredHexRadius());
  app.particles?.resize(window.innerWidth, window.innerHeight);
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
