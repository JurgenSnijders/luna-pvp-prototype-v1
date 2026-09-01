import type {
  DraftCard,
  EvolutionContext,
  PlayerLoadout,
  SkillCategory,
} from '../../types/cards';
import {
  fetchLLMEvolution,
  fetchLLMForge,
  fetchLLMPassive,
  type NativeGeminiChunk,
} from './geminiClient';
import { generateOfflineEvolution } from './offline/evolution';
import { generateOfflineForge, generateOfflinePassives } from './offline/forge';
import { getAiSettings } from './settings';
import {
  getLastApiError,
  setLastSynthesisError,
  setLastSynthesisSource,
} from './status';

export async function synthesizeAbility(
  prompt: string,
  category: SkillCategory,
  loadout: PlayerLoadout,
  evolution?: EvolutionContext,
  passiveOnly = false,
  options?: { signal?: AbortSignal; onChunk?: (chunk: NativeGeminiChunk) => void },
): Promise<DraftCard[]> {
  const settings = getAiSettings();
  const transportOptions = {
    signal: options?.signal,
    onChunk: options?.onChunk,
  };

  if (settings.apiKey.trim()) {
    let online: DraftCard[] | null = null;

    if (passiveOnly) {
      online = await fetchLLMPassive(prompt, loadout, settings, transportOptions);
    } else if (evolution) {
      online = await fetchLLMEvolution(prompt, evolution, loadout, settings, transportOptions);
    } else {
      online = await fetchLLMForge(prompt, category, loadout, settings, transportOptions);
    }

    if (online) {
      setLastSynthesisSource('api');
      setLastSynthesisError(null);
      return online;
    }
  }

  setLastSynthesisSource('heuristic');
  setLastSynthesisError(
    settings.apiKey.trim() ? getLastApiError() : 'No API key configured',
  );

  if (passiveOnly) return generateOfflinePassives(prompt);
  if (evolution) return generateOfflineEvolution(prompt, evolution);
  return generateOfflineForge(prompt, category);
}

export async function synthesizeCards(
  prompt: string,
  loadout: PlayerLoadout,
): Promise<DraftCard[]> {
  return synthesizeAbility(prompt, 'SECONDARY', loadout);
}
