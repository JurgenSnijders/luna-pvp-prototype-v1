import type { SkillCategory } from '../../../types/cards';
import type { AbilitySchema, ActionPayload, ConditionNode, TriggerNode } from '../../../types/schema';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';
import { sanitizeAction } from './action';
import { sanitizeConditionNode } from './condition';
import { sanitizeEmitter } from './emitter';
import { sanitizeVisuals } from './visuals';

export function sanitizeTriggerNode(
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

export function hasOnCastEffect(triggers: TriggerNode[]): boolean {
  return triggers.some((n) => n.trigger === 'ON_CAST' && n.actions.length > 0);
}

export function promoteRootEmitter(
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
