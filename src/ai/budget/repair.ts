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

function isStrictlyDefensiveUtility(schema: AbilitySchema): boolean {
  if (schema.trajectory) return false;

  const allActions: ActionPayload[] = [];
  const collect = (nodes: TriggerNode[]): void => {
    for (const node of nodes) {
      allActions.push(...node.actions);
      if (node.ifFalseActions) allActions.push(...node.ifFalseActions);
      if (node.children) collect(node.children);
    }
  };
  collect(schema.triggers);
  if (allActions.length === 0) return false;

  return allActions.every(
    (action) =>
      action.type === 'APPLY_STASIS' ||
      action.type === 'RELEASE_STASIS' ||
      action.type === 'APPLY_STEALTH' ||
      action.type === 'MORPH_ENTITY' ||
      action.type === 'TELEPORT' ||
      action.type === 'SPAWN_OBSTACLE' ||
      action.type === 'REFLECT_PROJECTILES' ||
      action.type === 'MUTATE_TERRAIN' ||
      (action.type === 'SPAWN_FIELD' && action.field.fieldType === 'FRICTION_OVERRIDE'),
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
  if (abilityProvidesDisplacement(schema) || isStrictlyDefensiveUtility(schema)) {
    return schema;
  }

  const impulse = defaultKnockbackImpulse(schema.archetype);
  const isProjectile = !!schema.trajectory;

  if (isProjectile) {
    let onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
    if (!onHit) {
      onHit = { trigger: 'ON_HIT', actions: [] };
      schema.triggers.push(onHit);
    }
    if (!actionsProvideDisplacement(onHit.actions)) {
      onHit.actions.push(impulse);
      // #region agent log
      fetch('http://127.0.0.1:7853/ingest/87466bd9-6f45-4f18-b6dd-cf4ace948d67',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ae00b1'},body:JSON.stringify({sessionId:'ae00b1',location:'repair.ts:ensureDisplacement',message:'injected ON_HIT knockback',data:{abilityName:schema.name,archetype:schema.archetype,baseForce:impulse.baseForce},timestamp:Date.now(),hypothesisId:'A-fix',runId:'post-fix'})}).catch(()=>{});
      // #endregion
    }
    return schema;
  }

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
    return schema;
  }

  const onCast = schema.triggers.find((t) => t.trigger === 'ON_CAST');
  if (onCast && !actionsProvideDisplacement(onCast.actions)) {
    onCast.actions.push(impulse);
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
