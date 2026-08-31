import type { ActionTarget, ImpulseDirectionMode } from '../../types/schema';
import { ACTION_TARGETS, IMPULSE_DIRECTION_MODES } from './constants';

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ensureFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

export function parseActionTarget(value: unknown): ActionTarget | undefined {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return ACTION_TARGETS.has(upper) ? (upper as ActionTarget) : undefined;
}

export function parseImpulseDirectionMode(value: unknown): ImpulseDirectionMode | undefined {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return IMPULSE_DIRECTION_MODES.has(upper) ? (upper as ImpulseDirectionMode) : undefined;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
