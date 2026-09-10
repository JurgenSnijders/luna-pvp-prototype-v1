import type {
  AbilitySchema,
  ActionPayload,
  ActionTarget,
  ConditionNode,
  InputProfile,
  SpawnActorAction,
  SpawnProjectileAction,
  TrajectoryConfig,
  TriggerNode,
} from '../../types/schema';

export interface TriggerGraphModel {
  trigger: TriggerNode['trigger'];
  tickIntervalMs?: number;
  triggerDistance?: number;
  fireOnHitDeath?: boolean;
  minBounceSpeed?: number;
  bounceIndex?: number;
  minRamSpeed?: number;
  conditions?: ConditionNode[];
  actions: ActionGraphModel[];
  ifFalseActions?: ActionGraphModel[];
  children?: TriggerGraphModel[];
}

export type ActionGraphModel =
  | { kind: 'action'; action: ActionPayload }
  | {
      kind: 'projectile';
      action: Omit<SpawnProjectileAction, 'triggers'>;
      triggers: TriggerGraphModel[];
    }
  | {
      kind: 'actor';
      action: Omit<SpawnActorAction, 'actor'> & {
        actor: Omit<SpawnActorAction['actor'], 'triggers'>;
      };
      triggers: TriggerGraphModel[];
    }
  | {
      kind: 'child';
      payload: AbilityGraphModel;
      inheritVelocity?: boolean;
      inheritInstability?: boolean;
      maxRecursionDepth?: number;
      target?: ActionTarget;
    };

export interface AbilityGraphModel {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  archetype?: AbilitySchema['archetype'];
  cooldownMs: number;
  recoilKick: number;
  trajectory?: TrajectoryConfig;
  visuals?: AbilitySchema['visuals'];
  metadata?: Record<string, unknown>;
  inputProfile?: InputProfile;
  resourceCost?: AbilitySchema['resourceCost'];
  targetingMode?: AbilitySchema['targetingMode'];
  maxTargetRange?: number;
  triggers: TriggerGraphModel[];
}

export type SpellGraphNodeKind =
  | 'root'
  | 'meta'
  | 'trajectory'
  | 'input'
  | 'resource'
  | 'trigger'
  | 'condition'
  | 'action'
  | 'if_false'
  | 'host';

export interface SpellGraphNode {
  kind: SpellGraphNodeKind;
  label: string;
  detail?: string;
  children: SpellGraphNode[];
}

function parseTriggers(nodes: TriggerNode[]): TriggerGraphModel[] {
  return nodes.map(parseTrigger);
}

function parseTrigger(node: TriggerNode): TriggerGraphModel {
  return {
    trigger: node.trigger,
    tickIntervalMs: node.tickIntervalMs,
    triggerDistance: node.triggerDistance,
    fireOnHitDeath: node.fireOnHitDeath,
    minBounceSpeed: node.minBounceSpeed,
    bounceIndex: node.bounceIndex,
    minRamSpeed: node.minRamSpeed,
    conditions: node.conditions ? structuredClone(node.conditions) : undefined,
    actions: node.actions.map(parseAction),
    ifFalseActions: node.ifFalseActions?.map(parseAction),
    children: node.children?.map(parseTrigger),
  };
}

function parseAction(action: ActionPayload): ActionGraphModel {
  if (action.type === 'SPAWN_PROJECTILE') {
    const { triggers, ...rest } = action;
    return {
      kind: 'projectile',
      action: structuredClone(rest),
      triggers: parseTriggers(triggers ?? []),
    };
  }

  if (action.type === 'SPAWN_ACTOR') {
    const { triggers, ...actorRest } = action.actor;
    return {
      kind: 'actor',
      action: {
        ...structuredClone(action),
        actor: structuredClone(actorRest),
      },
      triggers: parseTriggers(triggers ?? []),
    };
  }

  if (action.type === 'CAST_CHILD_PAYLOAD') {
    return {
      kind: 'child',
      payload: parseAbility(action.payload),
      inheritVelocity: action.inheritVelocity,
      inheritInstability: action.inheritInstability,
      maxRecursionDepth: action.maxRecursionDepth,
      target: action.target,
    };
  }

  return { kind: 'action', action: structuredClone(action) };
}

function parseAbility(schema: AbilitySchema): AbilityGraphModel {
  return {
    id: schema.id,
    name: schema.name,
    tagline: schema.tagline,
    description: schema.description,
    archetype: schema.archetype,
    cooldownMs: schema.cooldownMs,
    recoilKick: schema.recoilKick,
    trajectory: schema.trajectory ? structuredClone(schema.trajectory) : undefined,
    visuals: schema.visuals ? structuredClone(schema.visuals) : undefined,
    metadata: schema.metadata ? structuredClone(schema.metadata) : undefined,
    inputProfile: schema.inputProfile ? structuredClone(schema.inputProfile) : undefined,
    resourceCost: schema.resourceCost ? structuredClone(schema.resourceCost) : undefined,
    targetingMode: schema.targetingMode,
    maxTargetRange: schema.maxTargetRange,
    triggers: parseTriggers(schema.triggers ?? []),
  };
}

export function abilityGraphFromSchema(schema: AbilitySchema): AbilityGraphModel {
  return parseAbility(schema);
}

function rebuildTriggers(models: TriggerGraphModel[]): TriggerNode[] {
  return models.map(rebuildTrigger);
}

function rebuildTrigger(model: TriggerGraphModel): TriggerNode {
  const node: TriggerNode = {
    trigger: model.trigger,
    actions: model.actions.map(rebuildAction),
  };

  if (model.tickIntervalMs !== undefined) node.tickIntervalMs = model.tickIntervalMs;
  if (model.triggerDistance !== undefined) node.triggerDistance = model.triggerDistance;
  if (model.fireOnHitDeath !== undefined) node.fireOnHitDeath = model.fireOnHitDeath;
  if (model.minBounceSpeed !== undefined) node.minBounceSpeed = model.minBounceSpeed;
  if (model.bounceIndex !== undefined) node.bounceIndex = model.bounceIndex;
  if (model.minRamSpeed !== undefined) node.minRamSpeed = model.minRamSpeed;
  if (model.conditions) node.conditions = structuredClone(model.conditions);
  if (model.ifFalseActions) {
    node.ifFalseActions = model.ifFalseActions.map(rebuildAction);
  }
  if (model.children) node.children = rebuildTriggers(model.children);

  return node;
}

function rebuildAction(model: ActionGraphModel): ActionPayload {
  if (model.kind === 'action') {
    return structuredClone(model.action);
  }

  if (model.kind === 'projectile') {
    const rebuilt: SpawnProjectileAction = {
      ...structuredClone(model.action),
      type: 'SPAWN_PROJECTILE',
    };
    if (model.triggers.length > 0) {
      rebuilt.triggers = rebuildTriggers(model.triggers);
    }
    return rebuilt;
  }

  if (model.kind === 'actor') {
    const rebuilt: SpawnActorAction = {
      ...structuredClone(model.action),
      type: 'SPAWN_ACTOR',
      actor: {
        ...structuredClone(model.action.actor),
      },
    };
    if (model.triggers.length > 0) {
      rebuilt.actor.triggers = rebuildTriggers(model.triggers);
    }
    return rebuilt;
  }

  const child: ActionPayload = {
    type: 'CAST_CHILD_PAYLOAD',
    payload: schemaFromAbilityGraph(model.payload),
  };
  if (model.inheritVelocity !== undefined) child.inheritVelocity = model.inheritVelocity;
  if (model.inheritInstability !== undefined) child.inheritInstability = model.inheritInstability;
  if (model.maxRecursionDepth !== undefined) child.maxRecursionDepth = model.maxRecursionDepth;
  if (model.target !== undefined) child.target = model.target;
  return child;
}

export function schemaFromAbilityGraph(model: AbilityGraphModel): AbilitySchema {
  const schema: AbilitySchema = {
    id: model.id,
    name: model.name,
    cooldownMs: model.cooldownMs,
    recoilKick: model.recoilKick,
    triggers: rebuildTriggers(model.triggers),
  };

  if (model.tagline !== undefined) schema.tagline = model.tagline;
  if (model.description !== undefined) schema.description = model.description;
  if (model.archetype !== undefined) schema.archetype = model.archetype;
  if (model.trajectory !== undefined) schema.trajectory = structuredClone(model.trajectory);
  if (model.visuals !== undefined) schema.visuals = structuredClone(model.visuals);
  if (model.metadata !== undefined) schema.metadata = structuredClone(model.metadata);
  if (model.inputProfile !== undefined) schema.inputProfile = structuredClone(model.inputProfile);
  if (model.resourceCost !== undefined) schema.resourceCost = structuredClone(model.resourceCost);
  if (model.targetingMode !== undefined) schema.targetingMode = model.targetingMode;
  if (model.maxTargetRange !== undefined) schema.maxTargetRange = model.maxTargetRange;

  return schema;
}

function formatTrajectory(trajectory: TrajectoryConfig): string {
  const parts: string[] = [trajectory.type];
  if (trajectory.speed !== undefined) parts.push(`speed=${trajectory.speed}`);
  if (trajectory.maxRange !== undefined) parts.push(`range=${trajectory.maxRange}`);
  if (trajectory.bounces !== undefined) parts.push(`bounces=${trajectory.bounces}`);
  if (trajectory.lobApex !== undefined) parts.push(`apex=${trajectory.lobApex}`);
  return parts.join(' · ');
}

function formatInputProfile(profile: InputProfile): string {
  const parts: string[] = [profile.mode];
  if (profile.windupMs !== undefined) parts.push(`windup=${profile.windupMs}ms`);
  if (profile.activeMs !== undefined) parts.push(`active=${profile.activeMs}ms`);
  if (profile.recoveryMs !== undefined) parts.push(`recovery=${profile.recoveryMs}ms`);
  if (profile.channelIntervalMs !== undefined) parts.push(`interval=${profile.channelIntervalMs}ms`);
  if (profile.minChargeMs !== undefined) parts.push(`minCharge=${profile.minChargeMs}ms`);
  if (profile.maxChargeMs !== undefined) parts.push(`maxCharge=${profile.maxChargeMs}ms`);
  if (profile.comboWindowMs !== undefined) parts.push(`combo=${profile.comboWindowMs}ms`);
  if (profile.cancelable) parts.push('cancelable');
  return parts.join(' · ');
}

function formatCondition(condition: ConditionNode): string {
  const value =
    typeof condition.value === 'boolean'
      ? condition.value ? 'true' : 'false'
      : String(condition.value);
  return `${condition.query} ${condition.comparison} ${value}`;
}

function formatTriggerMeta(node: TriggerGraphModel): string | undefined {
  const parts: string[] = [];
  if (node.minBounceSpeed !== undefined) parts.push(`minBounceSpeed=${node.minBounceSpeed}`);
  if (node.bounceIndex !== undefined) parts.push(`bounceIndex=${node.bounceIndex}`);
  if (node.minRamSpeed !== undefined) parts.push(`minRamSpeed=${node.minRamSpeed}`);
  if (node.tickIntervalMs !== undefined) parts.push(`tick=${node.tickIntervalMs}ms`);
  if (node.triggerDistance !== undefined) parts.push(`dist=${node.triggerDistance}`);
  if (node.fireOnHitDeath === false) parts.push('skipOnHitDeath');
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatAction(model: ActionGraphModel): { label: string; detail?: string } {
  if (model.kind === 'projectile') {
    const traj = model.action.projectileTrajectory;
    const emitter = model.action.emitter;
    const count = emitter?.count ?? 1;
    const detail = [
      traj ? formatTrajectory(traj) : undefined,
      emitter ? `emitter ${emitter.distribution} x${count}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
    return { label: 'SPAWN_PROJECTILE', detail: detail || undefined };
  }

  if (model.kind === 'actor') {
    const actor = model.action.actor;
    return {
      label: 'SPAWN_ACTOR',
      detail: `${actor.actorArchetype} hp=${actor.health} dur=${actor.durationMs}ms`,
    };
  }

  if (model.kind === 'child') {
    const parts = [model.payload.name];
    if (model.inheritVelocity) parts.push('inheritVel');
    if (model.inheritInstability) parts.push('inheritInstab');
    return { label: 'CAST_CHILD_PAYLOAD', detail: parts.join(' · ') };
  }

  const action = model.action;
  switch (action.type) {
    case 'SPAWN_FIELD':
      return {
        label: 'SPAWN_FIELD',
        detail: `${action.field.fieldType} r=${action.field.radius} str=${action.field.strength}`,
      };
    case 'APPLY_IMPULSE':
      return {
        label: 'APPLY_IMPULSE',
        detail: `${action.baseForce} → ${action.target ?? 'TARGET'} ${action.directionMode ?? ''}`.trim(),
      };
    default:
      return { label: action.type };
  }
}

function buildTriggerDisplay(node: TriggerGraphModel): SpellGraphNode {
  const children: SpellGraphNode[] = [];

  if (node.conditions) {
    for (const condition of node.conditions) {
      children.push({
        kind: 'condition',
        label: formatCondition(condition),
        children: [],
      });
    }
  }

  for (const action of node.actions) {
    children.push(buildActionDisplay(action));
  }

  if (node.ifFalseActions) {
    children.push({
      kind: 'if_false',
      label: 'ELSE',
      children: node.ifFalseActions.map(buildActionDisplay),
    });
  }

  if (node.children) {
    for (const child of node.children) {
      children.push(buildTriggerDisplay(child));
    }
  }

  return {
    kind: 'trigger',
    label: node.trigger,
    detail: formatTriggerMeta(node),
    children,
  };
}

function buildActionDisplay(model: ActionGraphModel): SpellGraphNode {
  const { label, detail } = formatAction(model);
  const children: SpellGraphNode[] = [];

  if (model.kind === 'projectile' || model.kind === 'actor') {
    const hostLabel = model.kind === 'projectile' ? 'PROJECTILE' : 'ACTOR';
    if (model.triggers.length > 0) {
      children.push({
        kind: 'host',
        label: hostLabel,
        children: model.triggers.map(buildTriggerDisplay),
      });
    }
  } else if (model.kind === 'child') {
    children.push(buildAbilityDisplay(model.payload));
  }

  return {
    kind: 'action',
    label,
    detail,
    children,
  };
}

function buildAbilityDisplay(model: AbilityGraphModel, isRoot = false): SpellGraphNode {
  const children: SpellGraphNode[] = [];

  if (model.trajectory) {
    children.push({
      kind: 'trajectory',
      label: formatTrajectory(model.trajectory),
      children: [],
    });
  }

  if (model.inputProfile) {
    children.push({
      kind: 'input',
      label: formatInputProfile(model.inputProfile),
      children: [],
    });
  }

  if (model.resourceCost) {
    children.push({
      kind: 'resource',
      label: `${model.resourceCost.type} cost=${model.resourceCost.cost}`,
      children: [],
    });
  }

  for (const trigger of model.triggers) {
    children.push(buildTriggerDisplay(trigger));
  }

  const metaParts = [
    `cd=${model.cooldownMs}ms`,
    `recoil=${model.recoilKick}`,
    model.archetype ?? undefined,
    model.targetingMode ?? undefined,
  ].filter(Boolean);

  return {
    kind: isRoot ? 'root' : 'meta',
    label: model.name,
    detail: metaParts.join(' · '),
    children,
  };
}

export function buildSpellGraphDisplay(schema: AbilitySchema): SpellGraphNode {
  return buildAbilityDisplay(abilityGraphFromSchema(schema), true);
}
