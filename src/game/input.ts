import { Vector2D } from '../math/Vector2D';
import type { ExecutionOverrides } from '../types/triggerContext';
import type { GameApp } from './GameApp';
import { loadInputSettings, type InputSettings } from './inputSettings';
import { canCombatInput } from './matchFlow';

export type CastResult = 'ok' | 'no_ability' | 'zero_aim';

const MOVEMENT_AIM_RANGE = 400;
const POINTER_STALE_MS = 400;
const TOAST_COOLDOWN_MS = 800;

let lastToastMessage = '';
let lastToastAt = 0;

export function notifyCastBlocked(app: GameApp, message: string): void {
  const now = performance.now();
  if (message === lastToastMessage && now - lastToastAt < TOAST_COOLDOWN_MS) return;
  lastToastMessage = message;
  lastToastAt = now;
  app.matchHUD.showTransientToast(message);
}

export function executePlayerCast(
  app: GameApp,
  slotIndex: number,
  overrides: ExecutionOverrides = {},
  isChannelTick = false,
): CastResult {
  const caster = app.player;
  const ability = caster.getAbility(slotIndex);
  if (!ability) return 'no_ability';

  const aimDir = caster.aimTarget.sub(caster.pos);
  if (aimDir.magSq() < 0.01) return 'zero_aim';

  if (caster.isStealthed() && caster.stealthRevealOnCast) {
    caster.breakStealth();
  }

  const heading = aimDir.normalize();
  app.interpreter.executeAbility(
    ability,
    {
      origin: caster.pos.clone(),
      heading,
      aimPoint: caster.aimTarget.clone(),
      caster,
      depth: 0,
      chargeRatio: overrides.chargeRatio,
      comboStep: overrides.comboStep,
    },
    app.world,
    overrides,
  );
  caster.triggerSlotCooldown(slotIndex, isChannelTick);
  return 'ok';
}

function castCallback(app: GameApp) {
  return (slotIndex: number, overrides: ExecutionOverrides, isChannelTick: boolean) => {
    const result = executePlayerCast(app, slotIndex, overrides, isChannelTick);
    if (result === 'zero_aim') {
      notifyCastBlocked(app, 'Aim direction required');
    }
  };
}

function shouldConfirmAimOnRelease(slot: number, settings: InputSettings): boolean {
  if (slot === 0) return true;
  return settings.laptopModeEnabled;
}

function tryConfirmAimCast(app: GameApp, onCast: ReturnType<typeof castCallback>): void {
  const player = app.player;
  const aimingSlot = player.activeAimingState?.slotIndex;
  if (aimingSlot === undefined) return;

  if (!player.isSlotReady(aimingSlot)) {
    notifyCastBlocked(app, 'Ability on cooldown');
    player.cancelAiming();
    return;
  }

  const result = player.confirmAimCast(onCast);
  if (result === 'draw_too_short') {
    notifyCastBlocked(app, 'Draw a longer path');
  }
}

export function cancelPlayerAiming(app: GameApp): boolean {
  if (!app.player.activeAimingState) return false;
  app.player.cancelAiming();
  return true;
}

export function handleCastInput(app: GameApp, slot: number, isDown: boolean): void {
  if (slot < 0 || slot > 4) return;
  if (!canCombatInput(app)) return;

  const player = app.player;
  const onCast = castCallback(app);
  const inputSettings = loadInputSettings();

  if (isDown) {
    const aiming = player.activeAimingState;

    // Already holding this slot — ignore key-repeat / extra downs.
    if (aiming?.slotIndex === slot) return;

    // LMB confirms a held keyboard/RMB telegraph.
    if (slot === 0 && aiming) {
      tryConfirmAimCast(app, onCast);
      return;
    }

    // RMB cancels a telegraph that was started with a different control.
    if (slot === 1 && aiming) {
      player.cancelAiming();
      return;
    }

    // Switching to another aimed slot replaces the current telegraph.
    if (aiming) {
      player.cancelAiming();
    }

    const ability = player.getAbility(slot);
    if (ability && !player.isSlotReady(slot)) {
      const profile = ability.inputProfile ?? { mode: 'INSTANT' };
      if (
        profile.mode === 'INSTANT' &&
        ability.triggers.some((t) => t.trigger === 'ON_RECAST')
      ) {
        app.interpreter.dispatchRecast(player.id, ability.name, app.world);
        return;
      }
    }

    if (player.startAiming(slot)) return;

    player.setSlotInput(slot, isDown, onCast);
    return;
  }

  if (player.activeAimingState?.slotIndex === slot) {
    if (shouldConfirmAimOnRelease(slot, inputSettings)) {
      tryConfirmAimCast(app, onCast);
    } else {
      player.cancelAiming();
    }
  }

  player.setSlotInput(slot, isDown, onCast);
}

export function applyPlayerInput(app: GameApp): void {
  let mx = 0;
  let my = 0;
  if (app.keys.has('w')) my -= 1;
  if (app.keys.has('s')) my += 1;
  if (app.keys.has('a')) mx -= 1;
  if (app.keys.has('d')) mx += 1;
  const move = new Vector2D(mx, my);
  app.player.inputMove = move.magSq() > 0 ? move.normalize() : Vector2D.zero();
}

export function updatePlayerAimTarget(
  app: GameApp,
  mouseWorldPos: { x: number; y: number },
): void {
  app.lastPointerAimMs = performance.now();
  app.player.aimTarget = new Vector2D(mouseWorldPos.x, mouseWorldPos.y);
  if (app.player.activeAimingState) {
    app.player.updateAimTarget(mouseWorldPos);
  }
}

export function applyMovementAimFallback(app: GameApp): void {
  const settings = loadInputSettings();
  if (!settings.laptopModeEnabled) return;

  const player = app.player;
  if (player.inputMove.magSq() <= 0) return;

  const pointerStale = performance.now() - app.lastPointerAimMs > POINTER_STALE_MS;
  const pointerOffGame = !!player.activeAimingState && !app.camera.pointerOverGame;
  if (!pointerStale && !pointerOffGame) return;

  const aimWorld = player.pos.add(player.inputMove.scale(MOVEMENT_AIM_RANGE));
  updatePlayerAimTarget(app, { x: aimWorld.x, y: aimWorld.y });
}
