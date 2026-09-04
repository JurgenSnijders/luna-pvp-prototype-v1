import type {
  AbilitySchema,
  ActionPayload,
  TrajectoryConfig,
  TriggerNode,
} from '../../types/schema';
import { MAX_DEPTH, MODIFY_STAT_COST, TRAJECTORY_WEIGHTS } from './constants';
import { clamp } from './helpers';

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
    case 'SPAWN_PROJECTILE': {
      const count = action.emitter?.count ?? 1;
      if (depth >= MAX_DEPTH) {
        return getTrajectoryWeight(action.projectileTrajectory) * 10 * count;
      }
      let childScore = getTrajectoryWeight(action.projectileTrajectory) * 5 * count;
      if (action.triggers) {
        for (const node of action.triggers) {
          childScore += scoreTriggerNode(node, depth + 1);
        }
      }
      return childScore;
    }
    case 'SPAWN_CONSTRAINT':
      return (action.constraint.durationMs / 1000) * 8;
    case 'CAST_CHILD_PAYLOAD': {
      if (depth >= MAX_DEPTH) return 10;
      return scoreAbilitySchema(action.payload, depth + 1) * 1.5;
    }
    case 'APPLY_STASIS':
      return (action.durationMs / 1000) * 6;
    case 'RELEASE_STASIS':
      return 2;
    case 'REFLECT_PROJECTILES':
      return 8 * ((action.radius ?? 150) / 150);
    case 'SPAWN_OBSTACLE': {
      const o = action.obstacle;
      const area = (o.width * o.height) / 10000;
      return (o.durationMs / 1000) * 4 + area * 3;
    }
    case 'MUTATE_TERRAIN': {
      const m = action.mutation;
      return (m.durationMs / 1000) * 3 + m.radius / 50;
    }
    case 'MORPH_ENTITY': {
      const morph = action.morph;
      return (
        (morph.durationMs / 1000) * 4 +
        (morph.mass ?? 0) / 200 +
        (morph.radius ?? 0) / 20
      );
    }
    case 'APPLY_STEALTH':
      return (action.durationMs / 1000) * 5;
    case 'APPLY_STATUS':
      return (action.durationMs / 1000) * 4;
    case 'SPAWN_ACTOR': {
      const actor = action.actor;
      const turretBonus = actor.actorArchetype === 'TURRET' ? 4 : 0;
      let score = (actor.durationMs / 1000) * 6 + actor.health / 50 + turretBonus;
      if (actor.triggers) {
        for (const node of actor.triggers) {
          const nodeScore = scoreTriggerNode(node, depth + 1);
          if (node.trigger === 'ON_TICK') {
            const ticks = Math.min(
              60,
              actor.durationMs / Math.max(16, node.tickIntervalMs ?? 100),
            );
            score += nodeScore * ticks;
          } else {
            score += nodeScore;
          }
        }
      }
      return score;
    }
    case 'LAUNCH_VERTICAL': {
      const apex = action.targetApex ?? 0;
      const impulse = action.verticalImpulse ?? 0;
      return Math.max(apex / 40, Math.abs(impulse) / 400) * 4;
    }
    case 'SET_GRAVITY_SCALE':
      return action.scale * ((action.durationMs ?? 1000) / 1000) * 3;
  }
}

function scoreTriggerNode(node: TriggerNode, depth: number): number {
  let trueScore = 0;
  for (const action of node.actions) {
    trueScore += scoreAction(action, depth);
  }
  let falseScore = 0;
  if (node.ifFalseActions) {
    for (const action of node.ifFalseActions) {
      falseScore += scoreAction(action, depth);
    }
  }
  let total = Math.max(trueScore, falseScore);
  if (node.children) {
    for (const child of node.children) {
      total += scoreTriggerNode(child, depth);
    }
  }
  return total;
}

function getCastingResourceModifier(schema: AbilitySchema): number {
  let mod = 1.0;

  switch (schema.inputProfile?.mode) {
    case 'CHANNELED':
      mod *= 1.35;
      break;
    case 'COMBO_CHAIN':
      mod *= 1.25;
      break;
    case 'CHARGE_AND_RELEASE':
      mod *= 1.15;
      break;
  }

  switch (schema.resourceCost?.type) {
    case 'HEAT':
      mod *= 0.85;
      break;
    case 'AMMO':
      mod *= 0.9;
      break;
    case 'HEALTH_PCT':
      mod *= 0.8;
      break;
  }

  return clamp(mod, 0.6, 1.8);
}

export function scoreAbilitySchema(schema: AbilitySchema, depth = 0): number {
  let actionSum = 0;
  for (const node of schema.triggers) {
    actionSum += scoreTriggerNode(node, depth);
  }
  if (actionSum === 0) actionSum = 10;
  return getTrajectoryWeight(schema.trajectory) * actionSum * getCastingResourceModifier(schema);
}
