import type { AbilitySchema } from './schema';
import { validateAbilitySchema } from './schema';

export type CardRarity = 'COMMON' | 'RARE' | 'EPIC' | 'CHAOTIC';
export type CardType = 'ACTIVE_ABILITY' | 'PASSIVE_UPGRADE';
export type PassiveStat =
  | 'MOVE_SPEED'
  | 'ACCELERATION'
  | 'LINEAR_DRAG'
  | 'MASS'
  | 'KNOCKBACK_RESISTANCE'
  | 'COOLDOWN_REDUCTION_PCT';
export type PassiveOp = 'ADD' | 'MULTIPLY';

export interface PassiveModifierPayload {
  stat: PassiveStat;
  op: PassiveOp;
  value: number;
}

export interface DraftCard {
  id: string;
  title: string;
  tagline: string;
  description: string;
  rarity: CardRarity;
  type: CardType;
  abilityPayload?: AbilitySchema;
  passivePayload?: PassiveModifierPayload[];
  budgetCost: number;
}

export type ActionSlotKey = 'LMB' | 'RMB' | 'Q' | 'E' | 'SPACE';
export type SlotType = ActionSlotKey | 'PASSIVE';

export const ACTION_SLOT_KEYS: readonly ActionSlotKey[] = ['LMB', 'RMB', 'Q', 'E', 'SPACE'];
export const ACTION_SLOT_INDEX: Record<ActionSlotKey, 0 | 1 | 2 | 3 | 4> = {
  LMB: 0,
  RMB: 1,
  Q: 2,
  E: 3,
  SPACE: 4,
};

export interface DraftSelection {
  card: DraftCard;
  slot: SlotType;
}

export interface PlayerLoadout {
  abilities: [
    AbilitySchema | null,
    AbilitySchema | null,
    AbilitySchema | null,
    AbilitySchema | null,
    AbilitySchema | null,
  ];
  passives: PassiveModifierPayload[];
}

const RARITIES: ReadonlySet<string> = new Set(['COMMON', 'RARE', 'EPIC', 'CHAOTIC']);
const CARD_TYPES: ReadonlySet<string> = new Set(['ACTIVE_ABILITY', 'PASSIVE_UPGRADE']);
const PASSIVE_STATS: ReadonlySet<string> = new Set([
  'MOVE_SPEED',
  'ACCELERATION',
  'LINEAR_DRAG',
  'MASS',
  'KNOCKBACK_RESISTANCE',
  'COOLDOWN_REDUCTION_PCT',
]);
const PASSIVE_OPS: ReadonlySet<string> = new Set(['ADD', 'MULTIPLY']);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function validatePassiveModifier(val: unknown): PassiveModifierPayload | null {
  if (!isObject(val)) return null;
  if (!isString(val.stat) || !PASSIVE_STATS.has(val.stat)) return null;
  if (!isString(val.op) || !PASSIVE_OPS.has(val.op)) return null;
  if (!isNumber(val.value)) return null;
  return {
    stat: val.stat as PassiveStat,
    op: val.op as PassiveOp,
    value: val.value,
  };
}

export function validateDraftCard(val: unknown): DraftCard | null {
  if (!isObject(val)) return null;
  if (!isString(val.id) || !isString(val.title) || !isString(val.tagline)) return null;
  if (!isString(val.description)) return null;
  if (!isString(val.rarity) || !RARITIES.has(val.rarity)) return null;
  if (!isString(val.type) || !CARD_TYPES.has(val.type)) return null;
  if (!isNumber(val.budgetCost)) return null;

  const card: DraftCard = {
    id: val.id,
    title: val.title,
    tagline: val.tagline,
    description: val.description,
    rarity: val.rarity as CardRarity,
    type: val.type as CardType,
    budgetCost: val.budgetCost,
  };

  if (val.type === 'ACTIVE_ABILITY') {
    if (val.abilityPayload === undefined) return null;
    const ability = validateAbilitySchema(val.abilityPayload);
    if (!ability) return null;
    card.abilityPayload = ability;
  }

  if (val.type === 'PASSIVE_UPGRADE') {
    if (!Array.isArray(val.passivePayload)) return null;
    const passives: PassiveModifierPayload[] = [];
    for (const p of val.passivePayload) {
      const mod = validatePassiveModifier(p);
      if (!mod) return null;
      passives.push(mod);
    }
    card.passivePayload = passives;
  }

  return card;
}

export function validateDraftCards(val: unknown): DraftCard[] | null {
  let cards: unknown[];

  if (Array.isArray(val)) {
    cards = val;
  } else if (isObject(val) && Array.isArray(val.cards)) {
    cards = val.cards;
  } else {
    return null;
  }

  if (cards.length !== 3) return null;

  const result: DraftCard[] = [];
  for (const c of cards) {
    const card = validateDraftCard(c);
    if (!card) return null;
    result.push(card);
  }
  return result;
}
