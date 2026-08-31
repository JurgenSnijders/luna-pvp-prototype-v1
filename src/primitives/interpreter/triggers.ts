import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { ActionPayload, TriggerNode } from '../../types/schema';
import type { TriggerContext } from '../../types/triggerContext';
import type { Interpreter } from './Interpreter';
import { dispatchAction } from './actions';
import { evaluateConditions } from './conditions';
import { getActionPriority } from './helpers';

export function dispatchActions(
  interp: Interpreter,
  actions: ActionPayload[],
  ctx: TriggerContext,
  world: PhysicsWorld,
): void {
  for (const action of actions) {
    dispatchAction(interp, action, ctx, world);
  }
}

export function dispatchTriggerNode(
  interp: Interpreter,
  node: TriggerNode,
  ctx: TriggerContext,
  world: PhysicsWorld,
): void {
  let passed = true;
  if (node.conditions && node.conditions.length > 0) {
    passed = evaluateConditions(node.conditions, ctx, world);
  }

  const actionsToRun = passed ? node.actions : (node.ifFalseActions ?? []);
  const sortedActions = [...actionsToRun].sort(
    (a, b) => getActionPriority(a.type) - getActionPriority(b.type),
  );
  dispatchActions(interp, sortedActions, ctx, world);

  if (node.children) {
    for (const child of node.children) {
      dispatchTriggerNode(interp, child, ctx, world);
    }
  }
}
