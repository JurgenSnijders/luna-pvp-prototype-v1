import { PATH_SPACE_SET, TRAJECTORY_TYPES } from '../constants';
import type {
  PathPoint,
  TrajectoryConfig,
  TrajectoryMotion,
  TrajectoryType,
} from '../types';
import { clamp, isNumber, isObject, isString } from './helpers';

const PATH_COORD_MIN = -2000;
const PATH_COORD_MAX = 2000;
const PATH_POINT_MIN = 2;
const PATH_POINT_MAX = 24;

function validatePathPoints(value: unknown): PathPoint[] | null {
  if (!Array.isArray(value) || value.length < PATH_POINT_MIN || value.length > PATH_POINT_MAX) {
    return null;
  }
  const points: PathPoint[] = [];
  for (const entry of value) {
    if (!isObject(entry) || !isNumber(entry.x) || !isNumber(entry.y)) return null;
    points.push({
      x: clamp(entry.x, PATH_COORD_MIN, PATH_COORD_MAX),
      y: clamp(entry.y, PATH_COORD_MIN, PATH_COORD_MAX),
    });
  }
  return points.length >= PATH_POINT_MIN ? points : null;
}

function clampOptional(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (!isNumber(value)) return null;
  return clamp(value, min, max);
}

function validateMotion(value: unknown): TrajectoryMotion | null {
  if (!isObject(value)) return null;
  const motion: TrajectoryMotion = {};

  if (value.wobble !== undefined) {
    if (!isObject(value.wobble)) return null;
    const amp = clampOptional(value.wobble.amplitudeDeg, 0, 45);
    const freq = clampOptional(value.wobble.frequencyHz, 0.5, 8);
    if (amp === null || freq === null) return null;
    const wobble: TrajectoryMotion['wobble'] = { amplitudeDeg: amp, frequencyHz: freq };
    if (value.wobble.decay !== undefined) {
      const decay = clampOptional(value.wobble.decay, 0, 4);
      if (decay === null) return null;
      wobble.decay = decay;
    }
    motion.wobble = wobble;
  }

  if (value.jitter !== undefined) {
    if (!isObject(value.jitter)) return null;
    const mag = clampOptional(value.jitter.magnitude, 0, 80);
    if (mag === null) return null;
    motion.jitter = { magnitude: mag };
  }

  if (value.drift !== undefined) {
    if (!isObject(value.drift)) return null;
    const lateralAccel = clampOptional(value.drift.lateralAccel, 0, 800);
    if (lateralAccel === null) return null;
    motion.drift = { lateralAccel };
  }

  if (value.spiral !== undefined) {
    if (!isObject(value.spiral)) return null;
    const radius = clampOptional(value.spiral.radius, 0, 80);
    const freq = clampOptional(value.spiral.frequencyHz, 0.5, 8);
    if (radius === null || freq === null) return null;
    motion.spiral = { radius, frequencyHz: freq };
  }

  if (value.speedCurve !== undefined) {
    if (!isObject(value.speedCurve)) return null;
    const startScale = clampOptional(value.speedCurve.startScale, 0.15, 1);
    const rampMs = clampOptional(value.speedCurve.rampMs, 80, 1500);
    if (startScale === null || rampMs === null) return null;
    motion.speedCurve = { startScale, rampMs };
  }

  return Object.keys(motion).length > 0 ? motion : null;
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
  if (value.spawnAltitude !== undefined) {
    const v = clampOptional(value.spawnAltitude, 0, 1200);
    if (v === null) return null;
    config.spawnAltitude = v;
  }
  if (value.fallSpeed !== undefined) {
    const v = clampOptional(value.fallSpeed, 0, 3000);
    if (v === null) return null;
    config.fallSpeed = v;
  }

  if (value.pathPoints !== undefined) {
    const pathPoints = validatePathPoints(value.pathPoints);
    if (!pathPoints) return null;
    config.pathPoints = pathPoints;
  }
  if (value.pathSpace !== undefined) {
    if (!isString(value.pathSpace) || !PATH_SPACE_SET.has(value.pathSpace)) return null;
    config.pathSpace = value.pathSpace as TrajectoryConfig['pathSpace'];
  }
  if (value.pathLoop !== undefined) {
    if (typeof value.pathLoop !== 'boolean') return null;
    config.pathLoop = value.pathLoop;
  }

  if (config.type === 'DRAWN_PATH') {
    if (!config.pathPoints) return null;
  }

  if (value.motion !== undefined) {
    const motion = validateMotion(value.motion);
    if (!motion) return null;
    config.motion = motion;
  }

  const isSkyDrop = (config.spawnAltitude ?? 0) > 0;
  if (config.speed !== undefined) {
    if (!Number.isFinite(config.speed) || config.speed < 0) return null;
    if (!isSkyDrop && config.speed < 50) return null;
  }

  return config;
}
