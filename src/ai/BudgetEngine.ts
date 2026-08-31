import type { PassiveModifierPayload, SkillCategory } from '../types/cards';
import type {
  AbilitySchema,
  ActionPayload,
  ApplyImpulseAction,
  ComparisonOperator,
  ConditionNode,
  ConditionQuery,
  ConstraintConfig,
  ConstraintType,
  EmitterConfig,
  EmitterDistribution,
  ImpactVfx,
  InputProfile,
  InputProfileMode,
  ResourceCost,
  ResourceType,
  ObstacleConfig,
  ObstacleShape,
  TerrainMutationConfig,
  TerrainType,
  MorphConfig,
  ActorConfig,
  ActorArchetype,
  ProjectileStyle,
  TrajectoryConfig,
  TrajectoryType,
  TrailType,
  TriggerNode,
  VisualDescriptor,
} from '../types/schema';
import { validateAbilitySchema } from '../types/schema';
import {
  CATEGORY_BUDGETS,
  COMPARISON_OPERATORS,
  CONDITION_QUERIES,
  CONSTRAINT_TYPES,
  EMITTER_DISTRIBUTIONS,
  FIELD_TYPES,
  IMPACT_VFX_TYPES,
  INPUT_PROFILE_MODES,
  MAX_DEPTH,
  PROJECTILE_STYLES,
  TRAJECTORY_TYPES,
  TRAIL_TYPES,
} from './budget/constants';
import {
  clamp,
  ensureFiniteNumber,
  isObject,
  parseActionTarget,
  parseImpulseDirectionMode,
} from './budget/helpers';
import { scoreAbilitySchema } from './budget/score';

export { CATEGORY_BUDGETS } from './budget/constants';
export { scoreAbilitySchema } from './budget/score';
function sanitizeTrajectory(raw: unknown): TrajectoryConfig {
  const obj = isObject(raw) ? raw : {};
  const typeRaw = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'LINEAR';
  const type = (TRAJECTORY_TYPES.has(typeRaw) ? typeRaw : 'LINEAR') as TrajectoryType;

  const config: TrajectoryConfig = {
    type,
    speed: clamp(ensureFiniteNumber(obj.speed, 400), 150, 1600),
    maxRange: clamp(ensureFiniteNumber(obj.maxRange, 500), 50, 1200),
  };

  if (obj.turnAccel !== undefined) {
    config.turnAccel = ensureFiniteNumber(obj.turnAccel, 800);
  }
  if (obj.piercing !== undefined) {
    config.piercing = clamp(ensureFiniteNumber(obj.piercing, 0), 0, 4);
  }
  if (obj.orbitRadius !== undefined) {
    config.orbitRadius = ensureFiniteNumber(obj.orbitRadius, 80);
  }
  if (obj.orbitSpeed !== undefined) {
    config.orbitSpeed = ensureFiniteNumber(obj.orbitSpeed, 3);
  }
  if (obj.blinkDistance !== undefined) {
    config.blinkDistance = ensureFiniteNumber(obj.blinkDistance, 60);
  }

  return config;
}

function sanitizeConstraintConfig(raw: unknown): ConstraintConfig {
  const obj = isObject(raw) ? raw : {};
  const typeRaw = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'SPRING_TETHER';
  const type = (CONSTRAINT_TYPES.has(typeRaw) ? typeRaw : 'SPRING_TETHER') as ConstraintType;

  const defaultRestLength = type === 'DISTANCE_ROD' ? 100 : 0;
  const config: ConstraintConfig = {
    type,
    durationMs: clamp(ensureFiniteNumber(obj.durationMs ?? obj.duration, 2000), 100, 10000),
    stiffness: clamp(ensureFiniteNumber(obj.stiffness, 100), 1, 2000),
    restLength: clamp(ensureFiniteNumber(obj.restLength, defaultRestLength), 0, 2000),
  };

  if (obj.maxBreakDistance !== undefined) {
    config.maxBreakDistance = clamp(ensureFiniteNumber(obj.maxBreakDistance, 500), 10, 5000);
  }

  return config;
}

function parseComparisonOperator(value: unknown): ComparisonOperator | undefined {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return COMPARISON_OPERATORS.has(upper) ? (upper as ComparisonOperator) : undefined;
}

function sanitizeObstacleConfig(raw: unknown): ObstacleConfig {
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

function sanitizeTerrainMutationConfig(raw: unknown): TerrainMutationConfig {
  const obj = isObject(raw) ? raw : {};
  const typeRaw = typeof obj.type === 'string' ? obj.type.toUpperCase() : 'SAFE';
  const type = (['SAFE', 'LAVA'].includes(typeRaw) ? typeRaw : 'SAFE') as TerrainType;

  return {
    type,
    radius: clamp(ensureFiniteNumber(obj.radius, 60), 20, 500),
    durationMs: clamp(ensureFiniteNumber(obj.durationMs, 5000), 500, 15000),
  };
}

function sanitizeMorphConfig(raw: unknown): MorphConfig {
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

function sanitizeActorConfig(raw: unknown): ActorConfig {
  const obj = isObject(raw) ? raw : {};
  const archetypeRaw = typeof obj.archetype === 'string' ? obj.archetype.toUpperCase() : 'DECOY';
  const archetype = (
    ['TURRET', 'DECOY'].includes(archetypeRaw) ? archetypeRaw : 'DECOY'
  ) as ActorArchetype;

  return {
    archetype,
    health: clamp(ensureFiniteNumber(obj.health, 50), 1, 500),
    durationMs: clamp(ensureFiniteNumber(obj.durationMs, 5000), 500, 30000),
  };
}

function sanitizeResourceCost(raw: unknown): ResourceCost | null {
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

function sanitizeInputProfile(raw: unknown): InputProfile {
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

function sanitizeConditionNode(raw: unknown): ConditionNode | null {
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

function sanitizeEmitter(raw: unknown, countHint = 1): EmitterConfig {
  const obj = isObject(raw) ? raw : {};
  const count = clamp(Math.round(ensureFiniteNumber(obj.count, countHint)), 1, 12);
  const spreadMissing = obj.spreadDeg === undefined || obj.spreadDeg === null;
  const spreadDeg = clamp(
    ensureFiniteNumber(obj.spreadDeg, count > 1 ? 30 : 0),
    0,
    360,
  );
  const distRaw =
    typeof obj.distribution === 'string' ? obj.distribution.toUpperCase() : 'FAN';
  const distribution = (
    EMITTER_DISTRIBUTIONS.has(distRaw) ? distRaw : 'FAN'
  ) as EmitterDistribution;

  const emitter: EmitterConfig = {
    count,
    spreadDeg: spreadMissing && count > 1 ? 30 : spreadDeg,
    distribution,
  };

  if (obj.aimOffsetDeg !== undefined) {
    emitter.aimOffsetDeg = ensureFiniteNumber(obj.aimOffsetDeg, 0);
  }
  if (obj.inheritVelocityRatio !== undefined) {
    emitter.inheritVelocityRatio = clamp(
      ensureFiniteNumber(obj.inheritVelocityRatio, 0),
      0,
      1,
    );
  }

  return emitter;
}

function sanitizeVisuals(raw: unknown): VisualDescriptor {
  const obj = isObject(raw) ? raw : {};
  const trailRaw =
    typeof obj.trailType === 'string' ? obj.trailType.toUpperCase() : 'NONE';
  const impactRaw =
    typeof obj.impactVfx === 'string' ? obj.impactVfx.toUpperCase() : 'SPARKS';
  const styleRaw =
    typeof obj.projectileStyle === 'string'
      ? obj.projectileStyle.toUpperCase()
      : 'DISC';

  const descriptor: VisualDescriptor = {
    color: typeof obj.color === 'string' && obj.color.trim() ? obj.color : '#00e5ff',
    size: clamp(ensureFiniteNumber(obj.size, 8), 4, 32),
    projectileStyle: (PROJECTILE_STYLES.has(styleRaw) ? styleRaw : 'DISC') as ProjectileStyle,
    trailType: (TRAIL_TYPES.has(trailRaw) ? trailRaw : 'NONE') as TrailType,
    impactVfx: (IMPACT_VFX_TYPES.has(impactRaw) ? impactRaw : 'SPARKS') as ImpactVfx,
  };

  if (isObject(obj.vfx)) {
    const vfxRaw = obj.vfx;
    const vfx: VisualDescriptor['vfx'] = {};
    if (vfxRaw.glowIntensity !== undefined) {
      vfx.glowIntensity = clamp(ensureFiniteNumber(vfxRaw.glowIntensity, 1), 0, 2);
    }
    if (vfxRaw.trailDensity !== undefined) {
      vfx.trailDensity = clamp(ensureFiniteNumber(vfxRaw.trailDensity, 1), 0, 2);
    }
    if (vfxRaw.trailLengthMs !== undefined) {
      vfx.trailLengthMs = clamp(ensureFiniteNumber(vfxRaw.trailLengthMs, 400), 50, 2000);
    }
    if (vfxRaw.impactScale !== undefined) {
      vfx.impactScale = clamp(ensureFiniteNumber(vfxRaw.impactScale, 1), 0.5, 2);
    }
    if (typeof vfxRaw.secondaryColor === 'string' && vfxRaw.secondaryColor.trim()) {
      vfx.secondaryColor = vfxRaw.secondaryColor;
    }
    if (typeof vfxRaw.blendMode === 'string') {
      const bm = vfxRaw.blendMode.toUpperCase();
      if (bm === 'NORMAL' || bm === 'ADDITIVE') vfx.blendMode = bm;
    }
    if (vfxRaw.shakeIntensity !== undefined) {
      vfx.shakeIntensity = clamp(ensureFiniteNumber(vfxRaw.shakeIntensity, 1), 0, 2);
    }
    if (vfxRaw.distortion !== undefined) {
      vfx.distortion = clamp(ensureFiniteNumber(vfxRaw.distortion, 0), 0, 1);
    }
    if (Object.keys(vfx).length > 0) descriptor.vfx = vfx;
  }

  return descriptor;
}

function sanitizeAction(
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
      const statMap: Record<string, 'mass' | 'linearDrag' | 'moveSpeed' | 'instabilityPct'> = {
        mass: 'mass',
        lineardrag: 'linearDrag',
        linear_drag: 'linearDrag',
        movespeed: 'moveSpeed',
        move_speed: 'moveSpeed',
        instabilitypct: 'instabilityPct',
        instability: 'instabilityPct',
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
        actor: sanitizeActorConfig(raw.actor),
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

    default:
      return null;
  }
}

function sanitizeTriggerNode(
  raw: unknown,
  depth = 0,
  category: SkillCategory = 'SECONDARY',
): TriggerNode | null {
  if (!isObject(raw)) return null;

  let trigger = typeof raw.trigger === 'string' ? raw.trigger.toUpperCase() : '';
  if (!trigger && typeof raw.on === 'string') {
    trigger = raw.on.toUpperCase();
  }

  const triggerAliases: Record<string, string> = {
    ON_IMPACT: 'ON_HIT',
    ON_COLLISION: 'ON_HIT',
    ON_CONTACT: 'ON_HIT',
    ON_DESTROY: 'ON_EXPIRY',
    ON_DEATH: 'ON_EXPIRY',
    ON_SPAWN: 'ON_CAST',
    ON_DETONATE: 'ON_RECAST',
    ON_WALL_HIT: 'ON_HIT_WALL',
  };
  trigger = triggerAliases[trigger] ?? trigger;

  const validTriggers = new Set([
    'ON_CAST',
    'ON_TICK',
    'ON_HIT',
    'ON_EXPIRY',
    'ON_RETURN',
    'ON_HAZARD_CONTACT',
    'ON_RECAST',
    'ON_HIT_WALL',
    'ON_DISTANCE_TRAVELED',
  ]);
  if (!validTriggers.has(trigger)) return null;

  let actionsRaw: unknown[] = [];
  if (Array.isArray(raw.actions)) {
    actionsRaw = raw.actions;
  } else if (Array.isArray(raw.effects)) {
    actionsRaw = raw.effects;
  } else if (raw.actions && typeof raw.actions === 'object') {
    actionsRaw = [raw.actions];
  }

  const actions = actionsRaw
    .map((a) => sanitizeAction(a, depth, category))
    .filter((a): a is ActionPayload => a !== null);

  const node: TriggerNode = {
    trigger: trigger as TriggerNode['trigger'],
    actions,
  };

  if (trigger === 'ON_TICK' || raw.tickIntervalMs !== undefined) {
    node.tickIntervalMs = clamp(ensureFiniteNumber(raw.tickIntervalMs, 100), 16, 5000);
  }

  if (trigger === 'ON_DISTANCE_TRAVELED' || raw.triggerDistance !== undefined) {
    node.triggerDistance = clamp(ensureFiniteNumber(raw.triggerDistance, 100), 1, 5000);
  }

  if (typeof raw.fireOnHitDeath === 'boolean') {
    node.fireOnHitDeath = raw.fireOnHitDeath;
  }

  if (Array.isArray(raw.conditions)) {
    const conditions = raw.conditions
      .map(sanitizeConditionNode)
      .filter((c): c is ConditionNode => c !== null);
    if (conditions.length > 0) node.conditions = conditions;
  }

  if (Array.isArray(raw.ifFalseActions)) {
    const ifFalseActions = raw.ifFalseActions
      .map((a) => sanitizeAction(a, depth, category))
      .filter((a): a is ActionPayload => a !== null);
    if (ifFalseActions.length > 0) node.ifFalseActions = ifFalseActions;
  }

  if (Array.isArray(raw.children)) {
    node.children = raw.children
      .map((c) => sanitizeTriggerNode(c, depth, category))
      .filter((n): n is TriggerNode => n !== null);
  }

  return node;
}

function hasOnCastEffect(triggers: TriggerNode[]): boolean {
  return triggers.some((n) => n.trigger === 'ON_CAST' && n.actions.length > 0);
}

function promoteRootEmitter(
  schema: AbilitySchema,
  obj: Record<string, unknown>,
): void {
  const emitterRaw = obj.rootEmitter ?? obj.emitter;
  if (emitterRaw === undefined || !schema.trajectory) return;

  const emitter = sanitizeEmitter(emitterRaw);
  const needsFan =
    emitter.count > 1 ||
    emitter.spreadDeg > 0 ||
    (emitter.aimOffsetDeg !== undefined && emitter.aimOffsetDeg !== 0);
  if (!needsFan) return;

  const lifecycle = schema.triggers.filter((t) => t.trigger !== 'ON_CAST');
  const onCast = schema.triggers.find((t) => t.trigger === 'ON_CAST');
  const spawn: Extract<ActionPayload, { type: 'SPAWN_PROJECTILE' }> = {
    type: 'SPAWN_PROJECTILE',
    projectileTrajectory: schema.trajectory,
    emitter,
  };
  if (lifecycle.length > 0) spawn.triggers = lifecycle;
  if (schema.visuals) spawn.visuals = schema.visuals;

  delete schema.trajectory;
  schema.triggers = schema.triggers.filter((t) => t.trigger === 'ON_CAST');
  if (onCast) {
    onCast.actions.push(spawn);
  } else {
    schema.triggers.unshift({ trigger: 'ON_CAST', actions: [spawn] });
  }
}

export function sanitizeAbilitySchema(
  raw: unknown,
  _category: SkillCategory = 'SECONDARY',
  sanitizeDepth = 0,
): AbilitySchema {
  const obj = isObject(raw) ? { ...raw } : {};

  const id = typeof obj.id === 'string' && obj.id ? obj.id : 'sanitized_ability';
  const name = typeof obj.name === 'string' && obj.name ? obj.name : 'Sanitized Ability';
  const cooldownMs = ensureFiniteNumber(obj.cooldownMs, 800);
  const recoilKick = ensureFiniteNumber(obj.recoilKick, 50);

  let triggers: TriggerNode[] = [];
  if (Array.isArray(obj.triggers)) {
    triggers = obj.triggers
      .map((t) => sanitizeTriggerNode(t, sanitizeDepth, _category))
      .filter((n): n is TriggerNode => n !== null);
  }

  const schema: AbilitySchema = {
    id,
    name,
    cooldownMs,
    recoilKick,
    triggers,
  };

  if (obj.trajectory !== undefined) {
    schema.trajectory = sanitizeTrajectory(obj.trajectory);
  }

  schema.visuals = sanitizeVisuals(obj.visuals);

  if (isObject(obj.metadata)) {
    schema.metadata = obj.metadata as Record<string, unknown>;
  }

  if (obj.inputProfile !== undefined) {
    schema.inputProfile = sanitizeInputProfile(obj.inputProfile);
  }

  if (obj.resourceCost !== undefined) {
    const resourceCost = sanitizeResourceCost(obj.resourceCost);
    if (resourceCost) {
      schema.resourceCost = resourceCost;
    }
  }

  promoteRootEmitter(schema, obj);

  if (!schema.trajectory && !hasOnCastEffect(schema.triggers)) {
    schema.trajectory = sanitizeTrajectory(obj.trajectory);
  }

  const validated = validateAbilitySchema(schema);
  return validated ?? {
    id,
    name,
    cooldownMs,
    recoilKick,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
    triggers: [],
    visuals: sanitizeVisuals(undefined),
  };
}

function clampSchemaValues(schema: AbilitySchema): AbilitySchema {
  const s = structuredClone(schema);

  if (s.trajectory) {
    if (s.trajectory.speed !== undefined) {
      s.trajectory.speed = clamp(s.trajectory.speed, 150, 1600);
    }
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
            action.projectileTrajectory.speed = clamp(
              action.projectileTrajectory.speed,
              150,
              1600,
            );
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

function repairImpulseSemantics(
  action: ApplyImpulseAction,
  desc: string,
): ApplyImpulseAction {
  if (action.directionMode) return action;

  const patched = { ...action };
  if (/\b(pull|draw|harpoon|hook)\b/.test(desc)) {
    patched.directionMode = 'TOWARDS_CASTER';
    if (!patched.target) patched.target = 'TARGET';
  } else if (/\b(push|repel|knockback)\b/.test(desc)) {
    patched.directionMode = 'AWAY_FROM_ORIGIN';
    if (!patched.target) patched.target = 'TARGET';
  }
  return patched;
}

function repairActionsSemantics(actions: ActionPayload[], desc: string): ActionPayload[] {
  return actions.map((action) => {
    if (action.type === 'APPLY_IMPULSE') {
      return repairImpulseSemantics(action, desc);
    }
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      return {
        ...action,
        triggers: repairTriggersSemantics(action.triggers, desc),
      };
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      return {
        ...action,
        payload: repairAbilitySemantics(action.payload, desc),
      };
    }
    return action;
  });
}

function repairTriggersSemantics(nodes: TriggerNode[], desc: string): TriggerNode[] {
  return nodes.map((node) => ({
    ...node,
    actions: repairActionsSemantics(node.actions, desc),
    ifFalseActions: node.ifFalseActions
      ? repairActionsSemantics(node.ifFalseActions, desc)
      : undefined,
    children: node.children ? repairTriggersSemantics(node.children, desc) : undefined,
  }));
}

/** Patches missing impulse direction modes based on prompt keywords. */
export function repairAbilitySemantics(
  payload: AbilitySchema,
  description = '',
): AbilitySchema {
  const desc = description.toLowerCase();
  const cloned = structuredClone(payload);
  cloned.triggers = repairTriggersSemantics(cloned.triggers, desc);
  return cloned;
}
