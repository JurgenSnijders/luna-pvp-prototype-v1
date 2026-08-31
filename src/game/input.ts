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

export function handleCastInput(app: GameApp, slot: number, isDown: boolean): void {
  if (slot < 0 || slot > 4) return;
  if (!canCombatInput(app)) return;

  if (isDown) {
    const ability = app.player.getAbility(slot);
    if (ability && !app.player.isSlotReady(slot)) {
      const profile = ability.inputProfile ?? { mode: 'INSTANT' };
      if (
        profile.mode === 'INSTANT' &&
        ability.triggers.some((t) => t.trigger === 'ON_RECAST')
      ) {
        app.interpreter.dispatchRecast(app.player.id, ability.name, app.world);
        return;
      }
    }
  }

  app.player.setSlotInput(slot, isDown, (slotIndex, overrides, isChannelTick) =>
    executePlayerCast(app, slotIndex, overrides, isChannelTick),
  );
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
