import { getGraphicsSettings } from '../devtools/graphicsSettings';
import { adaptiveQuality } from '../render/AdaptiveQuality';
import { applyField } from '../primitives/Fields';
import { CombatLogger } from '../telemetry/CombatLogger';
import type { GameApp } from './GameApp';
import { getHexCenter } from './arena';
import { applyPlayerInput, executePlayerCast } from './input';

export function syncArenaRadius(app: GameApp, dt: number): void {
  if (app.arenaShrink.enabled) {
    app.arenaShrink.update(dt);
    app.world.hexRadius = app.arenaShrink.currentRadius;
  } else {
    app.world.hexRadius = app.arenaShrink.initialRadius;
  }
}

export function applySpatialFields(app: GameApp, dt: number): void {
  const combatants = app.world.getCombatants();

  for (const entity of combatants) {
    entity.linearDrag = entity.baseLinearDrag;
  }

  for (const zone of app.world.zones) {
    if (zone.isDead) continue;
    for (const entity of combatants) {
      if (entity.isDead) continue;
      applyField(zone, entity, dt, app.world);
    }
  }
}

export function runSimulationStep(app: GameApp, dt: number): void {
  CombatLogger.getInstance().advanceClock(dt);
  app.particles.beginFrame(dt);
  app.world.beginDebugFrame();
  syncArenaRadius(app, dt);
  applyPlayerInput(app);
  app.player.updateSlotInputs(dt, (slotIndex, overrides, isChannelTick) =>
    executePlayerCast(app, slotIndex, overrides, isChannelTick),
  );

  if (app.botController.enabled) {
    app.botController.update(dt, app.player, app.world, app.arenaShrink, app.interpreter);
  }

  app.interpreter.updateTrajectories(app.world, dt);
  app.world.updateSpatialZones(dt);
  applySpatialFields(app, dt);
  app.world.step(dt);
  app.interpreter.processLifecycleEvents(app.world, dt);

  for (const impact of app.world.pendingWallImpacts) {
    app.particles.burstSparks(impact, 6, '#ffaa44');
  }
  for (const entity of app.world.getCombatants()) {
    if (entity.tags.has('in_lava') && Math.random() < 0.2) {
      app.particles.ember(entity.pos);
    }
  }
  if (getGraphicsSettings().ambientEmbers) {
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      app.particles.spawnAmbientEmber(
        { width: window.innerWidth, height: window.innerHeight },
        app.world.hexCenter,
        app.world.hexRadius,
      );
    }
  }

  app.matchManager.checkRoundEliminations(
    app.player,
    app.bot,
    app.world,
    app.arenaShrink,
    getHexCenter(),
  );
  app.particles.update(dt);
  adaptiveQuality.update();

  app.player.clearCastInputs();
  app.bot.clearCastInputs();
}
