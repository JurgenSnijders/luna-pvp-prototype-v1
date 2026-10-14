import { getTierLimits } from '../devtools/graphicsSettings';

export interface Light {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
  born: number;
  lifeMs: number;
  falloff: number;
  /** 1 = full strength (frame lights); timed lights fade with age. */
  fade: number;
}

export class LightLayer {
  private frameLights: Light[] = [];
  private timedLights: Light[] = [];

  pushFrameLight(
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
    falloff = 2,
  ): void {
    const cap = getTierLimits().maxLights;
    if (cap <= 0) return;
    if (this.frameLights.length + this.timedLights.length >= cap) return;
    this.frameLights.push({
      x,
      y,
      radius,
      r,
      g,
      b,
      intensity,
      born: 0,
      lifeMs: 0,
      falloff,
      fade: 1,
    });
  }

  pushTimedLight(
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
    lifeMs: number,
    now: number,
    falloff = 2,
  ): void {
    const cap = getTierLimits().maxLights;
    if (cap <= 0) return;
    while (this.frameLights.length + this.timedLights.length >= cap) {
      if (!this.evictWeakestTimed()) break;
    }
    if (this.frameLights.length + this.timedLights.length >= cap) return;
    this.timedLights.push({
      x,
      y,
      radius,
      r,
      g,
      b,
      intensity,
      born: now,
      lifeMs: Math.max(1, lifeMs),
      falloff,
      fade: 1,
    });
  }

  private evictWeakestTimed(): boolean {
    if (this.timedLights.length === 0) return false;
    let idx = 0;
    let weakest = this.timedLights[0].intensity * this.timedLights[0].fade;
    for (let i = 1; i < this.timedLights.length; i++) {
      const w = this.timedLights[i].intensity * this.timedLights[i].fade;
      if (w < weakest) {
        weakest = w;
        idx = i;
      }
    }
    this.timedLights.splice(idx, 1);
    return true;
  }

  update(now: number): void {
    const next: Light[] = [];
    for (const light of this.timedLights) {
      const age = now - light.born;
      if (age >= light.lifeMs) continue;
      const t = age / light.lifeMs;
      const fade = 1 - t * t;
      next.push({ ...light, fade });
    }
    this.timedLights = next;
  }

  clearFrameLights(): void {
    this.frameLights.length = 0;
  }

  clearAll(): void {
    this.frameLights.length = 0;
    this.timedLights.length = 0;
  }

  getActive(): Light[] {
    if (this.timedLights.length === 0) return this.frameLights;
    if (this.frameLights.length === 0) return this.timedLights;
    return [...this.frameLights, ...this.timedLights];
  }

  getCount(): number {
    return this.frameLights.length + this.timedLights.length;
  }
}
