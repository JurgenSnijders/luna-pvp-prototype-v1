import type {
  AbilitySchema,
  ActionPayload,
  ApplyImpulseAction,
  EmitterConfig,
  FieldType,
  SpellArchetype,
  TriggerNode,
} from '../../types/schema';

const PULL_KEYWORDS = /\b(pull|inward|attract|gravity|singularity|drag|vacuum|harpoon|black hole)\b/;
const PERSISTENT_PULL_KEYWORDS = /\b(well|singularity|orbit|vortex)\b/;
const LINGERING_KEYWORDS = /\b(lingering|sticky|puddle|pool|scorch|fire trail|ground|hazard)\b/;
const ARC_KEYWORDS = /\b(arc|sweep|scatter|salvo|fan|spray|barrage|burst)\b/;
const CHANNEL_KEYWORDS = /\b(flamethrower|continuous|channel|stream|beam)\b/;
const HARPOON_KEYWORDS = /\b(pull|draw|harpoon|hook)\b/;

function isPullConcept(text: string): boolean {
  return PULL_KEYWORDS.test(text);
}

function isLingeringConcept(text: string): boolean {
  return LINGERING_KEYWORDS.test(text);
}

function isArcConcept(text: string): boolean {
  return ARC_KEYWORDS.test(text);
}

function isChannelConcept(text: string): boolean {
  return CHANNEL_KEYWORDS.test(text);
}

function repairImpulseSemantics(
  action: ApplyImpulseAction,
  text: string,
): ApplyImpulseAction {
  const patched = { ...action };
  if (!patched.target) patched.target = 'TARGET';

  if (isPullConcept(text)) {
    if (!patched.directionMode || patched.directionMode === 'AWAY_FROM_ORIGIN') {
      patched.directionMode = HARPOON_KEYWORDS.test(text)
        ? 'TOWARDS_CASTER'
        : 'TOWARDS_ORIGIN';
    }
    return patched;
  }

  if (!patched.directionMode) {
    patched.directionMode = 'AWAY_FROM_ORIGIN';
  }
  return patched;
}

function repairActionsSemantics(actions: ActionPayload[], text: string): ActionPayload[] {
  return actions.map((action) => {
    if (action.type === 'APPLY_IMPULSE') {
      return repairImpulseSemantics(action, text);
    }
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      return {
        ...action,
        triggers: repairTriggersSemantics(action.triggers, text),
      };
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      return {
        ...action,
        payload: repairAbilitySemantics(action.payload, text),
      };
    }
    return action;
  });
}

function repairTriggersSemantics(nodes: TriggerNode[], text: string): TriggerNode[] {
  return nodes.map((node) => ({
    ...node,
    actions: repairActionsSemantics(node.actions, text),
    ifFalseActions: node.ifFalseActions
      ? repairActionsSemantics(node.ifFalseActions, text)
      : undefined,
    children: node.children ? repairTriggersSemantics(node.children, text) : undefined,
  }));
}

function collectAllActions(nodes: TriggerNode[]): ActionPayload[] {
  const all: ActionPayload[] = [];
  const collect = (triggerNodes: TriggerNode[]): void => {
    for (const node of triggerNodes) {
      all.push(...node.actions);
      if (node.ifFalseActions) all.push(...node.ifFalseActions);
      if (node.children) collect(node.children);
      for (const action of node.actions) {
        if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
          collect(action.triggers);
        }
        if (action.type === 'CAST_CHILD_PAYLOAD') {
          collect(action.payload.triggers);
        }
      }
    }
  };
  collect(nodes);
  return all;
}

function walkTriggerNodes(
  nodes: TriggerNode[],
  visit: (node: TriggerNode, action: ActionPayload) => void,
): void {
  for (const node of nodes) {
    for (const action of node.actions) {
      visit(node, action);
      if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
        walkTriggerNodes(action.triggers, visit);
      }
      if (action.type === 'CAST_CHILD_PAYLOAD') {
        walkTriggerNodes(action.payload.triggers, visit);
      }
    }
    if (node.ifFalseActions) {
      for (const action of node.ifFalseActions) {
        visit(node, action);
      }
    }
    if (node.children) walkTriggerNodes(node.children, visit);
  }
}

function hasFieldType(schema: AbilitySchema, types: FieldType[]): boolean {
  let found = false;
  walkTriggerNodes(schema.triggers, (_node, action) => {
    if (action.type === 'SPAWN_FIELD' && types.includes(action.field.fieldType)) {
      found = true;
    }
  });
  return found;
}

function hasSpawnFieldOrTerrain(schema: AbilitySchema): boolean {
  let found = false;
  walkTriggerNodes(schema.triggers, (_node, action) => {
    if (action.type === 'SPAWN_FIELD' || action.type === 'MUTATE_TERRAIN') {
      found = true;
    }
  });
  return found;
}

function hasFanEmitter(schema: AbilitySchema): boolean {
  let found = false;
  walkTriggerNodes(schema.triggers, (_node, action) => {
    if (action.type === 'SPAWN_PROJECTILE' && action.emitter) {
      if (action.emitter.count >= 3 && action.emitter.distribution === 'FAN') {
        found = true;
      }
    }
  });
  return found;
}

function findOnCastProjectile(schema: AbilitySchema): {
  node: TriggerNode;
  action: Extract<ActionPayload, { type: 'SPAWN_PROJECTILE' }>;
} | null {
  for (const node of schema.triggers) {
    if (node.trigger !== 'ON_CAST') continue;
    for (const action of node.actions) {
      if (action.type === 'SPAWN_PROJECTILE') {
        return { node, action };
      }
    }
  }
  return null;
}

function ensureFanEmitter(emitter?: EmitterConfig): EmitterConfig {
  const count = emitter?.count ?? 1;
  const spreadDeg = emitter?.spreadDeg ?? 0;
  if (count >= 3 && emitter?.distribution === 'FAN') {
    return emitter;
  }
  return {
    count: Math.max(3, count),
    spreadDeg: Math.max(35, spreadDeg),
    distribution: 'FAN',
    aimOffsetDeg: emitter?.aimOffsetDeg,
  };
}

function applyRuleA_PullGravity(schema: AbilitySchema, text: string): void {
  if (!isPullConcept(text)) return;

  if (
    schema.trajectory &&
    !hasFieldType(schema, ['MASS_ATTRACTOR', 'VORTEX_TANGENT']) &&
    PERSISTENT_PULL_KEYWORDS.test(text)
  ) {
    let onTick = schema.triggers.find((t) => t.trigger === 'ON_TICK');
    if (!onTick) {
      onTick = { trigger: 'ON_TICK', tickIntervalMs: 100, actions: [] };
      schema.triggers.push(onTick);
    }
    const hasAttractor = onTick.actions.some(
      (a) =>
        a.type === 'SPAWN_FIELD' &&
        (a.field.fieldType === 'MASS_ATTRACTOR' || a.field.fieldType === 'VORTEX_TANGENT'),
    );
    if (!hasAttractor) {
      onTick.actions.push({
        type: 'SPAWN_FIELD',
        field: {
          fieldType: 'MASS_ATTRACTOR',
          radius: 80,
          strength: 2500,
          durationMs: 2000,
          attachToSource: true,
        },
      });
    }
  }
}

function applyRuleB_LingeringHazard(schema: AbilitySchema, text: string): void {
  if (!isLingeringConcept(text) || hasSpawnFieldOrTerrain(schema)) return;

  const fieldAction: ActionPayload = {
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'RADIAL_IMPULSE',
      radius: 70,
      strength: 150,
      durationMs: 3000,
    },
  };

  let onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
  if (onHit) {
    onHit.actions.push(fieldAction);
    return;
  }

  let onTick = schema.triggers.find((t) => t.trigger === 'ON_TICK');
  if (!onTick) {
    onTick = { trigger: 'ON_TICK', tickIntervalMs: 200, actions: [] };
    schema.triggers.push(onTick);
  }
  onTick.actions.push(fieldAction);
}

function applyRuleC_ArcSweep(schema: AbilitySchema, text: string): void {
  if (!isArcConcept(text)) return;

  const projectile = findOnCastProjectile(schema);
  if (projectile) {
    projectile.action.emitter = ensureFanEmitter(projectile.action.emitter);
    return;
  }

  if (!schema.trajectory) return;

  const emitter = ensureFanEmitter();
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

function applyRuleD_ChanneledStream(schema: AbilitySchema, text: string): void {
  if (!isChannelConcept(text)) return;

  if (!schema.inputProfile || schema.inputProfile.mode === 'INSTANT') {
    schema.inputProfile = { mode: 'CHANNELED', channelIntervalMs: 100 };
  }

  if (!schema.resourceCost) {
    schema.resourceCost = {
      type: 'HEAT',
      cost: 8,
      maxCapacity: 20,
      rechargeRate: 20,
      lockoutDurationMs: 2500,
    };
    schema.cooldownMs = 0;
  }
}

function actionsProvideDisplacement(actions: ActionPayload[]): boolean {
  for (const action of actions) {
    if (action.type === 'APPLY_IMPULSE') return true;
    if (action.type === 'SPAWN_FIELD') {
      const ft = action.field.fieldType;
      if (ft === 'RADIAL_IMPULSE' || ft === 'MASS_ATTRACTOR') return true;
    }
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      if (triggersProvideDisplacement(action.triggers)) return true;
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      if (abilityProvidesDisplacement(action.payload)) return true;
    }
  }
  return false;
}

function actionsProvideLifecycleDisplacement(actions: ActionPayload[]): boolean {
  for (const action of actions) {
    if (action.type === 'SPAWN_FIELD') {
      const ft = action.field.fieldType;
      if (ft === 'RADIAL_IMPULSE' || ft === 'MASS_ATTRACTOR' || ft === 'VORTEX_TANGENT') {
        return true;
      }
    }
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      if (triggersProvideLifecycleDisplacement(action.triggers)) return true;
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      if (hasLifecycleFieldDisplacement(action.payload)) return true;
    }
  }
  return false;
}

function triggersProvideLifecycleDisplacement(nodes: TriggerNode[]): boolean {
  for (const node of nodes) {
    if (actionsProvideLifecycleDisplacement(node.actions)) return true;
    if (node.ifFalseActions && actionsProvideLifecycleDisplacement(node.ifFalseActions)) return true;
    if (node.children && triggersProvideLifecycleDisplacement(node.children)) return true;
  }
  return false;
}

const LIFECYCLE_DISPLACEMENT_TRIGGERS = new Set([
  'ON_RETURN',
  'ON_EXPIRY',
  'ON_HIT_WALL',
  'ON_DISTANCE_TRAVELED',
]);

function hasLifecycleFieldDisplacement(schema: AbilitySchema): boolean {
  if (!schema.trajectory) return false;
  for (const node of schema.triggers) {
    if (!LIFECYCLE_DISPLACEMENT_TRIGGERS.has(node.trigger)) continue;
    if (actionsProvideLifecycleDisplacement(node.actions)) return true;
    if (node.ifFalseActions && actionsProvideLifecycleDisplacement(node.ifFalseActions)) return true;
    if (node.children && triggersProvideLifecycleDisplacement(node.children)) return true;
  }
  return false;
}

function isStasisOnlyOnHit(schema: AbilitySchema): boolean {
  const onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
  if (!onHit || onHit.actions.length === 0) return false;
  return onHit.actions.every(
    (action) => action.type === 'APPLY_STASIS' || action.type === 'ADD_INSTABILITY',
  );
}

function triggersProvideDisplacement(nodes: TriggerNode[]): boolean {
  for (const node of nodes) {
    if (actionsProvideDisplacement(node.actions)) return true;
    if (node.ifFalseActions && actionsProvideDisplacement(node.ifFalseActions)) return true;
    if (node.children && triggersProvideDisplacement(node.children)) return true;
  }
  return false;
}

function abilityProvidesDisplacement(schema: AbilitySchema): boolean {
  return triggersProvideDisplacement(schema.triggers);
}

function isPureSpatialUtility(schema: AbilitySchema): boolean {
  if (schema.trajectory) return false;

  const allActions = collectAllActions(schema.triggers);
  if (allActions.length === 0) return false;

  return allActions.every(
    (action) => action.type === 'SPAWN_OBSTACLE' || action.type === 'SPAWN_FIELD',
  );
}

const ARCHETYPE_KNOCKBACK_FORCE: Partial<Record<SpellArchetype, number>> = {
  KINETIC: 600,
  FIRE: 450,
  FROST: 350,
  LIGHTNING: 500,
  VOID: 400,
  SONIC: 700,
  EARTH: 650,
  BLOOD: 550,
  CHAOS: 550,
  AERO: 300,
  GRAVITY: 400,
};

function defaultKnockbackImpulse(
  archetype: SpellArchetype | undefined,
  text: string,
): ApplyImpulseAction {
  const pull = isPullConcept(text);
  return {
    type: 'APPLY_IMPULSE',
    baseForce: ARCHETYPE_KNOCKBACK_FORCE[archetype ?? 'KINETIC'] ?? 500,
    target: 'TARGET',
    directionMode: pull
      ? HARPOON_KEYWORDS.test(text)
        ? 'TOWARDS_CASTER'
        : 'TOWARDS_ORIGIN'
      : 'AWAY_FROM_ORIGIN',
  };
}

function ensureDisplacementSemantics(schema: AbilitySchema, text: string): AbilitySchema {
  if (
    abilityProvidesDisplacement(schema) ||
    isPureSpatialUtility(schema) ||
    isStasisOnlyOnHit(schema) ||
    hasLifecycleFieldDisplacement(schema)
  ) {
    return schema;
  }

  if (isPullConcept(text) && hasFieldType(schema, ['MASS_ATTRACTOR', 'VORTEX_TANGENT'])) {
    return schema;
  }

  if (isLingeringConcept(text) && hasSpawnFieldOrTerrain(schema)) {
    return schema;
  }

  if (!schema.trajectory) {
    const onExpiry = schema.triggers.find((t) => t.trigger === 'ON_EXPIRY');
    if (onExpiry && !actionsProvideDisplacement(onExpiry.actions)) {
      onExpiry.actions.push({
        type: 'SPAWN_FIELD',
        field: {
          fieldType: 'RADIAL_IMPULSE',
          radius: 80,
          strength: 600,
          durationMs: 400,
        },
      });
    }
    return schema;
  }

  let onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
  if (!onHit) {
    onHit = { trigger: 'ON_HIT', actions: [] };
    schema.triggers.push(onHit);
  }
  if (!actionsProvideDisplacement(onHit.actions)) {
    onHit.actions.push(defaultKnockbackImpulse(schema.archetype, text));
  }

  return schema;
}

/** Patches concept semantics and injects knockback when offensive spells omit displacement. */
export function repairAbilitySemantics(
  payload: AbilitySchema,
  descriptionText = '',
): AbilitySchema {
  const text = (
    descriptionText ||
    [payload.tagline, payload.description].filter(Boolean).join(' ')
  ).toLowerCase();

  const cloned = structuredClone(payload);
  cloned.triggers = repairTriggersSemantics(cloned.triggers, text);

  if (text) {
    applyRuleA_PullGravity(cloned, text);
    applyRuleB_LingeringHazard(cloned, text);
    applyRuleC_ArcSweep(cloned, text);
    applyRuleD_ChanneledStream(cloned, text);
  }

  return ensureDisplacementSemantics(cloned, text);
}

/** Returns true if the schema contains any APPLY_IMPULSE action (for tests). */
export function schemaHasApplyImpulse(schema: AbilitySchema): boolean {
  return collectAllActions(schema.triggers).some((a) => a.type === 'APPLY_IMPULSE');
}

/** Returns true if any APPLY_IMPULSE uses the given direction mode (for tests). */
export function schemaHasImpulseDirection(
  schema: AbilitySchema,
  mode: ApplyImpulseAction['directionMode'],
): boolean {
  return collectAllActions(schema.triggers).some(
    (a) => a.type === 'APPLY_IMPULSE' && a.directionMode === mode,
  );
}

/** Returns true if schema has a fan emitter with count >= minCount (for tests). */
export function schemaHasFanEmitter(schema: AbilitySchema, minCount = 3): boolean {
  let found = false;
  walkTriggerNodes(schema.triggers, (_node, action) => {
    if (
      action.type === 'SPAWN_PROJECTILE' &&
      action.emitter &&
      action.emitter.count >= minCount &&
      action.emitter.distribution === 'FAN'
    ) {
      found = true;
    }
  });
  return found;
}
