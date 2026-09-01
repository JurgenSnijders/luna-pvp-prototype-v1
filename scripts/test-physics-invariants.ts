import { sanitizeAbilitySchema } from '../src/ai/BudgetEngine';
import { PRESETS } from '../src/devtools/Presets';
import { PhysicsWorld } from '../src/engine/PhysicsWorld';
import { Dummy } from '../src/entities/Dummy';
import { Player } from '../src/entities/Player';
import { Vector2D } from '../src/math/Vector2D';
import { applyField } from '../src/primitives/Fields';
import { Interpreter } from '../src/primitives/Interpreter';
import type { AbilitySchema, VisualDescriptor } from '../src/types/schema';

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const DEFAULT_VISUALS: VisualDescriptor = {
  color: '#888888',
  size: 8,
  projectileStyle: 'DISC',
  trailType: 'NONE',
  impactVfx: 'SPARKS',
};

// ── Telemetry & harness ─────────────────────────────────────────────────────

export interface SimulationTelemetry {
  initialDistance: number;
  finalDistance: number;
  minDistance: number;
  maxDistance: number;
  peakTargetSpeed: number;
  targetInstabilityDelta: number;
  targetHealthDelta: number;
  maxTargetDisplacement: number;
  fieldTicksApplied: number;
  obstaclesSpawned: number;
  orbitBandFrameCount: number;
}

function applySpatialFields(world: PhysicsWorld, dt: number): void {
  const combatants = world.getCombatants();

  for (const entity of combatants) {
    entity.linearDrag = entity.baseLinearDrag;
  }

  for (const zone of world.zones) {
    if (zone.isDead) continue;
    for (const entity of combatants) {
      if (entity.isDead) continue;
      applyField(zone, entity, dt, world);
    }
  }
}

function isTargetInZone(
  target: Dummy,
  zonePos: Vector2D,
  zoneRadius: number,
): boolean {
  return target.pos.dist(zonePos) <= zoneRadius + target.radius;
}

export function runHeadlessSimulation(
  schema: AbilitySchema,
  ticks = 60,
  dt = 1 / 60,
  targetDistance = 200,
  options: { casterKinematic?: boolean; casterNoFriction?: boolean; dummyMass?: number } = {},
): SimulationTelemetry {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);

  const casterRadius = world.getCombatantRadius();
  const caster = new Player(new Vector2D(casterRadius + 1, 0));
  if (options.casterKinematic !== false) {
    caster.tags.add('kinematic');
  }
  if (options.casterNoFriction) {
    caster.friction = 0;
    caster.linearDrag = 0;
  }
  const target = new Dummy(new Vector2D(casterRadius + 1 + targetDistance, 0), {
    mass: options.dummyMass ?? 100,
  });

  world.addPlayer(caster);
  world.addDummy(target);

  const interpreter = new Interpreter();

  const initialDistance = caster.pos.dist(target.pos);
  const initialInstability = target.instabilityPct;
  const initialHealth = target.health;
  const initialTargetPos = target.pos.clone();

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

  let minDistance = initialDistance;
  let maxDistance = initialDistance;
  let peakTargetSpeed = 0;
  let maxTargetDisplacement = 0;
  let fieldTicksApplied = 0;
  let obstaclesSpawned = 0;
  let orbitBandFrameCount = 0;

  for (let i = 0; i < ticks; i++) {
    interpreter.updateTrajectories(world, dt);
    world.updateSpatialZones(dt);
    applySpatialFields(world, dt);
    world.step(dt);
    interpreter.processLifecycleEvents(world, dt);

    const dist = caster.pos.dist(target.pos);
    minDistance = Math.min(minDistance, dist);
    maxDistance = Math.max(maxDistance, dist);
    peakTargetSpeed = Math.max(peakTargetSpeed, target.vel.mag());
    maxTargetDisplacement = Math.max(maxTargetDisplacement, target.pos.dist(initialTargetPos));

    if (dist >= 40 && dist <= 120) {
      orbitBandFrameCount++;
    }

    let inField = false;
    for (const zone of world.zones) {
      if (zone.isDead) continue;
      if (isTargetInZone(target, zone.pos, zone.config.radius)) {
        inField = true;
        break;
      }
    }
    if (inField) fieldTicksApplied++;

    const liveObstacles = world.obstacles.filter((o) => !o.isDead).length;
    obstaclesSpawned = Math.max(obstaclesSpawned, liveObstacles);
  }

  const finalDistance = caster.pos.dist(target.pos);

  return {
    initialDistance,
    finalDistance,
    minDistance,
    maxDistance,
    peakTargetSpeed,
    targetInstabilityDelta: target.instabilityPct - initialInstability,
    targetHealthDelta: target.health - initialHealth,
    maxTargetDisplacement,
    fieldTicksApplied,
    obstaclesSpawned,
    orbitBandFrameCount,
  };
}

// ── Invariant checkers ──────────────────────────────────────────────────────

export type InvariantType = 'PULL' | 'PUSH' | 'HAZARD_DOT' | 'ORBIT' | 'OBSTACLE' | 'RAM';

export function assertInvariant(
  _name: string,
  telemetry: SimulationTelemetry,
  type: InvariantType,
): { pass: boolean; reason: string } {
  switch (type) {
    case 'PULL': {
      const threshold = telemetry.initialDistance - 25;
      if (telemetry.minDistance < threshold) {
        return {
          pass: true,
          reason: `minDistance=${telemetry.minDistance.toFixed(1)} < ${threshold.toFixed(1)}`,
        };
      }
      return {
        pass: false,
        reason: `minDistance=${telemetry.minDistance.toFixed(1)}, need < ${threshold.toFixed(1)} (initial=${telemetry.initialDistance.toFixed(1)})`,
      };
    }
    case 'PUSH': {
      const threshold = telemetry.initialDistance + 30;
      if (telemetry.maxDistance > threshold) {
        return {
          pass: true,
          reason: `maxDistance=${telemetry.maxDistance.toFixed(1)} > ${threshold.toFixed(1)}`,
        };
      }
      return {
        pass: false,
        reason: `maxDistance=${telemetry.maxDistance.toFixed(1)}, need > ${threshold.toFixed(1)} (initial=${telemetry.initialDistance.toFixed(1)})`,
      };
    }
    case 'HAZARD_DOT': {
      if (telemetry.targetInstabilityDelta >= 15 || telemetry.targetHealthDelta < 0) {
        return {
          pass: true,
          reason: `Δinstability=${telemetry.targetInstabilityDelta.toFixed(1)}, Δhealth=${telemetry.targetHealthDelta.toFixed(1)}`,
        };
      }
      return {
        pass: false,
        reason: `Δinstability=${telemetry.targetInstabilityDelta.toFixed(1)} (need >= 15), Δhealth=${telemetry.targetHealthDelta.toFixed(1)} (need < 0)`,
      };
    }
    case 'ORBIT': {
      if (telemetry.orbitBandFrameCount > 30) {
        return {
          pass: true,
          reason: `orbitBandFrames=${telemetry.orbitBandFrameCount} > 30`,
        };
      }
      return {
        pass: false,
        reason: `orbitBandFrames=${telemetry.orbitBandFrameCount}, need > 30 (dist band [40, 120]px from caster)`,
      };
    }
    case 'OBSTACLE': {
      if (telemetry.obstaclesSpawned > 0) {
        return {
          pass: true,
          reason: `obstaclesSpawned=${telemetry.obstaclesSpawned}`,
        };
      }
      return {
        pass: false,
        reason: `obstaclesSpawned=0, need > 0`,
      };
    }
    case 'RAM': {
      if (telemetry.maxTargetDisplacement >= 40 && telemetry.targetInstabilityDelta >= 15) {
        return {
          pass: true,
          reason: `displacement=${telemetry.maxTargetDisplacement.toFixed(1)}, Δinstab=${telemetry.targetInstabilityDelta.toFixed(1)}`,
        };
      }
      return {
        pass: false,
        reason: `displacement=${telemetry.maxTargetDisplacement.toFixed(1)} (need >= 40), Δinstab=${telemetry.targetInstabilityDelta.toFixed(1)} (need >= 15)`,
      };
    }
  }
}

// ── Canonical benchmark fixtures ────────────────────────────────────────────

const SINGULARITY_DART: AbilitySchema = {
  id: 'bench_singularity_dart',
  name: 'Singularity Dart',
  archetype: 'GRAVITY',
  cooldownMs: 400,
  recoilKick: 0,
  trajectory: { type: 'LINEAR', speed: 900, maxRange: 500 },
  visuals: { ...DEFAULT_VISUALS, color: '#220044' },
  triggers: [
    {
      trigger: 'ON_HIT',
      actions: [
        {
          type: 'APPLY_IMPULSE',
          baseForce: 15000,
          target: 'TARGET',
          directionMode: 'TOWARDS_CASTER',
        },
      ],
    },
  ],
};

const NAPALM_FIELD: AbilitySchema = {
  id: 'bench_napalm_field',
  name: 'Napalm Field',
  archetype: 'FIRE',
  cooldownMs: 1200,
  recoilKick: 40,
  trajectory: { type: 'LINEAR', speed: 600, maxRange: 500 },
  visuals: { ...DEFAULT_VISUALS, color: '#ff6622', trailType: 'MAGMA_SPARKS' },
  triggers: [
    {
      trigger: 'ON_HIT',
      actions: [
        { type: 'ADD_INSTABILITY', amount: 20, target: 'TARGET' },
        {
          type: 'SPAWN_FIELD',
          field: {
            fieldType: 'RADIAL_IMPULSE',
            radius: 100,
            strength: 999,
            durationMs: 3000,
          },
        },
      ],
    },
  ],
};

const ORBITING_HALOS: AbilitySchema = {
  id: 'bench_orbiting_halos',
  name: 'Orbiting Halos',
  archetype: 'GRAVITY',
  cooldownMs: 1500,
  recoilKick: 0,
  visuals: { ...DEFAULT_VISUALS, color: '#aa88ff' },
  triggers: [
    {
      trigger: 'ON_CAST',
      actions: [
        {
          type: 'SPAWN_FIELD',
          field: {
            fieldType: 'MASS_ATTRACTOR',
            radius: 250,
            strength: 6000,
            durationMs: 3000,
            attachToSource: true,
          },
        },
        {
          type: 'SPAWN_FIELD',
          field: {
            fieldType: 'VORTEX_TANGENT',
            radius: 200,
            strength: -4000,
            durationMs: 3000,
            attachToSource: true,
          },
        },
      ],
    },
  ],
};

const DASH_RAM: AbilitySchema = {
  id: 'bench_dash_ram',
  name: 'Dash Ram',
  archetype: 'KINETIC',
  cooldownMs: 800,
  recoilKick: 0,
  visuals: { ...DEFAULT_VISUALS, color: '#ffaa44' },
  triggers: [
    {
      trigger: 'ON_CAST',
      actions: [
        { type: 'TELEPORT', distance: 160 },
        {
          type: 'SPAWN_FIELD',
          field: {
            fieldType: 'RADIAL_IMPULSE',
            radius: 150,
            strength: 15000,
            durationMs: 400,
            attachToSource: true,
          },
        },
      ],
    },
  ],
};

const BODY_RAM_COLLISION: AbilitySchema = {
  id: 'bench_body_ram',
  name: 'Dash Ram (Body Collision)',
  archetype: 'KINETIC',
  cooldownMs: 800,
  recoilKick: 0,
  visuals: { ...DEFAULT_VISUALS, color: '#ffaa44' },
  triggers: [
    {
      trigger: 'ON_CAST',
      actions: [
        {
          type: 'APPLY_IMPULSE',
          target: 'CASTER',
          baseForce: 1200,
          directionMode: 'CUSTOM',
          direction: { x: 1, y: 0 },
        },
      ],
    },
  ],
};

interface BenchmarkCase {
  name: string;
  schema: AbilitySchema;
  invariant: InvariantType;
  targetDistance?: number;
  ticks?: number;
  simOptions?: { casterKinematic?: boolean; casterNoFriction?: boolean; dummyMass?: number };
}

function buildBenchmarkSuite(): BenchmarkCase[] {
  const railgun = sanitizeAbilitySchema(PRESETS['Kinetic Railgun'], 'SECONDARY');
  railgun.recoilKick = 0;
  const onHit = railgun.triggers.find((t) => t.trigger === 'ON_HIT');
  const impulse = onHit?.actions.find((a) => a.type === 'APPLY_IMPULSE');
  if (impulse && impulse.type === 'APPLY_IMPULSE') {
    impulse.baseForce = 15000;
  }

  const iceBarrier = sanitizeAbilitySchema(PRESETS['Ice Barrier'], 'SECONDARY');

  return [
    { name: 'Singularity Dart', schema: SINGULARITY_DART, invariant: 'PULL' },
    { name: 'Kinetic Railgun', schema: railgun, invariant: 'PUSH' },
    { name: 'Napalm Field', schema: NAPALM_FIELD, invariant: 'HAZARD_DOT' },
    { name: 'Ice Barrier', schema: iceBarrier, invariant: 'OBSTACLE' },
    { name: 'Orbiting Halos', schema: ORBITING_HALOS, invariant: 'ORBIT', targetDistance: 120 },
    { name: 'Dash Ram', schema: DASH_RAM, invariant: 'PUSH' },
    {
      name: 'Dash Ram (Body Collision)',
      schema: BODY_RAM_COLLISION,
      invariant: 'RAM',
      targetDistance: 200,
      ticks: 120,
      simOptions: { casterKinematic: false, casterNoFriction: true, dummyMass: 1 },
    },
  ];
}

// ── CLI report ──────────────────────────────────────────────────────────────

function formatTelemetry(t: SimulationTelemetry): string {
  return [
    `dist ${t.initialDistance.toFixed(0)}→${t.finalDistance.toFixed(0)}`,
    `peak ${t.peakTargetSpeed.toFixed(0)}`,
    `Δinstab ${t.targetInstabilityDelta.toFixed(1)}`,
    `Δhp ${t.targetHealthDelta.toFixed(1)}`,
    `fields ${t.fieldTicksApplied}`,
    `obs ${t.obstaclesSpawned}`,
    `orbit ${t.orbitBandFrameCount}`,
  ].join(' | ');
}

function run(): void {
  console.log('test:invariants');
  const suite = buildBenchmarkSuite();
  let passed = 0;

  for (const bench of suite) {
    let telemetry: SimulationTelemetry;
    try {
      telemetry = runHeadlessSimulation(
        bench.schema,
        bench.ticks ?? 60,
        1 / 60,
        bench.targetDistance,
        bench.simOptions,
      );
    } catch (err) {
      console.log(`${RED}[FAIL]${RESET} ${bench.name} (${bench.invariant})`);
      console.log(`  ${DIM}runtime error: ${err}${RESET}`);
      continue;
    }

    const result = assertInvariant(bench.name, telemetry, bench.invariant);
    const tag = result.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;

    console.log(`${tag} ${bench.name} (${bench.invariant})`);
    console.log(`  ${DIM}${result.reason}${RESET}`);
    console.log(`  ${DIM}${formatTelemetry(telemetry)}${RESET}`);

    if (result.pass) passed++;
  }

  console.log('');
  console.log(`${passed}/${suite.length} passed`);

  if (passed < suite.length) {
    process.exit(1);
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('test-physics-invariants.ts') ||
    process.argv[1].includes('test-physics-invariants'));

if (isMain) {
  run();
}
