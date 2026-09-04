import {
  ACTION_TARGETS,
  ACTION_TYPES,
  COMPARISON_OPERATORS,
  CONDITION_QUERIES,
  CONSTRAINT_TYPES,
  EMITTER_DISTRIBUTIONS,
  FIELD_TYPES,
  IMPACT_VFX_TYPES,
  IMPULSE_DIRECTION_MODES,
  INPUT_PROFILE_MODES,
  OBSTACLE_SHAPES,
  PROJECTILE_STYLES,
  RESOURCE_TYPES,
  SPELL_ARCHETYPES,
  TERRAIN_TYPES,
  TRAIL_TYPES,
  TRAJECTORY_TYPES,
  TRIGGER_TYPES,
  TARGETING_MODES,
  VFX_BLEND_MODES,
} from '../../types/schema/constants';

function stringEnum(values: ReadonlySet<string> | readonly string[]): { type: 'string'; enum: string[] } {
  const list = values instanceof Set ? [...values] : [...values];
  return { type: 'string', enum: list };
}

const actionTarget = stringEnum(ACTION_TARGETS);

const trajectoryConfig = {
  type: 'object',
  required: ['type'],
  properties: {
    type: stringEnum(TRAJECTORY_TYPES),
    speed: { type: 'number' },
    turnAccel: { type: 'number' },
    maxRange: { type: 'number' },
    piercing: { type: 'number' },
    orbitRadius: { type: 'number' },
    orbitSpeed: { type: 'number' },
    blinkDistance: { type: 'number' },
    gravityScale: { type: 'number' },
    lobApex: { type: 'number' },
    bounces: { type: 'number' },
    bounceRestitution: { type: 'number' },
    groundFriction: { type: 'number' },
    clearanceHeight: { type: 'number' },
    detonateAtZ: { type: 'number' },
    spawnAltitude: { type: 'number' },
    fallSpeed: { type: 'number' },
  },
  additionalProperties: false,
};

const fieldConfig = {
  type: 'object',
  required: ['fieldType', 'radius', 'strength', 'durationMs'],
  properties: {
    fieldType: stringEnum(FIELD_TYPES),
    radius: { type: 'number' },
    strength: { type: 'number' },
    durationMs: { type: 'number' },
    frictionValue: { type: 'number' },
    attachToSource: { type: 'boolean' },
    offset: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      additionalProperties: false,
    },
    detachOnParentDeath: { type: 'boolean' },
    zBase: { type: 'number' },
    zHeight: { type: 'number' },
    verticalForce: { type: 'number' },
  },
  additionalProperties: false,
};

const visualDescriptor = {
  type: 'object',
  required: ['color', 'size', 'projectileStyle', 'trailType', 'impactVfx'],
  properties: {
    color: { type: 'string' },
    size: { type: 'number' },
    projectileStyle: stringEnum(PROJECTILE_STYLES),
    trailType: stringEnum(TRAIL_TYPES),
    impactVfx: stringEnum(IMPACT_VFX_TYPES),
    vfx: {
      type: 'object',
      properties: {
        glowIntensity: { type: 'number' },
        trailDensity: { type: 'number' },
        trailLengthMs: { type: 'number' },
        impactScale: { type: 'number' },
        secondaryColor: { type: 'string' },
        blendMode: stringEnum(VFX_BLEND_MODES),
        shakeIntensity: { type: 'number' },
        distortion: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const conditionNode = {
  type: 'object',
  required: ['query', 'value'],
  properties: {
    query: stringEnum(CONDITION_QUERIES),
    target: actionTarget,
    stat: { type: 'string', enum: ['health', 'instabilityPct'] },
    comparison: stringEnum(COMPARISON_OPERATORS),
    value: { anyOf: [{ type: 'number' }, { type: 'string' }] },
    radius: { type: 'number' },
  },
  additionalProperties: false,
};

const actorConfig = {
  type: 'object',
  required: ['actorArchetype', 'health', 'durationMs'],
  properties: {
    actorArchetype: {
      ...stringEnum(['TURRET', 'DECOY']),
      description:
        'Deployable entity kind: TURRET (shoots periodically) or DECOY (distraction). NOT the spell elemental archetype.',
    },
    health: { type: 'number' },
    durationMs: { type: 'number' },
    anchored: { type: 'boolean' },
    radius: { type: 'number' },
    mass: { type: 'number' },
    targetingRange: { type: 'number' },
    visuals: visualDescriptor,
    triggers: { type: 'array', items: { $ref: '#/$defs/TriggerNode' } },
  },
  additionalProperties: false,
};

const actionBranches = [
  {
    type: 'object',
    required: ['type', 'amount'],
    properties: {
      type: { type: 'string', enum: ['ADD_INSTABILITY'] },
      amount: { type: 'number' },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'baseForce'],
    properties: {
      type: { type: 'string', enum: ['APPLY_IMPULSE'] },
      baseForce: { type: 'number' },
      direction: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        additionalProperties: false,
      },
      target: actionTarget,
      directionMode: stringEnum(IMPULSE_DIRECTION_MODES),
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'field'],
    properties: {
      type: { type: 'string', enum: ['SPAWN_FIELD'] },
      field: fieldConfig,
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'projectileTrajectory'],
    properties: {
      type: { type: 'string', enum: ['SPAWN_PROJECTILE'] },
      projectileTrajectory: trajectoryConfig,
      emitter: {
        type: 'object',
        required: ['count', 'spreadDeg', 'distribution'],
        properties: {
          count: { type: 'number' },
          spreadDeg: { type: 'number' },
          aimOffsetDeg: { type: 'number' },
          distribution: stringEnum(EMITTER_DISTRIBUTIONS),
          inheritVelocityRatio: { type: 'number' },
        },
        additionalProperties: false,
      },
      triggers: { type: 'array', items: { $ref: '#/$defs/TriggerNode' } },
      visuals: visualDescriptor,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'constraint'],
    properties: {
      type: { type: 'string', enum: ['SPAWN_CONSTRAINT'] },
      constraint: {
        type: 'object',
        required: ['type', 'durationMs'],
        properties: {
          type: stringEnum(CONSTRAINT_TYPES),
          stiffness: { type: 'number' },
          restLength: { type: 'number' },
          maxBreakDistance: { type: 'number' },
          durationMs: { type: 'number' },
        },
        additionalProperties: false,
      },
      source: actionTarget,
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'payload'],
    properties: {
      type: { type: 'string', enum: ['CAST_CHILD_PAYLOAD'] },
      payload: { $ref: '#/$defs/AbilitySchemaBody' },
      inheritVelocity: { type: 'boolean' },
      inheritInstability: { type: 'boolean' },
      maxRecursionDepth: { type: 'number' },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'stat', 'value', 'mode'],
    properties: {
      type: { type: 'string', enum: ['MODIFY_STAT'] },
      stat: {
        type: 'string',
        enum: ['mass', 'linearDrag', 'moveSpeed', 'instabilityPct', 'health'],
      },
      value: { type: 'number' },
      mode: { type: 'string', enum: ['add', 'set', 'multiply'] },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'distance'],
    properties: {
      type: { type: 'string', enum: ['TELEPORT'] },
      distance: { type: 'number' },
      direction: {
        type: 'object',
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        additionalProperties: false,
      },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'durationMs'],
    properties: {
      type: { type: 'string', enum: ['APPLY_STASIS'] },
      durationMs: { type: 'number' },
      forceAccumulatorScale: { type: 'number' },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'archetype', 'durationMs'],
    properties: {
      type: { type: 'string', enum: ['APPLY_STATUS'] },
      archetype: stringEnum(SPELL_ARCHETYPES),
      durationMs: { type: 'number' },
      stacks: { type: 'number' },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['RELEASE_STASIS'] },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['REFLECT_PROJECTILES'] },
      target: actionTarget,
      radius: { type: 'number' },
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'obstacle'],
    properties: {
      type: { type: 'string', enum: ['SPAWN_OBSTACLE'] },
      obstacle: {
        type: 'object',
        required: ['shape', 'width', 'height', 'durationMs'],
        properties: {
          shape: stringEnum(OBSTACLE_SHAPES),
          width: { type: 'number' },
          height: { type: 'number' },
          angle: { type: 'number' },
          isDestructible: { type: 'boolean' },
          maxHealth: { type: 'number' },
          durationMs: { type: 'number' },
          clearanceHeight: { type: 'number' },
        },
        additionalProperties: false,
      },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'mutation'],
    properties: {
      type: { type: 'string', enum: ['MUTATE_TERRAIN'] },
      mutation: {
        type: 'object',
        required: ['type', 'radius', 'durationMs'],
        properties: {
          type: stringEnum(TERRAIN_TYPES),
          radius: { type: 'number' },
          durationMs: { type: 'number' },
        },
        additionalProperties: false,
      },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'morph'],
    properties: {
      type: { type: 'string', enum: ['MORPH_ENTITY'] },
      morph: {
        type: 'object',
        required: ['durationMs'],
        properties: {
          radius: { type: 'number' },
          mass: { type: 'number' },
          speedMultiplier: { type: 'number' },
          durationMs: { type: 'number' },
        },
        additionalProperties: false,
      },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'actor'],
    properties: {
      type: { type: 'string', enum: ['SPAWN_ACTOR'] },
      actor: actorConfig,
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'durationMs'],
    properties: {
      type: { type: 'string', enum: ['APPLY_STEALTH'] },
      durationMs: { type: 'number' },
      revealOnCast: { type: 'boolean' },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['LAUNCH_VERTICAL'] },
      verticalImpulse: { type: 'number' },
      targetApex: { type: 'number' },
      target: actionTarget,
    },
    additionalProperties: false,
  },
  {
    type: 'object',
    required: ['type', 'scale'],
    properties: {
      type: { type: 'string', enum: ['SET_GRAVITY_SCALE'] },
      scale: { type: 'number' },
      durationMs: { type: 'number' },
      target: actionTarget,
    },
    additionalProperties: false,
  },
];

// Validate action type coverage at build time.
const coveredActionTypes = new Set(
  actionBranches.flatMap((b) => {
    const typeProp = (b as { properties?: { type?: { enum?: string[] } } }).properties?.type;
    return typeProp?.enum ?? [];
  }),
);
for (const actionType of ACTION_TYPES) {
  if (!coveredActionTypes.has(actionType)) {
    throw new Error(`abilityResponseSchema missing action branch: ${actionType}`);
  }
}

const triggerNode = {
  type: 'object',
  required: ['trigger', 'actions'],
  properties: {
    trigger: stringEnum(TRIGGER_TYPES),
    tickIntervalMs: { type: 'number' },
    triggerDistance: { type: 'number' },
    fireOnHitDeath: { type: 'boolean' },
    minBounceSpeed: { type: 'number' },
    bounceIndex: { type: 'number' },
    conditions: { type: 'array', items: conditionNode },
    actions: { type: 'array', items: { $ref: '#/$defs/ActionPayload' } },
    ifFalseActions: { type: 'array', items: { $ref: '#/$defs/ActionPayload' } },
    children: { type: 'array', items: { $ref: '#/$defs/TriggerNode' } },
  },
  additionalProperties: false,
};

const abilitySchemaBody = {
  type: 'object',
  required: ['id', 'name', 'cooldownMs', 'recoilKick', 'triggers', 'visuals'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    tagline: { type: 'string' },
    description: { type: 'string' },
    archetype: {
      ...stringEnum(SPELL_ARCHETYPES),
      description:
        'Spell elemental archetype (KINETIC, FROST, VOID, etc.). NOT actorArchetype on deployables.',
    },
    cooldownMs: { type: 'number' },
    recoilKick: { type: 'number' },
    trajectory: trajectoryConfig,
    targetingMode: stringEnum(TARGETING_MODES),
    maxTargetRange: { type: 'number' },
    triggers: { type: 'array', items: { $ref: '#/$defs/TriggerNode' } },
    visuals: visualDescriptor,
    inputProfile: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: stringEnum(INPUT_PROFILE_MODES),
        maxChargeMs: { type: 'number' },
        minChargeMs: { type: 'number' },
        channelIntervalMs: { type: 'number' },
        comboWindowMs: { type: 'number' },
      },
      additionalProperties: false,
    },
    resourceCost: {
      type: 'object',
      required: ['type', 'cost'],
      properties: {
        type: stringEnum(RESOURCE_TYPES),
        cost: { type: 'number' },
        maxCapacity: { type: 'number' },
        rechargeRate: { type: 'number' },
        lockoutDurationMs: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

/**
 * Gemini structured-output schema for a single AbilitySchema JSON object.
 * Uses $defs + $ref for recursive triggers and nested deployable actors.
 */
export const ABILITY_RESPONSE_SCHEMA: Record<string, unknown> = {
  ...abilitySchemaBody,
  $defs: {
    AbilitySchemaBody: abilitySchemaBody,
    TriggerNode: triggerNode,
    ActionPayload: { anyOf: actionBranches },
    ActorConfig: actorConfig,
    VisualDescriptor: visualDescriptor,
    TrajectoryConfig: trajectoryConfig,
    FieldConfig: fieldConfig,
  },
};
