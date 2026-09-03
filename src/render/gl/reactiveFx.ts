export const DEFAULT_BLUR_HALF_LIFE = 0.18;
export const DEFAULT_GLITCH_HALF_LIFE = 0.12;
export const DEFAULT_SHOCK_DURATION = 0.45;
export const DEFAULT_LIGHT_PULSE = 0.45;
export const DEFAULT_HEAVY_PULSE = 1;

export interface ReactiveFxTuning {
  blurHalfLife: number;
  glitchHalfLife: number;
  shockDuration: number;
  blurLight: number;
  blurHeavy: number;
  glitchLight: number;
  glitchHeavy: number;
  shockLight: number;
  shockHeavy: number;
}

export const DEFAULT_REACTIVE_TUNING: ReactiveFxTuning = {
  blurHalfLife: DEFAULT_BLUR_HALF_LIFE,
  glitchHalfLife: DEFAULT_GLITCH_HALF_LIFE,
  shockDuration: DEFAULT_SHOCK_DURATION,
  blurLight: DEFAULT_LIGHT_PULSE,
  blurHeavy: DEFAULT_HEAVY_PULSE,
  glitchLight: DEFAULT_LIGHT_PULSE,
  glitchHeavy: DEFAULT_HEAVY_PULSE,
  shockLight: DEFAULT_LIGHT_PULSE,
  shockHeavy: DEFAULT_HEAVY_PULSE,
};

export interface ReactiveFxSnapshot {
  blur: number;
  glitch: number;
  shock: number;
  shockAge: number;
  worldX: number;
  worldY: number;
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envelope(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

class ReactiveFx {
  private tuning: ReactiveFxTuning = { ...DEFAULT_REACTIVE_TUNING };
  private blurEnvelope = 0;
  private glitchEnvelope = 0;
  private shockStrength = 0;
  private shockAge = Number.POSITIVE_INFINITY;
  private worldX = 0;
  private worldY = 0;

  setTuning(tuning: Partial<ReactiveFxTuning>): void {
    this.tuning = {
      blurHalfLife: tuning.blurHalfLife ?? this.tuning.blurHalfLife,
      glitchHalfLife: tuning.glitchHalfLife ?? this.tuning.glitchHalfLife,
      shockDuration: tuning.shockDuration ?? this.tuning.shockDuration,
      blurLight: tuning.blurLight ?? this.tuning.blurLight,
      blurHeavy: tuning.blurHeavy ?? this.tuning.blurHeavy,
      glitchLight: tuning.glitchLight ?? this.tuning.glitchLight,
      glitchHeavy: tuning.glitchHeavy ?? this.tuning.glitchHeavy,
      shockLight: tuning.shockLight ?? this.tuning.shockLight,
      shockHeavy: tuning.shockHeavy ?? this.tuning.shockHeavy,
    };
  }

  pulse(worldX: number, worldY: number, isHeavy: boolean): void {
    const t = this.tuning;
    this.blurEnvelope = Math.max(this.blurEnvelope, envelope(isHeavy ? t.blurHeavy : t.blurLight));
    this.glitchEnvelope = Math.max(
      this.glitchEnvelope,
      envelope(isHeavy ? t.glitchHeavy : t.glitchLight),
    );
    this.shockStrength = envelope(isHeavy ? t.shockHeavy : t.shockLight);
    this.shockAge = 0;
    this.worldX = worldX;
    this.worldY = worldY;
  }

  update(dt: number, tuning?: Partial<ReactiveFxTuning>): void {
    if (tuning) this.setTuning(tuning);
    if (dt <= 0) return;
    const blurDecay = Math.pow(0.5, dt / positive(this.tuning.blurHalfLife, DEFAULT_BLUR_HALF_LIFE));
    const glitchDecay = Math.pow(
      0.5,
      dt / positive(this.tuning.glitchHalfLife, DEFAULT_GLITCH_HALF_LIFE),
    );
    this.blurEnvelope *= blurDecay;
    this.glitchEnvelope *= glitchDecay;
    this.shockAge += dt;
  }

  getShockDuration(): number {
    return positive(this.tuning.shockDuration, DEFAULT_SHOCK_DURATION);
  }

  snapshot(): ReactiveFxSnapshot {
    return {
      blur: this.blurEnvelope,
      glitch: this.glitchEnvelope,
      shock: this.shockStrength,
      shockAge: this.shockAge,
      worldX: this.worldX,
      worldY: this.worldY,
    };
  }
}

export const reactiveFx = new ReactiveFx();
