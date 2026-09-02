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

export type SkillCategory = 'PRIMARY' | 'SECONDARY' | 'UTILITY' | 'ULTIMATE' | 'MOBILITY';
export type SynthesisMode = 'FORGE_NEW' | 'EVOLVE_EXISTING';

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
  category?: SkillCategory;
  evolutionDiff?: string[];
}

export type ActionSlotKey = 'LMB' | 'RMB' | 'Q' | 'E' | 'SPACE';
export type LoadoutMap = Record<ActionSlotKey, string | null>;
export type SlotType = ActionSlotKey | 'PASSIVE';

export const ACTION_SLOT_KEYS: readonly ActionSlotKey[] = ['LMB', 'RMB', 'Q', 'E', 'SPACE'];
export const ACTION_SLOT_INDEX: Record<ActionSlotKey, 0 | 1 | 2 | 3 | 4> = {
  LMB: 0,
  RMB: 1,
  Q: 2,
  E: 3,
  SPACE: 4,
};

export const CATEGORY_SLOT_MAP: Record<SkillCategory, ActionSlotKey> = {
  PRIMARY: 'LMB',
  SECONDARY: 'RMB',
  UTILITY: 'Q',
  ULTIMATE: 'E',
  MOBILITY: 'SPACE',
};

export const SLOT_CATEGORY_MAP: Record<ActionSlotKey, SkillCategory> = {
  LMB: 'PRIMARY',
  RMB: 'SECONDARY',
  Q: 'UTILITY',
  E: 'ULTIMATE',
  SPACE: 'MOBILITY',
};

export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  'PRIMARY',
  'SECONDARY',
  'UTILITY',
  'ULTIMATE',
  'MOBILITY',
];

export interface EvolutionContext {
  baseAbility: AbilitySchema;
  slotKey: ActionSlotKey;
  category: SkillCategory;
}

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  PRIMARY: 'Primary',
  SECONDARY: 'Secondary',
  UTILITY: 'Utility',
  ULTIMATE: 'Ultimate',
  MOBILITY: 'Mobility',
};

export function getCategoryLabel(cat: SkillCategory): string {
  return CATEGORY_LABELS[cat];
}

export function getSlotForCategory(cat: SkillCategory): ActionSlotKey {
  return CATEGORY_SLOT_MAP[cat];
}

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

  // Stage 1 (metadata-only) responses use "name" instead of "title".
  const title = isString(val.title) ? val.title : isString(val.name) ? val.name : null;
  if (!isString(val.id) || !title || !isString(val.tagline)) return null;
  if (!isString(val.description)) return null;

  // rarity/type/budgetCost are optional for lightweight metadata cards — default them
  // instead of rejecting, since physics/scoring data may not exist yet (Stage 1 draft).
  const rarity: CardRarity =
    isString(val.rarity) && RARITIES.has(val.rarity) ? (val.rarity as CardRarity) : 'COMMON';
  const type: CardType =
    isString(val.type) && CARD_TYPES.has(val.type) ? (val.type as CardType) : 'ACTIVE_ABILITY';
  const budgetCost = isNumber(val.budgetCost) ? val.budgetCost : 0;

  const card: DraftCard = {
    id: val.id,
    title,
    tagline: val.tagline,
    description: val.description,
    rarity,
    type,
    budgetCost,
  };

  if (type === 'ACTIVE_ABILITY' && val.abilityPayload !== undefined) {
    const ability = validateAbilitySchema(val.abilityPayload);
    if (!ability) return null;
    card.abilityPayload = ability;
  }

  if (type === 'PASSIVE_UPGRADE') {
    if (!Array.isArray(val.passivePayload)) return null;
    const passives: PassiveModifierPayload[] = [];
    for (const p of val.passivePayload) {
      const mod = validatePassiveModifier(p);
      if (!mod) return null;
      passives.push(mod);
    }
    card.passivePayload = passives;
  }

  if (isString(val.category) && SKILL_CATEGORIES.includes(val.category as SkillCategory)) {
    card.category = val.category as SkillCategory;
  }

  if (Array.isArray(val.evolutionDiff)) {
    const diffs = val.evolutionDiff.filter((d): d is string => typeof d === 'string');
    if (diffs.length > 0) card.evolutionDiff = diffs;
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
