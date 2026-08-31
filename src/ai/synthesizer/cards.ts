import {
  balanceAbilitySchema,
  balancePassiveModifiers,
  sanitizeAbilitySchema,
  scoreAbilitySchema,
} from '../BudgetEngine';
import type {
  CardRarity,
  DraftCard,
  PassiveModifierPayload,
  SkillCategory,
} from '../../types/cards';
import type { AbilitySchema } from '../../types/schema';

export function balanceCard(card: DraftCard, category: SkillCategory = 'SECONDARY'): DraftCard {
  const balanced = { ...card };
  balanced.category = balanced.category ?? category;

  if (balanced.type === 'ACTIVE_ABILITY' && balanced.abilityPayload) {
    balanced.abilityPayload = balanceAbilitySchema(
      sanitizeAbilitySchema(balanced.abilityPayload, balanced.category ?? category),
      balanced.category ?? category,
    );
    balanced.budgetCost = scoreAbilitySchema(balanced.abilityPayload);
  }

  if (balanced.type === 'PASSIVE_UPGRADE' && balanced.passivePayload) {
    balanced.passivePayload = balancePassiveModifiers(balanced.passivePayload);
    balanced.budgetCost = balanced.passivePayload.length * 15;
  }

  return balanced;
}

export function balanceCards(cards: DraftCard[], category: SkillCategory = 'SECONDARY'): DraftCard[] {
  return cards.map((c) => balanceCard(c, category));
}

export function makeActiveCard(
  id: string,
  title: string,
  tagline: string,
  description: string,
  rarity: CardRarity,
  schema: AbilitySchema,
  category: SkillCategory = 'SECONDARY',
  evolutionDiff?: string[],
): DraftCard {
  const balanced = balanceAbilitySchema(schema, category);
  return {
    id,
    title,
    tagline,
    description,
    rarity,
    type: 'ACTIVE_ABILITY',
    abilityPayload: balanced,
    budgetCost: scoreAbilitySchema(balanced),
    category,
    evolutionDiff,
  };
}

export function makePassiveCard(
  id: string,
  title: string,
  tagline: string,
  description: string,
  rarity: CardRarity,
  modifiers: PassiveModifierPayload[],
): DraftCard {
  const balanced = balancePassiveModifiers(modifiers);
  return {
    id,
    title,
    tagline,
    description,
    rarity,
    type: 'PASSIVE_UPGRADE',
    passivePayload: balanced,
    budgetCost: balanced.length * 15,
  };
}
