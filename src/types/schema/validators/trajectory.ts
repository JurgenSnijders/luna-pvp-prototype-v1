import { TRAJECTORY_TYPES } from '../constants';
import type { TrajectoryConfig, TrajectoryType } from '../types';
import { clamp, isNumber, isObject, isString } from './helpers';

function clampOptional(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (!isNumber(value)) return null;
  return clamp(value, min, max);
}

export function validateTrajectoryConfig(value: unknown): TrajectoryConfig | null {
  if (!isObject(value) || !isString(value.type)) return null;
  if (!TRAJECTORY_TYPES.has(value.type)) return null;
  const config: TrajectoryConfig = { type: value.type as TrajectoryType };

  if (value.speed !== undefined) {
    if (!isNumber(value.speed)) return null;
    config.speed = value.speed;
  }
  if (value.turnAccel !== undefined) {
    if (!isNumber(value.turnAccel)) return null;
    config.turnAccel = value.turnAccel;
  }
  if (value.maxRange !== undefined) {
    if (!isNumber(value.maxRange)) return null;
    config.maxRange = value.maxRange;
  }
  if (value.piercing !== undefined) {
    if (!isNumber(value.piercing)) return null;
    config.piercing = value.piercing;
  }
  if (value.orbitRadius !== undefined) {
    if (!isNumber(value.orbitRadius)) return null;
    config.orbitRadius = value.orbitRadius;
  }
  if (value.orbitSpeed !== undefined) {
    if (!isNumber(value.orbitSpeed)) return null;
    config.orbitSpeed = value.orbitSpeed;
  }
  if (value.blinkDistance !== undefined) {
    if (!isNumber(value.blinkDistance)) return null;
    config.blinkDistance = value.blinkDistance;
  }
  if (value.gravityScale !== undefined) {
    const v = clampOptional(value.gravityScale, 0, 8);
    if (v === null) return null;
    config.gravityScale = v;
  }
  if (value.lobApex !== undefined) {
    const v = clampOptional(value.lobApex, 20, 350);
    if (v === null) return null;
    config.lobApex = v;
  }
  if (value.bounces !== undefined) {
    const v = clampOptional(value.bounces, 0, 6);
    if (v === null) return null;
    config.bounces = v;
  }
  if (value.bounceRestitution !== undefined) {
    const v = clampOptional(value.bounceRestitution, 0.1, 0.85);
    if (v === null) return null;
    config.bounceRestitution = v;
  }
  if (value.groundFriction !== undefined) {
    const v = clampOptional(value.groundFriction, 0, 0.5);
    if (v === null) return null;
    config.groundFriction = v;
  }
  if (value.clearanceHeight !== undefined) {
    const v = clampOptional(value.clearanceHeight, 0, 250);
    if (v === null) return null;
    config.clearanceHeight = v;
  }
  if (value.detonateAtZ !== undefined) {
    const v = clampOptional(value.detonateAtZ, 0, 400);
    if (v === null) return null;
    config.detonateAtZ = v;
  }

  return config;
}
