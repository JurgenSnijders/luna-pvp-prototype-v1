import type {
  AbilitySchema,
  ActionPayload,
  ApplyImpulseAction,
  SpellArchetype,
  TriggerNode,
} from '../../types/schema';

function repairImpulseSemantics(
  action: ApplyImpulseAction,
  desc: string,
): ApplyImpulseAction {
  const patched = { ...action };
  if (!patched.target) patched.target = 'TARGET';

  if (patched.directionMode) return patched;

  if (/\b(pull|draw|harpoon|hook)\b/.test(desc)) {
    patched.directionMode = 'TOWARDS_CASTER';
  } else {
    patched.directionMode = 'AWAY_FROM_ORIGIN';
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

function collectAllActions(nodes: TriggerNode[]): ActionPayload[] {
  const all: ActionPayload[] = [];
  const collect = (triggerNodes: TriggerNode[]): void => {
    for (const node of triggerNodes) {
      all.push(...node.actions);
      if (node.ifFalseActions) all.push(...node.ifFalseActions);
      if (node.children) collect(node.children);
    }
  };
  collect(nodes);
  return all;
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

/** No trajectory and only obstacle/field spawns — barriers, vortices, quakes. */
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

function defaultKnockbackImpulse(archetype?: SpellArchetype): ApplyImpulseAction {
  return {
    type: 'APPLY_IMPULSE',
    baseForce: ARCHETYPE_KNOCKBACK_FORCE[archetype ?? 'KINETIC'] ?? 500,
    target: 'TARGET',
    directionMode: 'AWAY_FROM_ORIGIN',
  };
}

function ensureDisplacementSemantics(schema: AbilitySchema): AbilitySchema {
  if (abilityProvidesDisplacement(schema) || isPureSpatialUtility(schema)) {
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
    onHit.actions.push(defaultKnockbackImpulse(schema.archetype));
  }

  return schema;
}

/** Patches missing impulse direction modes and injects knockback when offensive spells omit displacement. */
export function repairAbilitySemantics(
  payload: AbilitySchema,
  description = '',
): AbilitySchema {
  const desc = description.toLowerCase();
  const cloned = structuredClone(payload);
  cloned.triggers = repairTriggersSemantics(cloned.triggers, desc);
  return ensureDisplacementSemantics(cloned);
}

/** Returns true if the schema contains any APPLY_IMPULSE action (for tests). */
export function schemaHasApplyImpulse(schema: AbilitySchema): boolean {
  return collectAllActions(schema.triggers).some((a) => a.type === 'APPLY_IMPULSE');
}
