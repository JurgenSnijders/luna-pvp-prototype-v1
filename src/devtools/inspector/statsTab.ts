import {
  MAX_COMBATANT_RADIUS,
  MAX_HEX_RADIUS,
  MIN_COMBATANT_RADIUS,
  MIN_HEX_RADIUS,
} from '../../engine/PhysicsWorld';
import { Player } from '../../entities/Player';
import {
  ARENA_HEX_RADIUS_KEY,
  COMBATANT_RADIUS_KEY,
  COOLDOWN_SCALE_KEY,
  GLOBAL_COOLDOWN_MS_KEY,
  MAX_COOLDOWN_SCALE,
  MAX_GLOBAL_COOLDOWN_MS,
  MIN_COOLDOWN_SCALE,
  MIN_GLOBAL_COOLDOWN_MS,
  getStoredCooldownScale,
  getStoredGlobalCooldownMs,
} from '../../game/settings';
import type { InspectorContext } from '../InspectorUI';
import { sliderRow } from './domHelpers';

export function buildStatsTab(parent: HTMLElement, ctx: InspectorContext): void {
  const { world, arenaShrink } = ctx;
  const arenaSection = document.createElement('div');
  arenaSection.style.cssText =
    'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
  const arenaTitle = document.createElement('div');
  arenaTitle.textContent = 'Arena';
  arenaTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:12px;';
  arenaSection.appendChild(arenaTitle);
  sliderRow(
    arenaSection,
    'Arena Hex Radius',
    MIN_HEX_RADIUS,
    MAX_HEX_RADIUS,
    10,
    () => world.getBaseHexRadius(),
    (v) => {
      world.setBaseHexRadius(v);
      arenaShrink?.resize(v);
      localStorage.setItem(ARENA_HEX_RADIUS_KEY, String(v));
    },
    'px',
  );
  sliderRow(
    arenaSection,
    'Combatant Radius',
    MIN_COMBATANT_RADIUS,
    MAX_COMBATANT_RADIUS,
    1,
    () => world.getCombatantRadius(),
    (v) => {
      world.setCombatantRadius(v);
      localStorage.setItem(COMBATANT_RADIUS_KEY, String(v));
    },
    'px',
  );
  parent.appendChild(arenaSection);

  const pacingSection = document.createElement('div');
  pacingSection.style.cssText =
    'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
  const pacingTitle = document.createElement('div');
  pacingTitle.textContent = 'Combat Pacing';
  pacingTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:12px;';
  pacingSection.appendChild(pacingTitle);

  Player.globalCooldownScale = getStoredCooldownScale();
  Player.globalCooldownDurationMs = getStoredGlobalCooldownMs();

  sliderRow(
    pacingSection,
    'Cooldown Scale',
    MIN_COOLDOWN_SCALE,
    MAX_COOLDOWN_SCALE,
    0.1,
    () => Player.globalCooldownScale,
    (v) => {
      Player.globalCooldownScale = v;
      localStorage.setItem(COOLDOWN_SCALE_KEY, String(v));
    },
    'x',
  );
  sliderRow(
    pacingSection,
    'Global Cooldown',
    MIN_GLOBAL_COOLDOWN_MS,
    MAX_GLOBAL_COOLDOWN_MS,
    50,
    () => Player.globalCooldownDurationMs,
    (v) => {
      Player.globalCooldownDurationMs = v;
      localStorage.setItem(GLOBAL_COOLDOWN_MS_KEY, String(v));
    },
    'ms',
  );
  parent.appendChild(pacingSection);

  const p = ctx.player;
  sliderRow(parent, 'Move Speed', 50, 600, 10, () => p.moveSpeed, (v) => {
    p.moveSpeed = v;
  });
  sliderRow(parent, 'Acceleration', 200, 3000, 50, () => p.baseAcceleration, (v) => {
    p.baseAcceleration = v;
  });
  sliderRow(parent, 'Linear Drag', 0, 10, 0.1, () => p.baseLinearDrag, (v) => {
    p.baseLinearDrag = v;
    p.linearDrag = v;
  });
  sliderRow(parent, 'Mass', 0.1, 5, 0.1, () => p.mass, (v) => {
    p.mass = v;
  });
  sliderRow(parent, 'Instability %', 0, 400, 1, () => p.instabilityPct, (v) => {
    p.instabilityPct = v;
  });
}
