export class ArenaShrink {
  initialRadius: number;
  minRadius: number;
  currentRadius: number;
  gracePeriodSec = 12;
  shrinkRate = 15;
  elapsedSec = 0;
  isShrinking = false;
  enabled = true;

  constructor(initialRadius: number) {
    this.initialRadius = initialRadius;
    this.minRadius = initialRadius * (150 / 420);
    this.currentRadius = initialRadius;
  }

  update(dt: number): void {
    if (!this.enabled) {
      this.isShrinking = false;
      this.currentRadius = this.initialRadius;
      return;
    }

    this.elapsedSec += dt;
    if (this.elapsedSec > this.gracePeriodSec) {
      const shrinkElapsed = this.elapsedSec - this.gracePeriodSec;
      this.currentRadius = Math.max(
        this.minRadius,
        this.initialRadius - shrinkElapsed * this.shrinkRate,
      );
      this.isShrinking = true;
    }
  }

  reset(): void {
    this.currentRadius = this.initialRadius;
    this.elapsedSec = 0;
    this.isShrinking = false;
  }

  getShrinkProgress(): number {
    const range = this.initialRadius - this.minRadius;
    if (range <= 0) return 0;
    return Math.max(0, Math.min(1, (this.initialRadius - this.currentRadius) / range));
  }

  resize(newInitialRadius: number): void {
    const ratio = newInitialRadius / this.initialRadius;
    this.initialRadius = newInitialRadius;
    this.minRadius = newInitialRadius * (150 / 420);
    this.currentRadius = Math.max(this.minRadius, this.currentRadius * ratio);
  }
}
