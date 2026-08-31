import { getGraphicsSettings } from '../devtools/graphicsSettings';

export class ScreenShake {
  private intensity = 0;
  private duration = 0;
  /** Duration envelope used to normalize fade (seconds). */
  private totalDuration = 0;

  trigger(amount: number, durationMs = 0.15): void {
    const scale = getGraphicsSettings().screenShakeIntensity;
    if (scale <= 0) return;
    this.intensity = Math.max(this.intensity, amount * scale);
    if (this.duration <= 0) {
      this.totalDuration = durationMs;
    } else {
      this.totalDuration = Math.max(this.totalDuration, durationMs);
    }
    this.duration = Math.max(this.duration, durationMs);
  }

  update(dt: number): { x: number; y: number } {
    if (this.duration <= 0) {
      this.totalDuration = 0;
      return { x: 0, y: 0 };
    }
    this.duration -= dt;
    const fade = this.totalDuration > 0 ? this.duration / this.totalDuration : 0;
    const shake = this.intensity * fade;
    this.intensity *= 0.9;
    return {
      x: (Math.random() - 0.5) * shake * 2,
      y: (Math.random() - 0.5) * shake * 2,
    };
  }
}

export const screenShake = new ScreenShake();
