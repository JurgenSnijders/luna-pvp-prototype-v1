import type {
  DraftCard,
  EvolutionContext,
  PlayerLoadout,
  SkillCategory,
} from '../../types/cards';
import { CATEGORY_SLOT_MAP, getCategoryLabel, validateDraftCards } from '../../types/cards';
import { balanceCards } from './cards';
import {
  coerceMessageContent,
  diagnoseDraftCardsValidation,
  normalizeLLMResponse,
  summarizeValidationFailure,
  tryParseLLMJson,
} from './llmRepair';
import {
  EVOLUTION_SYSTEM_PROMPT,
  FORGE_SYSTEM_PROMPT,
  PASSIVE_SYSTEM_PROMPT,
} from './prompts';
import { DEFAULT_MODEL, type AiSettings } from './settings';
import { setLastApiError, setLastCallSucceeded } from './status';

function loadoutSummary(loadout: PlayerLoadout): string {
  return `Current loadout:
- LMB: ${loadout.abilities[0]?.name ?? 'Empty'}
- RMB: ${loadout.abilities[1]?.name ?? 'Empty'}
- Q: ${loadout.abilities[2]?.name ?? 'Empty'}
- E: ${loadout.abilities[3]?.name ?? 'Empty'}
- SPACE: ${loadout.abilities[4]?.name ?? 'Empty'}
- Passives: ${loadout.passives.length}`;
}

export interface NativeGeminiResult {
  ok: boolean;
  text: string;
  error: string | null;
}

/**
 * Shared native-Gemini `generateContent` transport used by both the 3-card draft path
 * (`callLLM`) and the single-card compiler (`compileAbilityPayload`). Callers own their own
 * JSON parsing/validation — this only handles the fetch, timeout, and raw text extraction.
 */
export async function postNativeGemini(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  options: {
    timeoutMs: number;
    maxOutputTokens: number;
    logTag: string;
    signal?: AbortSignal;
  },
): Promise<NativeGeminiResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  // Compose the caller's signal (e.g. modal-close teardown) with the internal
  // timeout controller — either one aborts the underlying fetch.
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    // Native Gemini host is a hard architectural constraint — settings.baseUrl is
    // intentionally ignored here (it only drives legacy/inspector display concerns).
    const model = settings.model.trim() || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const apiStartTime = performance.now();
    console.log(`[Synthesizer] ${options.logTag} Initiating Gemini API request...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': settings.apiKey.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: options.maxOutputTokens,
        },
      }),
      signal: controller.signal,
    });

    const ttfb = performance.now() - apiStartTime;
    console.log(`[Synthesizer] ${options.logTag} Time To First Byte (TTFB): ${ttfb.toFixed(1)}ms`);

    if (!response.ok) {
      const body = (await response.text()).slice(0, 180);
      return { ok: false, text: '', error: `HTTP ${response.status}: ${body || response.statusText}` };
    }

    const data = await response.json();

    const totalTime = performance.now() - apiStartTime;
    console.log(`[Synthesizer] ${options.logTag} Total API Latency: ${totalTime.toFixed(1)}ms`);

    let content = coerceMessageContent(data.candidates?.[0]?.content?.parts);
    if (!content) {
      return { ok: false, text: '', error: 'Invalid LLM response: empty content' };
    }
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return { ok: true, text: content, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (timedOut) {
        return { ok: false, text: '', error: `Request timed out (${options.timeoutMs}ms)` };
      }
      return { ok: false, text: '', error: 'Request aborted' };
    }
    if (err instanceof Error) {
      return { ok: false, text: '', error: err.message };
    }
    return { ok: false, text: '', error: 'Unknown API error' };
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  category: SkillCategory,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  setLastCallSucceeded(false);
  setLastApiError(null);

  const result = await postNativeGemini(systemPrompt, userPrompt, settings, {
    timeoutMs: 8000,
    maxOutputTokens: 1024,
    logTag: '[draft]',
    signal,
  });

  if (!result.ok) {
    setLastApiError(result.error);
    return null;
  }

  const parseResult = tryParseLLMJson(result.text);
  if (!parseResult.ok) {
    setLastApiError(`Invalid LLM response: JSON parse failed (${parseResult.error})`);
    return null;
  }
  const parsed = parseResult.value;

  const normalized = normalizeLLMResponse(parsed);
  const validated = validateDraftCards(normalized);
  if (!validated) {
    const diagnosis = diagnoseDraftCardsValidation(parsed);
    const normalizedDiagnosis = diagnoseDraftCardsValidation(normalized);
    const failureSummary = summarizeValidationFailure(diagnosis, normalizedDiagnosis);
    setLastApiError(`Invalid LLM response: card validation failed (${failureSummary})`);
    return null;
  }

  setLastCallSucceeded(true);
  setLastApiError(null);
  return balanceCards(validated, category);
}

export async function fetchLLMForge(
  prompt: string,
  category: SkillCategory,
  loadout: PlayerLoadout,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  const slot = CATEGORY_SLOT_MAP[category];
  const userPrompt = `Player prompt: "${prompt}"
Target category: ${category} (${getCategoryLabel(category)}) → slot ${slot}
${loadoutSummary(loadout)}

Generate 3 thematic ability concepts for this category.`;

  return callLLM(FORGE_SYSTEM_PROMPT, userPrompt, settings, category, signal);
}

export async function fetchLLMEvolution(
  prompt: string,
  context: EvolutionContext,
  loadout: PlayerLoadout,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  const userPrompt = `Base Ability Name: "${context.baseAbility.name}"

User Mutation Request: ${prompt}

Category: ${context.category} (${getCategoryLabel(context.category)}) → slot ${context.slotKey}
${loadoutSummary(loadout)}

Generate 3 distinct evolved ability concepts that preserve the base name's identity while applying the mutation.`;

  return callLLM(EVOLUTION_SYSTEM_PROMPT, userPrompt, settings, context.category, signal);
}

export async function fetchLLMPassive(
  prompt: string,
  loadout: PlayerLoadout,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  const userPrompt = `Player prompt: "${prompt}"
${loadoutSummary(loadout)}

Generate 3 thematic PASSIVE_UPGRADE draft cards.`;

  return callLLM(PASSIVE_SYSTEM_PROMPT, userPrompt, settings, 'SECONDARY', signal);
}
