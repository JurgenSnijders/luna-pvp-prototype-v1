import type { ActionPayload } from './schema';

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
