import type { PassiveModifierPayload, SkillCategory } from '../types/cards';
import type {
  AbilitySchema,
  ActionPayload,
  ActionTarget,
  EmitterConfig,
  EmitterDistribution,
  ImpactVfx,
  ImpulseDirectionMode,
  ProjectileStyle,
  TrajectoryConfig,
  TrajectoryType,
  TrailType,
  TriggerNode,
  VisualDescriptor,
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

const MAX_DEPTH = 3;
const MODIFY_STAT_COST = 5.0;

const TRAJECTORY_TYPES = new Set([
  'LINEAR',
  'RETURN_TO_SOURCE',
  'ORBIT_ANCHOR',
  'HOMING_SLERP',
  'DISCONTINUOUS_BLINK',
]);

const EMITTER_DISTRIBUTIONS = new Set([
  'FAN',
  'RADIAL',
  'RANDOM_CONE',
  'PARALLEL',
]);

const PROJECTILE_STYLES = new Set([
  'DISC',
  'BEAM',
  'PULSING_ORB',
  'SHURIKEN',
  'CHAOS_LIGHTNING',
]);
const TRAIL_TYPES = new Set(['NONE', 'SMOKE', 'ICE_GLOW', 'MAGMA_SPARKS', 'NEON_RIBBON']);
const IMPACT_VFX_TYPES = new Set([
  'SPARKS',
  'SHOCKWAVE',
  'ICE_BURST',
  'VORTEX_SWIRL',
  'MINI_NUKE',
]);
const FIELD_TYPES = new Set([
  'RADIAL_IMPULSE',
  'VORTEX_TANGENT',
  'FRICTION_OVERRIDE',
  'MASS_ATTRACTOR',
]);
const ACTION_TARGETS = new Set(['TARGET', 'CASTER', 'SELF']);
const IMPULSE_DIRECTION_MODES = new Set([
  'AWAY_FROM_ORIGIN',
  'TOWARDS_CASTER',
  'TOWARDS_ORIGIN',
  'ALONG_TRAJECTORY',
  'PERPENDICULAR_TRAJECTORY',
  'CUSTOM',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function parseActionTarget(value: unknown): ActionTarget | undefined {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return ACTION_TARGETS.has(upper) ? (upper as ActionTarget) : undefined;
}

function parseImpulseDirectionMode(value: unknown): ImpulseDirectionMode | undefined {
  const upper = typeof value === 'string' ? value.toUpperCase() : '';
  return IMPULSE_DIRECTION_MODES.has(upper) ? (upper as ImpulseDirectionMode) : undefined;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

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

  return {
    color: typeof obj.color === 'string' && obj.color.trim() ? obj.color : '#00e5ff',
    size: clamp(ensureFiniteNumber(obj.size, 8), 4, 32),
    projectileStyle: (PROJECTILE_STYLES.has(styleRaw) ? styleRaw : 'DISC') as ProjectileStyle,
    trailType: (TRAIL_TYPES.has(trailRaw) ? trailRaw : 'NONE') as TrailType,
    impactVfx: (IMPACT_VFX_TYPES.has(impactRaw) ? impactRaw : 'SPARKS') as ImpactVfx,
  };
}

function sanitizeAction(raw: unknown): ActionPayload | null {
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
          .map(sanitizeTriggerNode)
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

    default:
      return null;
  }
}

function sanitizeTriggerNode(raw: unknown): TriggerNode | null {
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
  };
  trigger = triggerAliases[trigger] ?? trigger;

  const validTriggers = new Set([
    'ON_CAST',
    'ON_TICK',
    'ON_HIT',
    'ON_EXPIRY',
    'ON_RETURN',
    'ON_HAZARD_CONTACT',
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
    .map(sanitizeAction)
    .filter((a): a is ActionPayload => a !== null);

  const node: TriggerNode = {
    trigger: trigger as TriggerNode['trigger'],
    actions,
  };

  if (trigger === 'ON_TICK' || raw.tickIntervalMs !== undefined) {
    node.tickIntervalMs = clamp(ensureFiniteNumber(raw.tickIntervalMs, 100), 16, 5000);
  }

  if (Array.isArray(raw.children)) {
    node.children = raw.children
      .map(sanitizeTriggerNode)
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
): AbilitySchema {
  const obj = isObject(raw) ? { ...raw } : {};

  const id = typeof obj.id === 'string' && obj.id ? obj.id : 'sanitized_ability';
  const name = typeof obj.name === 'string' && obj.name ? obj.name : 'Sanitized Ability';
  const cooldownMs = ensureFiniteNumber(obj.cooldownMs, 800);
  const recoilKick = ensureFiniteNumber(obj.recoilKick, 50);

  let triggers: TriggerNode[] = [];
  if (Array.isArray(obj.triggers)) {
    triggers = obj.triggers
      .map(sanitizeTriggerNode)
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
