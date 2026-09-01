import {
  MAX_COMBATANT_RADIUS,
  MAX_HEX_RADIUS,
  MIN_COMBATANT_RADIUS,
  MIN_HEX_RADIUS,
} from '../../engine/PhysicsWorld';
import { Player } from '../../entities/Player';
import {
  applyMovementPreset,
  getMovementPresetNames,
  getMovementProfile,
  saveMovementProfile,
  type MovementPresetName,
  type MovementProfile,
} from '../movementSettings';
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
import { buttonStyle, sliderRow } from './domHelpers';

function applyProfileToCombatants(
  profile: MovementProfile,
  ctx: InspectorContext,
): void {
  ctx.player.applyMovementProfile(profile);
  ctx.bot?.applyMovementProfile(profile);
  ctx.world.collisionRestitution = profile.restitution;
}

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

  const movementSection = document.createElement('div');
  movementSection.style.cssText =
    'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
  const movementTitle = document.createElement('div');
  movementTitle.textContent = 'Movement';
  movementTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:12px;';
  movementSection.appendChild(movementTitle);

  let profile = { ...getMovementProfile() };
  const sliderRefreshes: Array<() => void> = [];

  const commitProfile = (): void => {
    saveMovementProfile(profile);
    applyProfileToCombatants(profile, ctx);
    for (const refresh of sliderRefreshes) refresh();
  };

  const bindProfileSlider = (
    label: string,
    min: number,
    max: number,
    step: number,
    key: keyof MovementProfile,
    unit = '',
  ): void => {
    const { refresh } = sliderRow(
      movementSection,
      label,
      min,
      max,
      step,
      () => profile[key] as number,
      (v) => {
        profile = { ...profile, [key]: v };
        commitProfile();
      },
      unit,
    );
    sliderRefreshes.push(refresh);
  };

  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;';
  for (const name of getMovementPresetNames()) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = buttonStyle(false);
    btn.onclick = () => {
      profile = applyMovementPreset(name as MovementPresetName);
      commitProfile();
      for (const b of presetRow.querySelectorAll('button')) {
        (b as HTMLButtonElement).style.cssText = buttonStyle(b.textContent === name);
      }
    };
    presetRow.appendChild(btn);
  }
  movementSection.appendChild(presetRow);

  bindProfileSlider('Move Speed', 50, 600, 10, 'moveSpeed');
  bindProfileSlider('Max Speed', 100, 2000, 10, 'maxSpeed');
  bindProfileSlider('Accel', 100, 6000, 50, 'accel');
  bindProfileSlider('Brake Accel', 100, 6000, 50, 'brakeAccel');
  bindProfileSlider('Turn Accel', 50, 3000, 50, 'turnAccel');
  bindProfileSlider('Friction', 0, 30, 0.1, 'friction');
  bindProfileSlider('Linear Drag', 0, 15, 0.1, 'linearDrag');
  bindProfileSlider('Quadratic Drag', 0, 0.05, 0.001, 'quadraticDrag');
  bindProfileSlider('Mass', 0.1, 5, 0.1, 'mass');
  bindProfileSlider('Knockback Resist', 0, 0.75, 0.05, 'knockbackResistance');
  bindProfileSlider('Restitution', 0, 1.2, 0.05, 'restitution');
  bindProfileSlider('Stop Threshold', 0, 20, 1, 'stopThreshold', 'px/s');
  bindProfileSlider('Input Smoothing', 0, 300, 10, 'inputSmoothingMs', 'ms');

  parent.appendChild(movementSection);

  const p = ctx.player;
  sliderRow(parent, 'Instability %', 0, 400, 1, () => p.instabilityPct, (v) => {
    p.instabilityPct = v;
  });
}
