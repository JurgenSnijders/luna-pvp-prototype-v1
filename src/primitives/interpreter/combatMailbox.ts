import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { Player } from '../../entities/Player';
import type { ActionPayload, ActionTarget } from '../../types/schema';
import type { CombatEvent } from '../../types/combatEvents';
import type { TriggerContext } from '../../types/triggerContext';
import { Vector2D } from '../../math/Vector2D';
import type { Interpreter } from './Interpreter';
import { dispatchActions } from './triggers';

function actionHasExplicitTarget(action: ActionPayload): action is ActionPayload & { target?: ActionTarget } {
  return 'target' in action;
}

function isAllowedPassiveHookAction(action: ActionPayload): boolean {
  if (actionHasExplicitTarget(action)) {
    const mode = action.target;
    if (mode === 'TARGET') return false;
    if (mode === 'CASTER' || mode === 'SELF') return true;
  }
  // Actions without an explicit target (SPAWN_PROJECTILE, PLAY_VFX, etc.) are allowed.
  // Actions with implicit CASTER default must not use TARGET — handled above.
  if (action.type === 'SPAWN_CONSTRAINT') {
    if (action.target === 'TARGET' || action.source === 'TARGET') return false;
  }
  if (action.type === 'CAST_CHILD_PAYLOAD' && action.target === 'TARGET') return false;
  return true;
}

function buildHookContext(player: Player, event: CombatEvent): TriggerContext {
  return {
    origin: new Vector2D(event.pos.x, event.pos.y),
    heading: Vector2D.fromAngle(player.facingAngle),
    caster: player,
    depth: 0,
  };
}

export function drainCombatMailbox(interp: Interpreter, world: PhysicsWorld): void {
  const events = world.pendingCombatEvents;
  world.pendingCombatEvents = [];

  for (const event of events) {
    const actor = world.getEntityById(event.actorId);
    if (!actor || actor.isDead || !(actor instanceof Player)) continue;

    for (const hook of actor.passiveHooks) {
      if (hook.on !== event.type) continue;

      const allowed = hook.actions.filter((a) => isAllowedPassiveHookAction(a));
      if (allowed.length === 0) continue;

      const ctx = buildHookContext(actor, event);
      dispatchActions(interp, allowed, ctx, world);
    }
  }
}
