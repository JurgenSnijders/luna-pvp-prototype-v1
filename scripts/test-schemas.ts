import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeAbilitySchema, schemaHasApplyImpulse, schemaHasFanEmitter, schemaHasImpulseDirection, scoreAbilitySchema } from '../src/ai/BudgetEngine';
import { repairAbilitySemantics } from '../src/ai/budget/repair';
import { PRESETS } from '../src/devtools/Presets';
import type { AbilitySchema, ActionPayload, TriggerNode } from '../src/types/schema';
import { validateAbilitySchema } from '../src/types/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'schema-scores.snapshot.json');
const UPDATE_SNAPSHOT = process.argv.includes('--update-snapshot');

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

function hasOnHitImpulse(schema: AbilitySchema): boolean {
  const onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
  return onHit?.actions.some((a) => a.type === 'APPLY_IMPULSE') ?? false;
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

function isStasisOnlyOnHit(schema: AbilitySchema): boolean {
  const onHit = schema.triggers.find((t) => t.trigger === 'ON_HIT');
  if (!onHit || onHit.actions.length === 0) return false;
  return onHit.actions.every(
    (a) => a.type === 'APPLY_STASIS' || a.type === 'ADD_INSTABILITY',
  );
}

function trajectoryHasDisplacement(schema: AbilitySchema): boolean {
  if (!schema.trajectory) return true;
  return abilityProvidesDisplacement(schema) || isStasisOnlyOnHit(schema);
}

function runDisplacementAssertions(): string[] {
  const failures: string[] = [];

  const cryo = sanitizeAbilitySchema(PRESETS['Cryo Ice Trail'], 'SECONDARY');
  if (!hasOnHitImpulse(cryo)) {
    failures.push('Cryo Ice Trail: expected ON_HIT APPLY_IMPULSE after sanitize');
  }

  const iceBarrier = sanitizeAbilitySchema(PRESETS['Ice Barrier'], 'SECONDARY');
  if (schemaHasApplyImpulse(iceBarrier)) {
    failures.push('Ice Barrier: must not receive APPLY_IMPULSE injection');
  }

  const stasisTrap = sanitizeAbilitySchema(PRESETS['Stasis Freeze Trap'], 'SECONDARY');
  if (schemaHasApplyImpulse(stasisTrap)) {
    failures.push('Stasis Freeze Trap: stasis-only ON_HIT must not receive knockback injection');
  }

  return failures;
}

function hasSpawnFieldOrTerrain(schema: AbilitySchema): boolean {
  let found = false;
  const walk = (nodes: TriggerNode[]): void => {
    for (const node of nodes) {
      for (const action of node.actions) {
        if (action.type === 'SPAWN_FIELD' || action.type === 'MUTATE_TERRAIN') {
          found = true;
        }
        if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
          walk(action.triggers);
        }
        if (action.type === 'CAST_CHILD_PAYLOAD') {
          walk(action.payload.triggers);
        }
      }
      if (node.children) walk(node.children);
    }
  };
  walk(schema.triggers);
  return found;
}

function runSemanticRepairAssertions(): string[] {
  const failures: string[] = [];

  const singularityDart = sanitizeAbilitySchema(
    {
      id: 'singularity_dart',
      name: 'Singularity Dart',
      cooldownMs: 400,
      recoilKick: 30,
      trajectory: { type: 'LINEAR', speed: 700, maxRange: 500 },
      triggers: [
        {
          trigger: 'ON_HIT',
          actions: [
            {
              type: 'APPLY_IMPULSE',
              baseForce: 500,
              target: 'TARGET',
              directionMode: 'AWAY_FROM_ORIGIN',
            },
          ],
        },
      ],
      visuals: { color: '#220044', size: 8, projectileStyle: 'DISC', trailType: 'NONE', impactVfx: 'SPARKS' },
    },
    'SECONDARY',
    0,
    'Singularity Dart Fires a rapid dart that micro-pulls targets inward on impact',
  );

  if (schemaHasImpulseDirection(singularityDart, 'AWAY_FROM_ORIGIN')) {
    failures.push('Singularity Dart: must not keep AWAY_FROM_ORIGIN on pull concept');
  }
  if (
    !schemaHasImpulseDirection(singularityDart, 'TOWARDS_ORIGIN') &&
    !schemaHasImpulseDirection(singularityDart, 'TOWARDS_CASTER')
  ) {
    failures.push('Singularity Dart: expected TOWARDS_ORIGIN or TOWARDS_CASTER impulse');
  }

  const napalmArc = sanitizeAbilitySchema(
    {
      id: 'napalm_arc',
      name: 'Napalm Arc',
      cooldownMs: 1200,
      recoilKick: 80,
      trajectory: { type: 'LINEAR', speed: 500, maxRange: 600 },
      triggers: [{ trigger: 'ON_CAST', actions: [] }],
      visuals: { color: '#ff6622', size: 10, projectileStyle: 'DISC', trailType: 'EMBER_SPIRAL', impactVfx: 'PLASMA_BLOOM' },
    },
    'SECONDARY',
    0,
    'Napalm Arc Fires a sweeping arc of lingering sticky fire across the arena',
  );

  if (!schemaHasFanEmitter(napalmArc, 3)) {
    failures.push('Napalm Arc: expected FAN emitter with count >= 3');
  }
  if (!hasSpawnFieldOrTerrain(napalmArc)) {
    failures.push('Napalm Arc: expected lingering SPAWN_FIELD or MUTATE_TERRAIN');
  }

  const preset = PRESETS['Kinetic Railgun'];
  const withFlavor = sanitizeAbilitySchema(
    { ...preset, tagline: 'Test Tagline', description: 'A test description' },
    'SECONDARY',
  );
  if (withFlavor.tagline !== 'Test Tagline') {
    failures.push('flavor round-trip: tagline not preserved');
  }
  if (withFlavor.description !== 'A test description') {
    failures.push('flavor round-trip: description not preserved');
  }

  return failures;
}

function actorHasMassAttractorTick(schema: AbilitySchema): boolean {
  const onCast = schema.triggers.find((t) => t.trigger === 'ON_CAST');
  if (!onCast) return false;
  for (const action of onCast.actions) {
    if (action.type !== 'SPAWN_ACTOR' || !action.actor.triggers) continue;
    for (const node of action.actor.triggers) {
      if (node.trigger !== 'ON_TICK') continue;
      for (const tickAction of node.actions) {
        if (
          tickAction.type === 'SPAWN_FIELD' &&
          tickAction.field.fieldType === 'MASS_ATTRACTOR'
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function runDeployableRepairAssertions(): string[] {
  const failures: string[] = [];

  const minimal: AbilitySchema = {
    id: 'deployable_black_hole_trap',
    name: 'Deployable Black Hole Trap',
    cooldownMs: 2000,
    recoilKick: 0,
    triggers: [{ trigger: 'ON_CAST', actions: [] }],
  };

  const repaired = repairAbilitySemantics(
    minimal,
    'deployable black hole trap that pulls enemies inward',
    true,
  );

  if (repaired.trajectory) {
    failures.push('deployable black hole trap: must not have root trajectory after repair');
  }

  const spawnActor = repaired.triggers
    .find((t) => t.trigger === 'ON_CAST')
    ?.actions.find((a) => a.type === 'SPAWN_ACTOR');
  if (!spawnActor || spawnActor.type !== 'SPAWN_ACTOR') {
    failures.push('deployable black hole trap: expected ON_CAST SPAWN_ACTOR after repair');
  } else if (!actorHasMassAttractorTick(repaired)) {
    failures.push(
      'deployable black hole trap: expected actor.triggers ON_TICK MASS_ATTRACTOR after repair',
    );
  }

  return failures;
}

function runPresetContractAssertions(): string[] {
  const failures: string[] = [];

  for (const [name, preset] of Object.entries(PRESETS)) {
    if (!preset.archetype) {
      failures.push(`${name}: missing archetype in source preset`);
    }

    const once = sanitizeAbilitySchema(preset, 'SECONDARY', 0, name);
    if (!once.archetype) {
      failures.push(`${name}: missing archetype after sanitize`);
    }

    const twice = sanitizeAbilitySchema(once, 'SECONDARY', 0, name);
    if (JSON.stringify(once) !== JSON.stringify(twice)) {
      failures.push(`${name}: sanitize is not idempotent`);
    }

    if (preset.trajectory && !trajectoryHasDisplacement(preset)) {
      failures.push(`${name}: trajectory preset lacks displacement in source`);
    }

    const sanitized = once;
    if (sanitized.trajectory && !trajectoryHasDisplacement(sanitized)) {
      failures.push(`${name}: trajectory preset lacks displacement after sanitize`);
    }
  }

  return failures;
}

function run(): void {
  const scores: Record<string, number> = {};
  const failures: string[] = [
    ...runDisplacementAssertions(),
    ...runSemanticRepairAssertions(),
    ...runDeployableRepairAssertions(),
    ...runPresetContractAssertions(),
  ];

  for (const [name, preset] of Object.entries(PRESETS)) {
    const validated = validateAbilitySchema(preset);
    if (!validated) {
      failures.push(`validate failed: ${name}`);
      continue;
    }

    let sanitized;
    try {
      sanitized = sanitizeAbilitySchema(validated, 'SECONDARY');
    } catch (err) {
      failures.push(`sanitize threw for ${name}: ${err}`);
      continue;
    }

    const score = scoreAbilitySchema(sanitized);
    if (!Number.isFinite(score) || score <= 0) {
      failures.push(`invalid score for ${name}: ${score}`);
      continue;
    }

    scores[name] = roundScore(score);
  }

  if (failures.length > 0) {
    console.error('test:schemas  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  const presetCount = Object.keys(scores).length;
  const sortedScores = Object.fromEntries(
    Object.keys(scores)
      .sort()
      .map((key) => [key, scores[key]]),
  );

  if (!existsSync(SNAPSHOT_PATH)) {
    if (!UPDATE_SNAPSHOT) {
      console.error(
        `test:schemas  FAIL  snapshot missing at ${SNAPSHOT_PATH}\n` +
          '  Run: npm run test:schemas -- --update-snapshot',
      );
      process.exit(1);
    }
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortedScores, null, 2)}\n`, 'utf8');
    console.log(`test:schemas  OK  ${presetCount} presets  snapshot created`);
    return;
  }

  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Record<string, number>;

  if (UPDATE_SNAPSHOT) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortedScores, null, 2)}\n`, 'utf8');
    console.log(`test:schemas  OK  ${presetCount} presets  snapshot updated`);
    return;
  }

  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(sortedScores).sort();
  const keyMismatch =
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, i) => key !== actualKeys[i]);

  if (keyMismatch) {
    console.error('test:schemas  FAIL  preset name mismatch');
    const missing = expectedKeys.filter((k) => !(k in sortedScores));
    const extra = actualKeys.filter((k) => !(k in expected));
    if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`);
    if (extra.length > 0) console.error(`  extra: ${extra.join(', ')}`);
    process.exit(1);
  }

  const scoreMismatches: string[] = [];
  for (const name of expectedKeys) {
    if (sortedScores[name] !== expected[name]) {
      scoreMismatches.push(`${name}: expected ${expected[name]}, got ${sortedScores[name]}`);
    }
  }

  if (scoreMismatches.length > 0) {
    console.error('test:schemas  FAIL  score mismatch');
    for (const msg of scoreMismatches) console.error(`  ${msg}`);
    process.exit(1);
  }

  console.log(`test:schemas  OK  ${presetCount} presets  scores match snapshot`);
}

run();
