import type { ConstraintConfig, ConstraintType } from '../../../types/schema';
import { CONSTRAINT_TYPES } from '../constants';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';

export function sanitizeConstraintConfig(raw: unknown): ConstraintConfig {
  const obj = isObject(raw) ? raw : {};
  const typeRaw = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'SPRING_TETHER';
  const type = (CONSTRAINT_TYPES.has(typeRaw) ? typeRaw : 'SPRING_TETHER') as ConstraintType;

  const defaultRestLength = type === 'DISTANCE_ROD' ? 100 : 0;
  const config: ConstraintConfig = {
    type,
    durationMs: clamp(ensureFiniteNumber(obj.durationMs ?? obj.duration, 2000), 100, 10000),
    stiffness: clamp(ensureFiniteNumber(obj.stiffness, 100), 1, 2000),
    restLength: clamp(ensureFiniteNumber(obj.restLength, defaultRestLength), 0, 2000),
  };

  if (obj.maxBreakDistance !== undefined) {
    config.maxBreakDistance = clamp(ensureFiniteNumber(obj.maxBreakDistance, 500), 10, 5000);
  }

  return config;
}
