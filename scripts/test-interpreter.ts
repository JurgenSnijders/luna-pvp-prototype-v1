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
import { resolveTrajectoryVisualMode } from '../src/render/canvas/AimingIndicator';
import { resolveDeployableInfo } from '../src/render/canvas/trajectoryTracer';
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

function testGroundPointBoxOrientation(): string | null {
  const schema: AbilitySchema = {
    id: 'test_ground_wall',
    name: 'Ground Wall',
    targetingMode: 'GROUND_POINT',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_OBSTACLE',
            obstacle: {
              shape: 'BOX',
              width: 80,
              height: 24,
              durationMs: 5000,
            },
          },
        ],
      },
    ],
  };

  const castAt = (aimX: number, aimY: number, expectedAngle: number): string | null => {
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
        ability: schema,
        aimPoint: new Vector2D(aimX, aimY),
      },
      world,
    );
    const obs = world.obstacles[0];
    if (!obs) return `no obstacle spawned at aim (${aimX}, ${aimY})`;
    const actual = obs.config.angle ?? 0;
    const delta = Math.abs(actual - expectedAngle);
    const wrapped = Math.min(delta, Math.abs(delta - Math.PI * 2));
    if (wrapped > 0.02) {
      return `aim (${aimX}, ${aimY}): expected angle ${expectedAngle}, got ${actual}`;
    }
    return null;
  };

  const rightFail = castAt(100, 0, Math.PI / 2);
  if (rightFail) return `ground wall right: ${rightFail}`;

  const upFail = castAt(0, -100, 0);
  if (upFail) return `ground wall up: ${upFail}`;

  return null;
}

function testThrownDeployableGhostResolution(): string | null {
  const schema: AbilitySchema = {
    id: 'test_thrown_wall',
    name: 'Thrown Wall',
    cooldownMs: 1000,
    recoilKick: 0,
    trajectory: { type: 'BALLISTIC_ARC', speed: 300, lobApex: 120, maxRange: 500 },
    triggers: [
      {
        trigger: 'ON_EXPIRY',
        actions: [
          {
            type: 'SPAWN_OBSTACLE',
            obstacle: {
              shape: 'BOX',
              width: 80,
              height: 24,
              durationMs: 5000,
            },
          },
        ],
      },
    ],
  };

  const info = resolveDeployableInfo(schema);
  if (!info) return 'thrown wall: expected deployable info';
  if (info.shape !== 'BOX') return `thrown wall: expected BOX shape, got ${info.shape}`;
  if (!info.isThrown) return 'thrown wall: expected isThrown true';
  return null;
}

function testWedgeFieldOrientation(): string | null {
  const schema: AbilitySchema = {
    id: 'test_wedge_field',
    name: 'Wedge Field',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 90,
              strength: 650,
              durationMs: 200,
              arcDeg: 90,
              arcFacing: 'CAST_HEADING',
            },
          },
        ],
      },
    ],
  };

  const info = resolveDeployableInfo(schema);
  if (!info) return 'wedge field: expected deployable info';
  if (info.shape !== 'WEDGE_FIELD') {
    return `wedge field: expected WEDGE_FIELD shape, got ${info.shape}`;
  }
  if (info.orientationMode !== 'RADIAL_OUTWARD') {
    return `wedge field: expected RADIAL_OUTWARD, got ${info.orientationMode}`;
  }
  return null;
}

function testPlacedTurretAim(): string | null {
  const schema: AbilitySchema = {
    id: 'recipe_auto_turret',
    name: 'Auto Turret',
    archetype: 'KINETIC',
    cooldownMs: 2500,
    recoilKick: 20,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_ACTOR',
            target: 'CASTER',
            actor: { actorArchetype: 'TURRET', health: 80, durationMs: 8000 },
          },
        ],
      },
    ],
  };

  const info = resolveDeployableInfo(schema);
  if (!info) return 'placed turret aim: expected deployable info';
  if (info.shape !== 'TURRET') return `placed turret aim: expected TURRET shape, got ${info.shape}`;
  if (info.isThrown) return 'placed turret aim: expected non-thrown deployable';

  const visualMode = resolveTrajectoryVisualMode(schema);
  if (visualMode !== 'radial') {
    return `placed turret aim: expected radial visual mode, got ${visualMode}`;
  }

  const world = new PhysicsWorld(Vector2D.zero(), 400);
  const caster = new Player(new Vector2D(0, 0));
  world.addPlayer(caster);
  const interpreter = new Interpreter();
  const aimPoint = new Vector2D(100, 0);

  interpreter.executeAbility(
    schema,
    {
      origin: caster.pos.clone(),
      heading: new Vector2D(1, 0),
      caster,
      depth: 0,
      ability: schema,
      aimPoint,
    },
    world,
  );

  const aimedSummon = world.summons[0];
  if (!aimedSummon) return 'placed turret aim: summon not spawned with aimPoint';
  const aimDist = aimedSummon.pos.sub(aimPoint).mag();
  if (aimDist > 2) {
    return `placed turret aim: expected spawn near (100, 0), got (${aimedSummon.pos.x}, ${aimedSummon.pos.y})`;
  }
  const facingDelta = Math.abs(aimedSummon.facingAngle);
  if (facingDelta > 0.02) {
    return `placed turret aim: expected facingAngle ~0, got ${aimedSummon.facingAngle}`;
  }

  const fallbackWorld = new PhysicsWorld(Vector2D.zero(), 400);
  const fallbackCaster = new Player(new Vector2D(0, 0));
  fallbackWorld.addPlayer(fallbackCaster);
  const fallbackInterpreter = new Interpreter();
  fallbackInterpreter.executeAbility(
    schema,
    {
      origin: fallbackCaster.pos.clone(),
      heading: new Vector2D(1, 0),
      caster: fallbackCaster,
      depth: 0,
      ability: schema,
    },
    fallbackWorld,
  );

  const fallbackSummon = fallbackWorld.summons[0];
  if (!fallbackSummon) return 'placed turret aim: summon not spawned without aimPoint';
  if (fallbackSummon.pos.x <= fallbackCaster.radius + 10) {
    return `placed turret aim: expected offset spawn in front of caster, got x=${fallbackSummon.pos.x}`;
  }
  if (fallbackSummon.pos.y > 1) {
    return `placed turret aim: expected forward spawn along heading, got y=${fallbackSummon.pos.y}`;
  }

  return null;
}

function testTurretSpawnFacing(): string | null {
  const schema: AbilitySchema = {
    id: 'test_turret_facing',
    name: 'Facing Turret',
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
              actorArchetype: 'TURRET',
              health: 80,
              durationMs: 8000,
            },
          },
        ],
      },
    ],
  };

  const castWithHeading = (headingX: number, headingY: number, expectedAngle: number): string | null => {
    const world = new PhysicsWorld(Vector2D.zero(), 400);
    const caster = new Player(new Vector2D(0, 0));
    world.addPlayer(caster);
    const heading = new Vector2D(headingX, headingY);
    const interpreter = new Interpreter();
    interpreter.executeAbility(
      schema,
      {
        origin: caster.pos.clone(),
        heading,
        caster,
        depth: 0,
        ability: schema,
      },
      world,
    );
    const summon = world.summons[0];
    if (!summon) return `turret facing: summon not spawned for heading (${headingX}, ${headingY})`;
    const delta = Math.abs(summon.facingAngle - expectedAngle);
    const wrapped = Math.min(delta, Math.abs(delta - Math.PI * 2));
    if (wrapped > 0.02) {
      return `turret facing (${headingX}, ${headingY}): expected ${expectedAngle}, got ${summon.facingAngle}`;
    }
    return null;
  };

  const rightFail = castWithHeading(1, 0, 0);
  if (rightFail) return rightFail;

  const upFail = castWithHeading(0, -1, -Math.PI / 2);
  if (upFail) return upFail;

  return null;
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
              actorArchetype: 'TURRET',
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

  const wallOrientationFailure = testGroundPointBoxOrientation();
  if (wallOrientationFailure) failures.push(wallOrientationFailure);

  const thrownGhostFailure = testThrownDeployableGhostResolution();
  if (thrownGhostFailure) failures.push(thrownGhostFailure);

  const wedgeFieldFailure = testWedgeFieldOrientation();
  if (wedgeFieldFailure) failures.push(wedgeFieldFailure);

  const placedTurretAimFailure = testPlacedTurretAim();
  if (placedTurretAimFailure) failures.push(placedTurretAimFailure);

  const turretFacingFailure = testTurretSpawnFacing();
  if (turretFacingFailure) failures.push(turretFacingFailure);

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
