import { CONSTRAINT_TYPES } from '../constants';
import type { ConstraintConfig, ConstraintType } from '../types';
import { isNumber, isObject, isString } from './helpers';

export function validateConstraintConfig(value: unknown): ConstraintConfig | null {
  if (!isObject(value)) return null;
  if (!isString(value.type) || !CONSTRAINT_TYPES.has(value.type)) return null;
  if (!isNumber(value.durationMs) || value.durationMs <= 0) return null;

  const config: ConstraintConfig = {
    type: value.type as ConstraintType,
    durationMs: value.durationMs,
  };

  if (value.stiffness !== undefined) {
    if (!isNumber(value.stiffness)) return null;
    config.stiffness = value.stiffness;
  }
  if (value.restLength !== undefined) {
    if (!isNumber(value.restLength)) return null;
    config.restLength = value.restLength;
  }
  if (value.maxBreakDistance !== undefined) {
    if (!isNumber(value.maxBreakDistance)) return null;
    config.maxBreakDistance = value.maxBreakDistance;
  }

  return config;
}
