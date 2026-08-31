import { DEFAULT_MODEL, getAiSettings } from './settings';

let lastApiError: string | null = null;
let lastCallSucceeded = false;
let lastSynthesisSource: 'api' | 'heuristic' = 'heuristic';
let lastSynthesisError: string | null = null;

export function getLastApiError(): string | null {
  return lastApiError;
}

export function setLastApiError(value: string | null): void {
  lastApiError = value;
}

export function getLastCallSucceeded(): boolean {
  return lastCallSucceeded;
}

export function setLastCallSucceeded(value: boolean): void {
  lastCallSucceeded = value;
}

export function setLastSynthesisSource(value: 'api' | 'heuristic'): void {
  lastSynthesisSource = value;
}

export function setLastSynthesisError(value: string | null): void {
  lastSynthesisError = value;
}

export function getApiConnectionStatus(): {
  online: boolean;
  model: string;
  lastError: string | null;
} {
  const settings = getAiSettings();
  return {
    online: settings.apiKey.trim().length > 0 && lastCallSucceeded,
    model: settings.model.trim() || DEFAULT_MODEL,
    lastError: lastApiError,
  };
}

export function getLastSynthesisMeta(): {
  source: 'api' | 'heuristic';
  error: string | null;
} {
  return { source: lastSynthesisSource, error: lastSynthesisError };
}
