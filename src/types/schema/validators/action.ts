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

export function validateActionPayload(value: unknown, depth = 0): ActionPayload | null {
  if (!isObject(value) || !isString(value.type)) return null;
  if (!ACTION_TYPES.has(value.type)) return null;

  switch (value.type) {
    case 'ADD_INSTABILITY': {
      if (!isNumber(value.amount)) return null;
      const action: AddInstabilityAction = { type: 'ADD_INSTABILITY', amount: value.amount };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_IMPULSE': {
      if (!isNumber(value.baseForce)) return null;
      const action: ApplyImpulseAction = { type: 'APPLY_IMPULSE', baseForce: value.baseForce };
      if (value.direction !== undefined) {
        if (!isObject(value.direction)) return null;
        if (!isNumber(value.direction.x) || !isNumber(value.direction.y)) return null;
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
      if (!field) return null;
      const action: SpawnFieldAction = { type: 'SPAWN_FIELD', field };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_PROJECTILE': {
      const projectileTrajectory = validateTrajectoryConfig(value.projectileTrajectory);
      if (!projectileTrajectory) return null;
      const action: SpawnProjectileAction = {
        type: 'SPAWN_PROJECTILE',
        projectileTrajectory,
      };
      if (value.emitter !== undefined) {
        const emitter = validateEmitterConfig(value.emitter);
        if (!emitter) return null;
        action.emitter = emitter;
      }
      if (value.triggers !== undefined) {
        if (!Array.isArray(value.triggers)) return null;
        const triggers: TriggerNode[] = [];
        for (const t of value.triggers) {
          const node = validateTriggerNode(t, depth);
          if (!node) return null;
          triggers.push(node);
        }
        action.triggers = triggers;
      }
      if (value.visuals !== undefined) {
        const visuals = validateVisualDescriptor(value.visuals);
        if (!visuals) return null;
        action.visuals = visuals;
      }
      return action;
    }

    case 'MODIFY_STAT': {
      if (
        !isString(value.stat) ||
        !['mass', 'linearDrag', 'moveSpeed', 'instabilityPct'].includes(value.stat) ||
        !isNumber(value.value) ||
        !isString(value.mode) ||
        !['add', 'set', 'multiply'].includes(value.mode)
      ) {
        return null;
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
      if (!isNumber(value.distance)) return null;
      const action: TeleportAction = { type: 'TELEPORT', distance: value.distance };
      if (value.direction !== undefined) {
        if (!isObject(value.direction)) return null;
        if (!isNumber(value.direction.x) || !isNumber(value.direction.y)) return null;
        action.direction = { x: value.direction.x, y: value.direction.y };
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_CONSTRAINT': {
      const constraint = validateConstraintConfig(value.constraint);
      if (!constraint) return null;
      const action: SpawnConstraintAction = { type: 'SPAWN_CONSTRAINT', constraint };
      const source = parseActionTarget(value.source);
      if (source) action.source = source;
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'CAST_CHILD_PAYLOAD': {
      if (depth >= MAX_VALIDATION_DEPTH) return null;
      const payload = validateAbilitySchema(value.payload, depth + 1);
      if (!payload) return null;
      const action: CastChildPayloadAction = { type: 'CAST_CHILD_PAYLOAD', payload };
      if (typeof value.inheritVelocity === 'boolean') {
        action.inheritVelocity = value.inheritVelocity;
      }
      if (typeof value.inheritInstability === 'boolean') {
        action.inheritInstability = value.inheritInstability;
      }
      if (value.maxRecursionDepth !== undefined) {
        if (!isNumber(value.maxRecursionDepth)) return null;
        action.maxRecursionDepth = Math.max(1, Math.min(3, value.maxRecursionDepth));
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_STASIS': {
      if (!isNumber(value.durationMs)) return null;
      const action: ApplyStasisAction = { type: 'APPLY_STASIS', durationMs: value.durationMs };
      if (value.forceAccumulatorScale !== undefined) {
        if (!isNumber(value.forceAccumulatorScale)) return null;
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
        if (!isNumber(value.radius) || value.radius <= 0) return null;
        action.radius = value.radius;
      }
      return action;
    }

    case 'SPAWN_OBSTACLE': {
      const obstacle = validateObstacleConfig(value.obstacle);
      if (!obstacle) return null;
      const action: SpawnObstacleAction = { type: 'SPAWN_OBSTACLE', obstacle };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'MUTATE_TERRAIN': {
      const mutation = validateTerrainMutationConfig(value.mutation);
      if (!mutation) return null;
      const action: MutateTerrainAction = { type: 'MUTATE_TERRAIN', mutation };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'MORPH_ENTITY': {
      const morph = validateMorphConfig(value.morph);
      if (!morph) return null;
      const action: MorphEntityAction = { type: 'MORPH_ENTITY', morph };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_ACTOR': {
      const actor = validateActorConfig(value.actor);
      if (!actor) return null;
      const action: SpawnActorAction = { type: 'SPAWN_ACTOR', actor };
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_STEALTH': {
      if (!isNumber(value.durationMs) || value.durationMs <= 0) return null;
      const action: ApplyStealthAction = {
        type: 'APPLY_STEALTH',
        durationMs: value.durationMs,
      };
      if (value.revealOnCast !== undefined) {
        if (typeof value.revealOnCast !== 'boolean') return null;
        action.revealOnCast = value.revealOnCast;
      }
      const target = parseActionTarget(value.target);
      if (target) action.target = target;
      return action;
    }

    default:
      return null;
  }
}
