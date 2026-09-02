const BLUR_HALF_LIFE = 0.18;
const GLITCH_HALF_LIFE = 0.12;
export const REACTIVE_SHOCK_DURATION = 0.45;

export interface ReactiveFxSnapshot {
  blur: number;
  glitch: number;
  shock: number;
  shockAge: number;
  worldX: number;
  worldY: number;
}

class ReactiveFx {
  private blurEnvelope = 0;
  private glitchEnvelope = 0;
  private shockStrength = 0;
  private shockAge = REACTIVE_SHOCK_DURATION;
  private worldX = 0;
  private worldY = 0;

  pulse(worldX: number, worldY: number, strength: number): void {
    const s = Math.max(0, Math.min(1, strength));
    this.blurEnvelope = Math.max(this.blurEnvelope, s);
    this.glitchEnvelope = Math.max(this.glitchEnvelope, s);
    this.shockStrength = s;
    this.shockAge = 0;
    this.worldX = worldX;
    this.worldY = worldY;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    const blurDecay = Math.pow(0.5, dt / BLUR_HALF_LIFE);
    const glitchDecay = Math.pow(0.5, dt / GLITCH_HALF_LIFE);
    this.blurEnvelope *= blurDecay;
    this.glitchEnvelope *= glitchDecay;
    this.shockAge += dt;
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
