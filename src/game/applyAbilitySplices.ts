import type { PassiveModifierPayload } from '../types/cards';
import type { PassiveSplice } from '../types/combatEvents';
import type { AbilitySchema } from '../types/schema';

const LINEAR_TRAJECTORY_FLOOR = { type: 'LINEAR' as const, speed: 400, maxRange: 500 };
const MAX_BOUNCES = 6;
const MAX_PIERCE = 4;

function rootOnCastHasSpawnProjectile(schema: AbilitySchema): boolean {
  for (const node of schema.triggers) {
    if (node.trigger !== 'ON_CAST') continue;
    for (const action of node.actions) {
      if (action.type === 'SPAWN_PROJECTILE') return true;
    }
  }
  return false;
}

/** Ensures a root trajectory exists only when the spell already delivers a projectile on ON_CAST. */
function ensureProjectileTrajectory(schema: AbilitySchema): boolean {
  if (schema.trajectory) return true;
  if (!rootOnCastHasSpawnProjectile(schema)) return false;
  schema.trajectory = { ...LINEAR_TRAJECTORY_FLOOR };
  return true;
}

function matchesArchetype(schema: AbilitySchema, splice: PassiveSplice): boolean {
  if (!splice.targetArchetype) return true;
  return schema.archetype === splice.targetArchetype;
}

function applySingleSplice(schema: AbilitySchema, splice: PassiveSplice): void {
  if (!matchesArchetype(schema, splice)) return;

  const op = splice.operation;
  switch (op.type) {
    case 'APPEND_TRIGGER':
      schema.triggers.push(structuredClone(op.node));
      break;
    case 'ADD_BOUNCE': {
      if (!ensureProjectileTrajectory(schema)) return;
      const trajectory = schema.trajectory!;
      const current = trajectory.bounces ?? 0;
      trajectory.bounces = Math.min(MAX_BOUNCES, current + op.amount);
      break;
    }
    case 'ADD_PIERCE': {
      if (!ensureProjectileTrajectory(schema)) return;
      const trajectory = schema.trajectory!;
      const current = trajectory.piercing ?? 0;
      trajectory.piercing = Math.min(MAX_PIERCE, current + op.amount);
      break;
    }
  }
}

export function applySplicesToAbility(
  base: AbilitySchema,
  passives: PassiveModifierPayload[],
): AbilitySchema {
  const compiled = structuredClone(base);
  for (const mod of passives) {
    if (!mod.splices) continue;
    for (const splice of mod.splices) {
      applySingleSplice(compiled, splice);
    }
  }
  return compiled;
}
