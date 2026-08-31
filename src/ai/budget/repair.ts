import type { AbilitySchema, ActionPayload, ApplyImpulseAction, TriggerNode } from '../../types/schema';

function repairImpulseSemantics(
  action: ApplyImpulseAction,
  desc: string,
): ApplyImpulseAction {
  if (action.directionMode) return action;

  const patched = { ...action };
  if (/\b(pull|draw|harpoon|hook)\b/.test(desc)) {
    patched.directionMode = 'TOWARDS_CASTER';
    if (!patched.target) patched.target = 'TARGET';
  } else if (/\b(push|repel|knockback)\b/.test(desc)) {
    patched.directionMode = 'AWAY_FROM_ORIGIN';
    if (!patched.target) patched.target = 'TARGET';
  }
  return patched;
}

function repairActionsSemantics(actions: ActionPayload[], desc: string): ActionPayload[] {
  return actions.map((action) => {
    if (action.type === 'APPLY_IMPULSE') {
      return repairImpulseSemantics(action, desc);
    }
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      return {
        ...action,
        triggers: repairTriggersSemantics(action.triggers, desc),
      };
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      return {
        ...action,
        payload: repairAbilitySemantics(action.payload, desc),
      };
    }
    return action;
  });
}

function repairTriggersSemantics(nodes: TriggerNode[], desc: string): TriggerNode[] {
  return nodes.map((node) => ({
    ...node,
    actions: repairActionsSemantics(node.actions, desc),
    ifFalseActions: node.ifFalseActions
      ? repairActionsSemantics(node.ifFalseActions, desc)
      : undefined,
    children: node.children ? repairTriggersSemantics(node.children, desc) : undefined,
  }));
}

/** Patches missing impulse direction modes based on prompt keywords. */
export function repairAbilitySemantics(
  payload: AbilitySchema,
  description = '',
): AbilitySchema {
  const desc = description.toLowerCase();
  const cloned = structuredClone(payload);
  cloned.triggers = repairTriggersSemantics(cloned.triggers, desc);
  return cloned;
}
