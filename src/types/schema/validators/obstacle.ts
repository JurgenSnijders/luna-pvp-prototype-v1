import { ACTOR_ARCHETYPES, OBSTACLE_SHAPES, TERRAIN_TYPES } from '../constants';
import type {
  ActorArchetype,
  ActorConfig,
  MorphConfig,
  ObstacleConfig,
  ObstacleShape,
  TerrainMutationConfig,
  TerrainType,
  TriggerNode,
} from '../types';
import { validateTriggerNode } from './trigger';
import {
  isNumber,
  isObject,
  isString,
  MAX_VALIDATION_DEPTH,
} from './helpers';
import { validateVisualDescriptor } from './visuals';

export function validateObstacleConfig(value: unknown): ObstacleConfig | null {
  if (!isObject(value)) return null;
  const shapeRaw = isString(value.shape) ? value.shape.toUpperCase() : '';
  if (!OBSTACLE_SHAPES.has(shapeRaw)) return null;
  if (!isNumber(value.width) || value.width <= 0) return null;
  if (!isNumber(value.height) || value.height <= 0) return null;
  if (!isNumber(value.durationMs) || value.durationMs <= 0) return null;

  const config: ObstacleConfig = {
    shape: shapeRaw as ObstacleShape,
    width: value.width,
    height: value.height,
    durationMs: value.durationMs,
  };

  if (value.angle !== undefined) {
    if (!isNumber(value.angle)) return null;
    config.angle = value.angle;
  }
  if (value.isDestructible !== undefined) {
    if (typeof value.isDestructible !== 'boolean') return null;
    config.isDestructible = value.isDestructible;
  }
  if (value.maxHealth !== undefined) {
    if (!isNumber(value.maxHealth) || value.maxHealth <= 0) return null;
    config.maxHealth = value.maxHealth;
  }

  return config;
}

export function validateTerrainMutationConfig(value: unknown): TerrainMutationConfig | null {
  if (!isObject(value)) return null;
  const typeRaw = isString(value.type) ? value.type.toUpperCase() : '';
  if (!TERRAIN_TYPES.has(typeRaw)) return null;
  if (!isNumber(value.radius) || value.radius <= 0) return null;
  if (!isNumber(value.durationMs) || value.durationMs <= 0) return null;

  return {
    type: typeRaw as TerrainType,
    radius: value.radius,
    durationMs: value.durationMs,
  };
}

export function validateMorphConfig(value: unknown): MorphConfig | null {
  if (!isObject(value)) return null;
  if (!isNumber(value.durationMs) || value.durationMs <= 0) return null;

  const config: MorphConfig = { durationMs: value.durationMs };

  if (value.radius !== undefined) {
    if (!isNumber(value.radius) || value.radius <= 0) return null;
    config.radius = value.radius;
  }
  if (value.mass !== undefined) {
    if (!isNumber(value.mass) || value.mass <= 0) return null;
    config.mass = value.mass;
  }
  if (value.speedMultiplier !== undefined) {
    if (!isNumber(value.speedMultiplier) || value.speedMultiplier <= 0) return null;
    config.speedMultiplier = value.speedMultiplier;
  }

  return config;
}

export function validateActorConfig(value: unknown, depth = 0): ActorConfig | null {
  if (!isObject(value)) return null;
  const archetypeRaw = isString(value.archetype) ? value.archetype.toUpperCase() : '';
  if (!ACTOR_ARCHETYPES.has(archetypeRaw)) return null;
  if (!isNumber(value.health) || value.health <= 0) return null;
  if (!isNumber(value.durationMs) || value.durationMs <= 0) return null;

  const config: ActorConfig = {
    archetype: archetypeRaw as ActorArchetype,
    health: value.health,
    durationMs: value.durationMs,
  };

  if (value.anchored !== undefined) {
    if (typeof value.anchored !== 'boolean') return null;
    config.anchored = value.anchored;
  }
  if (value.radius !== undefined) {
    if (!isNumber(value.radius) || value.radius <= 0) return null;
    config.radius = value.radius;
  }
  if (value.mass !== undefined) {
    if (!isNumber(value.mass) || value.mass <= 0) return null;
    config.mass = value.mass;
  }
  if (value.targetingRange !== undefined) {
    if (!isNumber(value.targetingRange) || value.targetingRange <= 0) return null;
    config.targetingRange = value.targetingRange;
  }
  if (value.visuals !== undefined) {
    const visuals = validateVisualDescriptor(value.visuals);
    if (!visuals) return null;
    config.visuals = visuals;
  }
  if (value.triggers !== undefined) {
    if (depth >= MAX_VALIDATION_DEPTH) return null;
    if (!Array.isArray(value.triggers)) return null;
    const triggers: TriggerNode[] = [];
    for (const t of value.triggers) {
      const node = validateTriggerNode(t, depth);
      if (!node) return null;
      triggers.push(node);
    }
    if (triggers.length > 0) config.triggers = triggers;
  }

  return config;
}
