import type {
  ComparisonOperator,
  ConditionNode,
  ConditionQuery,
  InputProfile,
  InputProfileMode,
  ResourceCost,
  ResourceType,
} from '../../../types/schema';
import { COMPARISON_OPERATORS, CONDITION_QUERIES, INPUT_PROFILE_MODES } from '../constants';
import { clamp, ensureFiniteNumber, isObject, parseActionTarget } from '../helpers';

function parseComparisonOperator(value: unknown): ComparisonOperator | undefined {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return COMPARISON_OPERATORS.has(upper) ? (upper as ComparisonOperator) : undefined;
}

export function sanitizeResourceCost(raw: unknown): ResourceCost | null {
  if (!isObject(raw)) return null;

  const typeRaw = typeof raw.type === 'string' ? raw.type.toUpperCase() : '';
  if (!['COOLDOWN', 'HEAT', 'AMMO', 'HEALTH_PCT'].includes(typeRaw)) return null;

  const cost: ResourceCost = {
    type: typeRaw as ResourceType,
    cost: clamp(ensureFiniteNumber(raw.cost, 1), 1, 100),
  };

  if (raw.maxCapacity !== undefined) {
    cost.maxCapacity = clamp(ensureFiniteNumber(raw.maxCapacity, 6), 1, 20);
  }
  if (raw.rechargeRate !== undefined) {
    cost.rechargeRate = clamp(ensureFiniteNumber(raw.rechargeRate, 25), 1, 100);
  }
  if (raw.lockoutDurationMs !== undefined) {
    cost.lockoutDurationMs = clamp(ensureFiniteNumber(raw.lockoutDurationMs, 3000), 200, 10000);
  }

  return cost;
}

export function sanitizeInputProfile(raw: unknown): InputProfile {
  const obj = isObject(raw) ? raw : {};
  const modeRaw = typeof obj.mode === 'string' ? obj.mode.toUpperCase() : 'INSTANT';
  const mode = (
    INPUT_PROFILE_MODES.has(modeRaw) ? modeRaw : 'INSTANT'
  ) as InputProfileMode;

  const profile: InputProfile = { mode };

  if (mode === 'CHARGE_AND_RELEASE') {
    const minChargeMs = clamp(ensureFiniteNumber(obj.minChargeMs, 0), 0, 10000);
    const maxChargeMs = clamp(ensureFiniteNumber(obj.maxChargeMs, 1000), minChargeMs, 10000);
    profile.minChargeMs = minChargeMs;
    profile.maxChargeMs = maxChargeMs;
  }

  if (mode === 'CHANNELED') {
    profile.channelIntervalMs = clamp(ensureFiniteNumber(obj.channelIntervalMs, 100), 16, 5000);
  }

  if (mode === 'COMBO_CHAIN') {
    profile.comboWindowMs = clamp(ensureFiniteNumber(obj.comboWindowMs, 1500), 16, 10000);
  }

  return profile;
}

export function sanitizeConditionNode(raw: unknown): ConditionNode | null {
  if (!isObject(raw)) return null;

  const queryAliases: Record<string, string> = {
    STAT: 'STAT_THRESHOLD',
    TAG: 'TAG_CHECK',
    PROXIMITY: 'PROXIMITY_COUNT',
    SURFACE: 'SURFACE_TYPE',
  };
  let queryRaw = typeof raw.query === 'string' ? raw.query.toUpperCase() : '';
  queryRaw = queryAliases[queryRaw] ?? queryRaw;
  if (!CONDITION_QUERIES.has(queryRaw)) return null;
  if (raw.value === undefined || raw.value === null) return null;

  const query = queryRaw as ConditionQuery;

  switch (query) {
    case 'STAT_THRESHOLD': {
      const statRaw =
        typeof raw.stat === 'string' ? raw.stat.toLowerCase().replace(/_/g, '') : 'health';
      const stat = statRaw === 'instabilitypct' || statRaw === 'instability' ? 'instabilityPct' : 'health';
      const comparison = parseComparisonOperator(raw.comparison);
      const value = ensureFiniteNumber(raw.value, NaN);
      if (!comparison || !Number.isFinite(value)) return null;
      const cond: ConditionNode = { query, stat, comparison, value };
      const target = parseActionTarget(raw.target);
      if (target) cond.target = target;
      return cond;
    }
    case 'TAG_CHECK': {
      if (typeof raw.value !== 'string') return null;
      const cond: ConditionNode = { query, value: raw.value };
      const target = parseActionTarget(raw.target);
      if (target) cond.target = target;
      return cond;
    }
    case 'PROXIMITY_COUNT': {
      const comparison = parseComparisonOperator(raw.comparison);
      const value = ensureFiniteNumber(raw.value, NaN);
      if (!comparison || !Number.isFinite(value)) return null;
      const cond: ConditionNode = {
        query,
        comparison,
        value,
        radius: clamp(ensureFiniteNumber(raw.radius, 100), 1, 2000),
      };
      const target = parseActionTarget(raw.target);
      if (target) cond.target = target;
      return cond;
    }
    case 'SURFACE_TYPE': {
      if (typeof raw.value !== 'string') return null;
      const cond: ConditionNode = { query, value: raw.value };
      const target = parseActionTarget(raw.target);
      if (target) cond.target = target;
      return cond;
    }
    case 'COMBO_STEP': {
      const comparison = parseComparisonOperator(raw.comparison);
      const value = ensureFiniteNumber(raw.value, NaN);
      if (!comparison || !Number.isFinite(value)) return null;
      return { query, comparison, value };
    }
    default:
      return null;
  }
}
