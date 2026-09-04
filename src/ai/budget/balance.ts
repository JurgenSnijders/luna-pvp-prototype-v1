import type { PassiveModifierPayload, SkillCategory } from '../../types/cards';
import type { AbilitySchema, TriggerNode } from '../../types/schema';
import { validateAbilitySchema } from '../../types/schema';
import { CATEGORY_BUDGETS } from './constants';
import { clamp } from './helpers';
import { scoreAbilitySchema } from './score';
import { sanitizeAbilitySchema } from './sanitize/ability';
import type { TrajectoryConfig } from '../../types/schema';

function isSkyDropTrajectory(traj: TrajectoryConfig): boolean {
  return (traj.spawnAltitude ?? 0) > 0 || (traj.fallSpeed ?? 0) > 0;
}

function clampTrajectorySpeed(traj: TrajectoryConfig): void {
  if (traj.speed === undefined) return;
  const isSkyDrop = isSkyDropTrajectory(traj);
  const minSpeed = isSkyDrop ? 0 : 150;
  traj.speed = clamp(traj.speed, minSpeed, 1600);
}

function clampSchemaValues(schema: AbilitySchema): AbilitySchema {
  const s = structuredClone(schema);

  if (s.trajectory) {
    clampTrajectorySpeed(s.trajectory);
    if (s.trajectory.maxRange !== undefined) {
      s.trajectory.maxRange = Math.min(1200, s.trajectory.maxRange);
    }
    if (s.trajectory.piercing !== undefined) {
      s.trajectory.piercing = Math.min(4, s.trajectory.piercing);
    }
  }

  const clampTriggers = (nodes: TriggerNode[]): void => {
    for (const node of nodes) {
      for (const action of node.actions) {
        if (action.type === 'SPAWN_FIELD') {
          action.field.radius = Math.min(200, action.field.radius);
          action.field.durationMs = Math.min(5000, action.field.durationMs);
        }
        if (action.type === 'SPAWN_PROJECTILE') {
          if (action.emitter) {
            action.emitter.count = clamp(action.emitter.count, 1, 12);
            action.emitter.spreadDeg = clamp(action.emitter.spreadDeg, 0, 360);
          }
          if (action.projectileTrajectory.speed !== undefined) {
            clampTrajectorySpeed(action.projectileTrajectory);
          }
          if (action.triggers) {
            clampTriggers(action.triggers);
          }
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
    visuals: {
      color: '#00e5ff',
      size: 8,
      projectileStyle: 'DISC',
      trailType: 'NONE',
      impactVfx: 'SPARKS',
    },
  };
}

export function balanceAbilitySchema(
  schema: AbilitySchema,
  category: SkillCategory = 'SECONDARY',
): AbilitySchema {
  const budget = CATEGORY_BUDGETS[category];
  const sanitized = sanitizeAbilitySchema(schema, category);
  const originalRecoil = schema.recoilKick;
  const clamped = clampSchemaValues(sanitized);
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
