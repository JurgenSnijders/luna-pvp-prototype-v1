import type { AbilitySchema, ActionPayload, TriggerNode } from '../src/types/schema';
import { sanitizeAbilitySchema } from '../src/ai/BudgetEngine';
import { CORE_PRESETS } from '../src/devtools/presetPacks/core';
import { KINETIC_RECIPE_PRESETS } from '../src/devtools/presetPacks/kineticRecipes';
import { INPUT_PROFILE_PRESETS } from '../src/devtools/presetPacks/inputProfiles';
import { STASIS_PRESETS } from '../src/devtools/presetPacks/stasis';
import { TERRAIN_PRESETS } from '../src/devtools/presetPacks/terrain';
import { METAMORPH_PRESETS } from '../src/devtools/presetPacks/metamorph';
import { RESOURCE_PRESETS } from '../src/devtools/presetPacks/resources';
import { ADVANCED_PRESETS } from '../src/devtools/presetPacks/advanced';
import { CONDITIONAL_PRESETS } from '../src/devtools/presetPacks/conditional';
import { DIAGNOSTIC_PRESETS } from '../src/devtools/presetPacks/diagnostics';
import { VFX_SHOWCASE_PRESETS } from '../src/devtools/presetPacks/vfxShowcase';
import { PRESETS } from '../src/devtools/presetPacks/index';

const PACK_MAP: Record<string, Record<string, AbilitySchema>> = {
  'core.ts': CORE_PRESETS,
  'kineticRecipes.ts': KINETIC_RECIPE_PRESETS,
  'inputProfiles.ts': INPUT_PROFILE_PRESETS,
  'stasis.ts': STASIS_PRESETS,
  'terrain.ts': TERRAIN_PRESETS,
  'metamorph.ts': METAMORPH_PRESETS,
  'resources.ts': RESOURCE_PRESETS,
  'advanced.ts': ADVANCED_PRESETS,
  'conditional.ts': CONDITIONAL_PRESETS,
  'diagnostics.ts': DIAGNOSTIC_PRESETS,
  'vfxShowcase.ts': VFX_SHOWCASE_PRESETS,
};

function sourceFile(name: string): string {
  for (const [file, presets] of Object.entries(PACK_MAP)) {
    if (name in presets) return file;
  }
  return 'UNKNOWN';
}

function collectActionsDeep(actions: ActionPayload[]): ActionPayload[] {
  const all: ActionPayload[] = [];
  for (const action of actions) {
    all.push(action);
    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      all.push(...collectAllTriggerActions(action.triggers));
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      all.push(...collectAllTriggerActions(action.payload.triggers));
    }
  }
  return all;
}

function collectAllTriggerActions(nodes: TriggerNode[]): ActionPayload[] {
  const all: ActionPayload[] = [];
  const collect = (triggerNodes: TriggerNode[]): void => {
    for (const node of triggerNodes) {
      all.push(...collectActionsDeep(node.actions));
      if (node.ifFalseActions) all.push(...collectActionsDeep(node.ifFalseActions));
      if (node.children) collect(node.children);
    }
  };
  collect(nodes);
  return all;
}

function collectAllActions(nodes: TriggerNode[]): ActionPayload[] {
  return collectAllTriggerActions(nodes);
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

function isPureSpatialUtility(schema: AbilitySchema): boolean {
  if (schema.trajectory) return false;
  const allActions = collectAllActions(schema.triggers);
  if (allActions.length === 0) return false;
  return allActions.every(
    (a) => a.type === 'SPAWN_OBSTACLE' || a.type === 'SPAWN_FIELD',
  );
}

function hasApplyImpulse(schema: AbilitySchema): boolean {
  return collectAllActions(schema.triggers).some((a) => a.type === 'APPLY_IMPULSE');
}

function hasRadialOrAttractor(schema: AbilitySchema): boolean {
  return collectAllActions(schema.triggers).some(
    (a) =>
      a.type === 'SPAWN_FIELD' &&
      (a.field.fieldType === 'RADIAL_IMPULSE' || a.field.fieldType === 'MASS_ATTRACTOR'),
  );
}

function applyImpulseMissingTargetOrDirection(schema: AbilitySchema): boolean {
  return collectAllActions(schema.triggers).some(
    (a) =>
      a.type === 'APPLY_IMPULSE' && (!a.target || !a.directionMode),
  );
}

function wouldInjectOnHitImpulse(schema: AbilitySchema): boolean {
  if (!schema.trajectory) return false;
  if (abilityProvidesDisplacement(schema)) return false;
  if (isPureSpatialUtility(schema)) return false;
  return true;
}

function isSpecialCase(name: string, schema: AbilitySchema): string | null {
  const lower = name.toLowerCase();
  if (lower.includes('boomerang')) return 'boomerang';
  if (lower.includes('stasis') || lower.includes('freeze')) {
    const onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
    if (onHit) {
      const hasStasis = onHit.actions.some(
        (a) =>
          a.type === 'APPLY_STASIS' ||
          (a.type === 'SPAWN_FIELD' && a.field.fieldType === 'STASIS'),
      );
      if (hasStasis && !actionsProvideDisplacement(onHit.actions)) return 'stasis-only-hit';
    }
  }
  if (sourceFile(name) === 'diagnostics.ts') return 'diagnostic';
  return null;
}

interface AuditRow {
  name: string;
  file: string;
  hasTrajectory: boolean;
  hasApplyImpulse: boolean;
  hasRadialOrAttractor: boolean;
  pureSpatialUtility: boolean;
  wouldInjectOnHit: boolean;
  missingArchetype: boolean;
  impulseMissingFields: boolean;
  specialCase: string | null;
}

const rows: AuditRow[] = Object.keys(PRESETS)
  .sort()
  .map((name) => {
    const schema = PRESETS[name];
    return {
      name,
      file: sourceFile(name),
      hasTrajectory: !!schema.trajectory,
      hasApplyImpulse: hasApplyImpulse(schema),
      hasRadialOrAttractor: hasRadialOrAttractor(schema),
      pureSpatialUtility: isPureSpatialUtility(schema),
      wouldInjectOnHit: wouldInjectOnHitImpulse(schema),
      missingArchetype: !schema.archetype,
      impulseMissingFields: applyImpulseMissingTargetOrDirection(schema),
      specialCase: isSpecialCase(name, schema),
    };
  });

const GROUP_A = rows.filter((r) => r.wouldInjectOnHit && !r.specialCase);
const GROUP_B = rows.filter((r) => r.impulseMissingFields);
const GROUP_C = rows.filter((r) => r.missingArchetype);
const GROUP_E = rows.filter((r) => r.specialCase);
const GROUP_D = rows.filter(
  (r) =>
    !r.wouldInjectOnHit &&
    !r.impulseMissingFields &&
    !r.missingArchetype &&
    !r.specialCase,
);

function fmt(items: AuditRow[]): void {
  for (const r of items) {
    console.log(`  - ${r.name} (${r.file})`);
  }
}

console.log(`Total presets: ${rows.length}\n`);

console.log('=== GROUP A: Need explicit ON_HIT APPLY_IMPULSE baked in (trajectory, no displacement) ===');
fmt(GROUP_A);
console.log(`Count: ${GROUP_A.length}\n`);

console.log('=== GROUP B: Need target/directionMode on existing APPLY_IMPULSE ===');
fmt(GROUP_B);
console.log(`Count: ${GROUP_B.length}\n`);

console.log('=== GROUP C: Need archetype added ===');
fmt(GROUP_C);
console.log(`Count: ${GROUP_C.length}\n`);

console.log('=== GROUP D: Already correct / pure utility (no changes) ===');
fmt(GROUP_D);
console.log(`Count: ${GROUP_D.length}\n`);

console.log('=== GROUP E: Special cases needing design decision ===');
for (const r of GROUP_E) {
  console.log(`  - ${r.name} (${r.file}) [${r.specialCase}]`);
}
console.log(`Count: ${GROUP_E.length}\n`);

function runIdempotencyGate(): string[] {
  const failures: string[] = [];
  for (const [name, preset] of Object.entries(PRESETS)) {
    const once = sanitizeAbilitySchema(preset, 'SECONDARY', 0, name);
    const twice = sanitizeAbilitySchema(once, 'SECONDARY', 0, name);
    if (JSON.stringify(once) !== JSON.stringify(twice)) {
      failures.push(`${name}: sanitizeAbilitySchema is not idempotent`);
    }
  }
  return failures;
}

const idempotencyFailures = runIdempotencyGate();
console.log('=== IDEMPOTENCY GATE (sanitize once === sanitize twice) ===');
if (idempotencyFailures.length === 0) {
  console.log('  All presets pass idempotency check');
} else {
  for (const msg of idempotencyFailures) console.log(`  FAIL: ${msg}`);
}
console.log(`Count: ${idempotencyFailures.length} failures\n`);

const auditFailures =
  GROUP_A.length + GROUP_B.length + GROUP_C.length + idempotencyFailures.length;
if (auditFailures > 0) {
  console.error(`audit-presets  FAIL  ${auditFailures} issue(s)`);
  process.exit(1);
}

console.log('audit-presets  OK  all presets baked and idempotent');

console.log('=== DETAIL TABLE ===');
console.log(
  'name | file | traj | impulse | radial/attract | pureUtil | injectOnHit | noArchetype | badImpulse | special',
);
for (const r of rows) {
  console.log(
    [
      r.name,
      r.file,
      r.hasTrajectory ? 'Y' : 'N',
      r.hasApplyImpulse ? 'Y' : 'N',
      r.hasRadialOrAttractor ? 'Y' : 'N',
      r.pureSpatialUtility ? 'Y' : 'N',
      r.wouldInjectOnHit ? 'Y' : 'N',
      r.missingArchetype ? 'Y' : 'N',
      r.impulseMissingFields ? 'Y' : 'N',
      r.specialCase ?? '-',
    ].join(' | '),
  );
}
