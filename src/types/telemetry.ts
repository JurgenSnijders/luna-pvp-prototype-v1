import { Vector2D } from '../math/Vector2D';

export type CombatEventType =
  | 'ABILITY_CAST'
  | 'PROJECTILE_SPAWN'
  | 'IMPULSE_APPLIED'
  | 'FIELD_ACCEL_TICK'
  | 'RAM_COLLISION'
  | 'SLAM_COLLISION'
  | 'INSTABILITY_DELTA'
  | 'STATUS_APPLIED';

export interface VectorTelemetry {
  x: number;
  y: number;
  mag: number;
}

export interface BaseCombatEvent {
  id: number;
  frame: number;
  timeMs: number;
  type: CombatEventType;
}

export interface ImpulseAppliedEvent extends BaseCombatEvent {
  type: 'IMPULSE_APPLIED';
  sourceId: string;
  targetId: string;
  abilityId?: string;
  baseForce: number;
  directionMode: string;
  appliedDirection: VectorTelemetry;
  targetMass: number;
  deltaVelocity: VectorTelemetry;
  velocityBefore: VectorTelemetry;
  velocityAfter: VectorTelemetry;
}

export interface FieldTickEvent extends BaseCombatEvent {
  type: 'FIELD_ACCEL_TICK';
  zoneId: string;
  fieldType: string;
  targetId: string;
  fieldCenter: { x: number; y: number };
  distance: number;
  strength: number;
  acceleration: VectorTelemetry;
  velocityBefore: VectorTelemetry;
  velocityAfter: VectorTelemetry;
}

export interface RamCollisionEvent extends BaseCombatEvent {
  type: 'RAM_COLLISION';
  rammerId: string;
  targetId: string;
  relativeVelocityNormal: number;
  collisionNormal: VectorTelemetry;
  impulseMagnitude: number;
  reducedMass: number;
  rammerVelBefore: VectorTelemetry;
  rammerVelAfter: VectorTelemetry;
  targetVelBefore: VectorTelemetry;
  targetVelAfter: VectorTelemetry;
  targetInstabDelta: number;
  targetInstabTotal: number;
}

export interface SlamCollisionEvent extends BaseCombatEvent {
  type: 'SLAM_COLLISION';
  entityId: string;
  surfaceType: 'OBSTACLE' | 'HEX_BOUNDARY' | 'VIEWPORT';
  impactSpeed: number;
  surfaceNormal: VectorTelemetry;
  instabDelta: number;
  instabTotal: number;
  velBefore: VectorTelemetry;
  velAfter: VectorTelemetry;
}

export interface AbilityCastEvent extends BaseCombatEvent {
  type: 'ABILITY_CAST';
  casterId: string;
  abilityId: string;
  archetype?: string;
  aimDirection: VectorTelemetry;
  recoilKick: number;
  cooldownMs: number;
}

export type CombatEvent =
  | ImpulseAppliedEvent
  | FieldTickEvent
  | RamCollisionEvent
  | SlamCollisionEvent
  | AbilityCastEvent;

export function vecTelemetry(v: Vector2D): VectorTelemetry {
  return { x: v.x, y: v.y, mag: v.mag() };
}

export function deltaVec(before: VectorTelemetry, after: VectorTelemetry): VectorTelemetry {
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  return { x: dx, y: dy, mag: Math.sqrt(dx * dx + dy * dy) };
}

export type TelemetryFilterCategory = 'ALL' | 'CASTS' | 'IMPULSES' | 'FIELDS' | 'RAMS' | 'SLAMS';

export const EVENT_TYPE_COLORS: Record<CombatEvent['type'], string> = {
  ABILITY_CAST: '#00e5ff',
  IMPULSE_APPLIED: '#22c55e',
  FIELD_ACCEL_TICK: '#a855f7',
  RAM_COLLISION: '#f97316',
  SLAM_COLLISION: '#f43f5e',
};

export const CATEGORY_TO_TYPES: Record<
  Exclude<TelemetryFilterCategory, 'ALL'>,
  CombatEvent['type']
> = {
  CASTS: 'ABILITY_CAST',
  IMPULSES: 'IMPULSE_APPLIED',
  FIELDS: 'FIELD_ACCEL_TICK',
  RAMS: 'RAM_COLLISION',
  SLAMS: 'SLAM_COLLISION',
};

export const EVENT_TYPE_SHORT_LABEL: Record<CombatEvent['type'], string> = {
  ABILITY_CAST: 'CAST',
  IMPULSE_APPLIED: 'IMPULSE',
  FIELD_ACCEL_TICK: 'FIELD',
  RAM_COLLISION: 'RAM',
  SLAM_COLLISION: 'SLAM',
};

export interface CombatEventSummary {
  counts: Partial<Record<CombatEvent['type'], number>>;
  total: number;
  peakImpulse: number;
  highestInstability: number;
}

export interface CombatLogApi {
  dump: (durationMs?: number, type?: CombatEvent['type']) => void;
  json: (durationMs?: number) => CombatEvent[];
  summary: (durationMs?: number) => CombatEventSummary;
  clear: () => void;
  copy: (durationMs?: number) => Promise<number>;
  exportAscii: (durationMs?: number) => void;
}

export function formatVec(v: VectorTelemetry): string {
  return `(${v.x.toFixed(1)}, ${v.y.toFixed(1)} | ${v.mag.toFixed(1)})`;
}

export function getEventEndpoints(e: CombatEvent): { source: string; target: string } {
  switch (e.type) {
    case 'ABILITY_CAST':
      return { source: e.casterId, target: '—' };
    case 'IMPULSE_APPLIED':
      return { source: e.sourceId, target: e.targetId };
    case 'FIELD_ACCEL_TICK':
      return { source: e.zoneId, target: e.targetId };
    case 'RAM_COLLISION':
      return { source: e.rammerId, target: e.targetId };
    case 'SLAM_COLLISION':
      return { source: e.entityId, target: e.surfaceType };
  }
}

export function formatEventParams(e: CombatEvent): string {
  switch (e.type) {
    case 'ABILITY_CAST':
      return `aim=${formatVec(e.aimDirection)} recoil=${e.recoilKick.toFixed(0)} cd=${e.cooldownMs}ms`;
    case 'IMPULSE_APPLIED':
      return `Force:${e.baseForce.toFixed(0)} Mode:${e.directionMode} m=${e.targetMass.toFixed(1)}`;
    case 'FIELD_ACCEL_TICK':
      return `Type:${e.fieldType} Dist:${e.distance.toFixed(0)}px Str:${e.strength.toFixed(0)}`;
    case 'RAM_COLLISION':
      return `v_n:${e.relativeVelocityNormal.toFixed(1)}px/s μ:${e.reducedMass.toFixed(1)} J:${e.impulseMagnitude.toFixed(1)}`;
    case 'SLAM_COLLISION':
      return `Speed:${e.impactSpeed.toFixed(1)}px/s Surface:${e.surfaceType}`;
  }
}

export function formatKinematicDelta(e: CombatEvent): string {
  switch (e.type) {
    case 'ABILITY_CAST':
      return '—';
    case 'IMPULSE_APPLIED':
      return `|v|: ${e.velocityBefore.mag.toFixed(1)} → ${e.velocityAfter.mag.toFixed(1)}px/s (Δv:${e.deltaVelocity.mag.toFixed(1)})`;
    case 'FIELD_ACCEL_TICK':
      return `|v|: ${e.velocityBefore.mag.toFixed(1)} → ${e.velocityAfter.mag.toFixed(1)}px/s a=${formatVec(e.acceleration)}`;
    case 'RAM_COLLISION': {
      const dvx = e.targetVelAfter.x - e.targetVelBefore.x;
      const dvy = e.targetVelAfter.y - e.targetVelBefore.y;
      const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);
      return `target |v|: ${e.targetVelBefore.mag.toFixed(1)} → ${e.targetVelAfter.mag.toFixed(1)}px/s (Δv:${dvMag.toFixed(1)})`;
    }
    case 'SLAM_COLLISION':
      return `|v|: ${e.velBefore.mag.toFixed(1)} → ${e.velAfter.mag.toFixed(1)}px/s`;
  }
}

export function formatInstability(e: CombatEvent): string {
  switch (e.type) {
    case 'ABILITY_CAST':
    case 'FIELD_ACCEL_TICK':
      return '—';
    case 'IMPULSE_APPLIED':
      return '—';
    case 'RAM_COLLISION':
      return `+${e.targetInstabDelta.toFixed(1)}% (${e.targetInstabTotal.toFixed(1)}%)`;
    case 'SLAM_COLLISION':
      return `+${e.instabDelta.toFixed(1)}% (${e.instabTotal.toFixed(1)}%)`;
  }
}

export function eventMatchesSearch(e: CombatEvent, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const endpoints = getEventEndpoints(e);
  const haystack = [
    endpoints.source,
    endpoints.target,
    e.type,
    formatEventParams(e),
    JSON.stringify(e),
  ]
    .join(' ')
    .toLowerCase();
  if (e.type === 'ABILITY_CAST' && e.abilityId.toLowerCase().includes(q)) return true;
  if (e.type === 'IMPULSE_APPLIED' && e.abilityId?.toLowerCase().includes(q)) return true;
  if (e.type === 'FIELD_ACCEL_TICK' && e.fieldType.toLowerCase().includes(q)) return true;
  return haystack.includes(q);
}

export function filterByCategory(
  events: CombatEvent[],
  category: TelemetryFilterCategory,
): CombatEvent[] {
  if (category === 'ALL') return events;
  const type = CATEGORY_TO_TYPES[category];
  return events.filter((e) => e.type === type);
}

export function formatEventRowAscii(e: CombatEvent): string {
  const frame = String(e.frame).padStart(5);
  const time = e.timeMs.toFixed(1).padStart(8);
  const type = e.type.padEnd(17);
  const { source, target } = getEventEndpoints(e);
  const pair = `${source}->${target}`.padEnd(20);
  const params = formatEventParams(e).padEnd(32);
  const delta = `${formatKinematicDelta(e)} ${formatInstability(e)}`.trim();
  return `${frame}  ${time}  ${type}  ${pair}  ${params}  ${delta}`;
}

declare global {
  interface Window {
    combatLog?: CombatLogApi;
  }
}
