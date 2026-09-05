import { balanceAbilitySchema, sanitizeAbilitySchema } from '../src/ai/BudgetEngine';
import { PRESETS } from '../src/devtools/Presets';
import { PhysicsWorld } from '../src/engine/PhysicsWorld';
import { resolveBotGroundAimPoint } from '../src/entities/BotController';
import { Dummy } from '../src/entities/Dummy';
import { Obstacle } from '../src/entities/Obstacle';
import { Player } from '../src/entities/Player';
import { Projectile } from '../src/entities/Projectile';
import { SpatialZone } from '../src/entities/SpatialZone';
import { Vector2D } from '../src/math/Vector2D';
import { applyField } from '../src/primitives/Fields';
import { Interpreter } from '../src/primitives/Interpreter';
import { buildBallisticArcPath } from '../src/render/canvas/trajectoryTracer';
import { DEBRIS_MAX_SHARDS, DebrisManager } from '../src/render/canvas/debris';
import type { AbilitySchema, TriggerNode, VisualDescriptor } from '../src/types/schema';

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

const ORBIT_BAND_MIN = 39;
const ORBIT_BAND_MAX = 120;

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
    caster.baseLinearDrag = 0;
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

    if (dist >= ORBIT_BAND_MIN && dist <= ORBIT_BAND_MAX) {
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
      const threshold = telemetry.initialDistance - 23;
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
      if (telemetry.orbitBandFrameCount >= 28) {
        return {
          pass: true,
          reason: `orbitBandFrames=${telemetry.orbitBandFrameCount} >= 28`,
        };
      }
      return {
        pass: false,
        reason: `orbitBandFrames=${telemetry.orbitBandFrameCount}, need >= 28 (dist band [${ORBIT_BAND_MIN}, ${ORBIT_BAND_MAX}]px from caster)`,
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
    { name: 'Orbiting Halos', schema: ORBITING_HALOS, invariant: 'ORBIT', targetDistance: 120, ticks: 90 },
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

const GRAVITY_WELL_CONFIG = {
  fieldType: 'MASS_ATTRACTOR' as const,
  radius: 250,
  strength: 6000,
  durationMs: 5000,
};

function assertOwnerFieldImmunity(): { pass: boolean; reason: string } {
  const dt = 1 / 60;

  const ownWorld = new PhysicsWorld(Vector2D.zero(), 400);
  ownWorld.setViewportBounds(2000, 2000);
  const caster = new Player(new Vector2D(50, 0));
  caster.tags.add('kinematic');
  const allyTarget = new Dummy(new Vector2D(120, 0));
  ownWorld.addPlayer(caster);
  ownWorld.addDummy(allyTarget);
  ownWorld.addZone(new SpatialZone(Vector2D.zero(), GRAVITY_WELL_CONFIG, caster.id, 'GRAVITY'));

  caster.accel = Vector2D.zero();
  allyTarget.accel = Vector2D.zero();
  applyField(ownWorld.zones[0], caster, dt, ownWorld);
  applyField(ownWorld.zones[0], allyTarget, dt, ownWorld);

  const ownWellCasterAccel = caster.accel.mag();
  const ownWellTargetAccel = allyTarget.accel.mag();

  if (ownWellTargetAccel < 1) {
    return { pass: false, reason: 'own well: expected dummy field acceleration' };
  }
  if (ownWellCasterAccel > 0.01) {
    return {
      pass: false,
      reason: `own well: caster should be immune (accel=${ownWellCasterAccel.toFixed(2)})`,
    };
  }

  const enemyWorld = new PhysicsWorld(Vector2D.zero(), 400);
  enemyWorld.setViewportBounds(2000, 2000);
  const victim = new Player(new Vector2D(50, 0));
  const enemy = new Player(new Vector2D(500, 0));
  enemyWorld.addPlayer(victim);
  enemyWorld.addPlayer(enemy);
  enemyWorld.addZone(new SpatialZone(Vector2D.zero(), GRAVITY_WELL_CONFIG, enemy.id, 'GRAVITY'));

  victim.accel = Vector2D.zero();
  applyField(enemyWorld.zones[0], victim, dt, enemyWorld);

  const enemyWellVictimAccel = victim.accel.mag();
  if (enemyWellVictimAccel < 1) {
    return {
      pass: false,
      reason: 'enemy well: expected caster to receive field acceleration',
    };
  }

  return {
    pass: true,
    reason: `own well casterAccel=${ownWellCasterAccel.toFixed(2)} targetAccel=${ownWellTargetAccel.toFixed(0)} | enemy well victimAccel=${enemyWellVictimAccel.toFixed(0)}`,
  };
}

const JUMP_PAD_CONFIG = {
  fieldType: 'RADIAL_IMPULSE' as const,
  radius: 80,
  strength: 300,
  durationMs: 5000,
  verticalForce: 2500,
  zBase: 0,
  zHeight: 80,
};

function assertFieldAffectsFilters(): { pass: boolean; reason: string } {
  const dt = 1 / 60;

  const personalWorld = new PhysicsWorld(Vector2D.zero(), 400);
  personalWorld.setViewportBounds(2000, 2000);
  const caster = new Player(new Vector2D(0, 0));
  const enemy = new Dummy(new Vector2D(0, 0));
  personalWorld.addPlayer(caster);
  personalWorld.addDummy(enemy);
  personalWorld.addZone(
    new SpatialZone(
      Vector2D.zero(),
      { ...JUMP_PAD_CONFIG, affects: 'CASTER_ONLY' },
      caster.id,
      'KINETIC',
    ),
  );

  caster.vz = 0;
  caster.isGrounded = true;
  enemy.vz = 0;
  enemy.isGrounded = true;
  applyField(personalWorld.zones[0], caster, dt, personalWorld);
  applyField(personalWorld.zones[0], enemy, dt, personalWorld);

  if (caster.vz <= 0) {
    return { pass: false, reason: `CASTER_ONLY: expected caster vz>0, got ${caster.vz.toFixed(2)}` };
  }
  if (caster.isGrounded) {
    return { pass: false, reason: 'CASTER_ONLY: expected caster airborne (isGrounded=false)' };
  }
  if (enemy.vz > 0.01) {
    return {
      pass: false,
      reason: `CASTER_ONLY: enemy should be unaffected, vz=${enemy.vz.toFixed(2)}`,
    };
  }

  const defaultWorld = new PhysicsWorld(Vector2D.zero(), 400);
  defaultWorld.setViewportBounds(2000, 2000);
  const owner = new Player(new Vector2D(50, 0));
  const foe = new Dummy(new Vector2D(120, 0));
  defaultWorld.addPlayer(owner);
  defaultWorld.addDummy(foe);
  defaultWorld.addZone(new SpatialZone(Vector2D.zero(), GRAVITY_WELL_CONFIG, owner.id, 'GRAVITY'));

  owner.accel = Vector2D.zero();
  foe.accel = Vector2D.zero();
  applyField(defaultWorld.zones[0], owner, dt, defaultWorld);
  applyField(defaultWorld.zones[0], foe, dt, defaultWorld);

  if (owner.accel.mag() > 0.01) {
    return {
      pass: false,
      reason: `ENEMIES default: caster should be immune (accel=${owner.accel.mag().toFixed(2)})`,
    };
  }
  if (foe.accel.mag() < 1) {
    return { pass: false, reason: 'ENEMIES default: expected enemy field acceleration' };
  }

  return {
    pass: true,
    reason: `CASTER_ONLY casterVz=${caster.vz.toFixed(1)} enemyVz=${enemy.vz.toFixed(2)} | ENEMIES default foeAccel=${foe.accel.mag().toFixed(0)}`,
  };
}

function assertSkyDropBalancePreservesZeroSpeed(): { pass: boolean; reason: string } {
  const schema = balanceAbilitySchema({
    id: 'sky_drop_test',
    name: 'Sky Drop Test',
    cooldownMs: 800,
    trajectory: {
      type: 'BALLISTIC_ARC',
      speed: 0,
      spawnAltitude: 600,
      fallSpeed: 1400,
      maxRange: 500,
    },
    triggers: [],
    visuals: DEFAULT_VISUALS,
  });

  if (schema.trajectory?.speed !== 0) {
    return {
      pass: false,
      reason: `expected speed 0 after balance, got ${schema.trajectory?.speed}`,
    };
  }

  return { pass: true, reason: `sky-drop speed preserved at ${schema.trajectory?.speed}` };
}

function assertObstacleVerticalClearance(): { pass: boolean; reason: string } {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);

  world.addObstacle(
    new Obstacle(new Vector2D(50, 0), {
      shape: 'CIRCLE',
      width: 40,
      height: 40,
      durationMs: 5000,
      clearanceHeight: 40,
    }),
  );

  const triggerMap = new Map<string, TriggerNode[]>();
  const projectile = new Projectile(
    new Vector2D(25, 0),
    { type: 'LINEAR', speed: 800 },
    'caster_stub',
    0,
    triggerMap,
  );
  projectile.z = 60;
  projectile.clearanceHeight = 0;
  projectile.gravityScale = 0;
  projectile.vel = new Vector2D(800, 0);
  world.addProjectile(projectile);

  world.step(1 / 60);

  if (projectile.isDead && projectile.expiryReason === 'wall') {
    return { pass: false, reason: 'projectile died on low wall despite flying above clearance' };
  }

  return {
    pass: true,
    reason: `z=${projectile.z.toFixed(0)} cleared wall (expiry=${projectile.expiryReason ?? 'none'})`,
  };
}

function assertGroundBounceDamping(): { pass: boolean; reason: string } {
  const dt = 1 / 60;
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);

  const triggerMap = new Map<string, TriggerNode[]>();
  const projectile = new Projectile(
    Vector2D.zero(),
    { type: 'LINEAR', speed: 0 },
    'caster_stub',
    0,
    triggerMap,
  );
  projectile.z = 100;
  projectile.vz = 0;
  projectile.gravityScale = 1;
  projectile.bouncesRemaining = 2;
  projectile.groundRestitution = 0.6;
  projectile.groundFriction = 0.25;
  projectile.vel = Vector2D.zero();
  world.addProjectile(projectile);

  let impactSpeed = 0;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (projectile.bounceCount === 1) {
      impactSpeed = Math.sqrt(2 * 1400 * 100);
      break;
    }
  }

  if (projectile.bounceCount !== 1) {
    return { pass: false, reason: 'projectile never bounced' };
  }
  if (projectile.bouncesRemaining !== 1) {
    return {
      pass: false,
      reason: `expected 1 bounce remaining, got ${projectile.bouncesRemaining}`,
    };
  }
  if (projectile.vz <= 0) {
    return { pass: false, reason: `expected reflected vz>0, got ${projectile.vz.toFixed(1)}` };
  }
  if (projectile.vz >= impactSpeed) {
    return {
      pass: false,
      reason: `expected damped bounce (${projectile.vz.toFixed(0)} < ${impactSpeed.toFixed(0)})`,
    };
  }
  if (world.pendingGroundImpacts.length > 0) {
    return { pass: false, reason: 'mid-bounce impact queued ground slam' };
  }

  return {
    pass: true,
    reason: `bounce vz=${projectile.vz.toFixed(0)} < impact≈${impactSpeed.toFixed(0)}, remaining=${projectile.bouncesRemaining}`,
  };
}

function assertGroundSlamAreaTargeting(): { pass: boolean; reason: string } {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);

  const caster = new Player(new Vector2D(0, 0));
  const dummy = new Dummy(new Vector2D(30, 0));
  world.addPlayer(caster);
  world.addDummy(dummy);

  const triggerMap = new Map<string, TriggerNode[]>([
    [
      'ON_GROUND_SLAM',
      [
        {
          trigger: 'ON_GROUND_SLAM',
          actions: [
            {
              type: 'APPLY_STATUS',
              archetype: 'FIRE',
              durationMs: 3000,
              target: 'TARGET',
            },
          ],
        },
      ],
    ],
  ]);

  const projectile = new Projectile(
    Vector2D.zero(),
    { type: 'LINEAR', speed: 0 },
    caster.id,
    0,
    triggerMap,
    1,
    null,
    'slam_test',
    'FIRE',
  );
  projectile.isDead = true;
  projectile.expiryReason = 'ground';
  world.addProjectile(projectile);

  world.pendingGroundImpacts.push({
    entityId: projectile.id,
    pos: Vector2D.zero(),
    vz: 500,
    isProjectile: true,
    archetype: 'FIRE',
  });

  const interpreter = new Interpreter();
  interpreter.processLifecycleEvents(world, 1 / 60);

  if (!dummy.activeStatuses.has('FIRE')) {
    return { pass: false, reason: 'dummy did not receive FIRE status from slam radius' };
  }
  if (caster.activeStatuses.has('FIRE')) {
    return { pass: false, reason: 'caster incorrectly received FIRE status from slam' };
  }

  return { pass: true, reason: 'FIRE applied to dummy only within slam radius' };
}

function assertBallisticArcTrajectorySampling(): { pass: boolean; reason: string } {
  const path = buildBallisticArcPath(
    {
      type: 'BALLISTIC_ARC',
      speed: 320,
      maxRange: 480,
      lobApex: 150,
    },
    { x: 0, y: 0 },
    0,
    0,
  );

  if (path.points.length < 3) {
    return { pass: false, reason: 'expected at least 3 arc samples' };
  }

  const hasAirborne = path.points.some((p) => (p.z ?? 0) > 0);
  if (!hasAirborne) {
    return { pass: false, reason: 'expected airborne z>0 samples along arc' };
  }

  if (path.apexIndex === undefined) {
    return { pass: false, reason: 'missing apex index' };
  }

  let maxZ = -1;
  let maxZIndex = 0;
  for (let i = 0; i < path.points.length; i++) {
    const z = path.points[i].z ?? 0;
    if (z > maxZ) {
      maxZ = z;
      maxZIndex = i;
    }
  }
  if (maxZIndex !== path.apexIndex) {
    return {
      pass: false,
      reason: `apex index ${path.apexIndex} != max-z index ${maxZIndex}`,
    };
  }

  const impact = path.points[path.impactIndex ?? path.points.length - 1];
  if ((impact.z ?? 0) > 0.01) {
    return { pass: false, reason: `terminal impact z=${impact.z?.toFixed(1)} expected ~0` };
  }

  if (!path.groundPoints || path.groundPoints.length !== path.points.length) {
    return {
      pass: false,
      reason: `groundPoints length ${path.groundPoints?.length ?? 0} != points ${path.points.length}`,
    };
  }

  return {
    pass: true,
    reason: `samples=${path.points.length} maxZ=${maxZ.toFixed(0)} apex@${path.apexIndex}`,
  };
}

function assertBotGroundAimPoint(): { pass: boolean; reason: string } {
  const groundAbility: AbilitySchema = {
    id: 'bot_ground_test',
    name: 'Bot Ground Test',
    targetingMode: 'GROUND_POINT',
    maxTargetRange: 550,
    cooldownMs: 1000,
    triggers: [],
    visuals: DEFAULT_VISUALS,
  };

  const botPos = Vector2D.zero();
  const heading = new Vector2D(1, 0);

  const near = resolveBotGroundAimPoint(
    botPos,
    heading,
    new Vector2D(200, 0),
    groundAbility,
  );
  if (!near || near.dist(botPos) < 1 || Math.abs(near.x - 200) > 0.01) {
    return {
      pass: false,
      reason: `expected aim at (200,0), got (${near?.x.toFixed(1)}, ${near?.y.toFixed(1)})`,
    };
  }

  const clampedAbility: AbilitySchema = {
    ...groundAbility,
    maxTargetRange: 400,
  };
  const far = resolveBotGroundAimPoint(
    botPos,
    heading,
    new Vector2D(800, 0),
    clampedAbility,
  );
  if (!far || Math.abs(far.dist(botPos) - 400) > 0.01) {
    return {
      pass: false,
      reason: `expected clamped distance 400, got ${far?.dist(botPos).toFixed(1)}`,
    };
  }

  const directional = resolveBotGroundAimPoint(
    botPos,
    heading,
    new Vector2D(100, 0),
    { ...groundAbility, targetingMode: undefined },
  );
  if (directional !== undefined) {
    return { pass: false, reason: 'non-GROUND_POINT ability should not produce aimPoint' };
  }

  return { pass: true, reason: 'aim at target; clamped to maxTargetRange; skipped for non-ground' };
}

function stepWorldWithLifecycle(world: PhysicsWorld, interp: Interpreter, frames: number): void {
  for (let i = 0; i < frames; i++) {
    world.step(1 / 60);
    interp.processLifecycleEvents(world, 1 / 60);
  }
}

function assertLavaHazardDamageTick(): { pass: boolean; reason: string } {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);
  const interp = new Interpreter();

  const dummy = new Dummy(new Vector2D(800, 0));
  dummy.health = 100;
  dummy.z = 0;
  world.addDummy(dummy);

  stepWorldWithLifecycle(world, interp, 61);

  if (!dummy.inLava) {
    return { pass: false, reason: `expected inLava after off-hex wade, got inLava=${dummy.inLava}` };
  }
  if (dummy.health < 75 || dummy.health > 77) {
    return {
      pass: false,
      reason: `expected ~24 HP loss (health 75-77), got ${dummy.health.toFixed(1)}`,
    };
  }

  return { pass: true, reason: `inLava wading, health=${dummy.health.toFixed(1)} after 1s` };
}

function assertLavaAirborneEdgeRecoveryImmunity(): { pass: boolean; reason: string } {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);
  const interp = new Interpreter();

  const dummy = new Dummy(new Vector2D(800, 0));
  dummy.health = 100;
  dummy.z = 60;
  dummy.vz = 200;
  world.addDummy(dummy);

  stepWorldWithLifecycle(world, interp, 12);

  if (dummy.z <= 0) {
    return { pass: false, reason: `expected airborne z > 0, got z=${dummy.z.toFixed(1)}` };
  }
  if (dummy.inLava) {
    return { pass: false, reason: 'airborne off-hex should not be inLava' };
  }
  if (dummy.health !== 100) {
    return {
      pass: false,
      reason: `expected zero lava damage while airborne, health=${dummy.health.toFixed(1)}`,
    };
  }

  return { pass: true, reason: `z=${dummy.z.toFixed(1)}, no damage while airborne over lava` };
}

function assertLavaPlatformReEntrySafety(): { pass: boolean; reason: string } {
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);
  const interp = new Interpreter();

  const dummy = new Dummy(new Vector2D(800, 0));
  dummy.health = 100;
  dummy.z = 0;
  world.addDummy(dummy);

  stepWorldWithLifecycle(world, interp, 18);
  const healthAfterWade = dummy.health;

  dummy.pos = new Vector2D(0, 0);
  stepWorldWithLifecycle(world, interp, 30);

  if (dummy.inLava) {
    return { pass: false, reason: 'expected inLava=false after re-entering platform' };
  }
  if (dummy.health !== healthAfterWade) {
    return {
      pass: false,
      reason: `health changed after re-entry: ${healthAfterWade.toFixed(1)} -> ${dummy.health.toFixed(1)}`,
    };
  }

  return {
    pass: true,
    reason: `re-entry safe, health stable at ${dummy.health.toFixed(1)}`,
  };
}

function assertDebrisKinematicBounceAndSettling(): { pass: boolean; reason: string } {
  const debris = DebrisManager.getInstance();
  debris.clear();

  let simMs = 0;
  debris.spawnShatterCluster(Vector2D.zero(), 6);
  const shards = debris.getShardsReadonly();

  if (shards.length !== 6) {
    return { pass: false, reason: `expected 6 shards, got ${shards.length}` };
  }
  for (const s of shards) {
    if (s.z <= 0 || s.vz <= 0) {
      return { pass: false, reason: `spawn shard ${s.id} not launched upward (z=${s.z}, vz=${s.vz})` };
    }
  }

  let sawNegativeVz = false;
  for (let i = 0; i < 20; i++) {
    for (const s of shards) {
      if (s.vz < 0) sawNegativeVz = true;
    }
    debris.update(1 / 60, simMs);
    simMs += 1000 / 60;
  }
  if (!sawNegativeVz) {
    return { pass: false, reason: 'expected negative vz during gravity arc' };
  }

  let bounced = false;
  for (let step = 0; step < 120; step++) {
    for (const s of shards) {
      if (s.bouncesRemaining < s.initialBounces) bounced = true;
    }
    debris.update(1 / 60, simMs);
    simMs += 1000 / 60;
    if (shards.every((s) => s.z <= 0)) break;
  }

  if (!shards.every((s) => s.z <= 0)) {
    return { pass: false, reason: 'shards did not reach floor within 120 steps' };
  }
  if (!bounced) {
    return { pass: false, reason: 'no shard recorded a floor bounce' };
  }

  debris.update(4.0, simMs);
  simMs += 4000;
  if (!shards.every((s) => s.settled)) {
    return {
      pass: false,
      reason: `expected all settled after 4s, settled=${shards.filter((s) => s.settled).length}/${shards.length}`,
    };
  }

  const fadeStart = Math.max(...shards.map((s) => s.settledAt)) + 2600;
  const countBeforeFade = debris.getActiveShardCount();
  debris.update(1.0, fadeStart);
  const faded =
    debris.getActiveShardCount() < countBeforeFade || shards.some((s) => s.alpha < 1);
  if (!faded) {
    return { pass: false, reason: 'expected alpha fade after settle hold + 2.6s' };
  }

  debris.clear();
  return { pass: true, reason: 'launch, gravity, bounce, settle, and fade verified' };
}

function assertDebrisPoolCap(): { pass: boolean; reason: string } {
  const debris = DebrisManager.getInstance();
  debris.clear();

  for (let i = 0; i < 10; i++) {
    debris.spawnShatterCluster(Vector2D.zero(), 10);
  }

  const count = debris.getActiveShardCount();
  if (count > DEBRIS_MAX_SHARDS) {
    return { pass: false, reason: `pool exceeded cap: ${count} > ${DEBRIS_MAX_SHARDS}` };
  }

  debris.clear();
  return { pass: true, reason: `${count} active shards capped at ${DEBRIS_MAX_SHARDS}` };
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

  const ownerImmunity = assertOwnerFieldImmunity();
  const ownerTag = ownerImmunity.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${ownerTag} Owner field immunity`);
  console.log(`  ${DIM}${ownerImmunity.reason}${RESET}`);
  if (ownerImmunity.pass) passed++;

  const affectsFilters = assertFieldAffectsFilters();
  const affectsTag = affectsFilters.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${affectsTag} Field affects filters`);
  console.log(`  ${DIM}${affectsFilters.reason}${RESET}`);
  if (affectsFilters.pass) passed++;

  const skyDropBalance = assertSkyDropBalancePreservesZeroSpeed();
  const skyDropTag = skyDropBalance.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${skyDropTag} Sky-drop balance preserves zero speed`);
  console.log(`  ${DIM}${skyDropBalance.reason}${RESET}`);
  if (skyDropBalance.pass) passed++;

  const obstacleClearance = assertObstacleVerticalClearance();
  const obstacleTag = obstacleClearance.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${obstacleTag} Obstacle vertical clearance`);
  console.log(`  ${DIM}${obstacleClearance.reason}${RESET}`);
  if (obstacleClearance.pass) passed++;

  const bounceDamping = assertGroundBounceDamping();
  const bounceTag = bounceDamping.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${bounceTag} Ground bounce damping`);
  console.log(`  ${DIM}${bounceDamping.reason}${RESET}`);
  if (bounceDamping.pass) passed++;

  const slamTargeting = assertGroundSlamAreaTargeting();
  const slamTag = slamTargeting.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${slamTag} Ground slam area targeting`);
  console.log(`  ${DIM}${slamTargeting.reason}${RESET}`);
  if (slamTargeting.pass) passed++;

  const ballisticArc = assertBallisticArcTrajectorySampling();
  const ballisticTag = ballisticArc.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${ballisticTag} Ballistic arc trajectory sampling`);
  console.log(`  ${DIM}${ballisticArc.reason}${RESET}`);
  if (ballisticArc.pass) passed++;

  const botAim = assertBotGroundAimPoint();
  const botAimTag = botAim.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${botAimTag} Bot ground aim point`);
  console.log(`  ${DIM}${botAim.reason}${RESET}`);
  if (botAim.pass) passed++;

  const lavaDamage = assertLavaHazardDamageTick();
  const lavaDamageTag = lavaDamage.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${lavaDamageTag} Lava hazard damage tick`);
  console.log(`  ${DIM}${lavaDamage.reason}${RESET}`);
  if (lavaDamage.pass) passed++;

  const lavaAirborne = assertLavaAirborneEdgeRecoveryImmunity();
  const lavaAirborneTag = lavaAirborne.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${lavaAirborneTag} Lava airborne edge recovery immunity`);
  console.log(`  ${DIM}${lavaAirborne.reason}${RESET}`);
  if (lavaAirborne.pass) passed++;

  const lavaReEntry = assertLavaPlatformReEntrySafety();
  const lavaReEntryTag = lavaReEntry.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${lavaReEntryTag} Lava platform re-entry safety`);
  console.log(`  ${DIM}${lavaReEntry.reason}${RESET}`);
  if (lavaReEntry.pass) passed++;

  const debrisKinematics = assertDebrisKinematicBounceAndSettling();
  const debrisKinematicsTag = debrisKinematics.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${debrisKinematicsTag} Debris kinematic bounce and settling`);
  console.log(`  ${DIM}${debrisKinematics.reason}${RESET}`);
  if (debrisKinematics.pass) passed++;

  const debrisPool = assertDebrisPoolCap();
  const debrisPoolTag = debrisPool.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${debrisPoolTag} Debris pool cap`);
  console.log(`  ${DIM}${debrisPool.reason}${RESET}`);
  if (debrisPool.pass) passed++;

  const totalCases = suite.length + 13;

  console.log('');
  console.log(`${passed}/${totalCases} passed`);

  if (passed < totalCases) {
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
