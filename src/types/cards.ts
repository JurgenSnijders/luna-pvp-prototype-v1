import type { CombatEventType, PassiveHook, PassiveSplice, SpliceOperation } from './combatEvents';
import { COMBAT_EVENT_TYPES, SPLICE_OPERATION_TYPES } from './combatEvents';
import type { AbilitySchema, SpellArchetype } from './schema';
import { SPELL_ARCHETYPE_SET } from './schema';
import { validateAbilitySchema, validateActionPayload, validateTriggerNode } from './schema';

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
  stat?: PassiveStat;
  op?: PassiveOp;
  value?: number;
  hooks?: PassiveHook[];
  splices?: PassiveSplice[];
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

function validatePassiveHook(val: unknown): PassiveHook | null {
  if (!isObject(val)) return null;
  if (!isString(val.on) || !COMBAT_EVENT_TYPES.has(val.on)) return null;
  if (!Array.isArray(val.actions)) return null;

  const actions = [];
  for (const raw of val.actions) {
    const validated = validateActionPayload(raw);
    if (validated) actions.push(validated);
  }
  if (actions.length === 0) return null;

  return {
    on: val.on as CombatEventType,
    actions,
  };
}

function validateSpliceOperation(val: unknown): SpliceOperation | null {
  if (!isObject(val)) return null;
  if (!isString(val.type) || !SPLICE_OPERATION_TYPES.has(val.type)) return null;

  switch (val.type) {
    case 'APPEND_TRIGGER': {
      if (!isObject(val.node)) return null;
      const node = validateTriggerNode(val.node);
      if (!node) return null;
      return { type: 'APPEND_TRIGGER', node };
    }
    case 'ADD_BOUNCE':
    case 'ADD_PIERCE': {
      if (!isNumber(val.amount) || val.amount <= 0) return null;
      return { type: val.type, amount: val.amount };
    }
    default:
      return null;
  }
}

function validatePassiveSplice(val: unknown): PassiveSplice | null {
  if (!isObject(val)) return null;
  if (!isObject(val.operation)) return null;

  const operation = validateSpliceOperation(val.operation);
  if (!operation) return null;

  const splice: PassiveSplice = { operation };
  if (val.targetArchetype !== undefined) {
    const archetypeRaw = isString(val.targetArchetype) ? val.targetArchetype.toUpperCase() : '';
    if (!SPELL_ARCHETYPE_SET.has(archetypeRaw)) return null;
    splice.targetArchetype = archetypeRaw as SpellArchetype;
  }
  return splice;
}

export function validatePassiveModifier(val: unknown): PassiveModifierPayload | null {
  if (!isObject(val)) return null;

  const mod: PassiveModifierPayload = {};
  let hasContent = false;

  const hasStatTriple =
    isString(val.stat) &&
    PASSIVE_STATS.has(val.stat) &&
    isString(val.op) &&
    PASSIVE_OPS.has(val.op) &&
    isNumber(val.value);

  if (hasStatTriple) {
    mod.stat = val.stat as PassiveStat;
    mod.op = val.op as PassiveOp;
    mod.value = val.value as number;
    hasContent = true;
  }

  if (Array.isArray(val.hooks)) {
    const hooks: PassiveHook[] = [];
    for (const raw of val.hooks) {
      const hook = validatePassiveHook(raw);
      if (hook) hooks.push(hook);
    }
    if (hooks.length > 0) {
      mod.hooks = hooks;
      hasContent = true;
    }
  }

  if (Array.isArray(val.splices)) {
    const splices: PassiveSplice[] = [];
    for (const raw of val.splices) {
      const splice = validatePassiveSplice(raw);
      if (splice) splices.push(splice);
    }
    if (splices.length > 0) {
      mod.splices = splices;
      hasContent = true;
    }
  }

  return hasContent ? mod : null;
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
      if (mod) passives.push(mod);
    }
    if (passives.length === 0) return null;
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
