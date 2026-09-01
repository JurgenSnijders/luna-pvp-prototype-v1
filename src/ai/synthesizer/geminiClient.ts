import type {
  DraftCard,
  EvolutionContext,
  PlayerLoadout,
  SkillCategory,
} from '../../types/cards';
import { CATEGORY_SLOT_MAP, getCategoryLabel, validateDraftCards } from '../../types/cards';
import { balanceCards } from './cards';
import {
  feedSseBuffer,
  flushSseBuffer,
  parseGeminiStreamPayload,
  parseSseEventBlock,
  stripMarkdownFences,
} from './geminiSse';
import {
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

export interface NativeGeminiChunk {
  delta: string;
  text: string;
}

export interface StreamNativeGeminiOptions {
  timeoutMs: number;
  stallTimeoutMs?: number;
  maxOutputTokens: number;
  logTag: string;
  signal?: AbortSignal;
  onChunk?: (chunk: NativeGeminiChunk) => void;
}

function abortErrorResult(timedOut: boolean, timeoutMs: number): NativeGeminiResult {
  if (timedOut) {
    return { ok: false, text: '', error: `Request timed out (${timeoutMs}ms)` };
  }
  return { ok: false, text: '', error: 'Request aborted' };
}

function mapTransportError(err: unknown, timedOut: boolean, timeoutMs: number): NativeGeminiResult {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return abortErrorResult(timedOut, timeoutMs);
  }
  if (err instanceof Error) {
    return { ok: false, text: '', error: err.message };
  }
  return { ok: false, text: '', error: 'Unknown API error' };
}

function processSseEventBlock(
  block: string,
  accumulated: string,
  onChunk: StreamNativeGeminiOptions['onChunk'],
): {
  accumulated: string;
  chunks: NativeGeminiChunk[];
  streamDone: boolean;
  error: NativeGeminiResult | null;
} {
  const event = parseSseEventBlock(block);
  if (event.kind === 'empty') {
    return { accumulated, chunks: [], streamDone: false, error: null };
  }
  if (event.kind === 'done') {
    return { accumulated, chunks: [], streamDone: true, error: null };
  }

  const parsed = parseGeminiStreamPayload(event.payload);
  if (parsed.kind === 'error') {
    return {
      accumulated,
      chunks: [],
      streamDone: false,
      error: { ok: false, text: '', error: parsed.message },
    };
  }
  if (parsed.kind === 'skip') {
    return { accumulated, chunks: [], streamDone: false, error: null };
  }

  const nextText = accumulated + parsed.delta;
  const chunk: NativeGeminiChunk = { delta: parsed.delta, text: nextText };
  onChunk?.(chunk);
  return {
    accumulated: nextText,
    chunks: [chunk],
    streamDone: false,
    error: null,
  };
}

/**
 * Native-Gemini `streamGenerateContent?alt=sse` transport. Yields text deltas as they
 * arrive; the generator return value is the collected `NativeGeminiResult`.
 */
export async function* streamNativeGemini(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  options: StreamNativeGeminiOptions,
): AsyncGenerator<NativeGeminiChunk, NativeGeminiResult> {
  const controller = new AbortController();
  let timedOut = false;
  let ttfbTimer: ReturnType<typeof setTimeout> | null = null;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const stallTimeoutMs = options.stallTimeoutMs ?? options.timeoutMs;

  const clearAllTimers = () => {
    if (ttfbTimer !== null) {
      clearTimeout(ttfbTimer);
      ttfbTimer = null;
    }
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  const startTtfbTimer = () => {
    ttfbTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
  };

  const resetStallTimer = () => {
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, stallTimeoutMs);
  };

  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    const model = settings.model.trim() || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    const apiStartTime = performance.now();
    console.log(`[Synthesizer] ${options.logTag} Initiating Gemini SSE request...`);

    startTtfbTimer();

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

    if (ttfbTimer !== null) {
      clearTimeout(ttfbTimer);
      ttfbTimer = null;
    }

    const ttfb = performance.now() - apiStartTime;
    console.log(`[Synthesizer] ${options.logTag} Time To First Byte (TTFB): ${ttfb.toFixed(1)}ms`);

    if (!response.ok) {
      const body = (await response.text()).slice(0, 180);
      return {
        ok: false,
        text: '',
        error: `HTTP ${response.status}: ${body || response.statusText}`,
      };
    }

    if (!response.body) {
      return { ok: false, text: '', error: 'Empty response body' };
    }

    resetStallTimer();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let carry = '';
    let accumulated = '';
    let streamDone = false;

    const handleBlocks = function* (
      blocks: string[],
    ): Generator<NativeGeminiChunk, NativeGeminiResult | null> {
      for (const block of blocks) {
        const result = processSseEventBlock(block, accumulated, options.onChunk);
        if (result.error) return result.error;
        accumulated = result.accumulated;
        for (const chunk of result.chunks) {
          resetStallTimer();
          yield chunk;
        }
        if (result.streamDone) {
          streamDone = true;
          reader.cancel().catch(() => {});
          return null;
        }
      }
      return null;
    };

    while (!streamDone) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (err) {
        return mapTransportError(err, timedOut, options.timeoutMs);
      }

      const { done, value } = readResult;
      if (done) break;

      resetStallTimer();

      const textChunk = decoder.decode(value, { stream: true });
      const fed = feedSseBuffer(carry, textChunk);
      carry = fed.carry;

      const blockGen = handleBlocks(fed.eventBlocks);
      let blockIter = blockGen.next();
      while (!blockIter.done) {
        yield blockIter.value;
        blockIter = blockGen.next();
      }
      if (blockIter.value) return blockIter.value;
    }

    if (!streamDone) {
      const trailingBlocks = flushSseBuffer(carry);
      carry = '';
      const blockGen = handleBlocks(trailingBlocks);
      let blockIter = blockGen.next();
      while (!blockIter.done) {
        yield blockIter.value;
        blockIter = blockGen.next();
      }
      if (blockIter.value) return blockIter.value;
    }

    const totalTime = performance.now() - apiStartTime;
    console.log(`[Synthesizer] ${options.logTag} Total API Latency: ${totalTime.toFixed(1)}ms`);

    if (!accumulated) {
      return { ok: false, text: '', error: 'Invalid LLM response: empty content' };
    }

    return { ok: true, text: stripMarkdownFences(accumulated), error: null };
  } catch (err) {
    return mapTransportError(err, timedOut, options.timeoutMs);
  } finally {
    clearAllTimers();
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Collects a full SSE stream into `NativeGeminiResult`. Draft and compile callers use
 * this so they do not parse SSE frames themselves.
 */
export async function postNativeGemini(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  options: StreamNativeGeminiOptions,
): Promise<NativeGeminiResult> {
  const gen = streamNativeGemini(systemPrompt, userPrompt, settings, options);
  let iterResult = await gen.next();
  while (!iterResult.done) {
    iterResult = await gen.next();
  }
  return iterResult.value;
}

export interface CallLLMOptions {
  signal?: AbortSignal;
  onChunk?: (chunk: NativeGeminiChunk) => void;
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  category: SkillCategory,
  options?: CallLLMOptions,
): Promise<DraftCard[] | null> {
  setLastCallSucceeded(false);
  setLastApiError(null);

  const result = await postNativeGemini(systemPrompt, userPrompt, settings, {
    timeoutMs: 8000,
    maxOutputTokens: 1024,
    logTag: '[draft]',
    signal: options?.signal,
    onChunk: options?.onChunk,
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
  options?: CallLLMOptions,
): Promise<DraftCard[] | null> {
  const slot = CATEGORY_SLOT_MAP[category];
  const userPrompt = `Player prompt: "${prompt}"
Target category: ${category} (${getCategoryLabel(category)}) → slot ${slot}
${loadoutSummary(loadout)}

Generate 3 thematic ability concepts for this category.`;

  return callLLM(FORGE_SYSTEM_PROMPT, userPrompt, settings, category, options);
}

export async function fetchLLMEvolution(
  prompt: string,
  context: EvolutionContext,
  loadout: PlayerLoadout,
  settings: AiSettings,
  options?: CallLLMOptions,
): Promise<DraftCard[] | null> {
  const userPrompt = `Base Ability Name: "${context.baseAbility.name}"

User Mutation Request: ${prompt}

Category: ${context.category} (${getCategoryLabel(context.category)}) → slot ${context.slotKey}
${loadoutSummary(loadout)}

Generate 3 distinct evolved ability concepts that preserve the base name's identity while applying the mutation.`;

  return callLLM(EVOLUTION_SYSTEM_PROMPT, userPrompt, settings, context.category, options);
}

export async function fetchLLMPassive(
  prompt: string,
  loadout: PlayerLoadout,
  settings: AiSettings,
  options?: CallLLMOptions,
): Promise<DraftCard[] | null> {
  const userPrompt = `Player prompt: "${prompt}"
${loadoutSummary(loadout)}

Generate 3 thematic PASSIVE_UPGRADE draft cards.`;

  return callLLM(PASSIVE_SYSTEM_PROMPT, userPrompt, settings, 'SECONDARY', options);
}
