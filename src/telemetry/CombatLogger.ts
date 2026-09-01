import type {
  AbilityCastEvent,
  CombatEvent,
  CombatEventSummary,
  FieldTickEvent,
  ImpulseAppliedEvent,
  RamCollisionEvent,
  SlamCollisionEvent,
} from '../types/telemetry';
import {
  formatEventParams,
  formatEventRowAscii,
  formatInstability,
  formatKinematicDelta,
  getEventEndpoints,
} from '../types/telemetry';

type RecordableEvent =
  | Omit<AbilityCastEvent, 'id' | 'frame' | 'timeMs'>
  | Omit<ImpulseAppliedEvent, 'id' | 'frame' | 'timeMs'>
  | Omit<FieldTickEvent, 'id' | 'frame' | 'timeMs'>
  | Omit<RamCollisionEvent, 'id' | 'frame' | 'timeMs'>
  | Omit<SlamCollisionEvent, 'id' | 'frame' | 'timeMs'>;

export class CombatLogger {
  private static instance: CombatLogger;
  private buffer: CombatEvent[] = [];
  private maxCapacity = 1000;
  private eventCounter = 0;
  private simFrame = 0;
  private simTimeMs = 0;
  public enabled = true;

  public static getInstance(): CombatLogger {
    if (!CombatLogger.instance) {
      CombatLogger.instance = new CombatLogger();
    }
    return CombatLogger.instance;
  }

  advanceClock(dt: number): void {
    this.simFrame++;
    this.simTimeMs += dt * 1000;
  }

  getFrame(): number {
    return this.simFrame;
  }

  getTimeMs(): number {
    return this.simTimeMs;
  }

  record(event: RecordableEvent): void {
    if (!this.enabled) return;
    const fullEvent = {
      ...event,
      id: ++this.eventCounter,
      frame: this.simFrame,
      timeMs: this.simTimeMs,
    } as CombatEvent;
    if (this.buffer.length >= this.maxCapacity) {
      this.buffer.shift();
    }
    this.buffer.push(fullEvent);
  }

  getAllEvents(): CombatEvent[] {
    return [...this.buffer];
  }

  getRecentEvents(durationMs = 10000, currentTimeMs?: number): CombatEvent[] {
    if (this.buffer.length === 0) return [];
    if (!Number.isFinite(durationMs)) return this.getAllEvents();
    const latestTime = currentTimeMs ?? this.buffer[this.buffer.length - 1].timeMs;
    const threshold = latestTime - durationMs;
    return this.buffer.filter((e) => e.timeMs >= threshold);
  }

  getEventSummary(durationMs = 10000): CombatEventSummary {
    const events = this.getRecentEvents(durationMs);
    const counts: Partial<Record<CombatEvent['type'], number>> = {};
    let peakImpulse = 0;
    let highestInstability = 0;

    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (e.type === 'RAM_COLLISION') {
        peakImpulse = Math.max(peakImpulse, e.impulseMagnitude);
        highestInstability = Math.max(
          highestInstability,
          e.targetInstabDelta,
          e.targetInstabTotal,
        );
      }
      if (e.type === 'SLAM_COLLISION') {
        highestInstability = Math.max(highestInstability, e.instabDelta, e.instabTotal);
      }
    }

    return { counts, total: events.length, peakImpulse, highestInstability };
  }

  dumpConsoleTable(durationMs = 10000, filterType?: CombatEvent['type']): void {
    let events = this.getRecentEvents(durationMs);
    if (filterType) {
      events = events.filter((e) => e.type === filterType);
    }

    const rows = events.map((e) => {
      const { source, target } = getEventEndpoints(e);
      const kinematic = formatKinematicDelta(e);
      const instab = formatInstability(e);
      const deltaState = instab !== '—' ? `${kinematic} | ${instab}` : kinematic;
      return {
        'Time(s)': (e.timeMs / 1000).toFixed(2),
        Frame: e.frame,
        Type: e.type,
        Source: source,
        Target: target,
        'Key Parameters': formatEventParams(e),
        'Delta / State': deltaState,
      };
    });

    const windowLabel = Number.isFinite(durationMs) ? `${durationMs / 1000}s` : 'ALL';
    console.log(`[CombatLogger] ${rows.length} events (last ${windowLabel})`);
    console.table(rows);
  }

  exportJson(durationMs = 10000): string {
    return JSON.stringify(this.getRecentEvents(durationMs), null, 2);
  }

  exportAsciiTable(durationMs = 10000): string {
    const events = this.getRecentEvents(durationMs);
    const header =
      'Frame  Time(ms)  Event Type         Source -> Target      Key Parameters                    State Delta';
    const divider =
      '-----  --------  -----------------  --------------------  --------------------------------  --------------------------------';
    const rows = events.map((e) => formatEventRowAscii(e));
    return [header, divider, ...rows].join('\n');
  }

  clear(): void {
    this.buffer = [];
    this.eventCounter = 0;
    this.simFrame = 0;
    this.simTimeMs = 0;
  }
}
