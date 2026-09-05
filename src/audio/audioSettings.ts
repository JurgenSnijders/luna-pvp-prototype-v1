export const STORAGE_KEY_AUDIO = 'LUNA_AUDIO_SETTINGS';

export interface AudioSettings {
  audioEnabled: boolean;
  masterVolume: number;
  sfxVolume: number;
  uiVolume: number;
  muteOnBlur: boolean;
  debrisSfxEnabled: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  audioEnabled: true,
  masterVolume: 0.8,
  sfxVolume: 1.0,
  uiVolume: 0.7,
  muteOnBlur: true,
  debrisSfxEnabled: true,
};

let cachedSettings: AudioSettings | null = null;
const listeners = new Set<(settings: AudioSettings) => void>();

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeSettings(raw: Partial<AudioSettings>): AudioSettings {
  return {
    audioEnabled: raw.audioEnabled ?? DEFAULT_AUDIO_SETTINGS.audioEnabled,
    masterVolume: clampUnit(raw.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume),
    sfxVolume: clampUnit(raw.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume),
    uiVolume: clampUnit(raw.uiVolume ?? DEFAULT_AUDIO_SETTINGS.uiVolume),
    muteOnBlur: raw.muteOnBlur ?? DEFAULT_AUDIO_SETTINGS.muteOnBlur,
    debrisSfxEnabled: raw.debrisSfxEnabled ?? DEFAULT_AUDIO_SETTINGS.debrisSfxEnabled,
  };
}

export function loadAudioSettings(): AudioSettings {
  if (cachedSettings) return cachedSettings;

  if (typeof localStorage === 'undefined') {
    cachedSettings = { ...DEFAULT_AUDIO_SETTINGS };
    return cachedSettings;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUDIO);
    if (!raw) {
      cachedSettings = { ...DEFAULT_AUDIO_SETTINGS };
    } else {
      cachedSettings = normalizeSettings(JSON.parse(raw) as Partial<AudioSettings>);
    }
  } catch {
    cachedSettings = { ...DEFAULT_AUDIO_SETTINGS };
  }

  return cachedSettings;
}

export function saveAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  const current = loadAudioSettings();
  cachedSettings = normalizeSettings({ ...current, ...patch });

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_AUDIO, JSON.stringify(cachedSettings));
    } catch {
      // Quota or private mode fallback
    }
  }

  for (const listener of listeners) {
    listener(cachedSettings);
  }

  return cachedSettings;
}

export function subscribeAudioSettings(fn: (settings: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
