import { TRIGGER_TYPES } from '../constants';
import type { ActionPayload, TriggerNode, TriggerType } from '../types';
import { validateActionPayload } from './action';
import { validateConditionNode } from './condition';
import { isNumber, isObject, isString, type ValidationIssue, validationFail } from './helpers';

export function validateTriggerNode(
  value: unknown,
  depth = 0,
  issues?: ValidationIssue[],
  path = 'trigger',
): TriggerNode | null {
  if (!isObject(value)) return validationFail(issues, path, 'expected object');
  if (!isString(value.trigger) || !TRIGGER_TYPES.has(value.trigger)) {
    return validationFail(issues, `${path}.trigger`, 'invalid trigger type');
  }
  if (!Array.isArray(value.actions)) {
    return validationFail(issues, `${path}.actions`, 'actions must be an array');
  }

  const actions: ActionPayload[] = [];
  for (let i = 0; i < value.actions.length; i++) {
    const actionPath = `${path}.actions[${i}]`;
    const validated = validateActionPayload(value.actions[i], depth, issues, actionPath);
    if (!validated) return null;
    actions.push(validated);
  }

  const node: TriggerNode = {
    trigger: value.trigger as TriggerType,
    actions,
  };

  if (value.tickIntervalMs !== undefined) {
    if (!isNumber(value.tickIntervalMs)) {
      return validationFail(issues, `${path}.tickIntervalMs`, 'invalid tickIntervalMs');
    }
    node.tickIntervalMs = value.tickIntervalMs;
  }

  if (value.triggerDistance !== undefined) {
    if (!isNumber(value.triggerDistance) || value.triggerDistance <= 0) {
      return validationFail(issues, `${path}.triggerDistance`, 'invalid triggerDistance');
    }
    node.triggerDistance = value.triggerDistance;
  }

  if (value.fireOnHitDeath !== undefined) {
    if (typeof value.fireOnHitDeath !== 'boolean') {
      return validationFail(issues, `${path}.fireOnHitDeath`, 'invalid fireOnHitDeath');
    }
    node.fireOnHitDeath = value.fireOnHitDeath;
  }

  if (value.conditions !== undefined) {
    if (!Array.isArray(value.conditions)) {
      return validationFail(issues, `${path}.conditions`, 'conditions must be an array');
    }
    const conditions = [];
    for (const c of value.conditions) {
      const validated = validateConditionNode(c);
      if (validated) conditions.push(validated);
    }
    if (conditions.length > 0) node.conditions = conditions;
  }

  if (value.ifFalseActions !== undefined) {
    if (!Array.isArray(value.ifFalseActions)) {
      return validationFail(issues, `${path}.ifFalseActions`, 'ifFalseActions must be an array');
    }
    const ifFalseActions: ActionPayload[] = [];
    for (let i = 0; i < value.ifFalseActions.length; i++) {
      const actionPath = `${path}.ifFalseActions[${i}]`;
      const validated = validateActionPayload(value.ifFalseActions[i], depth, issues, actionPath);
      if (!validated) return null;
      ifFalseActions.push(validated);
    }
    if (ifFalseActions.length > 0) node.ifFalseActions = ifFalseActions;
  }

  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) {
      return validationFail(issues, `${path}.children`, 'children must be an array');
    }
    const children: TriggerNode[] = [];
    for (let i = 0; i < value.children.length; i++) {
      const childPath = `${path}.children[${i}]`;
      const validated = validateTriggerNode(value.children[i], depth, issues, childPath);
      if (!validated) return null;
      children.push(validated);
    }
    node.children = children;
  }

  return node;
}
