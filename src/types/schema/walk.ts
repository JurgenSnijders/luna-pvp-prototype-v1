import type { AbilitySchema, ActionPayload, TriggerNode } from './types';

export type ActionHost = 'ROOT' | 'PROJECTILE' | 'ACTOR' | 'CHILD_PAYLOAD';

export interface ActionVisit {
  action: ActionPayload;
  node: TriggerNode | null;
  host: ActionHost;
  depth: number;
  /** false when reached via node.ifFalseActions */
  isPrimary: boolean;
}

export type ActionVisitor = (v: ActionVisit) => void;

export function walkActionList(
  actions: ActionPayload[],
  visit: ActionVisitor,
  node: TriggerNode | null = null,
  host: ActionHost = 'ROOT',
  depth = 0,
  isPrimary = true,
): void {
  for (const action of actions) {
    visit({ action, node, host, depth, isPrimary });
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      walkTriggerNodes(action.triggers, visit, 'PROJECTILE', depth + 1);
    }
    if (action.type === 'SPAWN_ACTOR' && action.actor.triggers) {
      walkTriggerNodes(action.actor.triggers, visit, 'ACTOR', depth + 1);
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      walkTriggerNodes(action.payload.triggers ?? [], visit, 'CHILD_PAYLOAD', depth + 1);
    }
  }
}

export function walkTriggerNodes(
  nodes: TriggerNode[],
  visit: ActionVisitor,
  host: ActionHost = 'ROOT',
  depth = 0,
): void {
  for (const node of nodes) {
    walkActionList(node.actions, visit, node, host, depth, true);
    if (node.ifFalseActions) {
      walkActionList(node.ifFalseActions, visit, node, host, depth, false);
    }
    if (node.children) walkTriggerNodes(node.children, visit, host, depth);
  }
}

export function walkActions(schema: AbilitySchema, visit: ActionVisitor): void {
  walkTriggerNodes(schema.triggers ?? [], visit, 'ROOT', 0);
}
