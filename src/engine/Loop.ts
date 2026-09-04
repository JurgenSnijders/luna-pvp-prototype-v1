import { perfMonitor } from '../devtools/PerfMonitor';
import { getPresentIntervalMs } from '../devtools/graphicsSettings';

export const FIXED_DT = 1 / 60;
const MAX_FRAME_DT = 0.1;

export interface LoopCallbacks {
  onUpdate: (dt: number) => void;
  onRender: (alpha: number, frameDt: number) => void;
}

export class Loop {
  private running = false;
  private lastTime = 0;
  private lastPresentTime = 0;
  private lastFrameDt = FIXED_DT;
  private accumulator = 0;
  private rafId = 0;
  private paused = false;

  constructor(private callbacks: LoopCallbacks) {}

  getLastFrameDt(): number {
    return this.lastFrameDt;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.lastPresentTime = 0;
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  setPaused(p: boolean): void {
    if (this.paused && !p) {
      this.lastTime = performance.now();
      this.accumulator = 0;
    }
    this.paused = p;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private frame = (now: number): void => {
    if (!this.running) return;

    perfMonitor.beginFrame();

    let frameDt = FIXED_DT;
    if (!this.paused) {
      frameDt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
      this.lastTime = now;
      this.accumulator += frameDt;

      perfMonitor.beginSim();
      while (this.accumulator >= FIXED_DT) {
        this.callbacks.onUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      perfMonitor.endSim();
    } else {
      this.lastTime = now;
    }

    this.lastFrameDt = frameDt;

    const presentInterval = getPresentIntervalMs();
    const shouldPresent =
      presentInterval <= 0 ||
      this.lastPresentTime <= 0 ||
      now - this.lastPresentTime >= presentInterval;

    if (shouldPresent) {
      this.lastPresentTime = now;
      const alpha = this.paused ? 1 : this.accumulator / FIXED_DT;
      perfMonitor.beginRender();
      this.callbacks.onRender(alpha, frameDt);
      perfMonitor.endRender();
    }

    this.rafId = requestAnimationFrame(this.frame);
  };
}
