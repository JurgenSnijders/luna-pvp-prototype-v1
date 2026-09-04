import {
  COMPARISON_OPERATORS,
  CONDITION_QUERIES,
  INPUT_PROFILE_MODES,
  RESOURCE_TYPES,
} from '../constants';
import type {
  ComparisonOperator,
  ConditionNode,
  ConditionQuery,
  InputProfile,
  InputProfileMode,
  ResourceCost,
  ResourceType,
} from '../types';
import { clamp, isNumber, isObject, isString, parseActionTarget } from './helpers';

export function parseComparisonOperator(value: unknown): ComparisonOperator | undefined {
  return isString(value) && COMPARISON_OPERATORS.has(value)
    ? (value as ComparisonOperator)
    : undefined;
}

export function validateConditionNode(value: unknown): ConditionNode | null {
  if (!isObject(value) || !isString(value.query)) return null;
  if (!CONDITION_QUERIES.has(value.query)) return null;
  if (value.value === undefined || value.value === null) return null;

  const query = value.query as ConditionQuery;
  const cond: ConditionNode = { query, value: value.value as number | string };

  const target = parseActionTarget(value.target);
  if (target) cond.target = target;

  switch (query) {
    case 'STAT_THRESHOLD': {
      if (
        !isString(value.stat) ||
        !['health', 'instabilityPct'].includes(value.stat) ||
        !parseComparisonOperator(value.comparison) ||
        !isNumber(value.value)
      ) {
        return null;
      }
      cond.stat = value.stat as 'health' | 'instabilityPct';
      cond.comparison = parseComparisonOperator(value.comparison);
      cond.value = value.value;
      return cond;
    }
    case 'TAG_CHECK': {
      if (!isString(value.value)) return null;
      cond.value = value.value;
      return cond;
    }
    case 'PROXIMITY_COUNT': {
      if (!parseComparisonOperator(value.comparison) || !isNumber(value.value)) return null;
      cond.comparison = parseComparisonOperator(value.comparison);
      cond.value = value.value;
      if (value.radius !== undefined) {
        if (!isNumber(value.radius) || value.radius <= 0) return null;
        cond.radius = value.radius;
      }
      return cond;
    }
    case 'SURFACE_TYPE': {
      if (!isString(value.value)) return null;
      cond.value = value.value;
      return cond;
    }
    case 'COMBO_STEP': {
      if (!parseComparisonOperator(value.comparison) || !isNumber(value.value)) return null;
      cond.comparison = parseComparisonOperator(value.comparison);
      cond.value = value.value;
      return cond;
    }
    case 'ELEVATION': {
      if (!parseComparisonOperator(value.comparison) || !isNumber(value.value)) return null;
      cond.comparison = parseComparisonOperator(value.comparison);
      cond.value = value.value;
      return cond;
    }
    default:
      return null;
  }
}

export function validateInputProfile(value: unknown): InputProfile | null {
  if (!isObject(value)) return null;
  const modeRaw = isString(value.mode) ? value.mode.toUpperCase() : 'INSTANT';
  if (!INPUT_PROFILE_MODES.has(modeRaw)) return null;

  const profile: InputProfile = { mode: modeRaw as InputProfileMode };

  if (value.minChargeMs !== undefined) {
    if (!isNumber(value.minChargeMs) || value.minChargeMs < 0) return null;
    profile.minChargeMs = value.minChargeMs;
  }
  if (value.maxChargeMs !== undefined) {
    if (!isNumber(value.maxChargeMs) || value.maxChargeMs <= 0) return null;
    profile.maxChargeMs = value.maxChargeMs;
  }
  if (value.channelIntervalMs !== undefined) {
    if (!isNumber(value.channelIntervalMs) || value.channelIntervalMs < 16) return null;
    profile.channelIntervalMs = value.channelIntervalMs;
  }
  if (value.comboWindowMs !== undefined) {
    if (!isNumber(value.comboWindowMs) || value.comboWindowMs < 16) return null;
    profile.comboWindowMs = value.comboWindowMs;
  }

  const minCharge = profile.minChargeMs ?? 0;
  const maxCharge = profile.maxChargeMs ?? 1000;
  profile.minChargeMs = clamp(minCharge, 0, maxCharge);
  profile.maxChargeMs = Math.max(minCharge, maxCharge);

  return profile;
}

export function validateResourceCost(value: unknown): ResourceCost | null {
  if (!isObject(value)) return null;

  const allowedKeys = new Set([
    'type',
    'cost',
    'maxCapacity',
    'rechargeRate',
    'lockoutDurationMs',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) return null;
  }

  const typeRaw = isString(value.type) ? value.type.toUpperCase() : '';
  if (!RESOURCE_TYPES.has(typeRaw)) return null;
  if (!isNumber(value.cost) || value.cost <= 0) return null;

  const cost: ResourceCost = {
    type: typeRaw as ResourceType,
    cost: value.cost,
  };

  if (value.maxCapacity !== undefined) {
    if (!isNumber(value.maxCapacity) || value.maxCapacity <= 0) return null;
    cost.maxCapacity = value.maxCapacity;
  }
  if (value.rechargeRate !== undefined) {
    if (!isNumber(value.rechargeRate) || value.rechargeRate <= 0) return null;
    cost.rechargeRate = value.rechargeRate;
  }
  if (value.lockoutDurationMs !== undefined) {
    if (!isNumber(value.lockoutDurationMs) || value.lockoutDurationMs <= 0) return null;
    cost.lockoutDurationMs = value.lockoutDurationMs;
  }

  return cost;
}
