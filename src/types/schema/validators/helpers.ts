import {
  ACTION_TARGETS,
  IMPULSE_DIRECTION_MODES,
} from '../constants';
import type { ActionTarget, ImpulseDirectionMode } from '../types';

export const MAX_VALIDATION_DEPTH = 3;

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

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
