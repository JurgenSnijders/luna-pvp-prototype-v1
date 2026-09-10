import { DEFAULT_EMITTER } from '../../primitives/interpreter/constants';
import type { AbilitySchema, SpawnProjectileAction } from '../../types/schema';
import type { SpellModifier, SpellModifierField } from '../../types/evolution';
import { clamp } from './helpers';

export interface StatCatalogEntry {
  id: string;
  label: string;
  description: string;
  modifiers: SpellModifier[];
  requires: (schema: AbilitySchema) => boolean;
}

function hasOnCastSpawnProjectile(schema: AbilitySchema): boolean {
  return findOnCastSpawnProjectile(schema) !== null;
}

function findOnCastSpawnProjectile(schema: AbilitySchema): SpawnProjectileAction | null {
  for (const node of schema.triggers ?? []) {
    if (node.trigger !== 'ON_CAST') continue;
    for (const action of node.actions) {
      if (action.type === 'SPAWN_PROJECTILE') return action;
    }
  }
  return null;
}

function isBallisticTrajectory(schema: AbilitySchema): boolean {
  return schema.trajectory?.type === 'BALLISTIC_ARC';
}

export const STAT_NODE_CATALOG: StatCatalogEntry[] = [
  {
    id: 'sharpened',
    label: 'Sharpened',
    description: '+15% projectile speed',
    modifiers: [{ field: 'trajectory.speed', op: 'MULTIPLY', value: 1.15 }],
    requires: () => true,
  },
  {
    id: 'extended',
    label: 'Extended',
    description: '+20% max range',
    modifiers: [{ field: 'trajectory.maxRange', op: 'MULTIPLY', value: 1.2 }],
    requires: () => true,
  },
  {
    id: 'quickened',
    label: 'Quickened',
    description: '-15% cooldown',
    modifiers: [{ field: 'cooldownMs', op: 'MULTIPLY', value: 0.85 }],
    requires: () => true,
  },
  {
    id: 'heavier',
    label: 'Heavier',
    description: '+2 projectile size',
    modifiers: [{ field: 'visuals.size', op: 'ADD', value: 2 }],
    requires: () => true,
  },
  {
    id: 'ricochet',
    label: 'Ricochet',
    description: '+1 bounce',
    modifiers: [{ field: 'trajectory.bounces', op: 'ADD', value: 1 }],
    requires: isBallisticTrajectory,
  },
  {
    id: 'piercing',
    label: 'Piercing',
    description: '+1 pierce',
    modifiers: [{ field: 'trajectory.piercing', op: 'ADD', value: 1 }],
    requires: () => true,
  },
  {
    id: 'volley',
    label: 'Volley',
    description: '+1 projectile on cast',
    modifiers: [{ field: 'emitter.count', op: 'ADD', value: 1 }],
    requires: hasOnCastSpawnProjectile,
  },
  {
    id: 'braced',
    label: 'Braced',
    description: '-20% recoil',
    modifiers: [{ field: 'recoilKick', op: 'MULTIPLY', value: 0.8 }],
    requires: () => true,
  },
];

export function getStatCatalogEntry(catalogId: string): StatCatalogEntry | undefined {
  return STAT_NODE_CATALOG.find((entry) => entry.id === catalogId);
}

export function getEligibleStatNodes(schema: AbilitySchema): StatCatalogEntry[] {
  return STAT_NODE_CATALOG.filter((entry) => entry.requires(schema));
}

function applyFieldModifier(
  schema: AbilitySchema,
  field: SpellModifierField,
  op: SpellModifier['op'],
  value: number,
): void {
  switch (field) {
    case 'cooldownMs':
      if (op === 'ADD') schema.cooldownMs += value;
      else if (op === 'MULTIPLY') schema.cooldownMs *= value;
      else schema.cooldownMs = value;
      schema.cooldownMs = Math.max(0, Math.round(schema.cooldownMs));
      break;
    case 'recoilKick':
      if (op === 'ADD') schema.recoilKick += value;
      else if (op === 'MULTIPLY') schema.recoilKick *= value;
      else schema.recoilKick = value;
      schema.recoilKick = Math.max(0, Math.round(schema.recoilKick));
      break;
    case 'trajectory.speed':
      if (!schema.trajectory) schema.trajectory = { type: 'LINEAR', speed: 400 };
      if (op === 'ADD') schema.trajectory.speed = (schema.trajectory.speed ?? 0) + value;
      else if (op === 'MULTIPLY') schema.trajectory.speed = (schema.trajectory.speed ?? 0) * value;
      else schema.trajectory.speed = value;
      break;
    case 'trajectory.maxRange':
      if (!schema.trajectory) schema.trajectory = { type: 'LINEAR', speed: 400 };
      if (op === 'ADD') schema.trajectory.maxRange = (schema.trajectory.maxRange ?? 0) + value;
      else if (op === 'MULTIPLY') schema.trajectory.maxRange = (schema.trajectory.maxRange ?? 0) * value;
      else schema.trajectory.maxRange = value;
      break;
    case 'trajectory.bounces':
      if (!schema.trajectory) schema.trajectory = { type: 'BALLISTIC_ARC', speed: 400 };
      if (op === 'ADD') schema.trajectory.bounces = (schema.trajectory.bounces ?? 0) + value;
      else if (op === 'MULTIPLY') schema.trajectory.bounces = (schema.trajectory.bounces ?? 0) * value;
      else schema.trajectory.bounces = value;
      break;
    case 'trajectory.piercing':
      if (!schema.trajectory) schema.trajectory = { type: 'LINEAR', speed: 400 };
      if (op === 'ADD') schema.trajectory.piercing = (schema.trajectory.piercing ?? 0) + value;
      else if (op === 'MULTIPLY') schema.trajectory.piercing = (schema.trajectory.piercing ?? 0) * value;
      else schema.trajectory.piercing = value;
      break;
    case 'trajectory.lobApex':
      if (!schema.trajectory) schema.trajectory = { type: 'BALLISTIC_ARC', speed: 400 };
      if (op === 'ADD') schema.trajectory.lobApex = (schema.trajectory.lobApex ?? 0) + value;
      else if (op === 'MULTIPLY') schema.trajectory.lobApex = (schema.trajectory.lobApex ?? 0) * value;
      else schema.trajectory.lobApex = value;
      break;
    case 'visuals.size':
      if (!schema.visuals) {
        schema.visuals = {
          color: '#00e5ff',
          size: 8,
          projectileStyle: 'DISC',
          trailType: 'NONE',
          impactVfx: 'SPARKS',
        };
      }
      if (op === 'ADD') schema.visuals.size += value;
      else if (op === 'MULTIPLY') schema.visuals.size *= value;
      else schema.visuals.size = value;
      break;
    case 'emitter.count': {
      const action = findOnCastSpawnProjectile(schema);
      if (!action) break;
      if (!action.emitter) action.emitter = { ...DEFAULT_EMITTER };
      if (op === 'ADD') action.emitter.count += value;
      else if (op === 'MULTIPLY') action.emitter.count *= value;
      else action.emitter.count = value;
      action.emitter.count = clamp(Math.round(action.emitter.count), 1, 12);
      break;
    }
    default:
      break;
  }
}

export function applyModifiers(
  schema: AbilitySchema,
  modifiers: SpellModifier[],
): AbilitySchema {
  const next = structuredClone(schema);
  for (const mod of modifiers) {
    applyFieldModifier(next, mod.field, mod.op, mod.value);
  }
  return next;
}
