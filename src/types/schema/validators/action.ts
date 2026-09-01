import { ACTION_TYPES } from '../constants';
import type {
  ActionPayload,
  ApplyImpulseAction,
  ApplyStasisAction,
  ApplyStealthAction,
  CastChildPayloadAction,
  ModifyStatAction,
  ReflectProjectilesAction,
  ReleaseStasisAction,
  SpawnConstraintAction,
  SpawnFieldAction,
  SpawnObstacleAction,
  SpawnProjectileAction,
  TeleportAction,
  TriggerNode,
  AddInstabilityAction,
  MutateTerrainAction,
  MorphEntityAction,
  SpawnActorAction,
} from '../types';
import { validateAbilitySchema } from './ability';
import { validateConstraintConfig } from './constraint';
import { validateEmitterConfig } from './emitter';
import { validateFieldConfig } from './field';
import {
  isNumber,
  isObject,
  isString,
  MAX_VALIDATION_DEPTH,
  parseActionTarget,
  parseImpulseDirectionMode,
  type ValidationIssue,
  validationFail,
} from './helpers';
import {
  validateActorConfig,
  validateMorphConfig,
  validateObstacleConfig,
  validateTerrainMutationConfig,
} from './obstacle';
import { validateTriggerNode } from './trigger';
import { validateTrajectoryConfig } from './trajectory';
import { validateVisualDescriptor } from './visuals';

export function validateActionPayload(
  value: unknown,
  depth = 0,
  issues?: ValidationIssue[],
  path = 'action',
): ActionPayload | null {
  if (!isObject(value) || !isString(value.type)) {
    return validationFail(issues, path, 'expected action object with type');
  }
  if (!ACTION_TYPES.has(value.type)) {
    return validationFail(issues, `${path}.type`, `unknown action type: ${value.type}`);
  }

  switch (value.type) {
    case 'ADD_INSTABILITY': {
      if (!isNumber(value.amount)) return validationFail(issues, `${path}.amount`, 'invalid amount');
      const action: AddInstabilityAction = { type: 'ADD_INSTABILITY', amount: value.amount };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_IMPULSE': {
      if (!isNumber(value.baseForce)) return validationFail(issues, `${path}.baseForce`, 'invalid baseForce');
      const action: ApplyImpulseAction = { type: 'APPLY_IMPULSE', baseForce: value.baseForce };
      if (value.direction !== undefined) {
        if (!isObject(value.direction)) return validationFail(issues, `${path}.direction`, 'invalid direction');
        if (!isNumber(value.direction.x) || !isNumber(value.direction.y)) {
          return validationFail(issues, `${path}.direction`, 'invalid direction components');
        }
        action.direction = { x: value.direction.x, y: value.direction.y };
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      const directionMode = parseImpulseDirectionMode(value.directionMode);
      if (directionMode) action.directionMode = directionMode;
      return action;
    }

    case 'SPAWN_FIELD': {
      const field = validateFieldConfig(value.field);
      if (!field) return validationFail(issues, `${path}.field`, 'invalid field');
      const action: SpawnFieldAction = { type: 'SPAWN_FIELD', field };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_PROJECTILE': {
      const projectileTrajectory = validateTrajectoryConfig(value.projectileTrajectory);
      if (!projectileTrajectory) {
        return validationFail(issues, `${path}.projectileTrajectory`, 'invalid projectileTrajectory');
      }
      const action: SpawnProjectileAction = {
        type: 'SPAWN_PROJECTILE',
        projectileTrajectory,
      };
      if (value.emitter !== undefined) {
        const emitter = validateEmitterConfig(value.emitter);
        if (!emitter) return validationFail(issues, `${path}.emitter`, 'invalid emitter');
        action.emitter = emitter;
      }
      if (value.triggers !== undefined) {
        if (!Array.isArray(value.triggers)) {
          return validationFail(issues, `${path}.triggers`, 'triggers must be an array');
        }
        const triggers: TriggerNode[] = [];
        for (let i = 0; i < value.triggers.length; i++) {
          const triggerPath = `${path}.triggers[${i}]`;
          const node = validateTriggerNode(value.triggers[i], depth, issues, triggerPath);
          if (!node) return null;
          triggers.push(node);
        }
        action.triggers = triggers;
      }
      if (value.visuals !== undefined) {
        const visuals = validateVisualDescriptor(value.visuals);
        if (!visuals) return validationFail(issues, `${path}.visuals`, 'invalid visuals');
        action.visuals = visuals;
      }
      return action;
    }

    case 'MODIFY_STAT': {
      if (
        !isString(value.stat) ||
        !['mass', 'linearDrag', 'moveSpeed', 'instabilityPct', 'health'].includes(value.stat) ||
        !isNumber(value.value) ||
        !isString(value.mode) ||
        !['add', 'set', 'multiply'].includes(value.mode)
      ) {
        return validationFail(issues, path, 'invalid MODIFY_STAT');
      }
      const action: ModifyStatAction = {
        type: 'MODIFY_STAT',
        stat: value.stat as ModifyStatAction['stat'],
        value: value.value,
        mode: value.mode as ModifyStatAction['mode'],
      };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'TELEPORT': {
      if (!isNumber(value.distance)) return validationFail(issues, `${path}.distance`, 'invalid distance');
      const action: TeleportAction = { type: 'TELEPORT', distance: value.distance };
      if (value.direction !== undefined) {
        if (!isObject(value.direction)) return validationFail(issues, `${path}.direction`, 'invalid direction');
        if (!isNumber(value.direction.x) || !isNumber(value.direction.y)) {
          return validationFail(issues, `${path}.direction`, 'invalid direction components');
        }
        action.direction = { x: value.direction.x, y: value.direction.y };
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_CONSTRAINT': {
      const constraint = validateConstraintConfig(value.constraint);
      if (!constraint) return validationFail(issues, `${path}.constraint`, 'invalid constraint');
      const action: SpawnConstraintAction = { type: 'SPAWN_CONSTRAINT', constraint };
      const source = parseActionTarget(value.source);
      if (source) action.source = source;
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'CAST_CHILD_PAYLOAD': {
      if (depth >= MAX_VALIDATION_DEPTH) {
        return validationFail(issues, path, 'max validation depth exceeded');
      }
      const payload = validateAbilitySchema(value.payload, depth + 1, issues);
      if (!payload) return null;
      const action: CastChildPayloadAction = { type: 'CAST_CHILD_PAYLOAD', payload };
      if (typeof value.inheritVelocity === 'boolean') {
        action.inheritVelocity = value.inheritVelocity;
      }
      if (typeof value.inheritInstability === 'boolean') {
        action.inheritInstability = value.inheritInstability;
      }
      if (value.maxRecursionDepth !== undefined) {
        if (!isNumber(value.maxRecursionDepth)) {
          return validationFail(issues, `${path}.maxRecursionDepth`, 'invalid maxRecursionDepth');
        }
        action.maxRecursionDepth = Math.max(1, Math.min(3, value.maxRecursionDepth));
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_STASIS': {
      if (!isNumber(value.durationMs)) return validationFail(issues, `${path}.durationMs`, 'invalid durationMs');
      const action: ApplyStasisAction = { type: 'APPLY_STASIS', durationMs: value.durationMs };
      if (value.forceAccumulatorScale !== undefined) {
        if (!isNumber(value.forceAccumulatorScale)) {
          return validationFail(issues, `${path}.forceAccumulatorScale`, 'invalid forceAccumulatorScale');
        }
        action.forceAccumulatorScale = value.forceAccumulatorScale;
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'RELEASE_STASIS': {
      const action: ReleaseStasisAction = { type: 'RELEASE_STASIS' };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'REFLECT_PROJECTILES': {
      const action: ReflectProjectilesAction = { type: 'REFLECT_PROJECTILES' };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      if (value.radius !== undefined) {
        if (!isNumber(value.radius) || value.radius <= 0) {
          return validationFail(issues, `${path}.radius`, 'invalid radius');
        }
        action.radius = value.radius;
      }
      return action;
    }

    case 'SPAWN_OBSTACLE': {
      const obstacle = validateObstacleConfig(value.obstacle);
      if (!obstacle) return validationFail(issues, `${path}.obstacle`, 'invalid obstacle');
      const action: SpawnObstacleAction = { type: 'SPAWN_OBSTACLE', obstacle };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'MUTATE_TERRAIN': {
      const mutation = validateTerrainMutationConfig(value.mutation);
      if (!mutation) return validationFail(issues, `${path}.mutation`, 'invalid mutation');
      const action: MutateTerrainAction = { type: 'MUTATE_TERRAIN', mutation };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'MORPH_ENTITY': {
      const morph = validateMorphConfig(value.morph);
      if (!morph) return validationFail(issues, `${path}.morph`, 'invalid morph');
      const action: MorphEntityAction = { type: 'MORPH_ENTITY', morph };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_ACTOR': {
      const actor = validateActorConfig(value.actor, depth, issues, `${path}.actor`);
      if (!actor) return null;
      const action: SpawnActorAction = { type: 'SPAWN_ACTOR', actor };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_STEALTH': {
      if (!isNumber(value.durationMs) || value.durationMs <= 0) {
        return validationFail(issues, `${path}.durationMs`, 'invalid durationMs');
      }
      const action: ApplyStealthAction = {
        type: 'APPLY_STEALTH',
        durationMs: value.durationMs,
      };
      if (value.revealOnCast !== undefined) {
        if (typeof value.revealOnCast !== 'boolean') {
          return validationFail(issues, `${path}.revealOnCast`, 'invalid revealOnCast');
        }
        action.revealOnCast = value.revealOnCast;
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    default:
      return validationFail(issues, `${path}.type`, 'unsupported action type');
  }
}
