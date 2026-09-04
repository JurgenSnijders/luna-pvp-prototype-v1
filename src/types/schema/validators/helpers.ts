import {
  ACTION_TARGETS,
  FIELD_AFFECTS_FILTER_SET,
  IMPULSE_DIRECTION_MODES,
} from '../constants';
import type { ActionTarget, FieldAffectsFilter, ImpulseDirectionMode } from '../types';

export const MAX_VALIDATION_DEPTH = 3;

export interface ValidationIssue {
  path: string;
  reason: string;
}

export function pushValidationIssue(
  issues: ValidationIssue[] | undefined,
  path: string,
  reason: string,
): void {
  if (issues) issues.push({ path, reason });
}

export function validationFail(
  issues: ValidationIssue[] | undefined,
  path: string,
  reason: string,
): null {
  pushValidationIssue(issues, path, reason);
  return null;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function parseActionTarget(value: unknown): ActionTarget | undefined {
  return isString(value) && ACTION_TARGETS.has(value) ? (value as ActionTarget) : undefined;
}

export function parseImpulseDirectionMode(value: unknown): ImpulseDirectionMode | undefined {
  return isString(value) && IMPULSE_DIRECTION_MODES.has(value)
    ? (value as ImpulseDirectionMode)
    : undefined;
}

export function parseFieldAffectsFilter(value: unknown): FieldAffectsFilter | undefined {
  const upper = isString(value) ? value.toUpperCase() : '';
  return FIELD_AFFECTS_FILTER_SET.has(upper) ? (upper as FieldAffectsFilter) : undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
