import { Vector2D } from '../math/Vector2D';
import type { ExecutionOverrides } from '../types/triggerContext';
import type { GameApp } from './GameApp';
import { canCombatInput } from './matchFlow';

export function executePlayerCast(
  app: GameApp,
  slotIndex: number,
  overrides: ExecutionOverrides = {},
  isChannelTick = false,
): void {
  const caster = app.player;
  const ability = caster.getAbility(slotIndex);
  if (!ability) return;

  const aimDir = caster.aimTarget.sub(caster.pos);
  if (aimDir.magSq() < 0.01) return;

  if (caster.isStealthed() && caster.stealthRevealOnCast) {
    caster.breakStealth();
  }

  const heading = aimDir.normalize();
  app.interpreter.executeAbility(
    ability,
    {
      origin: caster.pos.clone(),
      heading,
      caster,
      depth: 0,
      chargeRatio: overrides.chargeRatio,
      comboStep: overrides.comboStep,
    },
    app.world,
    overrides,
  );
  caster.triggerSlotCooldown(slotIndex, isChannelTick);
}

function castCallback(app: GameApp) {
  return (slotIndex: number, overrides: ExecutionOverrides, isChannelTick: boolean) =>
    executePlayerCast(app, slotIndex, overrides, isChannelTick);
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

  if (isDown) {
    const aiming = player.activeAimingState;

    // Already holding this slot — ignore key-repeat / extra downs.
    if (aiming?.slotIndex === slot) return;

    // LMB confirms a held keyboard/RMB telegraph.
    if (slot === 0 && aiming) {
      if (player.isSlotReady(aiming.slotIndex)) {
        player.confirmAimCast(onCast);
      }
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

  // Release of the held activation dismisses the telegraph without casting,
  // except LMB: the same button is the confirm control, so release fires.
  if (player.activeAimingState?.slotIndex === slot) {
    if (slot === 0) {
      if (player.isSlotReady(slot)) {
        player.confirmAimCast(onCast);
      } else {
        player.cancelAiming();
      }
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
  app.player.aimTarget = new Vector2D(mouseWorldPos.x, mouseWorldPos.y);
  if (app.player.activeAimingState) {
    app.player.updateAimTarget(mouseWorldPos);
  }
}
