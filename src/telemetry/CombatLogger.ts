import type {
  AbilityCastEvent,
  CombatEvent,
  FieldTickEvent,
  ImpulseAppliedEvent,
  RamCollisionEvent,
  SlamCollisionEvent,
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

  getRecentEvents(durationMs = 10000, currentTimeMs?: number): CombatEvent[] {
    if (this.buffer.length === 0) return [];
    const latestTime = currentTimeMs ?? this.buffer[this.buffer.length - 1].timeMs;
    const threshold = latestTime - durationMs;
    return this.buffer.filter((e) => e.timeMs >= threshold);
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
    const rows = events.map((e) => this.formatEventRow(e));
    return [header, divider, ...rows].join('\n');
  }

  private formatEventRow(e: CombatEvent): string {
    const frame = String(e.frame).padStart(5);
    const time = e.timeMs.toFixed(1).padStart(8);
    const type = e.type.padEnd(17);

    switch (e.type) {
      case 'ABILITY_CAST':
        return `${frame}  ${time}  ${type}  ${e.casterId.padEnd(20)}  aim=(${e.aimDirection.x.toFixed(1)},${e.aimDirection.y.toFixed(1)}) recoil=${e.recoilKick.toFixed(0)}  cd=${e.cooldownMs}ms`;
      case 'IMPULSE_APPLIED': {
        const pair = `${e.sourceId}->${e.targetId}`.padEnd(20);
        const params = `F=${e.baseForce.toFixed(0)} mode=${e.directionMode} m=${e.targetMass.toFixed(1)}`.padEnd(32);
        const delta = `dv=(${e.deltaVelocity.x.toFixed(1)},${e.deltaVelocity.y.toFixed(1)})`;
        return `${frame}  ${time}  ${type}  ${pair}  ${params}  ${delta}`;
      }
      case 'FIELD_ACCEL_TICK': {
        const pair = `${e.zoneId}->${e.targetId}`.padEnd(20);
        const params = `${e.fieldType} d=${e.distance.toFixed(0)} str=${e.strength.toFixed(0)}`.padEnd(32);
        const delta = `a=(${e.acceleration.x.toFixed(1)},${e.acceleration.y.toFixed(1)})`;
        return `${frame}  ${time}  ${type}  ${pair}  ${params}  ${delta}`;
      }
      case 'RAM_COLLISION': {
        const pair = `${e.rammerId}->${e.targetId}`.padEnd(20);
        const params = `v_n=${e.relativeVelocityNormal.toFixed(1)} J=${e.impulseMagnitude.toFixed(1)} mu=${e.reducedMass.toFixed(1)}`.padEnd(32);
        const delta = `instab+${e.targetInstabDelta.toFixed(1)} tot=${e.targetInstabTotal.toFixed(1)}`;
        return `${frame}  ${time}  ${type}  ${pair}  ${params}  ${delta}`;
      }
      case 'SLAM_COLLISION': {
        const pair = `${e.entityId}@${e.surfaceType}`.padEnd(20);
        const params = `v_imp=${e.impactSpeed.toFixed(1)} n=(${e.surfaceNormal.x.toFixed(2)},${e.surfaceNormal.y.toFixed(2)})`.padEnd(32);
        const delta = `instab+${e.instabDelta.toFixed(1)} tot=${e.instabTotal.toFixed(1)}`;
        return `${frame}  ${time}  ${type}  ${pair}  ${params}  ${delta}`;
      }
    }
  }

  clear(): void {
    this.buffer = [];
    this.eventCounter = 0;
    this.simFrame = 0;
    this.simTimeMs = 0;
  }
}
