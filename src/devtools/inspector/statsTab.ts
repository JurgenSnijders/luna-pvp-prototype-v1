import {
  MAX_COMBATANT_RADIUS,
  MAX_HEX_RADIUS,
  MIN_COMBATANT_RADIUS,
  MIN_HEX_RADIUS,
} from '../../engine/PhysicsWorld';
import { Entity } from '../../entities/Entity';
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
  KNOCKBACK_SCALE_REF_KEY,
  MAX_INSTABILITY_KEY,
  MAX_COOLDOWN_SCALE,
  MAX_GLOBAL_COOLDOWN_MS,
  MAX_KNOCKBACK_SCALE_REF,
  MAX_MAX_INSTABILITY,
  MIN_COOLDOWN_SCALE,
  MIN_GLOBAL_COOLDOWN_MS,
  MIN_KNOCKBACK_SCALE_REF,
  MIN_MAX_INSTABILITY,
  applyInstabilitySettings,
  clampCombatantInstability,
  getStoredCooldownScale,
  getStoredGlobalCooldownMs,
} from '../../game/settings';
import type { InspectorContext } from '../InspectorUI';
import { buttonStyle, helperText, numberRow, numberSliderRow, sectionDivider, sectionHeader, sliderRow } from './domHelpers';
import { MIN_PANEL_HEIGHT, MIN_PANEL_WIDTH } from './floatingPanel';

function applyProfileToCombatants(
  profile: MovementProfile,
  ctx: InspectorContext,
): void {
  ctx.player.applyMovementProfile(profile);
  ctx.bot?.applyMovementProfile(profile);
  ctx.world.collisionRestitution = profile.restitution;
}

export function buildStatsTab(parent: HTMLElement, ctx: InspectorContext): void {
  const layoutApi = ctx.inspectorLayout;
  if (layoutApi) {
    const panelSection = document.createElement('div');
    panelSection.style.cssText = sectionDivider();
    panelSection.appendChild(sectionHeader('Inspector Panel'));
    helperText(
      panelSection,
      'Drag the DEVTOOLS title to move, or type X / Y / Width / Height here. Resize from any edge or corner.',
    );
    const refreshes: Array<() => void> = [];
    const bindLayoutField = (
      label: string,
      key: 'x' | 'y' | 'w' | 'h',
      min: number,
      max: number,
      unit: string,
    ): void => {
      const { refresh } = numberRow(
        panelSection,
        label,
        min,
        max,
        1,
        () => layoutApi.get()[key],
        (v) => layoutApi.set({ [key]: v }),
        unit,
      );
      refreshes.push(refresh);
    };
    bindLayoutField('Panel X', 'x', 0, window.innerWidth, 'px');
    bindLayoutField('Panel Y', 'y', 0, window.innerHeight, 'px');
    bindLayoutField('Panel Width', 'w', MIN_PANEL_WIDTH, window.innerWidth, 'px');
    bindLayoutField('Panel Height', 'h', MIN_PANEL_HEIGHT, window.innerHeight, 'px');
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset Layout';
    resetBtn.style.cssText = buttonStyle(false);
    resetBtn.onclick = () => layoutApi.reset();
    panelSection.appendChild(resetBtn);
    layoutApi.subscribe(() => {
      if (!panelSection.isConnected) return;
      for (const refresh of refreshes) refresh();
    });
    parent.appendChild(panelSection);
  }

  const { world, arenaShrink } = ctx;
  const arenaSection = document.createElement('div');
  arenaSection.style.cssText = sectionDivider();
  const arenaTitle = sectionHeader('Arena');
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
  pacingSection.style.cssText = sectionDivider();
  pacingSection.appendChild(sectionHeader('Combat Pacing'));

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
  movementSection.style.cssText = sectionDivider();
  movementSection.appendChild(sectionHeader('Movement'));

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

  const instabilitySection = document.createElement('div');
  instabilitySection.style.cssText = sectionDivider();
  instabilitySection.appendChild(sectionHeader('Instability'));
  helperText(
    instabilitySection,
    'Higher instability amplifies knockback. Tune the cap and ramp separately.',
  );

  applyInstabilitySettings();

  const p = ctx.player;
  let instabSliderRefresh: (() => void) | undefined;

  numberSliderRow(
    instabilitySection,
    'Max Instability',
    MIN_MAX_INSTABILITY,
    MAX_MAX_INSTABILITY,
    10,
    () => Entity.maxInstability,
    (v) => {
      Entity.maxInstability = v;
      localStorage.setItem(MAX_INSTABILITY_KEY, String(v));
      clampCombatantInstability(ctx.world);
      instabSliderRefresh?.();
    },
  );
  helperText(
    instabilitySection,
    'Meter ceiling for all combatants. Higher max = stronger knockback at the top.',
  );

  numberSliderRow(
    instabilitySection,
    'Knockback Scale Ref',
    MIN_KNOCKBACK_SCALE_REF,
    MAX_KNOCKBACK_SCALE_REF,
    10,
    () => Entity.knockbackScaleRef,
    (v) => {
      Entity.knockbackScaleRef = v;
      localStorage.setItem(KNOCKBACK_SCALE_REF_KEY, String(v));
    },
  );
  helperText(
    instabilitySection,
    'Knockback ramp speed. Higher ref = same % hits softer; takes longer to build force.',
  );

  const instabPctControl = sliderRow(
    instabilitySection,
    'Instability %',
    0,
    Entity.maxInstability,
    1,
    () => p.instabilityPct,
    (v) => {
      p.instabilityPct = Math.min(Entity.maxInstability, Math.max(0, v));
    },
  );
  instabSliderRefresh = () => {
    instabPctControl.refresh();
    instabPctControl.setMax(Entity.maxInstability);
  };
  instabSliderRefresh();

  helperText(instabilitySection, 'Debug: set your local player instability % directly.');

  parent.appendChild(instabilitySection);
}
