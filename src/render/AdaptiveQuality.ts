import {
  getGraphicsSettings,
  setAdaptiveEffectiveTier,
  type QualityTier,
} from '../devtools/graphicsSettings';
import { perfMonitor } from '../devtools/PerfMonitor';

const TIERS: Exclude<QualityTier, 'AUTO'>[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
const STEP_DOWN_MS = 14;
const STEP_UP_MS = 9;
const DOWN_HOLD_FRAMES = 90;
const UP_HOLD_FRAMES = 300;
const COOLDOWN_MS = 5000;

export class AdaptiveQuality {
  private aboveCount = 0;
  private belowCount = 0;
  private lastChange = 0;
  private current: Exclude<QualityTier, 'AUTO'> = 'HIGH';

  update(): void {
    const settings = getGraphicsSettings();
    if (settings.tier !== 'AUTO' || settings.manualTierOverride) return;

    const now = performance.now();
    if (now - this.lastChange < COOLDOWN_MS) return;

    const snap = perfMonitor.getSnapshot();
    if (snap.frameMsP95 > STEP_DOWN_MS) {
      this.aboveCount++;
      this.belowCount = 0;
    } else if (snap.frameMsP95 < STEP_UP_MS) {
      this.belowCount++;
      this.aboveCount = 0;
    } else {
      this.aboveCount = Math.max(0, this.aboveCount - 1);
      this.belowCount = Math.max(0, this.belowCount - 1);
    }

    const idx = TIERS.indexOf(this.current);
    if (this.aboveCount >= DOWN_HOLD_FRAMES && idx > 0) {
      this.current = TIERS[idx - 1];
      setAdaptiveEffectiveTier(this.current);
      this.aboveCount = 0;
      this.lastChange = now;
    } else if (this.belowCount >= UP_HOLD_FRAMES && idx < TIERS.length - 1) {
      this.current = TIERS[idx + 1];
      setAdaptiveEffectiveTier(this.current);
      this.belowCount = 0;
      this.lastChange = now;
    }
  }
}

export const adaptiveQuality = new AdaptiveQuality();
