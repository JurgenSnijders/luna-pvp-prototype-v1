export const STORAGE_KEY_API = 'LUNA_AI_API_KEY';
export const STORAGE_KEY_BASE_URL = 'LUNA_AI_BASE_URL';
export const STORAGE_KEY_MODEL = 'LUNA_AI_MODEL';

export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const LEGACY_MODELS = new Set(['gpt-4o-mini', 'gemini-2.0-flash']);
// Old OpenAI-compatible endpoints — migrated to the native Gemini endpoint below.
const LEGACY_BASE_URLS = new Set([
  'https://api.openai.com/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai',
]);

export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getAiSettings(): AiSettings {
  const storedModel = localStorage.getItem(STORAGE_KEY_MODEL);
  const storedBaseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL);
  const normalizedBaseUrl = storedBaseUrl?.replace(/\/+$/, '') ?? '';

  const model =
    !storedModel || LEGACY_MODELS.has(storedModel)
      ? DEFAULT_MODEL
      : storedModel;

  const baseUrl =
    !storedBaseUrl || LEGACY_BASE_URLS.has(normalizedBaseUrl)
      ? DEFAULT_BASE_URL
      : storedBaseUrl;

  return {
    apiKey: localStorage.getItem(STORAGE_KEY_API) ?? '',
    baseUrl,
    model,
  };
}

export function setAiSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY_API, settings.apiKey);
  localStorage.setItem(STORAGE_KEY_BASE_URL, settings.baseUrl);
  localStorage.setItem(STORAGE_KEY_MODEL, settings.model);
}
