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
  | 'ON_HAZARD_CONTACT';

export type ActionType =
  | 'ADD_INSTABILITY'
  | 'APPLY_IMPULSE'
  | 'SPAWN_FIELD'
  | 'SPAWN_PROJECTILE'
  | 'MODIFY_STAT'
  | 'TELEPORT';

export type EmitterDistribution = 'FAN' | 'RADIAL' | 'RANDOM_CONE' | 'PARALLEL';

export type TrailType = 'NONE' | 'SMOKE' | 'ICE_GLOW' | 'MAGMA_SPARKS';

export type ImpactVfx = 'SPARKS' | 'SHOCKWAVE' | 'VORTEX_SWIRL';

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
  trailType: TrailType;
  impactVfx: ImpactVfx;
}

export interface AddInstabilityAction {
  type: 'ADD_INSTABILITY';
  amount: number;
}

export interface ApplyImpulseAction {
  type: 'APPLY_IMPULSE';
  baseForce: number;
  direction?: { x: number; y: number };
}

export interface SpawnFieldAction {
  type: 'SPAWN_FIELD';
  field: FieldConfig;
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
}

export interface TeleportAction {
  type: 'TELEPORT';
  distance: number;
  direction?: { x: number; y: number };
}

export type ActionPayload =
  | AddInstabilityAction
  | ApplyImpulseAction
  | SpawnFieldAction
  | SpawnProjectileAction
  | ModifyStatAction
  | TeleportAction;

export interface TriggerNode {
  trigger: TriggerType;
  actions: ActionPayload[];
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
]);

const ACTION_TYPES: ReadonlySet<string> = new Set([
  'ADD_INSTABILITY',
  'APPLY_IMPULSE',
  'SPAWN_FIELD',
  'SPAWN_PROJECTILE',
  'MODIFY_STAT',
  'TELEPORT',
]);

const EMITTER_DISTRIBUTIONS: ReadonlySet<string> = new Set([
  'FAN',
  'RADIAL',
  'RANDOM_CONE',
  'PARALLEL',
]);

const TRAIL_TYPES: ReadonlySet<string> = new Set([
  'NONE',
  'SMOKE',
  'ICE_GLOW',
  'MAGMA_SPARKS',
]);

const IMPACT_VFX_TYPES: ReadonlySet<string> = new Set([
  'SPARKS',
  'SHOCKWAVE',
  'VORTEX_SWIRL',
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

function validateVisualDescriptor(value: unknown): VisualDescriptor | null {
  if (!isObject(value)) return null;
  if (!isString(value.color) || !isNumber(value.size)) return null;
  if (!isString(value.trailType) || !TRAIL_TYPES.has(value.trailType)) return null;
  if (!isString(value.impactVfx) || !IMPACT_VFX_TYPES.has(value.impactVfx)) return null;

  return {
    color: value.color,
    size: value.size,
    trailType: value.trailType as TrailType,
    impactVfx: value.impactVfx as ImpactVfx,
  };
}

function validateActionPayload(value: unknown): ActionPayload | null {
  if (!isObject(value) || !isString(value.type)) return null;
  if (!ACTION_TYPES.has(value.type)) return null;

  switch (value.type) {
    case 'ADD_INSTABILITY':
      if (!isNumber(value.amount)) return null;
      return { type: 'ADD_INSTABILITY', amount: value.amount };

    case 'APPLY_IMPULSE':
      if (!isNumber(value.baseForce)) return null;
      if (value.direction !== undefined) {
        if (!isObject(value.direction)) return null;
        if (!isNumber(value.direction.x) || !isNumber(value.direction.y)) return null;
        return {
          type: 'APPLY_IMPULSE',
          baseForce: value.baseForce,
          direction: { x: value.direction.x, y: value.direction.y },
        };
      }
      return { type: 'APPLY_IMPULSE', baseForce: value.baseForce };

    case 'SPAWN_FIELD': {
      const field = validateFieldConfig(value.field);
      if (!field) return null;
      return { type: 'SPAWN_FIELD', field };
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

    case 'MODIFY_STAT':
      if (
        !isString(value.stat) ||
        !['mass', 'linearDrag', 'moveSpeed', 'instabilityPct'].includes(value.stat) ||
        !isNumber(value.value) ||
        !isString(value.mode) ||
        !['add', 'set', 'multiply'].includes(value.mode)
      ) {
        return null;
      }
      return {
        type: 'MODIFY_STAT',
        stat: value.stat as ModifyStatAction['stat'],
        value: value.value,
        mode: value.mode as ModifyStatAction['mode'],
      };

    case 'TELEPORT':
      if (!isNumber(value.distance)) return null;
      if (value.direction !== undefined) {
        if (!isObject(value.direction)) return null;
        if (!isNumber(value.direction.x) || !isNumber(value.direction.y)) return null;
        return {
          type: 'TELEPORT',
          distance: value.distance,
          direction: { x: value.direction.x, y: value.direction.y },
        };
      }
      return { type: 'TELEPORT', distance: value.distance };

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
