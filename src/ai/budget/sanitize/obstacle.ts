import type { SkillCategory } from '../../../types/cards';
import type {
  ActorConfig,
  ActorArchetype,
  MorphConfig,
  ObstacleConfig,
  ObstacleShape,
  TerrainMutationConfig,
  TerrainType,
} from '../../../types/schema';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';
import { sanitizeTriggerNode } from './trigger';
import { sanitizeVisuals } from './visuals';

export function sanitizeObstacleConfig(raw: unknown): ObstacleConfig {
  const obj = isObject(raw) ? raw : {};
  const shapeRaw = typeof obj.shape === 'string' ? obj.shape.toUpperCase() : 'BOX';
  const shape = (['CIRCLE', 'BOX'].includes(shapeRaw) ? shapeRaw : 'BOX') as ObstacleShape;

  const config: ObstacleConfig = {
    shape,
    width: clamp(ensureFiniteNumber(obj.width, 40), 8, 400),
    height: clamp(ensureFiniteNumber(obj.height, 24), 8, 400),
    durationMs: clamp(ensureFiniteNumber(obj.durationMs, 5000), 500, 15000),
  };

  if (obj.angle !== undefined) {
    config.angle = ensureFiniteNumber(obj.angle, 0);
  }
  if (obj.isDestructible === true) {
    config.isDestructible = true;
    config.maxHealth = clamp(ensureFiniteNumber(obj.maxHealth, 100), 1, 1000);
  }
  return config;
}

export function sanitizeTerrainMutationConfig(raw: unknown): TerrainMutationConfig {
  const obj = isObject(raw) ? raw : {};
  const typeRaw = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'SAFE';
  const type = (['SAFE', 'LAVA'].includes(typeRaw) ? typeRaw : 'SAFE') as TerrainType;

  return {
    type,
    radius: clamp(ensureFiniteNumber(obj.radius, 60), 20, 500),
    durationMs: clamp(ensureFiniteNumber(obj.durationMs, 5000), 500, 15000),
  };
}

export function sanitizeMorphConfig(raw: unknown): MorphConfig {
  const obj = isObject(raw) ? raw : {};
  const config: MorphConfig = {
    durationMs: clamp(ensureFiniteNumber(obj.durationMs, 3000), 100, 15000),
  };

  if (obj.radius !== undefined) {
    config.radius = clamp(ensureFiniteNumber(obj.radius, 20), 10, 60);
  }
  if (obj.mass !== undefined) {
    config.mass = clamp(ensureFiniteNumber(obj.mass, 100), 1, 2000);
  }
  if (obj.speedMultiplier !== undefined) {
    config.speedMultiplier = clamp(ensureFiniteNumber(obj.speedMultiplier, 1), 0.25, 3);
  }

  return config;
}

export function sanitizeActorConfig(
  raw: unknown,
  depth = 0,
  category: SkillCategory = 'SECONDARY',
): ActorConfig {
  const obj = isObject(raw) ? raw : {};
  const actorArchetypeRaw =
    typeof (obj.actorArchetype ?? obj.archetype) === 'string'
      ? String(obj.actorArchetype ?? obj.archetype).toUpperCase()
      : 'DECOY';
  const actorArchetype = (
    ['TURRET', 'DECOY'].includes(actorArchetypeRaw) ? actorArchetypeRaw : 'DECOY'
  ) as ActorArchetype;

  const config: ActorConfig = {
    actorArchetype,
    health: clamp(ensureFiniteNumber(obj.health, 50), 1, 500),
    durationMs: clamp(ensureFiniteNumber(obj.durationMs, 5000), 500, 30000),
    anchored: obj.anchored === false ? false : true,
  };

  if (obj.radius !== undefined) {
    config.radius = clamp(ensureFiniteNumber(obj.radius, 15), 8, 48);
  }
  if (obj.mass !== undefined) {
    config.mass = clamp(ensureFiniteNumber(obj.mass, 50), 10, 500);
  }
  if (obj.targetingRange !== undefined) {
    config.targetingRange = clamp(ensureFiniteNumber(obj.targetingRange, 400), 100, 800);
  }
  if (obj.visuals !== undefined) {
    config.visuals = sanitizeVisuals(obj.visuals);
  }
  if (Array.isArray(obj.triggers)) {
    const triggers = obj.triggers
      .map((t) => sanitizeTriggerNode(t, depth, category))
      .filter((n): n is NonNullable<typeof n> => n !== null);
    if (triggers.length > 0) config.triggers = triggers;
  }

  return config;
}
