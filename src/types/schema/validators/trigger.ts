import { TRIGGER_TYPES } from '../constants';
import type { ActionPayload, TriggerNode, TriggerType } from '../types';
import { validateActionPayload } from './action';
import { validateConditionNode } from './condition';
import { isNumber, isObject, isString } from './helpers';

export function validateTriggerNode(value: unknown, depth = 0): TriggerNode | null {
  if (!isObject(value)) return null;
  if (!isString(value.trigger) || !TRIGGER_TYPES.has(value.trigger)) return null;
  if (!Array.isArray(value.actions)) return null;

  const actions: ActionPayload[] = [];
  for (const action of value.actions) {
    const validated = validateActionPayload(action, depth);
    if (!validated) return null;
    actions.push(validated);
  }

  const node: TriggerNode = {
    trigger: value.trigger as TriggerType,
    actions,
  };

  if (value.tickIntervalMs !== undefined) {
    if (!isNumber(value.tickIntervalMs)) return null;
    node.tickIntervalMs = value.tickIntervalMs;
  }

  if (value.triggerDistance !== undefined) {
    if (!isNumber(value.triggerDistance) || value.triggerDistance <= 0) return null;
    node.triggerDistance = value.triggerDistance;
  }

  if (value.fireOnHitDeath !== undefined) {
    if (typeof value.fireOnHitDeath !== 'boolean') return null;
    node.fireOnHitDeath = value.fireOnHitDeath;
  }

  if (value.conditions !== undefined) {
    if (!Array.isArray(value.conditions)) return null;
    const conditions = [];
    for (const c of value.conditions) {
      const validated = validateConditionNode(c);
      if (validated) conditions.push(validated);
    }
    if (conditions.length > 0) node.conditions = conditions;
  }

  if (value.ifFalseActions !== undefined) {
    if (!Array.isArray(value.ifFalseActions)) return null;
    const ifFalseActions: ActionPayload[] = [];
    for (const action of value.ifFalseActions) {
      const validated = validateActionPayload(action, depth);
      if (!validated) return null;
      ifFalseActions.push(validated);
    }
    if (ifFalseActions.length > 0) node.ifFalseActions = ifFalseActions;
  }

  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) return null;
    const children: TriggerNode[] = [];
    for (const child of value.children) {
      const validated = validateTriggerNode(child, depth);
      if (!validated) return null;
      children.push(validated);
    }
    node.children = children;
  }

  return node;
}
