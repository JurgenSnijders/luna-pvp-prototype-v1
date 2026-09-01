import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeAbilitySchema } from '../src/ai/BudgetEngine';
import { PRESETS } from '../src/devtools/Presets';
import { PhysicsWorld } from '../src/engine/PhysicsWorld';
import { Dummy } from '../src/entities/Dummy';
import { Player } from '../src/entities/Player';
import { Vector2D } from '../src/math/Vector2D';
import { Interpreter } from '../src/primitives/Interpreter';
import type { AbilitySchema } from '../src/types/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'interpreter-casts.snapshot.json');
const UPDATE_SNAPSHOT = process.argv.includes('--update-snapshot');

interface CastCounts {
  projectiles: number;
  zones: number;
  obstacles: number;
  summons: number;
}

const CAST_PRESETS = [
  'Kinetic Railgun',
  'Void Singularity',
  'Ice Barrier',
  'Auto Turret',
  'Ghost Walk',
  'Iron Colossus',
  'Cluster MIRV',
  'Recursive Fractal',
] as const;

function countLiveEntities(world: PhysicsWorld): CastCounts {
  return {
    projectiles: world.projectiles.filter((p) => !p.isDead).length,
    zones: world.zones.filter((z) => !z.isDead).length,
    obstacles: world.obstacles.filter((o) => !o.isDead).length,
    summons: world.summons.filter((s) => !s.isDead).length,
  };
}

function castPreset(presetName: string, schema: AbilitySchema): CastCounts {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  const caster = new Player(new Vector2D(0, 0));
  world.addPlayer(caster);

  const interpreter = new Interpreter();
  interpreter.executeAbility(
    schema,
    {
      origin: caster.pos.clone(),
      heading: new Vector2D(1, 0),
      caster,
      depth: 0,
    },
    world,
  );

  return countLiveEntities(world);
}

function testDeployableNestedTriggerSelfHit(): string | null {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  const caster = new Player(new Vector2D(0, 0));
  const dummy = new Dummy(new Vector2D(200, 0));
  world.addPlayer(caster);
  world.addDummy(dummy);

  const schema: AbilitySchema = {
    id: 'test_deployable_turret',
    name: 'Test Deployable Turret',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_ACTOR',
            target: 'CASTER',
            actor: {
              archetype: 'TURRET',
              health: 80,
              durationMs: 8000,
              triggers: [
                {
                  trigger: 'ON_TICK',
                  tickIntervalMs: 100,
                  actions: [
                    {
                      type: 'SPAWN_PROJECTILE',
                      projectileTrajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const interpreter = new Interpreter();
  interpreter.executeAbility(
    schema,
    {
      origin: caster.pos.clone(),
      heading: new Vector2D(1, 0),
      caster,
      depth: 0,
      ability: schema,
    },
    world,
  );

  if (world.summons.length !== 1 || world.summons[0].isDead) {
    return 'deployable nested trigger: summon was not spawned';
  }
  const summon = world.summons[0];

  const dt = 0.2;
  interpreter.updateTrajectories(world, dt);
  world.step(dt);
  interpreter.processLifecycleEvents(world, dt);

  const liveProjectiles = world.projectiles.filter((p) => !p.isDead);
  if (liveProjectiles.length === 0) {
    return 'deployable nested trigger: no live projectile after tick';
  }

  const spawned = liveProjectiles.find((p) => p.hitEntityIds.has(summon.id));
  if (!spawned) {
    return 'deployable nested trigger: projectile missing summon self-hit guard';
  }

  return null;
}

function run(): void {
  const counts: Record<string, CastCounts> = {};
  const failures: string[] = [];

  const deployableFailure = testDeployableNestedTriggerSelfHit();
  if (deployableFailure) failures.push(deployableFailure);

  for (const name of CAST_PRESETS) {
    const preset = PRESETS[name];
    if (!preset) {
      failures.push(`missing preset: ${name}`);
      continue;
    }

    try {
      const sanitized = sanitizeAbilitySchema(preset, 'SECONDARY');
      counts[name] = castPreset(name, sanitized);
    } catch (err) {
      failures.push(`cast failed for ${name}: ${err}`);
    }
  }

  if (failures.length > 0) {
    console.error('test:interpreter  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  const sortedCounts = Object.fromEntries(
    CAST_PRESETS.map((key) => [key, counts[key]]),
  );

  if (!existsSync(SNAPSHOT_PATH)) {
    if (!UPDATE_SNAPSHOT) {
      console.error(
        `test:interpreter  FAIL  snapshot missing at ${SNAPSHOT_PATH}\n` +
          '  Run: npm run test:interpreter -- --update-snapshot',
      );
      process.exit(1);
    }
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortedCounts, null, 2)}\n`, 'utf8');
    console.log(`test:interpreter  OK  ${CAST_PRESETS.length} casts  snapshot created`);
    return;
  }

  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Record<string, CastCounts>;

  if (UPDATE_SNAPSHOT) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortedCounts, null, 2)}\n`, 'utf8');
    console.log(`test:interpreter  OK  ${CAST_PRESETS.length} casts  snapshot updated`);
    return;
  }

  for (const name of CAST_PRESETS) {
    const actual = counts[name];
    const exp = expected[name];
    if (!exp) {
      failures.push(`snapshot missing entry: ${name}`);
      continue;
    }
    const keys: (keyof CastCounts)[] = ['projectiles', 'zones', 'obstacles', 'summons'];
    for (const key of keys) {
      if (actual[key] !== exp[key]) {
        failures.push(`${name}.${key}: expected ${exp[key]}, got ${actual[key]}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('test:interpreter  FAIL  snapshot mismatch');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  console.log(`test:interpreter  OK  ${CAST_PRESETS.length} casts  snapshot matched`);
}

run();
