import { FIELD_TYPES } from '../constants';
import type { FieldConfig, FieldType } from '../types';
import { isNumber, isObject, isString } from './helpers';

export function validateFieldConfig(value: unknown): FieldConfig | null {
  if (!isObject(value)) return null;
  if (!isString(value.fieldType) || !FIELD_TYPES.has(value.fieldType)) return null;
  if (!isNumber(value.radius) || !isNumber(value.strength) || !isNumber(value.durationMs)) {
    return null;
  }

  const config: FieldConfig = {
    fieldType: value.fieldType as FieldType,
    radius: value.radius,
    strength: value.strength,
    durationMs: value.durationMs,
  };

  if (value.frictionValue !== undefined) {
    if (!isNumber(value.frictionValue)) return null;
    config.frictionValue = value.frictionValue;
  }

  if (value.attachToSource !== undefined) {
    if (typeof value.attachToSource !== 'boolean') return null;
    config.attachToSource = value.attachToSource;
  }

  if (value.offset !== undefined) {
    if (!isObject(value.offset) || !isNumber(value.offset.x) || !isNumber(value.offset.y)) {
      return null;
    }
    config.offset = { x: value.offset.x, y: value.offset.y };
  }

  if (value.detachOnParentDeath !== undefined) {
    if (typeof value.detachOnParentDeath !== 'boolean') return null;
    config.detachOnParentDeath = value.detachOnParentDeath;
  }

  return config;
}
