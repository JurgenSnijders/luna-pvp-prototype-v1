import type { ActionPayload, SpellArchetype, TriggerNode } from './schema';

export type CombatEventType = 'PARRY_SUCCEEDED' | 'ENTITY_RAMMED' | 'ENTITY_SLAMMED';

export const COMBAT_EVENT_TYPES: ReadonlySet<string> = new Set([
  'PARRY_SUCCEEDED',
  'ENTITY_RAMMED',
  'ENTITY_SLAMMED',
]);

export interface CombatEvent {
  type: CombatEventType;
  actorId: string;
  otherId?: string;
  pos: { x: number; y: number };
  magnitude: number;
}

export interface PassiveHook {
  on: CombatEventType;
  actions: ActionPayload[];
}

export type SpliceOperation =
  | { type: 'APPEND_TRIGGER'; node: TriggerNode }
  | { type: 'ADD_BOUNCE'; amount: number }
  | { type: 'ADD_PIERCE'; amount: number };

export const SPLICE_OPERATION_TYPES: ReadonlySet<string> = new Set([
  'APPEND_TRIGGER',
  'ADD_BOUNCE',
  'ADD_PIERCE',
]);

export interface PassiveSplice {
  operation: SpliceOperation;
  targetArchetype?: SpellArchetype;
}
