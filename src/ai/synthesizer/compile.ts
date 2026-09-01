import { CATEGORY_BUDGETS, sanitizeAbilitySchema } from '../BudgetEngine';
import type { DraftCard, SkillCategory } from '../../types/cards';
import { CATEGORY_SLOT_MAP } from '../../types/cards';
import type { AbilitySchema } from '../../types/schema';
import { validateAbilitySchema } from '../../types/schema';
import { postNativeGemini, type NativeGeminiChunk } from './geminiClient';
import {
  deepNormalizeLLMValue,
  repairAbilityPayload,
  tryParseLLMJson,
} from './llmRepair';
import { generateOfflineEvolution } from './offline/evolution';
import { generateOfflineForge, resolveKineticRecipe } from './offline/forge';
import { COMPILER_SYSTEM_PROMPT } from './prompts';
import { getAiSettings } from './settings';

const CATEGORY_COMPILE_HINTS: Record<SkillCategory, string> = {
  PRIMARY: 'rapid-fire skillshots, low payload, short cooldown pacing, ammo magazines',
  SECONDARY: 'medium area/skillshot pressure, charged shots, combo chains',
  UTILITY: 'crowd control, zones, terrain mutation, obstacles, stasis traps',
  ULTIMATE: 'high-impact screen presence, morphs, turrets/decoys, large fields',
  MOBILITY: 'displacement, teleports, dashes, stealth — movement over damage',
};

function finalizeCompiledSchema(
  card: DraftCard,
  schema: AbilitySchema,
  category: SkillCategory,
): AbilitySchema {
  const compileDescription = `${card.title} ${card.tagline} ${card.description}`;
  const sanitized = sanitizeAbilitySchema(schema, category, 0, compileDescription);
  sanitized.tagline = card.tagline;
  sanitized.description = card.description;
  return sanitized;
}

function buildCompileUserPrompt(
  card: DraftCard,
  baseAbility: AbilitySchema | undefined,
  category: SkillCategory,
): string {
  const budget = CATEGORY_BUDGETS[category];
  const lines = [
    'Ability Concept:',
    `- name: "${card.title}"`,
    `- tagline: "${card.tagline}"`,
    `- description: "${card.description}"`,
    `- category: ${category}`,
    `- category design: ${CATEGORY_COMPILE_HINTS[category]}`,
    `- target power budget: ~${budget.targetPower}`,
  ];
  if (baseAbility) {
    lines.push(`- evolving from base ability named: "${baseAbility.name}"`);
    if (baseAbility.visuals) {
      lines.push(`- parent visuals: ${JSON.stringify(baseAbility.visuals)}`);
      lines.push('- mutate parent palette (shift hue/size) rather than rerolling colors');
    }
  }
  lines.push('', 'Output the single AbilitySchema JSON object for this concept.');
  return lines.join('\n');
}

/**
 * Offline heuristic used when no API key is configured, the compile request fails/times
 * out, or the parsed response fails validation. Reuses the existing forge/evolution
 * generators (never a bare default) so a lazily-compiled slot is never left unplayable —
 * only the id/name are overwritten to match the chosen card.
 */
function fallbackCompiledSchema(
  card: DraftCard,
  baseAbility: AbilitySchema | undefined,
  category: SkillCategory,
): AbilitySchema {
  let source: AbilitySchema | undefined;

  const promptText = `${card.title} ${card.tagline} ${card.description}`;
  const recipe = resolveKineticRecipe(promptText);
  if (recipe) {
    source = structuredClone(recipe);
  } else if (baseAbility) {
    const evolved = generateOfflineEvolution(card.description || card.tagline || 'mutation', {
      baseAbility,
      slotKey: CATEGORY_SLOT_MAP[category],
      category,
    });
    source = evolved[0]?.abilityPayload;
  } else {
    const forged = generateOfflineForge(
      `${card.title} ${card.tagline} ${card.description}`,
      category,
    );
    source = forged[0]?.abilityPayload ?? forged[1]?.abilityPayload;
  }

  const compiled = source ? structuredClone(source) : sanitizeAbilitySchema({}, category);
  compiled.id = card.id || compiled.id;
  compiled.name = card.title || compiled.name;
  return finalizeCompiledSchema(card, compiled, category);
}

/**
 * Phase 2 lazy compilation: compiles the full physics `AbilitySchema` for exactly ONE
 * already-chosen card. Deliberately does NOT route through `callLLM` (which always expects
 * and validates 3 `DraftCard`s) — this is a separate native-Gemini call with its own prompt,
 * a tighter 5s timeout, and a smaller/targeted parse+repair path for a single schema object.
 * Always fulfills with a playable schema; network/parse/validation failures fall back to an
 * offline heuristic so the calling slot can never stay stuck "compiling" forever.
 */
export async function compileAbilityPayload(
  card: DraftCard,
  baseAbility?: AbilitySchema,
  options?: { signal?: AbortSignal; onChunk?: (chunk: NativeGeminiChunk) => void },
): Promise<AbilitySchema> {
  const category = card.category ?? 'SECONDARY';

  // Offline heuristic / pre-compiled cards already carry a full payload — skip the network.
  if (card.abilityPayload) {
    return finalizeCompiledSchema(card, structuredClone(card.abilityPayload), category);
  }

  const settings = getAiSettings();
  if (!settings.apiKey.trim()) {
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  const userPrompt = buildCompileUserPrompt(card, baseAbility, category);
  const result = await postNativeGemini(COMPILER_SYSTEM_PROMPT, userPrompt, settings, {
    timeoutMs: 5000,
    maxOutputTokens: 3072,
    logTag: '[compile]',
    signal: options?.signal,
    onChunk: options?.onChunk,
  });

  if (!result.ok) {
    console.warn(`[Synthesizer] compileAbilityPayload fallback (${result.error})`);
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  const parseResult = tryParseLLMJson(result.text);
  if (!parseResult.ok) {
    console.warn(`[Synthesizer] compileAbilityPayload parse failed (${parseResult.error})`);
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  const normalized = deepNormalizeLLMValue(parseResult.value);
  const compileDescription = `${card.title} ${card.tagline} ${card.description}`;
  const repaired = repairAbilityPayload(normalized, compileDescription);
  const finalized = finalizeCompiledSchema(card, repaired as AbilitySchema, category);

  if (!validateAbilitySchema(finalized)) {
    console.warn('[Synthesizer] compileAbilityPayload validation failed, using fallback');
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  return finalized;
}
