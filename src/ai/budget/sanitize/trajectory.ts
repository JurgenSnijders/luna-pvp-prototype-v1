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

  if (type === 'BALLISTIC_ARC' || obj.gravityScale !== undefined) {
    config.gravityScale = clamp(ensureFiniteNumber(obj.gravityScale, 1.0), 0, 8);
  }
  if (type === 'BALLISTIC_ARC' || obj.lobApex !== undefined) {
    config.lobApex = clamp(ensureFiniteNumber(obj.lobApex, 80), 20, 350);
  }
  if (type === 'BALLISTIC_ARC' || obj.bounces !== undefined) {
    config.bounces = clamp(ensureFiniteNumber(obj.bounces, 0), 0, 6);
  }
  if (type === 'BALLISTIC_ARC' || obj.bounceRestitution !== undefined) {
    config.bounceRestitution = clamp(ensureFiniteNumber(obj.bounceRestitution, 0.55), 0.1, 0.85);
  }
  if (type === 'BALLISTIC_ARC' || obj.groundFriction !== undefined) {
    config.groundFriction = clamp(ensureFiniteNumber(obj.groundFriction, 0.15), 0, 0.5);
  }
  if (obj.clearanceHeight !== undefined) {
    config.clearanceHeight = clamp(ensureFiniteNumber(obj.clearanceHeight, 0), 0, 250);
  }
  if (obj.detonateAtZ !== undefined) {
    config.detonateAtZ = clamp(ensureFiniteNumber(obj.detonateAtZ, 0), 0, 400);
  }

  return config;
}
