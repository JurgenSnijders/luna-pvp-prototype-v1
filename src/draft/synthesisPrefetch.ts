import { getAiSettings, synthesizeAbility } from '../ai/Synthesizer';
import type { DraftCard, EvolutionContext, PlayerLoadout, SkillCategory } from '../types/cards';

export type WorkshopMode = 'FORGE_NEW' | 'EVOLVE_EXISTING' | 'PASSIVE_UPGRADES';

export interface PrefetchCacheEntry {
  key: string;
  promise: Promise<DraftCard[]>;
  cards?: DraftCard[];
  abortController: AbortController;
  startedAt: number;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function buildPrefetchKey(
  mode: WorkshopMode,
  category: SkillCategory,
  promptText: string,
  evolutionBaseId?: string,
): string {
  return `${mode}|${category}|${promptText}|evolve:${evolutionBaseId ?? ''}`;
}

export function buildCurrentPrefetchKey(
  mode: WorkshopMode,
  category: SkillCategory,
  promptText: string,
  evolutionContext: EvolutionContext | null,
): string {
  return buildPrefetchKey(
    mode,
    category,
    promptText,
    mode === 'EVOLVE_EXISTING' ? evolutionContext?.baseAbility.id : undefined,
  );
}

export function canPrefetch(
  intermissionMode: boolean,
  mode: WorkshopMode,
  evolutionContext: EvolutionContext | null,
): boolean {
  if (intermissionMode) return false;
  if (!getAiSettings().apiKey.trim()) return false;
  if (mode === 'EVOLVE_EXISTING' && !evolutionContext) return false;
  return true;
}

export function invalidatePrefetch(cache: PrefetchCacheEntry | null): null {
  if (!cache) return null;
  cache.abortController.abort();
  cache.promise.catch(() => {});
  return null;
}

/**
 * Speculatively dispatches the Stage 1 metadata request for the current mode/category/prompt
 * so `synthesize()` can consume an already-resolved (or in-flight) result with near-zero
 * perceived latency. No-ops if a matching prefetch is already running.
 */
export function startPrefetch(
  cache: PrefetchCacheEntry | null,
  intermissionMode: boolean,
  mode: WorkshopMode,
  category: SkillCategory,
  prompt: string,
  evolutionContext: EvolutionContext | null,
  getLoadout: () => PlayerLoadout,
): PrefetchCacheEntry | null {
  if (!canPrefetch(intermissionMode, mode, evolutionContext)) return invalidatePrefetch(cache);

  const evolutionBaseId =
    mode === 'EVOLVE_EXISTING' ? evolutionContext?.baseAbility.id : undefined;
  const key = buildPrefetchKey(mode, category, prompt, evolutionBaseId);

  if (cache?.key === key) return cache;
  cache = invalidatePrefetch(cache);

  const abortController = new AbortController();
  const loadout = getLoadout();
  const promise = synthesizeAbility(
    prompt,
    category,
    loadout,
    mode === 'EVOLVE_EXISTING' ? evolutionContext ?? undefined : undefined,
    mode === 'PASSIVE_UPGRADES',
    { signal: abortController.signal },
  );

  const entry: PrefetchCacheEntry = { key, promise, abortController, startedAt: performance.now() };

  promise
    .then((cards) => {
      if (entry.key === key) entry.cards = cards;
    })
    .catch(() => {
      // Aborted (modal closed / context changed) or failed — synthesize() will fall
      // through to a fresh request on the next cache-miss instead of surfacing this.
    });

  return entry;
}
