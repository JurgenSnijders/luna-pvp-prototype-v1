import { sanitizeAbilitySchema } from '../src/ai/BudgetEngine';
import {
  generateOfflineDraft,
  generateOfflineEvolution,
  generateOfflineForge,
  generateOfflinePassives,
  resolveKineticRecipe,
} from '../src/ai/Synthesizer';
import { PRESETS } from '../src/devtools/Presets';
import { validateAbilitySchema } from '../src/types/schema';

function assertValidAbility(payload: unknown, label: string): void {
  const sanitized = sanitizeAbilitySchema(payload, 'SECONDARY');
  if (!validateAbilitySchema(sanitized)) {
    throw new Error(`validation failed: ${label}`);
  }
}

function assertCardCount(cards: unknown[], expected: number, label: string): void {
  if (cards.length !== expected) {
    throw new Error(`${label}: expected ${expected} cards, got ${cards.length}`);
  }
}

function run(): void {
  const failures: string[] = [];

  try {
    const forgeCards = generateOfflineForge('railgun', 'PRIMARY');
    assertCardCount(forgeCards, 3, 'generateOfflineForge');
    for (const card of forgeCards) {
      if (!card.abilityPayload) {
        failures.push('generateOfflineForge: missing abilityPayload');
        continue;
      }
      assertValidAbility(card.abilityPayload, `forge card ${card.id}`);
    }
  } catch (err) {
    failures.push(`generateOfflineForge: ${err}`);
  }

  try {
    const draftCards = generateOfflineDraft('ice', 'UTILITY');
    assertCardCount(draftCards, 3, 'generateOfflineDraft');
    const activeCards = draftCards.filter((c) => c.type === 'ACTIVE_ABILITY');
    if (activeCards.length < 1) {
      failures.push('generateOfflineDraft: expected at least one ACTIVE_ABILITY card');
    }
    for (const card of activeCards) {
      if (!card.abilityPayload) {
        failures.push(`generateOfflineDraft: missing abilityPayload on ${card.id}`);
        continue;
      }
      assertValidAbility(card.abilityPayload, `draft card ${card.id}`);
    }
  } catch (err) {
    failures.push(`generateOfflineDraft: ${err}`);
  }

  try {
    const recipe = resolveKineticRecipe('harpoon pull');
    if (!recipe) {
      failures.push('resolveKineticRecipe: expected non-null for harpoon pull');
    } else {
      const sanitized = sanitizeAbilitySchema(recipe, 'SECONDARY');
      if (!validateAbilitySchema(sanitized)) {
        failures.push('resolveKineticRecipe: harpoon recipe failed validation after sanitize');
      }
    }
  } catch (err) {
    failures.push(`resolveKineticRecipe: ${err}`);
  }

  try {
    const baseAbility = PRESETS['Kinetic Railgun'];
    if (!baseAbility) {
      failures.push('generateOfflineEvolution: missing PRESETS[Kinetic Railgun]');
    } else {
      const evoCards = generateOfflineEvolution('cluster mirv', {
        baseAbility,
        slotKey: 'lmb',
        category: 'PRIMARY',
      });
      assertCardCount(evoCards, 3, 'generateOfflineEvolution');
      for (const card of evoCards) {
        if (!card.abilityPayload) {
          failures.push(`generateOfflineEvolution: missing abilityPayload on ${card.id}`);
          continue;
        }
        assertValidAbility(card.abilityPayload, `evolution card ${card.id}`);
      }
    }
  } catch (err) {
    failures.push(`generateOfflineEvolution: ${err}`);
  }

  try {
    const passiveCards = generateOfflinePassives('speed');
    assertCardCount(passiveCards, 3, 'generateOfflinePassives');
    for (const card of passiveCards) {
      if (card.type !== 'PASSIVE_UPGRADE') {
        failures.push(`generateOfflinePassives: expected PASSIVE_UPGRADE, got ${card.type}`);
      }
    }
  } catch (err) {
    failures.push(`generateOfflinePassives: ${err}`);
  }

  if (failures.length > 0) {
    console.error('test:offline  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  console.log('test:offline  OK  5 offline generator checks passed');
}

run();
