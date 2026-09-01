import type { SkillCategory } from '../../../types/cards';
import type { ActionPayload, SpellArchetype, TriggerNode } from '../../../types/schema';
import { SPELL_ARCHETYPE_SET } from '../../../types/schema';
import { FIELD_TYPES, MAX_DEPTH } from '../constants';
import {
  clamp,
  ensureFiniteNumber,
  isObject,
  parseActionTarget,
  parseImpulseDirectionMode,
} from '../helpers';
import { sanitizeAbilitySchema } from './ability';
import { sanitizeConstraintConfig } from './constraint';
import { sanitizeEmitter } from './emitter';
import {
  sanitizeActorConfig,
  sanitizeMorphConfig,
  sanitizeObstacleConfig,
  sanitizeTerrainMutationConfig,
} from './obstacle';
import { sanitizeTriggerNode } from './trigger';
import { sanitizeTrajectory } from './trajectory';
import { sanitizeVisuals } from './visuals';

export function sanitizeAction(
  raw: unknown,
  depth = 0,
  category: SkillCategory = 'SECONDARY',
): ActionPayload | null {
  if (!isObject(raw)) return null;

  let type = typeof raw.type === 'string' ? raw.type.toUpperCase() : '';

  // Legacy migration
  if (type === 'SPAWN_CHILD_PROJECTILE') {
    type = 'SPAWN_PROJECTILE';
  }

  switch (type) {
    case 'ADD_INSTABILITY': {
      const action: Extract<ActionPayload, { type: 'ADD_INSTABILITY' }> = {
        type: 'ADD_INSTABILITY',
        amount: ensureFiniteNumber(raw.amount ?? raw.instability, 20),
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_PROJECTILE': {
      const trajRaw =
        raw.projectileTrajectory !== undefined
          ? raw.projectileTrajectory
          : raw.trajectory;
      const action: Extract<ActionPayload, { type: 'SPAWN_PROJECTILE' }> = {
        type: 'SPAWN_PROJECTILE',
        projectileTrajectory: sanitizeTrajectory(trajRaw),
        emitter: sanitizeEmitter(raw.emitter, 1),
      };

      // Preserve aimOffsetDeg from legacy single-shot child spawn
      if (
        action.emitter &&
        raw.aimOffsetDeg !== undefined &&
        action.emitter.aimOffsetDeg === undefined
      ) {
        action.emitter.aimOffsetDeg = ensureFiniteNumber(raw.aimOffsetDeg, 0);
      }

      if (Array.isArray(raw.triggers)) {
        action.triggers = raw.triggers
          .map((t) => sanitizeTriggerNode(t, depth, category))
          .filter((n): n is TriggerNode => n !== null);
      }
      if (raw.visuals !== undefined) {
        action.visuals = sanitizeVisuals(raw.visuals);
      }
      return action;
    }

    case 'TELEPORT': {
      const action: Extract<ActionPayload, { type: 'TELEPORT' }> = {
        type: 'TELEPORT',
        distance: ensureFiniteNumber(raw.distance, 100),
      };
      if (isObject(raw.direction)) {
        action.direction = {
          x: ensureFiniteNumber(raw.direction.x, 0),
          y: ensureFiniteNumber(raw.direction.y, 0),
        };
      }
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_IMPULSE': {
      const action: Extract<ActionPayload, { type: 'APPLY_IMPULSE' }> = {
        type: 'APPLY_IMPULSE',
        baseForce: ensureFiniteNumber(raw.baseForce ?? raw.force, 400),
      };
      if (isObject(raw.direction)) {
        action.direction = {
          x: ensureFiniteNumber(raw.direction.x, 0),
          y: ensureFiniteNumber(raw.direction.y, 0),
        };
      }
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      const directionMode = parseImpulseDirectionMode(raw.directionMode);
      if (directionMode) action.directionMode = directionMode;
      return action;
    }

    case 'SPAWN_FIELD': {
      const fieldObj = isObject(raw.field) ? raw.field : {};
      const fieldTypeRaw =
        typeof fieldObj.fieldType === 'string'
          ? fieldObj.fieldType.toUpperCase()
          : 'RADIAL_IMPULSE';
      const fieldType = FIELD_TYPES.has(fieldTypeRaw)
        ? fieldTypeRaw
        : 'RADIAL_IMPULSE';
      const action: Extract<ActionPayload, { type: 'SPAWN_FIELD' }> = {
        type: 'SPAWN_FIELD' as const,
        field: {
          fieldType: fieldType as
            | 'RADIAL_IMPULSE'
            | 'VORTEX_TANGENT'
            | 'FRICTION_OVERRIDE'
            | 'MASS_ATTRACTOR',
          radius: clamp(ensureFiniteNumber(fieldObj.radius, 80), 10, 200),
          strength: ensureFiniteNumber(fieldObj.strength, 500),
          durationMs: clamp(
            ensureFiniteNumber(fieldObj.durationMs ?? fieldObj.duration, 2000),
            100,
            5000,
          ),
          ...(fieldObj.frictionValue !== undefined
            ? { frictionValue: ensureFiniteNumber(fieldObj.frictionValue, 0.02) }
            : {}),
          ...(typeof fieldObj.attachToSource === 'boolean'
            ? { attachToSource: fieldObj.attachToSource }
            : {}),
          ...(isObject(fieldObj.offset)
            ? {
                offset: {
                  x: ensureFiniteNumber(fieldObj.offset.x, 0),
                  y: ensureFiniteNumber(fieldObj.offset.y, 0),
                },
              }
            : {}),
          ...(typeof fieldObj.detachOnParentDeath === 'boolean'
            ? { detachOnParentDeath: fieldObj.detachOnParentDeath }
            : {}),
        },
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_CONSTRAINT': {
      const action: Extract<ActionPayload, { type: 'SPAWN_CONSTRAINT' }> = {
        type: 'SPAWN_CONSTRAINT',
        constraint: sanitizeConstraintConfig(raw.constraint),
      };
      const source = parseActionTarget(raw.source);
      if (source) action.source = source;
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'CAST_CHILD_PAYLOAD': {
      if (depth >= MAX_DEPTH) return null;
      const action: Extract<ActionPayload, { type: 'CAST_CHILD_PAYLOAD' }> = {
        type: 'CAST_CHILD_PAYLOAD',
        payload: sanitizeAbilitySchema(raw.payload, category, depth + 1),
      };
      if (typeof raw.inheritVelocity === 'boolean') {
        action.inheritVelocity = raw.inheritVelocity;
      }
      if (typeof raw.inheritInstability === 'boolean') {
        action.inheritInstability = raw.inheritInstability;
      }
      action.maxRecursionDepth = clamp(ensureFiniteNumber(raw.maxRecursionDepth, 1), 1, 3);
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'MODIFY_STAT': {
      const statMap: Record<
        string,
        'mass' | 'linearDrag' | 'moveSpeed' | 'instabilityPct' | 'health'
      > = {
        mass: 'mass',
        lineardrag: 'linearDrag',
        linear_drag: 'linearDrag',
        movespeed: 'moveSpeed',
        move_speed: 'moveSpeed',
        instabilitypct: 'instabilityPct',
        instability: 'instabilityPct',
        health: 'health',
      };
      const statRaw = typeof raw.stat === 'string' ? raw.stat.toLowerCase().replace(/_/g, '') : 'mass';
      const modeRaw = typeof raw.mode === 'string' ? raw.mode.toLowerCase() : 'add';
      const mode = (['add', 'set', 'multiply'].includes(modeRaw)
        ? modeRaw
        : 'add') as 'add' | 'set' | 'multiply';
      const action: Extract<ActionPayload, { type: 'MODIFY_STAT' }> = {
        type: 'MODIFY_STAT',
        stat: statMap[statRaw] ?? 'mass',
        value: ensureFiniteNumber(raw.value, 1),
        mode,
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_STASIS': {
      const action: Extract<ActionPayload, { type: 'APPLY_STASIS' }> = {
        type: 'APPLY_STASIS',
        durationMs: clamp(ensureFiniteNumber(raw.durationMs, 2000), 100, 10000),
        forceAccumulatorScale: clamp(ensureFiniteNumber(raw.forceAccumulatorScale, 1), 0.1, 3),
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'RELEASE_STASIS': {
      const action: Extract<ActionPayload, { type: 'RELEASE_STASIS' }> = {
        type: 'RELEASE_STASIS',
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'REFLECT_PROJECTILES': {
      const action: Extract<ActionPayload, { type: 'REFLECT_PROJECTILES' }> = {
        type: 'REFLECT_PROJECTILES',
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      if (raw.radius !== undefined) {
        action.radius = clamp(ensureFiniteNumber(raw.radius, 150), 1, 2000);
      }
      return action;
    }

    case 'SPAWN_OBSTACLE': {
      const action: Extract<ActionPayload, { type: 'SPAWN_OBSTACLE' }> = {
        type: 'SPAWN_OBSTACLE',
        obstacle: sanitizeObstacleConfig(raw.obstacle),
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'MUTATE_TERRAIN': {
      const action: Extract<ActionPayload, { type: 'MUTATE_TERRAIN' }> = {
        type: 'MUTATE_TERRAIN',
        mutation: sanitizeTerrainMutationConfig(raw.mutation),
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'MORPH_ENTITY': {
      const action: Extract<ActionPayload, { type: 'MORPH_ENTITY' }> = {
        type: 'MORPH_ENTITY',
        morph: sanitizeMorphConfig(raw.morph),
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'SPAWN_ACTOR': {
      const action: Extract<ActionPayload, { type: 'SPAWN_ACTOR' }> = {
        type: 'SPAWN_ACTOR',
        actor: sanitizeActorConfig(raw.actor, depth, category),
      };
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_STEALTH': {
      const action: Extract<ActionPayload, { type: 'APPLY_STEALTH' }> = {
        type: 'APPLY_STEALTH',
        durationMs: clamp(ensureFiniteNumber(raw.durationMs, 3000), 100, 15000),
      };
      if (typeof raw.revealOnCast === 'boolean') {
        action.revealOnCast = raw.revealOnCast;
      }
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    case 'APPLY_STATUS': {
      const archetypeRaw =
        typeof raw.archetype === 'string' ? raw.archetype.toUpperCase() : 'KINETIC';
      const archetype = (
        SPELL_ARCHETYPE_SET.has(archetypeRaw) ? archetypeRaw : 'KINETIC'
      ) as SpellArchetype;
      const action: Extract<ActionPayload, { type: 'APPLY_STATUS' }> = {
        type: 'APPLY_STATUS',
        archetype,
        durationMs: clamp(ensureFiniteNumber(raw.durationMs, 2000), 100, 10000),
      };
      if (raw.stacks !== undefined) {
        action.stacks = clamp(ensureFiniteNumber(raw.stacks, 1), 1, 10);
      }
      const target = parseActionTarget(raw.target);
      if (target) action.target = target;
      return action;
    }

    default:
      return null;
  }
}
