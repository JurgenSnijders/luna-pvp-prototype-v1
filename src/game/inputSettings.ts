export const STORAGE_KEY_INPUT = 'LUNA_INPUT_SETTINGS';

export interface InputSettings {
  laptopModeEnabled: boolean;
}

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  laptopModeEnabled: false,
};

let cachedSettings: InputSettings | null = null;
const listeners = new Set<(settings: InputSettings) => void>();

function normalizeSettings(raw: Partial<InputSettings>): InputSettings {
  return {
    laptopModeEnabled: raw.laptopModeEnabled ?? DEFAULT_INPUT_SETTINGS.laptopModeEnabled,
  };
}

export function loadInputSettings(): InputSettings {
  if (cachedSettings) return cachedSettings;

  if (typeof localStorage === 'undefined') {
    cachedSettings = { ...DEFAULT_INPUT_SETTINGS };
    return cachedSettings;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_INPUT);
    if (!raw) {
      cachedSettings = { ...DEFAULT_INPUT_SETTINGS };
    } else {
      cachedSettings = normalizeSettings(JSON.parse(raw) as Partial<InputSettings>);
    }
  } catch {
    cachedSettings = { ...DEFAULT_INPUT_SETTINGS };
  }

  return cachedSettings;
}

export function saveInputSettings(patch: Partial<InputSettings>): InputSettings {
  const current = loadInputSettings();
  cachedSettings = normalizeSettings({ ...current, ...patch });

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_INPUT, JSON.stringify(cachedSettings));
    } catch {
      // Quota or private mode fallback
    }
  }

  for (const listener of listeners) {
    listener(cachedSettings);
  }

  return cachedSettings;
}

export function subscribeInputSettings(fn: (settings: InputSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
