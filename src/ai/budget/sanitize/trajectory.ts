import type { TrajectoryConfig, TrajectoryType } from '../../../types/schema';
import { TRAJECTORY_TYPES } from '../constants';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';

export function sanitizeTrajectory(raw: unknown): TrajectoryConfig {
  const obj = isObject(raw) ? raw : {};
  const typeRaw = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'LINEAR';
  const type = (TRAJECTORY_TYPES.has(typeRaw) ? typeRaw : 'LINEAR') as TrajectoryType;

  const config: TrajectoryConfig = {
    type,
    speed: clamp(ensureFiniteNumber(obj.speed, 400), 150, 1600),
    maxRange: clamp(ensureFiniteNumber(obj.maxRange, 500), 50, 1200),
  };

  if (obj.turnAccel !== undefined) {
    config.turnAccel = ensureFiniteNumber(obj.turnAccel, 800);
  }
  if (obj.piercing !== undefined) {
    config.piercing = clamp(ensureFiniteNumber(obj.piercing, 0), 0, 4);
  }
  if (obj.orbitRadius !== undefined) {
    config.orbitRadius = ensureFiniteNumber(obj.orbitRadius, 80);
  }
  if (obj.orbitSpeed !== undefined) {
    config.orbitSpeed = ensureFiniteNumber(obj.orbitSpeed, 3);
  }
  if (obj.blinkDistance !== undefined) {
    config.blinkDistance = ensureFiniteNumber(obj.blinkDistance, 60);
  }

  return config;
}
