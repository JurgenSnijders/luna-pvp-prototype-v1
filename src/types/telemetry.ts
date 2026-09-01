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
