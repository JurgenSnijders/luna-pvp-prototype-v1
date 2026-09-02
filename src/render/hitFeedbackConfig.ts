export interface HitFeedbackConfig {
  targetFlash: boolean;
  reticleMarkers: boolean;
  bodyDeform: boolean;
  microHitstop: boolean;
  ghostInstabilityBar: boolean;
  directionalBlastRings: boolean;
}

export const DEFAULT_HIT_FEEDBACK_CONFIG: HitFeedbackConfig = {
  targetFlash: true,
  reticleMarkers: true,
  bodyDeform: true,
  microHitstop: true,
  ghostInstabilityBar: true,
  directionalBlastRings: true,
};

export const hitFeedbackConfig: HitFeedbackConfig = { ...DEFAULT_HIT_FEEDBACK_CONFIG };

const STORAGE_KEY = 'hit_feedback_config_v1';

export function loadHitFeedbackConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<HitFeedbackConfig>;
    Object.assign(hitFeedbackConfig, DEFAULT_HIT_FEEDBACK_CONFIG, parsed);
  } catch {
    // ignore corrupt storage
  }
}

export function saveHitFeedbackConfig(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hitFeedbackConfig));
  } catch {
    // ignore quota errors
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as { __hitFeedbackConfig?: HitFeedbackConfig }).__hitFeedbackConfig =
    hitFeedbackConfig;
}
