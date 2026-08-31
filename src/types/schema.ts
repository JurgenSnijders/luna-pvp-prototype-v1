export type TrajectoryType =
  | 'LINEAR'
  | 'RETURN_TO_SOURCE'
  | 'ORBIT_ANCHOR'
  | 'HOMING_SLERP'
  | 'DISCONTINUOUS_BLINK';

export type FieldType =
  | 'RADIAL_IMPULSE'
  | 'VORTEX_TANGENT'
  | 'FRICTION_OVERRIDE'
  | 'MASS_ATTRACTOR';

export type TriggerType =
  | 'ON_CAST'
  | 'ON_TICK'
  | 'ON_HIT'
  | 'ON_EXPIRY'
  | 'ON_RETURN'
  | 'ON_HAZARD_CONTACT'
  | 'ON_RECAST'
  | 'ON_HIT_WALL'
  | 'ON_DISTANCE_TRAVELED';

export type ConstraintType = 'SPRING_TETHER' | 'DISTANCE_ROD' | 'SURFACE_PIN';

export type ActionType =
  | 'ADD_INSTABILITY'
  | 'APPLY_IMPULSE'
  | 'SPAWN_FIELD'
  | 'SPAWN_PROJECTILE'
  | 'SPAWN_CONSTRAINT'
  | 'MODIFY_STAT'
  | 'TELEPORT';

export type ActionTarget = 'TARGET' | 'CASTER' | 'SELF';

export type ConditionQuery =
  | 'STAT_THRESHOLD'
  | 'TAG_CHECK'
  | 'PROXIMITY_COUNT'
  | 'SURFACE_TYPE';

export type ComparisonOperator = 'LT' | 'GT' | 'EQ' | 'LTE' | 'GTE';

export interface ConditionNode {
  query: ConditionQuery;
  target?: ActionTarget;
  stat?: 'health' | 'instabilityPct';
  comparison?: ComparisonOperator;
  value: number | string;
  radius?: number;
}

export type ImpulseDirectionMode =
  | 'AWAY_FROM_ORIGIN'
  | 'TOWARDS_CASTER'
  | 'TOWARDS_ORIGIN'
  | 'ALONG_TRAJECTORY'
  | 'PERPENDICULAR_TRAJECTORY'
  | 'CUSTOM';

export type EmitterDistribution = 'FAN' | 'RADIAL' | 'RANDOM_CONE' | 'PARALLEL';

export type ProjectileStyle =
  | 'DISC'
  | 'BEAM'
  | 'PULSING_ORB'
  | 'SHURIKEN'
  | 'CHAOS_LIGHTNING';

export type TrailType = 'NONE' | 'SMOKE' | 'ICE_GLOW' | 'MAGMA_SPARKS' | 'NEON_RIBBON';

export type ImpactVfx =
  | 'SPARKS'
  | 'SHOCKWAVE'
  | 'ICE_BURST'
  | 'VORTEX_SWIRL'
  | 'MINI_NUKE';

export interface TrajectoryConfig {
  type: TrajectoryType;
  speed?: number;
  turnAccel?: number;
  maxRange?: number;
  piercing?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  blinkDistance?: number;
}

export interface FieldConfig {
  fieldType: FieldType;
  radius: number;
  strength: number;
  durationMs: number;
  frictionValue?: number;
  attachToSource?: boolean;
  offset?: { x: number; y: number };
  detachOnParentDeath?: boolean;
}

export interface EmitterConfig {
  count: number;
  spreadDeg: number;
  aimOffsetDeg?: number;
  distribution: EmitterDistribution;
  inheritVelocityRatio?: number;
}

export interface VisualDescriptor {
  color: string;
  size: number;
  projectileStyle: ProjectileStyle;
  trailType: TrailType;
  impactVfx: ImpactVfx;
}

export interface AddInstabilityAction {
  type: 'ADD_INSTABILITY';
  amount: number;
  target?: ActionTarget;
}

export interface ApplyImpulseAction {
  type: 'APPLY_IMPULSE';
  baseForce: number;
  direction?: { x: number; y: number };
  target?: ActionTarget;
  directionMode?: ImpulseDirectionMode;
}

export interface SpawnFieldAction {
  type: 'SPAWN_FIELD';
  field: FieldConfig;
  target?: ActionTarget;
}

export interface SpawnProjectileAction {
  type: 'SPAWN_PROJECTILE';
  projectileTrajectory: TrajectoryConfig;
  emitter?: EmitterConfig;
  triggers?: TriggerNode[];
  visuals?: VisualDescriptor;
}

export interface ModifyStatAction {
  type: 'MODIFY_STAT';
  stat: 'mass' | 'linearDrag' | 'moveSpeed' | 'instabilityPct';
  value: number;
  mode: 'add' | 'set' | 'multiply';
  target?: ActionTarget;
}

export interface TeleportAction {
  type: 'TELEPORT';
  distance: number;
  direction?: { x: number; y: number };
  target?: ActionTarget;
}

export interface ConstraintConfig {
  type: ConstraintType;
  stiffness?: number;
  restLength?: number;
  maxBreakDistance?: number;
  durationMs: number;
}

export interface SpawnConstraintAction {
  type: 'SPAWN_CONSTRAINT';
  constraint: ConstraintConfig;
  source?: ActionTarget;
  target?: ActionTarget;
}

export type ActionPayload =
  | AddInstabilityAction
  | ApplyImpulseAction
  | SpawnFieldAction
  | SpawnProjectileAction
  | SpawnConstraintAction
  | ModifyStatAction
  | TeleportAction;

export interface TriggerNode {
  trigger: TriggerType;
  tickIntervalMs?: number;
  triggerDistance?: number;
  fireOnHitDeath?: boolean;
  conditions?: ConditionNode[];
  actions: ActionPayload[];
  ifFalseActions?: ActionPayload[];
  children?: TriggerNode[];
}

export interface AbilitySchema {
  id: string;
  name: string;
  cooldownMs: number;
  recoilKick: number;
  trajectory?: TrajectoryConfig;
  triggers: TriggerNode[];
  visuals?: VisualDescriptor;
  metadata?: Record<string, unknown>;
}

export type { TriggerContext } from './triggerContext';

const TRAJECTORY_TYPES: ReadonlySet<string> = new Set([
  'LINEAR',
  'RETURN_TO_SOURCE',
  'ORBIT_ANCHOR',
  'HOMING_SLERP',
  'DISCONTINUOUS_BLINK',
]);

const FIELD_TYPES: ReadonlySet<string> = new Set([
  'RADIAL_IMPULSE',
  'VORTEX_TANGENT',
  'FRICTION_OVERRIDE',
  'MASS_ATTRACTOR',
]);

const TRIGGER_TYPES: ReadonlySet<string> = new Set([
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

const CONSTRAINT_TYPES: ReadonlySet<string> = new Set([
  'SPRING_TETHER',
  'DISTANCE_ROD',
  'SURFACE_PIN',
]);

const ACTION_TYPES: ReadonlySet<string> = new Set([
  'ADD_INSTABILITY',
  'APPLY_IMPULSE',
  'SPAWN_FIELD',
  'SPAWN_PROJECTILE',
  'SPAWN_CONSTRAINT',
  'MODIFY_STAT',
  'TELEPORT',
]);

const ACTION_TARGETS: ReadonlySet<string> = new Set(['TARGET', 'CASTER', 'SELF']);

const CONDITION_QUERIES: ReadonlySet<string> = new Set([
  'STAT_THRESHOLD',
  'TAG_CHECK',
  'PROXIMITY_COUNT',
  'SURFACE_TYPE',
]);

const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(['LT', 'GT', 'EQ', 'LTE', 'GTE']);

const IMPULSE_DIRECTION_MODES: ReadonlySet<string> = new Set([
  'AWAY_FROM_ORIGIN',
  'TOWARDS_CASTER',
  'TOWARDS_ORIGIN',
  'ALONG_TRAJECTORY',
  'PERPENDICULAR_TRAJECTORY',
  'CUSTOM',
]);

const EMITTER_DISTRIBUTIONS: ReadonlySet<string> = new Set([
  'FAN',
  'RADIAL',
  'RANDOM_CONE',
  'PARALLEL',
]);

const PROJECTILE_STYLES: ReadonlySet<string> = new Set([
  'DISC',
  'BEAM',
  'PULSING_ORB',
  'SHURIKEN',
  'CHAOS_LIGHTNING',
]);

const TRAIL_TYPES: ReadonlySet<string> = new Set([
  'NONE',
  'SMOKE',
  'ICE_GLOW',
  'MAGMA_SPARKS',
  'NEON_RIBBON',
]);

const IMPACT_VFX_TYPES: ReadonlySet<string> = new Set([
  'SPARKS',
  'SHOCKWAVE',
  'ICE_BURST',
  'VORTEX_SWIRL',
  'MINI_NUKE',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function parseActionTarget(value: unknown): ActionTarget | undefined {
  return isString(value) && ACTION_TARGETS.has(value) ? (value as ActionTarget) : undefined;
}

function parseImpulseDirectionMode(value: unknown): ImpulseDirectionMode | undefined {
  return isString(value) && IMPULSE_DIRECTION_MODES.has(value)
    ? (value as ImpulseDirectionMode)
    : undefined;
}

function validateTrajectoryConfig(value: unknown): TrajectoryConfig | null {
  if (!isObject(value) || !isString(value.type)) return null;
  if (!TRAJECTORY_TYPES.has(value.type)) return null;
  const config: TrajectoryConfig = { type: value.type as TrajectoryType };

  if (value.speed !== undefined) {
    if (!isNumber(value.speed)) return null;
    config.speed = value.speed;
  }
  if (value.turnAccel !== undefined) {
    if (!isNumber(value.turnAccel)) return null;
    config.turnAccel = value.turnAccel;
  }
  if (value.maxRange !== undefined) {
    if (!isNumber(value.maxRange)) return null;
    config.maxRange = value.maxRange;
  }
  if (value.piercing !== undefined) {
    if (!isNumber(value.piercing)) return null;
    config.piercing = value.piercing;
  }
  if (value.orbitRadius !== undefined) {
    if (!isNumber(value.orbitRadius)) return null;
    config.orbitRadius = value.orbitRadius;
  }
  if (value.orbitSpeed !== undefined) {
    if (!isNumber(value.orbitSpeed)) return null;
    config.orbitSpeed = value.orbitSpeed;
  }
  if (value.blinkDistance !== undefined) {
    if (!isNumber(value.blinkDistance)) return null;
    config.blinkDistance = value.blinkDistance;
  }

  return config;
}

function validateFieldConfig(value: unknown): FieldConfig | null {
  if (!isObject(value)) return null;
  if (!isString(value.fieldType) || !FIELD_TYPES.has(value.fieldType)) return null;
  if (!isNumber(value.radius) || !isNumber(value.strength) || !isNumber(value.durationMs)) {
    return null;
  }

  const config: FieldConfig = {
    fieldType: value.fieldType as FieldType,
    radius: value.radius,
    strength: value.strength,
    durationMs: value.durationMs,
  };

  if (value.frictionValue !== undefined) {
    if (!isNumber(value.frictionValue)) return null;
    config.frictionValue = value.frictionValue;
  }

  if (value.attachToSource !== undefined) {
    if (typeof value.attachToSource !== 'boolean') return null;
    config.attachToSource = value.attachToSource;
  }

  if (value.offset !== undefined) {
    if (!isObject(value.offset) || !isNumber(value.offset.x) || !isNumber(value.offset.y)) {
      return null;
    }
    config.offset = { x: value.offset.x, y: value.offset.y };
  }

  if (value.detachOnParentDeath !== undefined) {
    if (typeof value.detachOnParentDeath !== 'boolean') return null;
    config.detachOnParentDeath = value.detachOnParentDeath;
  }

  return config;
}

function validateEmitterConfig(value: unknown): EmitterConfig | null {
  if (!isObject(value)) return null;
  if (!isNumber(value.count) || !isNumber(value.spreadDeg)) return null;
  if (!isString(value.distribution) || !EMITTER_DISTRIBUTIONS.has(value.distribution)) {
    return null;
  }

  const config: EmitterConfig = {
    count: value.count,
    spreadDeg: value.spreadDeg,
    distribution: value.distribution as EmitterDistribution,
  };

  if (value.aimOffsetDeg !== undefined) {
    if (!isNumber(value.aimOffsetDeg)) return null;
    config.aimOffsetDeg = value.aimOffsetDeg;
  }
  if (value.inheritVelocityRatio !== undefined) {
    if (!isNumber(value.inheritVelocityRatio)) return null;
    config.inheritVelocityRatio = value.inheritVelocityRatio;
  }

  return config;
}

function validateConstraintConfig(value: unknown): ConstraintConfig | null {
  if (!isObject(value)) return null;
  if (!isString(value.type) || !CONSTRAINT_TYPES.has(value.type)) return null;
  if (!isNumber(value.durationMs) || value.durationMs <= 0) return null;

  const config: ConstraintConfig = {
    type: value.type as ConstraintType,
    durationMs: value.durationMs,
  };

  if (value.stiffness !== undefined) {
    if (!isNumber(value.stiffness)) return null;
    config.stiffness = value.stiffness;
  }
  if (value.restLength !== undefined) {
    if (!isNumber(value.restLength)) return null;
    config.restLength = value.restLength;
  }
  if (value.maxBreakDistance !== undefined) {
    if (!isNumber(value.maxBreakDistance)) return null;
    config.maxBreakDistance = value.maxBreakDistance;
  }

  return config;
}

function validateVisualDescriptor(value: unknown): VisualDescriptor | null {
  if (!isObject(value)) return null;
  if (!isString(value.color) || !isNumber(value.size)) return null;
  if (!isString(value.trailType) || !TRAIL_TYPES.has(value.trailType)) return null;
  if (!isString(value.impactVfx) || !IMPACT_VFX_TYPES.has(value.impactVfx)) return null;

  let projectileStyle: ProjectileStyle = 'DISC';
  if (value.projectileStyle !== undefined) {
    if (!isString(value.projectileStyle) || !PROJECTILE_STYLES.has(value.projectileStyle)) {
      return null;
    }
    projectileStyle = value.projectileStyle as ProjectileStyle;
  }

  return {
    color: value.color,
    size: value.size,
    projectileStyle,
    trailType: value.trailType as TrailType,
    impactVfx: value.impactVfx as ImpactVfx,
  };
}

function validateActionPayload(value: unknown): ActionPayload | null {
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
          const node = validateTriggerNode(t);
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

    default:
      return null;
  }
}

function parseComparisonOperator(value: unknown): ComparisonOperator | undefined {
  return isString(value) && COMPARISON_OPERATORS.has(value)
    ? (value as ComparisonOperator)
    : undefined;
}

function validateConditionNode(value: unknown): ConditionNode | null {
  if (!isObject(value) || !isString(value.query)) return null;
  if (!CONDITION_QUERIES.has(value.query)) return null;
  if (value.value === undefined || value.value === null) return null;

  const query = value.query as ConditionQuery;
  const cond: ConditionNode = { query, value: value.value as number | string };

  const target = parseActionTarget(value.target);
  if (target) cond.target = target;

  switch (query) {
    case 'STAT_THRESHOLD': {
      if (
        !isString(value.stat) ||
        !['health', 'instabilityPct'].includes(value.stat) ||
        !parseComparisonOperator(value.comparison) ||
        !isNumber(value.value)
      ) {
        return null;
      }
      cond.stat = value.stat as 'health' | 'instabilityPct';
      cond.comparison = parseComparisonOperator(value.comparison);
      cond.value = value.value;
      return cond;
    }
    case 'TAG_CHECK': {
      if (!isString(value.value)) return null;
      cond.value = value.value;
      return cond;
    }
    case 'PROXIMITY_COUNT': {
      if (!parseComparisonOperator(value.comparison) || !isNumber(value.value)) return null;
      cond.comparison = parseComparisonOperator(value.comparison);
      cond.value = value.value;
      if (value.radius !== undefined) {
        if (!isNumber(value.radius) || value.radius <= 0) return null;
        cond.radius = value.radius;
      }
      return cond;
    }
    case 'SURFACE_TYPE': {
      if (!isString(value.value)) return null;
      cond.value = value.value;
      return cond;
    }
    default:
      return null;
  }
}

function validateTriggerNode(value: unknown): TriggerNode | null {
  if (!isObject(value)) return null;
  if (!isString(value.trigger) || !TRIGGER_TYPES.has(value.trigger)) return null;
  if (!Array.isArray(value.actions)) return null;

  const actions: ActionPayload[] = [];
  for (const action of value.actions) {
    const validated = validateActionPayload(action);
    if (!validated) return null;
    actions.push(validated);
  }

  const node: TriggerNode = {
    trigger: value.trigger as TriggerType,
    actions,
  };

  if (value.tickIntervalMs !== undefined) {
    if (!isNumber(value.tickIntervalMs)) return null;
    node.tickIntervalMs = value.tickIntervalMs;
  }

  if (value.triggerDistance !== undefined) {
    if (!isNumber(value.triggerDistance) || value.triggerDistance <= 0) return null;
    node.triggerDistance = value.triggerDistance;
  }

  if (value.fireOnHitDeath !== undefined) {
    if (typeof value.fireOnHitDeath !== 'boolean') return null;
    node.fireOnHitDeath = value.fireOnHitDeath;
  }

  if (value.conditions !== undefined) {
    if (!Array.isArray(value.conditions)) return null;
    const conditions: ConditionNode[] = [];
    for (const c of value.conditions) {
      const validated = validateConditionNode(c);
      if (validated) conditions.push(validated);
    }
    if (conditions.length > 0) node.conditions = conditions;
  }

  if (value.ifFalseActions !== undefined) {
    if (!Array.isArray(value.ifFalseActions)) return null;
    const ifFalseActions: ActionPayload[] = [];
    for (const action of value.ifFalseActions) {
      const validated = validateActionPayload(action);
      if (!validated) return null;
      ifFalseActions.push(validated);
    }
    if (ifFalseActions.length > 0) node.ifFalseActions = ifFalseActions;
  }

  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) return null;
    const children: TriggerNode[] = [];
    for (const child of value.children) {
      const validated = validateTriggerNode(child);
      if (!validated) return null;
      children.push(validated);
    }
    node.children = children;
  }

  return node;
}

export function validateAbilitySchema(json: unknown): AbilitySchema | null {
  if (!isObject(json)) return null;
  if (!isString(json.id) || !isString(json.name)) return null;
  if (!isNumber(json.cooldownMs) || !isNumber(json.recoilKick)) return null;
  if (!Array.isArray(json.triggers)) return null;

  const triggers: TriggerNode[] = [];
  for (const trigger of json.triggers) {
    const validated = validateTriggerNode(trigger);
    if (!validated) return null;
    triggers.push(validated);
  }

  const schema: AbilitySchema = {
    id: json.id,
    name: json.name,
    cooldownMs: json.cooldownMs,
    recoilKick: json.recoilKick,
    triggers,
  };

  if (json.trajectory !== undefined) {
    const trajectory = validateTrajectoryConfig(json.trajectory);
    if (!trajectory) return null;
    schema.trajectory = trajectory;
  }

  if (json.visuals !== undefined) {
    const visuals = validateVisualDescriptor(json.visuals);
    if (!visuals) return null;
    schema.visuals = visuals;
  }

  if (json.metadata !== undefined) {
    if (!isObject(json.metadata)) return null;
    schema.metadata = json.metadata as Record<string, unknown>;
  }

  return schema;
}
