import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { ComparisonOperator, ConditionNode } from '../../types/schema';
import type { TriggerContext } from '../../types/triggerContext';
import { resolveActionTarget } from './targeting';

export function compareNumeric(
  current: number,
  op: ComparisonOperator,
  threshold: number,
): boolean {
  switch (op) {
    case 'LT':
      return current < threshold;
    case 'GT':
      return current > threshold;
    case 'EQ':
      return current === threshold;
    case 'LTE':
      return current <= threshold;
    case 'GTE':
      return current >= threshold;
  }
}

export function evaluateCondition(
  cond: ConditionNode,
  ctx: TriggerContext,
  world: PhysicsWorld,
): boolean {
  if (cond.query === 'COMBO_STEP') {
    return compareNumeric(
      ctx.comboStep ?? 0,
      cond.comparison ?? 'EQ',
      Number(cond.value),
    );
  }

  const t = resolveActionTarget(cond.target ?? 'TARGET', ctx);
  if (!t || t.isDead) return false;

  switch (cond.query) {
    case 'STAT_THRESHOLD': {
      const current = cond.stat === 'health' ? t.health : t.instabilityPct;
      return compareNumeric(
        current,
        cond.comparison ?? 'LT',
        Number(cond.value),
      );
    }
    case 'TAG_CHECK':
      return t.tags.has(String(cond.value));
    case 'PROXIMITY_COUNT': {
      const r = cond.radius ?? 100;
      const count = world
        .getEntitiesInRadius(t.pos, r)
        .filter((e) => e.id !== t.id).length;
      return compareNumeric(count, cond.comparison ?? 'GTE', Number(cond.value));
    }
    case 'SURFACE_TYPE': {
      const surface = world.getSurfaceTypeAt(t.pos);
      return surface.toUpperCase() === String(cond.value).toUpperCase();
    }
  }
}

export function evaluateConditions(
  conditions: ConditionNode[],
  ctx: TriggerContext,
  world: PhysicsWorld,
): boolean {
  return conditions.every((c) => evaluateCondition(c, ctx, world));
}
