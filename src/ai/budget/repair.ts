import type {
  AbilitySchema,
  ActionPayload,
  ApplyImpulseAction,
  EmitterConfig,
  FieldType,
  SpellArchetype,
  SpawnActorAction,
  TriggerNode,
} from '../../types/schema';
import { walkActionList, walkActions } from '../../types/schema';

const PULL_KEYWORDS =
  /\b(pull|inward|attract|gravity|singularity|drag|vacuum|harpoon|black hole|suck|reel|implosion)\b/;
const PUSH_KEYWORDS =
  /\b(push|knock|blast|fling|repel|shockwave|concussive|slabs|repulsor|launch)\b/;
const ORBIT_KEYWORDS =
  /\b(orbiting|orbits|orbit|circling|circle|ring|halo|surround|revolving|rotating|satellite|whirling)\b/;
const OBSTACLE_KEYWORDS =
  /\b(wall|barrier|obstacle|bunker|pillar|pylon|barricade|cover|fortified|obelisk)\b/;
const PERSISTENT_PULL_KEYWORDS = /\b(well|vortex|black hole)\b/;
const LINGERING_KEYWORDS =
  /\b(lingering|sticky|puddle|pool|scorch|fire trail|hazard|toxic|sludge|burn|mire|acid)\b/;
const ARC_KEYWORDS = /\b(arc|sweep|scatter|salvo|fan|spray|barrage|burst)\b/;
const CHANNEL_KEYWORDS = /\b(flamethrower|continuous|channel|stream|beam)\b/;
const HARPOON_KEYWORDS = /\b(pull|draw|harpoon|hook|reel)\b/;

const DEFAULT_SINGLE_EMITTER: EmitterConfig = {
  count: 1,
  spreadDeg: 0,
  distribution: 'FAN',
};

const PULL_FORCE_FLOOR = 450;
const PUSH_FORCE_FLOOR = 500;
const INJECTED_IMPULSE_FORCE = 15000;
const ATTRACTOR_FIELD_RADIUS = 250;
const ATTRACTOR_FIELD_STRENGTH = 4000;
const CONTINUOUS_FIELD_STRENGTH_FLOOR = 3500;
const CONTINUOUS_FIELD_STRENGTH_CLAMP = 4500;

function isPullConcept(text: string): boolean {
  return PULL_KEYWORDS.test(text) && !isPushConcept(text);
}

function isPushConcept(text: string): boolean {
  return PUSH_KEYWORDS.test(text);
}

function isOrbitConcept(text: string): boolean {
  return ORBIT_KEYWORDS.test(text);
}

function isObstacleConcept(text: string): boolean {
  return OBSTACLE_KEYWORDS.test(text);
}

function isLingeringConcept(text: string): boolean {
  return LINGERING_KEYWORDS.test(text);
}

function isArcConcept(text: string): boolean {
  if (isPullConcept(text) && !/\b(arc|sweep|scatter|salvo|fan|spray|barrage)\b/.test(text)) {
    return false;
  }
  return ARC_KEYWORDS.test(text);
}

function isChannelConcept(text: string): boolean {
  return CHANNEL_KEYWORDS.test(text);
}

function isDeployableConcept(text: string, schema?: AbilitySchema): boolean {
  if (/\b(deploy|deployable|turret)\b/.test(text)) return true;

  if (/\b(sentry|pylon|totem)\b/.test(text)) {
    if (schema && hasOrbitAnchorProjectileOnCast(schema)) return false;
    return /\b(deploy|place|placed|stationary)\b/.test(text);
  }

  if (/\b(trap|mine)\b/.test(text)) {
    if (/\b(deploy|deployable|place|placed|stationary)\b/.test(text)) return true;
    if (/\b(black hole|singularity)\b/.test(text) && /\bdeploy/.test(text)) return true;
  }

  return false;
}

function hasOrbitAnchorProjectileOnCast(schema: AbilitySchema): boolean {
  for (const node of schema.triggers) {
    if (node.trigger !== 'ON_CAST') continue;
    for (const action of node.actions) {
      if (
        action.type === 'SPAWN_PROJECTILE' &&
        action.projectileTrajectory.type === 'ORBIT_ANCHOR'
      ) {
        return true;
      }
    }
  }
  return false;
}

function findThrownSpawnActor(schema: AbilitySchema): SpawnActorAction | null {
  let found: SpawnActorAction | null = null;
  walkActions(schema, (v) => {
    if (found) return;
    if (
      v.host === 'ROOT' &&
      v.node &&
      (v.node.trigger === 'ON_HIT' || v.node.trigger === 'ON_EXPIRY') &&
      v.action.type === 'SPAWN_ACTOR'
    ) {
      found = v.action;
    }
  });
  return found;
}

function isThrownDeployable(schema: AbilitySchema): boolean {
  if (!schema.trajectory) return false;
  return findThrownSpawnActor(schema) !== null;
}

function findOnCastSpawnActor(schema: AbilitySchema): SpawnActorAction | null {
  for (const node of schema.triggers) {
    if (node.trigger !== 'ON_CAST') continue;
    for (const action of node.actions) {
      if (action.type === 'SPAWN_ACTOR') return action;
    }
  }
  return null;
}

function hasSpawnActorOnCast(schema: AbilitySchema): boolean {
  return findOnCastSpawnActor(schema) !== null;
}

function hasInstabilityAction(schema: AbilitySchema): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (v.action.type === 'ADD_INSTABILITY') found = true;
  });
  return found;
}

function repairImpulseSemantics(
  action: ApplyImpulseAction,
  text: string,
): ApplyImpulseAction {
  const patched = { ...action };
  if (!patched.target) patched.target = 'TARGET';

  if (isPushConcept(text) && !isPullConcept(text)) {
    patched.directionMode = 'AWAY_FROM_ORIGIN';
    patched.baseForce = Math.max(patched.baseForce ?? 0, PUSH_FORCE_FLOOR);
    return patched;
  }

  if (isPullConcept(text)) {
    if (!patched.directionMode || patched.directionMode === 'AWAY_FROM_ORIGIN') {
      patched.directionMode = HARPOON_KEYWORDS.test(text)
        ? 'TOWARDS_CASTER'
        : 'TOWARDS_ORIGIN';
    }
    patched.baseForce = Math.max(patched.baseForce ?? 0, PULL_FORCE_FLOOR);
    return patched;
  }

  if (!patched.directionMode) {
    patched.directionMode = 'AWAY_FROM_ORIGIN';
  }
  if (patched.directionMode === 'AWAY_FROM_ORIGIN') {
    patched.baseForce = Math.max(patched.baseForce ?? 0, PUSH_FORCE_FLOOR);
  }
  return patched;
}

function repairActionsSemantics(
  actions: ActionPayload[],
  text: string,
  isHeadlessMode: boolean,
): ActionPayload[] {
  return actions.map((action) => {
    if (action.type === 'APPLY_IMPULSE') {
      return repairImpulseSemantics(action, text);
    }
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      return {
        ...action,
        triggers: repairTriggersSemantics(action.triggers, text, isHeadlessMode),
      };
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      return {
        ...action,
        payload: repairAbilitySemantics(action.payload, text, isHeadlessMode),
      };
    }
    if (action.type === 'SPAWN_ACTOR' && action.actor.triggers) {
      return {
        ...action,
        actor: {
          ...action.actor,
          triggers: repairTriggersSemantics(action.actor.triggers, text, isHeadlessMode),
        },
      };
    }
    return action;
  });
}

function repairTriggersSemantics(
  nodes: TriggerNode[],
  text: string,
  isHeadlessMode: boolean,
): TriggerNode[] {
  return nodes.map((node) => ({
    ...node,
    actions: repairActionsSemantics(node.actions, text, isHeadlessMode),
    ifFalseActions: node.ifFalseActions
      ? repairActionsSemantics(node.ifFalseActions, text, isHeadlessMode)
      : undefined,
    children: node.children
      ? repairTriggersSemantics(node.children, text, isHeadlessMode)
      : undefined,
  }));
}

function hasFieldType(schema: AbilitySchema, types: FieldType[]): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (v.action.type === 'SPAWN_FIELD' && types.includes(v.action.field.fieldType)) {
      found = true;
    }
  });
  return found;
}

function hasSpawnFieldOrTerrain(schema: AbilitySchema): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (v.action.type === 'SPAWN_FIELD' || v.action.type === 'MUTATE_TERRAIN') {
      found = true;
    }
  });
  return found;
}

function hasSpawnObstacle(schema: AbilitySchema): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (v.action.type === 'SPAWN_OBSTACLE') found = true;
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

function ensureOnCastNode(schema: AbilitySchema): TriggerNode {
  let onCast = schema.triggers.find((t) => t.trigger === 'ON_CAST');
  if (!onCast) {
    onCast = { trigger: 'ON_CAST', actions: [] };
    schema.triggers.unshift(onCast);
  }
  return onCast;
}

function applyRuleF_Obstacle(schema: AbilitySchema, text: string): void {
  if (!isObstacleConcept(text)) return;

  const onCast = ensureOnCastNode(schema);
  if (!hasSpawnObstacle(schema)) {
    onCast.actions.push({
      type: 'SPAWN_OBSTACLE',
      target: 'CASTER',
      obstacle: {
        shape: 'BOX',
        width: 80,
        height: 24,
        durationMs: 5000,
        isDestructible: true,
        maxHealth: 150,
      },
    });
  }

  delete schema.trajectory;
}

function applyRuleG_Deployable(schema: AbilitySchema, text: string): void {
  if (!isDeployableConcept(text, schema)) return;

  const thrown = isThrownDeployable(schema);
  let spawnActor: SpawnActorAction | null;

  if (thrown) {
    spawnActor = findThrownSpawnActor(schema);
    if (!spawnActor) return;
  } else {
    const onCast = ensureOnCastNode(schema);
    spawnActor = findOnCastSpawnActor(schema);
    if (!spawnActor) {
      spawnActor = {
        type: 'SPAWN_ACTOR',
        target: 'CASTER',
        actor: {
          actorArchetype: 'TURRET',
          health: 80,
          durationMs: 8000,
          anchored: true,
        },
      };
      onCast.actions.push(spawnActor);
    }
  }

  if (spawnActor.actor.anchored !== false) {
    spawnActor.actor.anchored = true;
  }

  if (!spawnActor.actor.triggers || spawnActor.actor.triggers.length === 0) {
    if (isPullConcept(text)) {
      spawnActor.actor.actorArchetype = 'DECOY';
      spawnActor.actor.anchored = true;
      spawnActor.actor.triggers = [
        {
          trigger: 'ON_TICK',
          tickIntervalMs: 100,
          actions: [
            {
              type: 'SPAWN_FIELD',
              field: {
                fieldType: 'MASS_ATTRACTOR',
                attachToSource: true,
                strength: 5000,
                radius: 140,
                durationMs: 600,
              },
            },
          ],
        },
      ];
    } else {
      spawnActor.actor.actorArchetype = 'TURRET';
      spawnActor.actor.triggers = [
        {
          trigger: 'ON_TICK',
          tickIntervalMs: 100,
          actions: [
            {
              type: 'SPAWN_PROJECTILE',
              projectileTrajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
              emitter: DEFAULT_SINGLE_EMITTER,
            },
          ],
        },
      ];
    }
  }

  if (!thrown) {
    delete schema.trajectory;
  }
}

function applyRuleE_Orbit(schema: AbilitySchema, text: string): void {
  if (!isOrbitConcept(text)) return;

  schema.trajectory = {
    type: 'ORBIT_ANCHOR',
    orbitRadius: 70,
    orbitSpeed: 3.0,
    maxRange: 800,
  };

  if (hasFieldType(schema, ['MASS_ATTRACTOR', 'VORTEX_TANGENT'])) return;

  const onCast = ensureOnCastNode(schema);
  const hasAttractor = onCast.actions.some(
    (a) => a.type === 'SPAWN_FIELD' && a.field.fieldType === 'MASS_ATTRACTOR',
  );
  const hasVortex = onCast.actions.some(
    (a) => a.type === 'SPAWN_FIELD' && a.field.fieldType === 'VORTEX_TANGENT',
  );

  if (!hasAttractor) {
    onCast.actions.push({
      type: 'SPAWN_FIELD',
      field: {
        fieldType: 'MASS_ATTRACTOR',
        radius: ATTRACTOR_FIELD_RADIUS,
        strength: ATTRACTOR_FIELD_STRENGTH,
        durationMs: 3000,
        attachToSource: true,
      },
    });
  }
  if (!hasVortex) {
    onCast.actions.push({
      type: 'SPAWN_FIELD',
      field: {
        fieldType: 'VORTEX_TANGENT',
        radius: 200,
        strength: -ATTRACTOR_FIELD_STRENGTH,
        durationMs: 3000,
        attachToSource: true,
      },
    });
  }
}

function applyRuleA_PullGravity(
  schema: AbilitySchema,
  text: string,
  isHeadlessMode: boolean,
): void {
  if (!isPullConcept(text) || isOrbitConcept(text)) return;

  const needsPersistentWell =
    PERSISTENT_PULL_KEYWORDS.test(text) ||
    (!schema.trajectory && /\b(spawn|swirling|black hole)\b/.test(text));

  if (!needsPersistentWell || hasFieldType(schema, ['MASS_ATTRACTOR', 'VORTEX_TANGENT'])) {
    return;
  }

  const onCast = ensureOnCastNode(schema);
  const hasAttractor = onCast.actions.some(
    (a) =>
      a.type === 'SPAWN_FIELD' &&
      (a.field.fieldType === 'MASS_ATTRACTOR' || a.field.fieldType === 'VORTEX_TANGENT'),
  );
  if (!hasAttractor) {
    onCast.actions.push({
      type: 'SPAWN_FIELD',
      field: {
        fieldType: 'MASS_ATTRACTOR',
        radius: ATTRACTOR_FIELD_RADIUS,
        strength: ATTRACTOR_FIELD_STRENGTH,
        durationMs: 3000,
        attachToSource: true,
      },
    });
  }

  if (!schema.trajectory && hasSpawnActorOnCast(schema)) return;

  if (!schema.trajectory) {
    schema.trajectory = { type: 'LINEAR', speed: 700, maxRange: 500 };
  }

  let onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
  if (!onHit) {
    onHit = { trigger: 'ON_HIT', actions: [] };
    schema.triggers.push(onHit);
  }
  if (!actionsProvideDisplacement(onHit.actions)) {
    onHit.actions.push(defaultKnockbackImpulse(schema.archetype, text, isHeadlessMode));
  }
}

function injectHazardInstability(schema: AbilitySchema): void {
  if (hasInstabilityAction(schema)) return;

  const instabilityAction: ActionPayload = {
    type: 'ADD_INSTABILITY',
    amount: 25,
    target: 'TARGET',
  };

  if (schema.trajectory) {
    let onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
    if (!onHit) {
      onHit = { trigger: 'ON_HIT', actions: [] };
      schema.triggers.push(onHit);
    }
    onHit.actions.push(instabilityAction);
    return;
  }

  let onTick = schema.triggers.find((t) => t.trigger === 'ON_TICK');
  if (!onTick) {
    onTick = { trigger: 'ON_TICK', tickIntervalMs: 200, actions: [] };
    schema.triggers.push(onTick);
  }
  onTick.actions.push(instabilityAction);
}

function isGroundHazardConcept(text: string): boolean {
  return /\b(puddle|pool|mire|patch|coats|ground|zone)\b/.test(text);
}

function applyRuleB_LingeringHazard(schema: AbilitySchema, text: string): void {
  if (!isLingeringConcept(text)) return;

  if (isGroundHazardConcept(text) || (isChannelConcept(text) && isLingeringConcept(text))) {
    if (!schema.trajectory) {
      schema.trajectory = { type: 'LINEAR', speed: 700, maxRange: 500 };
    }
  }

  if (!hasSpawnFieldOrTerrain(schema)) {
    const fieldAction: ActionPayload = {
      type: 'SPAWN_FIELD',
      field: {
        fieldType: 'RADIAL_IMPULSE',
        radius: 100,
        strength: 300,
        durationMs: 3000,
      },
    };

    if (schema.trajectory) {
      let onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
      if (!onHit) {
        onHit = { trigger: 'ON_HIT', actions: [] };
        schema.triggers.push(onHit);
      }
      onHit.actions.push(fieldAction);
    } else {
      let onTick = schema.triggers.find((t) => t.trigger === 'ON_TICK');
      if (!onTick) {
        onTick = { trigger: 'ON_TICK', tickIntervalMs: 200, actions: [] };
        schema.triggers.push(onTick);
      }
      onTick.actions.push(fieldAction);
    }
  }

  injectHazardInstability(schema);
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

  if (isLingeringConcept(text)) {
    let onTick = schema.triggers.find((t) => t.trigger === 'ON_TICK');
    if (!onTick) {
      onTick = { trigger: 'ON_TICK', tickIntervalMs: 100, actions: [] };
      schema.triggers.push(onTick);
    }
    const hasTickInstability = onTick.actions.some((a) => a.type === 'ADD_INSTABILITY');
    if (!hasTickInstability) {
      onTick.actions.push({ type: 'ADD_INSTABILITY', amount: 15, target: 'TARGET' });
    }
  }
}

function actionsProvideDisplacement(actions: ActionPayload[]): boolean {
  let found = false;
  walkActionList(actions, (v) => {
    if (found) return;
    if (v.action.type === 'APPLY_IMPULSE') {
      found = true;
      return;
    }
    if (v.action.type === 'SPAWN_FIELD') {
      const ft = v.action.field.fieldType;
      if (ft === 'RADIAL_IMPULSE' || ft === 'MASS_ATTRACTOR') found = true;
      return;
    }
    if (v.action.type === 'CAST_CHILD_PAYLOAD') {
      if (abilityProvidesDisplacement(v.action.payload)) found = true;
    }
  });
  return found;
}

function actionsProvideLifecycleDisplacement(actions: ActionPayload[]): boolean {
  let found = false;
  walkActionList(actions, (v) => {
    if (found) return;
    if (v.action.type === 'SPAWN_FIELD') {
      const ft = v.action.field.fieldType;
      if (ft === 'RADIAL_IMPULSE' || ft === 'MASS_ATTRACTOR' || ft === 'VORTEX_TANGENT') {
        found = true;
      }
      return;
    }
    if (v.action.type === 'CAST_CHILD_PAYLOAD') {
      if (hasLifecycleFieldDisplacement(v.action.payload)) found = true;
    }
  });
  return found;
}

const LIFECYCLE_DISPLACEMENT_TRIGGERS = new Set([
  'ON_RETURN',
  'ON_EXPIRY',
  'ON_HIT_WALL',
  'ON_DISTANCE_TRAVELED',
]);

function hasLifecycleFieldDisplacement(schema: AbilitySchema): boolean {
  if (!schema.trajectory) return false;
  let found = false;
  walkActions(schema, (v) => {
    if (found) return;
    if (!v.node || !LIFECYCLE_DISPLACEMENT_TRIGGERS.has(v.node.trigger)) return;
    if (v.action.type === 'SPAWN_FIELD') {
      const ft = v.action.field.fieldType;
      if (ft === 'RADIAL_IMPULSE' || ft === 'MASS_ATTRACTOR' || ft === 'VORTEX_TANGENT') {
        found = true;
      }
      return;
    }
    if (v.action.type === 'CAST_CHILD_PAYLOAD') {
      if (hasLifecycleFieldDisplacement(v.action.payload)) found = true;
    }
  });
  return found;
}

function isStasisOnlyOnHit(schema: AbilitySchema): boolean {
  const onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
  if (!onHit || onHit.actions.length === 0) return false;
  return onHit.actions.every(
    (action) => action.type === 'APPLY_STASIS' || action.type === 'ADD_INSTABILITY',
  );
}

function abilityProvidesDisplacement(schema: AbilitySchema): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (found) return;
    if (v.action.type === 'APPLY_IMPULSE') {
      found = true;
      return;
    }
    if (v.action.type === 'SPAWN_FIELD') {
      const ft = v.action.field.fieldType;
      if (ft === 'RADIAL_IMPULSE' || ft === 'MASS_ATTRACTOR') found = true;
      return;
    }
    if (v.action.type === 'CAST_CHILD_PAYLOAD') {
      if (abilityProvidesDisplacement(v.action.payload)) found = true;
    }
  });
  return found;
}

function isPureSpatialUtility(schema: AbilitySchema): boolean {
  if (schema.trajectory) return false;

  const allActions: ActionPayload[] = [];
  walkActions(schema, (v) => allActions.push(v.action));
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

function ensureProjectileTriggerDisplacement(
  schema: AbilitySchema,
  text: string,
  isHeadlessMode: boolean,
): void {
  walkActions(schema, (v) => {
    if (v.host !== 'ROOT' || v.node?.trigger !== 'ON_CAST') return;
    if (v.action.type !== 'SPAWN_PROJECTILE') return;
    const action = v.action;
    if (!action.triggers) action.triggers = [];
    let onHit = action.triggers.find((t) => t.trigger === 'ON_HIT');
    if (!onHit) {
      onHit = { trigger: 'ON_HIT', actions: [] };
      action.triggers.push(onHit);
    }
    if (!actionsProvideDisplacement(onHit.actions)) {
      onHit.actions.push(defaultKnockbackImpulse(schema.archetype, text, isHeadlessMode));
    }
  });
}

function defaultKnockbackImpulse(
  archetype: SpellArchetype | undefined,
  text: string,
  isHeadlessMode: boolean,
): ApplyImpulseAction {
  const pull = isPullConcept(text) && !isPushConcept(text);
  const archetypeForce = ARCHETYPE_KNOCKBACK_FORCE[archetype ?? 'KINETIC'] ?? 500;
  const injectedForce = isHeadlessMode
    ? Math.max(archetypeForce, INJECTED_IMPULSE_FORCE)
    : archetypeForce;

  if (pull) {
    return {
      type: 'APPLY_IMPULSE',
      baseForce: Math.max(injectedForce, PULL_FORCE_FLOOR),
      target: 'TARGET',
      directionMode: HARPOON_KEYWORDS.test(text) ? 'TOWARDS_CASTER' : 'TOWARDS_ORIGIN',
    };
  }

  return {
    type: 'APPLY_IMPULSE',
    baseForce: Math.max(injectedForce, PUSH_FORCE_FLOOR),
    target: 'TARGET',
    directionMode: 'AWAY_FROM_ORIGIN',
  };
}

function ensureDisplacementSemantics(
  schema: AbilitySchema,
  text: string,
  isHeadlessMode: boolean,
): AbilitySchema {
  if (
    abilityProvidesDisplacement(schema) ||
    isPureSpatialUtility(schema) ||
    isStasisOnlyOnHit(schema) ||
    hasLifecycleFieldDisplacement(schema) ||
    isObstacleConcept(text)
  ) {
    return schema;
  }

  if (isPullConcept(text) && hasFieldType(schema, ['MASS_ATTRACTOR', 'VORTEX_TANGENT'])) {
    if (!schema.trajectory) return schema;
  }

  if (isLingeringConcept(text) && hasSpawnFieldOrTerrain(schema)) {
    return schema;
  }

  if (isOrbitConcept(text)) {
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
    onHit.actions.push(defaultKnockbackImpulse(schema.archetype, text, isHeadlessMode));
  }

  return schema;
}

function clampContinuousFieldStrength(schema: AbilitySchema): void {
  walkActions(schema, (v) => {
    if (v.action.type !== 'SPAWN_FIELD') return;
    const ft = v.action.field.fieldType;
    if (ft !== 'MASS_ATTRACTOR' && ft !== 'VORTEX_TANGENT') return;
    if (Math.abs(v.action.field.strength) < CONTINUOUS_FIELD_STRENGTH_FLOOR) {
      v.action.field.strength =
        Math.sign(v.action.field.strength || 1) * CONTINUOUS_FIELD_STRENGTH_CLAMP;
    }
  });
}

/** Patches concept semantics and injects knockback when offensive spells omit displacement. */
export function repairAbilitySemantics(
  payload: AbilitySchema,
  descriptionText = '',
  isHeadlessMode = false,
): AbilitySchema {
  const text = (
    descriptionText ||
    [payload.tagline, payload.description].filter(Boolean).join(' ')
  ).toLowerCase();

  const cloned = structuredClone(payload);
  cloned.triggers = repairTriggersSemantics(cloned.triggers, text, isHeadlessMode);

  if (text) {
    applyRuleF_Obstacle(cloned, text);
    applyRuleG_Deployable(cloned, text);
    applyRuleE_Orbit(cloned, text);
    applyRuleA_PullGravity(cloned, text, isHeadlessMode);
    applyRuleB_LingeringHazard(cloned, text);
    applyRuleC_ArcSweep(cloned, text);
    applyRuleD_ChanneledStream(cloned, text);
    ensureProjectileTriggerDisplacement(cloned, text, isHeadlessMode);
  }

  const result = ensureDisplacementSemantics(cloned, text, isHeadlessMode);
  clampContinuousFieldStrength(result);
  return result;
}

/** Returns true if the schema contains any APPLY_IMPULSE action (for tests). */
export function schemaHasApplyImpulse(schema: AbilitySchema): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (v.action.type === 'APPLY_IMPULSE') found = true;
  });
  return found;
}

/** Returns true if any APPLY_IMPULSE uses the given direction mode (for tests). */
export function schemaHasImpulseDirection(
  schema: AbilitySchema,
  mode: ApplyImpulseAction['directionMode'],
): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (v.action.type === 'APPLY_IMPULSE' && v.action.directionMode === mode) found = true;
  });
  return found;
}

/** Returns true if schema has a fan emitter with count >= minCount (for tests). */
export function schemaHasFanEmitter(schema: AbilitySchema, minCount = 3): boolean {
  let found = false;
  walkActions(schema, (v) => {
    if (
      v.action.type === 'SPAWN_PROJECTILE' &&
      v.action.emitter &&
      v.action.emitter.count >= minCount &&
      v.action.emitter.distribution === 'FAN'
    ) {
      found = true;
    }
  });
  return found;
}
