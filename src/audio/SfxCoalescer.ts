import type { SfxEvent } from './types';

export interface CoalescedSfxDispatch {
  event: SfxEvent;
  gain: number;
  when: number;
}

interface CategoryConfig {
  mergeRadiusSq: number;
  maxRepsPerFrame: number;
  refractoryMs: number;
}

interface RepBucket {
  event: SfxEvent;
  x: number;
  y: number;
  count: number;
  maxIntensity: number;
}

export function coalescerSubLinearGain(count: number, maxIntensity: number): number {
  return Math.min(1.5, maxIntensity / Math.sqrt(count));
}

function extractIntensity(evt: SfxEvent): number {
  if ('vz' in evt) return Math.min(2.0, Math.abs(evt.vz) / 300);
  if ('speed' in evt) return Math.min(2.0, evt.speed / 400);
  return 1.0;
}

export class SfxCoalescer {
  private queue: SfxEvent[] = [];
  private lastPlayedMs = new Map<string, number>();

  private readonly LOOKAHEAD_SEC = 0.012;

  private readonly CONFIG: Record<string, CategoryConfig> = {
    DEBRIS_CLINK: { mergeRadiusSq: 48 * 48, maxRepsPerFrame: 4, refractoryMs: 35 },
    IMPACT: { mergeRadiusSq: 24 * 24, maxRepsPerFrame: 3, refractoryMs: 25 },
    BOUNCE: { mergeRadiusSq: 32 * 32, maxRepsPerFrame: 3, refractoryMs: 40 },
    GROUND_SLAM: { mergeRadiusSq: 96 * 96, maxRepsPerFrame: 2, refractoryMs: 60 },
    LAUNCH_VERTICAL: { mergeRadiusSq: 64 * 64, maxRepsPerFrame: 2, refractoryMs: 50 },
    UI: { mergeRadiusSq: Infinity, maxRepsPerFrame: 1, refractoryMs: 120 },
    CAST: { mergeRadiusSq: 0, maxRepsPerFrame: 4, refractoryMs: 0 },
    LAVA_SURFACE: { mergeRadiusSq: Infinity, maxRepsPerFrame: 1, refractoryMs: 0 },
  };

  enqueue(event: SfxEvent): void {
    this.queue.push(event);
  }

  flush(nowMs: number, currentTimeSec: number): CoalescedSfxDispatch[] {
    if (this.queue.length === 0) return [];

    const dispatches: CoalescedSfxDispatch[] = [];
    const buckets = new Map<string, RepBucket[]>();

    for (const evt of this.queue) {
      const kind = evt.kind;
      const cfg = this.CONFIG[kind] ?? { mergeRadiusSq: 32 * 32, maxRepsPerFrame: 3, refractoryMs: 30 };

      const lastPlayed = this.lastPlayedMs.get(kind) ?? -Infinity;
      if (cfg.refractoryMs > 0 && nowMs - lastPlayed < cfg.refractoryMs) {
        continue;
      }

      const x = 'x' in evt ? evt.x : 0;
      const y = 'y' in evt ? evt.y : 0;
      const intensity = extractIntensity(evt);

      const reps = buckets.get(kind) ?? [];

      let merged = false;
      if (cfg.mergeRadiusSq > 0) {
        for (const rep of reps) {
          const dx = rep.x - x;
          const dy = rep.y - y;
          if (dx * dx + dy * dy <= cfg.mergeRadiusSq) {
            rep.count++;
            rep.maxIntensity = Math.max(rep.maxIntensity, intensity);
            merged = true;
            break;
          }
        }
      }

      if (!merged) {
        if (reps.length < cfg.maxRepsPerFrame) {
          reps.push({ event: evt, x, y, count: 1, maxIntensity: intensity });
          buckets.set(kind, reps);
        }
      }
    }

    let staggerIndex = 0;
    const baseTime = currentTimeSec + this.LOOKAHEAD_SEC;

    for (const [kind, reps] of buckets.entries()) {
      for (const rep of reps) {
        const gain = coalescerSubLinearGain(rep.count, rep.maxIntensity);
        const jitter = staggerIndex * (0.004 + Math.random() * 0.008);
        const scheduledWhen = baseTime + jitter;

        dispatches.push({
          event: rep.event,
          gain,
          when: scheduledWhen,
        });

        this.lastPlayedMs.set(kind, nowMs);
        staggerIndex++;
      }
    }

    this.queue.length = 0;
    return dispatches;
  }

  clear(): void {
    this.queue.length = 0;
  }
}
