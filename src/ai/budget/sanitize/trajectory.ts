import type { TrajectoryConfig, TrajectoryType } from '../../../types/schema';
import { TRAJECTORY_TYPES } from '../constants';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';

export function sanitizeTrajectory(raw: unknown): TrajectoryConfig {
  const obj = isObject(raw) ? raw : {};
  const rawAltitude = clamp(ensureFiniteNumber(obj.spawnAltitude, 0), 0, 1200);
  const rawFallSpeed = ensureFiniteNumber(obj.fallSpeed, 0);
  const rawLobApex = ensureFiniteNumber(obj.lobApex, 0);

  // Sky drop: altitude or fall speed without a forward mortar lob
  const isSkyDrop =
    rawAltitude > 0 || (rawFallSpeed > 0 && rawLobApex <= 0);

  const typeRaw = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'LINEAR';
  let type = (TRAJECTORY_TYPES.has(typeRaw) ? typeRaw : 'LINEAR') as TrajectoryType;
  if (isSkyDrop) {
    type = 'BALLISTIC_ARC';
  }

  const spawnAltitude =
    rawAltitude > 0 ? rawAltitude : isSkyDrop && rawFallSpeed > 0 ? 600 : rawAltitude;
  const minSpeed = isSkyDrop ? 0 : 150;
  const rawSpeed = ensureFiniteNumber(obj.speed, isSkyDrop ? 0 : 400);
  const speed = isSkyDrop && rawSpeed > 100 ? 0 : clamp(rawSpeed, minSpeed, 1600);

  const config: TrajectoryConfig = {
    type,
    speed,
    maxRange: clamp(ensureFiniteNumber(obj.maxRange, 500), 50, 1200),
  };

  if (isSkyDrop || obj.spawnAltitude !== undefined) {
    config.spawnAltitude = spawnAltitude;
  }
  if (isSkyDrop || obj.fallSpeed !== undefined) {
    config.fallSpeed = clamp(
      ensureFiniteNumber(obj.fallSpeed, isSkyDrop ? 1200 : 0),
      0,
      3000,
    );
  }

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
