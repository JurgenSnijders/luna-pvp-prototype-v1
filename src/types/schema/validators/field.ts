import { FIELD_TYPES } from '../constants';
import type { FieldConfig, FieldType } from '../types';
import { clamp, isNumber, isObject, isString, parseFieldAffectsFilter } from './helpers';

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

  if (value.zBase !== undefined) {
    if (!isNumber(value.zBase)) return null;
    config.zBase = clamp(value.zBase, 0, 300);
  }
  if (value.zHeight !== undefined) {
    if (!isNumber(value.zHeight)) return null;
    config.zHeight = clamp(value.zHeight, 12, 500);
  }
  if (value.verticalForce !== undefined) {
    if (!isNumber(value.verticalForce)) return null;
    config.verticalForce = clamp(value.verticalForce, -4000, 4000);
  }

  const affects = parseFieldAffectsFilter(value.affects);
  if (value.affects !== undefined && !affects) return null;
  if (affects) config.affects = affects;

  return config;
}
