import type { PassiveModifierPayload, SkillCategory } from '../types/cards';
import type {
  AbilitySchema,
  ActionPayload,
  TrajectoryConfig,
  TrajectoryType,
  TriggerNode,
} from '../types/schema';
import { validateAbilitySchema } from '../types/schema';

export const CATEGORY_BUDGETS: Record<
  SkillCategory,
  { targetPower: number; minCdMs: number; baseCdScale: number }
> = {
  PRIMARY: { targetPower: 70, minCdMs: 500, baseCdScale: 900 },
  SECONDARY: { targetPower: 110, minCdMs: 1200, baseCdScale: 1500 },
  UTILITY: { targetPower: 120, minCdMs: 2500, baseCdScale: 2000 },
  ULTIMATE: { targetPower: 240, minCdMs: 6000, baseCdScale: 3500 },
  MOBILITY: { targetPower: 90, minCdMs: 2000, baseCdScale: 1800 },
};

const TRAJECTORY_WEIGHTS: Record<TrajectoryType, number> = {
  LINEAR: 1.0,
  RETURN_TO_SOURCE: 1.4,
  HOMING_SLERP: 1.8,
  ORBIT_ANCHOR: 1.3,
  DISCONTINUOUS_BLINK: 1.6,
};

const MAX_DEPTH = 2;
const MODIFY_STAT_COST = 5.0;

function getTrajectoryWeight(traj?: TrajectoryConfig): number {
  if (!traj) return 1.0;
  const base = TRAJECTORY_WEIGHTS[traj.type] ?? 1.0;
  const pierce = traj.piercing ?? 0;
  return base * (1.0 + pierce * 0.25);
}

function scoreAction(action: ActionPayload, depth: number): number {
  switch (action.type) {
    case 'ADD_INSTABILITY':
      return action.amount * 2.0;
    case 'APPLY_IMPULSE':
      return (action.baseForce / 100) * 3.0;
    case 'SPAWN_FIELD': {
      const f = action.field;
      const pullFactor = f.strength > 0 ? 3.0 : 4.5;
      return (f.radius / 50) * (f.durationMs / 1000) * pullFactor;
    }
    case 'TELEPORT':
      return (action.distance / 50) * 4.0;
    case 'MODIFY_STAT':
      return MODIFY_STAT_COST;
    case 'SPAWN_CHILD_PROJECTILE': {
      if (depth >= MAX_DEPTH) return getTrajectoryWeight(action.trajectory) * 10;
      let childScore = getTrajectoryWeight(action.trajectory) * 5;
      if (action.triggers) {
        for (const node of action.triggers) {
          childScore += scoreTriggerNode(node, depth + 1);
        }
      }
      return childScore;
    }
  }
}

function scoreTriggerNode(node: TriggerNode, depth: number): number {
  let total = 0;
  for (const action of node.actions) {
    total += scoreAction(action, depth);
  }
  if (node.children) {
    for (const child of node.children) {
      total += scoreTriggerNode(child, depth);
    }
  }
  return total;
}

export function scoreAbilitySchema(schema: AbilitySchema): number {
  let actionSum = 0;
  for (const node of schema.triggers) {
    actionSum += scoreTriggerNode(node, 0);
  }
  if (actionSum === 0) actionSum = 10;
  return getTrajectoryWeight(schema.trajectory) * actionSum;
}

function clampSchemaValues(schema: AbilitySchema): AbilitySchema {
  const s = structuredClone(schema);

  if (s.trajectory) {
    if (s.trajectory.speed !== undefined) s.trajectory.speed = Math.min(1600, s.trajectory.speed);
    if (s.trajectory.maxRange !== undefined) s.trajectory.maxRange = Math.min(1200, s.trajectory.maxRange);
    if (s.trajectory.piercing !== undefined) s.trajectory.piercing = Math.min(4, s.trajectory.piercing);
  }

  const clampTriggers = (nodes: TriggerNode[]): void => {
    for (const node of nodes) {
      for (const action of node.actions) {
        if (action.type === 'SPAWN_FIELD') {
          action.field.radius = Math.min(200, action.field.radius);
          action.field.durationMs = Math.min(5000, action.field.durationMs);
        }
        if (action.type === 'SPAWN_CHILD_PROJECTILE' && action.triggers) {
          clampTriggers(action.triggers);
        }
      }
      if (node.children) clampTriggers(node.children);
    }
  };
  clampTriggers(s.triggers);

  return s;
}

function minimalFallbackSchema(): AbilitySchema {
  return {
    id: 'fallback_linear',
    name: 'Fallback Shot',
    cooldownMs: 800,
    recoilKick: 50,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
    triggers: [],
  };
}

export function balanceAbilitySchema(
  schema: AbilitySchema,
  category: SkillCategory = 'SECONDARY',
): AbilitySchema {
  const budget = CATEGORY_BUDGETS[category];
  const originalRecoil = schema.recoilKick;
  const clamped = clampSchemaValues(schema);
  const totalPower = scoreAbilitySchema(clamped);

  clamped.cooldownMs = Math.max(
    budget.minCdMs,
    Math.round((totalPower / budget.targetPower) * budget.baseCdScale),
  );

  if (category === 'MOBILITY') {
    clamped.recoilKick = originalRecoil;
  } else {
    clamped.recoilKick = Math.max(0, Math.round(totalPower / 2.5));
  }

  const validated = validateAbilitySchema(clamped);
  return validated ?? minimalFallbackSchema();
}

export function balancePassiveModifiers(
  modifiers: PassiveModifierPayload[],
): PassiveModifierPayload[] {
  return modifiers.slice(0, 3).map((mod) => {
    const m = { ...mod };

    if (m.op === 'MULTIPLY') {
      m.value = Math.max(0.5, Math.min(1.5, m.value));
    }

    switch (m.stat) {
      case 'COOLDOWN_REDUCTION_PCT':
        if (m.op === 'ADD') m.value = Math.max(0, Math.min(50, m.value));
        break;
      case 'KNOCKBACK_RESISTANCE':
        if (m.op === 'ADD') m.value = Math.max(0, Math.min(0.75, m.value));
        break;
      case 'MOVE_SPEED':
        if (m.op === 'ADD') m.value = Math.max(-100, Math.min(150, m.value));
        break;
      case 'ACCELERATION':
        if (m.op === 'ADD') m.value = Math.max(-500, Math.min(1000, m.value));
        break;
      case 'LINEAR_DRAG':
        if (m.op === 'ADD') m.value = Math.max(-2, Math.min(2, m.value));
        break;
      case 'MASS':
        if (m.op === 'ADD') m.value = Math.max(-0.5, Math.min(1.5, m.value));
        break;
    }

    return m;
  });
}
