import { balanceAbilitySchema, clampSchemaValues, sanitizeAbilitySchema } from '../src/ai/BudgetEngine';
import { getStatCatalogEntry } from '../src/ai/budget/modifiers';
import { analyzeSaturation } from '../src/ai/budget/saturation';
import { MAX_EVOLVED_RECOIL } from '../src/ai/budget/constants';
import { resolveEvolutionTree } from '../src/game/EvolutionStore';
import type { EvolutionNode, EvolutionTree } from '../src/types/evolution';
import { scoreAbilitySchema } from '../src/ai/budget/score';
import { sanitizeVisuals } from '../src/ai/budget/sanitize/visuals';
import { repairAbilityPayload } from '../src/ai/synthesizer/llmRepair';
import { PRESETS } from '../src/devtools/Presets';
import { VERTICAL_RECIPES } from '../src/devtools/presetPacks/verticalRecipes';
import {
  getEffectiveFeatureFlags,
  getGraphicsSettings,
  getTierLimits,
  seedEffectiveTierForTests,
} from '../src/devtools/graphicsSettings';
import {
  computeImpactIntensity,
  intensityParticleScale,
  normalizeScopePower,
} from '../src/render/gl/impactIntensity';
import { MAX_ENTITIES, PhysicsWorld } from '../src/engine/PhysicsWorld';
import { HAZARD_CLEARANCE_Z } from '../src/engine/verticalConstants';
import { resolveBotGroundAimPoint } from '../src/entities/BotController';
import { Dummy } from '../src/entities/Dummy';
import { Obstacle } from '../src/entities/Obstacle';
import { Player } from '../src/entities/Player';
import { Projectile } from '../src/entities/Projectile';
import { SpatialZone } from '../src/entities/SpatialZone';
import { Vector2D } from '../src/math/Vector2D';
import { applyField } from '../src/primitives/Fields';
import { Interpreter } from '../src/primitives/Interpreter';
import { HEADLESS_LIFECYCLE_FX } from '../src/primitives/interpreter/lifecycle';
import {
  buildArcLengthTable,
  resolvePathWorldPoints,
  simplifyPath,
} from '../src/primitives/drawnPath';
import { initBallisticKinematics, initDrawnPath, updateTrajectory } from '../src/primitives/Trajectories';
import {
  clearAimingPathCache,
  resolveLiveAimingPaths,
} from '../src/render/canvas/aimingRollout';
import { buildBallisticArcPath } from '../src/render/canvas/trajectoryTracer';
import { BACKGROUND_FRAGMENT_SHADER } from '../src/render/gl/shaders';
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
    interpreter.processLifecycleEvents(world, dt, HEADLESS_LIFECYCLE_FX);

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
  interpreter.processLifecycleEvents(world, 1 / 60, HEADLESS_LIFECYCLE_FX);

  if (!dummy.activeStatuses.has('FIRE')) {
    return { pass: false, reason: 'dummy did not receive FIRE status from slam radius' };
  }
  if (caster.activeStatuses.has('FIRE')) {
    return { pass: false, reason: 'caster incorrectly received FIRE status from slam' };
  }

  return { pass: true, reason: 'FIRE applied to dummy only within slam radius' };
}

const FROST_FIELD_CONFIG = {
  fieldType: 'FRICTION_OVERRIDE' as const,
  radius: 60,
  strength: 0,
  durationMs: 5000,
  frictionValue: 0.02,
  zBase: 0,
  zHeight: 80,
};

function assertFieldStatusApplicationAndAirborneClearance(): { pass: boolean; reason: string } {
  const dt = 1 / 60;
  const stepMs = 400;

  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);
  world.airborneCount = 1;

  const caster = new Player(new Vector2D(0, 0));
  const dummy = new Dummy(new Vector2D(0, 0));
  world.addPlayer(caster);
  world.addDummy(dummy);

  const zone = new SpatialZone(Vector2D.zero(), FROST_FIELD_CONFIG, caster.id, 'FROST');
  zone.affects = 'ENEMIES';
  world.addZone(zone);

  const stepField = (entity: typeof dummy, ms: number): void => {
    const n = Math.ceil(ms / (dt * 1000));
    for (let i = 0; i < n; i++) {
      applyField(zone, entity, dt, world);
    }
  };

  stepField(dummy, stepMs);
  if (!dummy.activeStatuses.has('FROST')) {
    return { pass: false, reason: 'grounded enemy at center did not receive FROST status' };
  }
  if (caster.activeStatuses.has('FROST')) {
    return { pass: false, reason: 'caster incorrectly received FROST from ENEMIES zone' };
  }

  dummy.activeStatuses.clear();
  dummy.z = HAZARD_CLEARANCE_Z + 48;
  dummy.isGrounded = false;
  stepField(dummy, stepMs);
  if (dummy.activeStatuses.has('FROST')) {
    return {
      pass: false,
      reason: `airborne dummy at z=${dummy.z} should not receive FROST (clearance=${HAZARD_CLEARANCE_Z})`,
    };
  }

  dummy.activeStatuses.clear();
  dummy.pos = new Vector2D(55, 0);
  dummy.z = 0;
  dummy.isGrounded = true;
  stepField(dummy, stepMs);
  if (dummy.activeStatuses.has('FROST')) {
    return {
      pass: false,
      reason: 'dummy in outer rim deadband (falloff < 0.15) should not receive FROST',
    };
  }

  return {
    pass: true,
    reason: 'FROST applied to grounded center enemy; owner, airborne, and rim cases blocked',
  };
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

/**
 * Phase 1 RC-1 gate: cluster mortar ballistic types must survive repairAbilityPayload
 * (and the subsequent sanitize/balance path without hostile flavor). Structure survival
 * under evolved flavor containing ring/burst/self is Phase 3
 * (assertClusterMortarStructureSurvives).
 */
function assertClusterMortarTrajectorySurvives(): { pass: boolean; reason: string } {
  const source = VERTICAL_RECIPES.clusterMortar;
  const corrupted = JSON.parse(JSON.stringify(source)) as AbilitySchema;

  // Simulate the common LLM failure: LINEAR + ballistic fields still present.
  if (corrupted.trajectory) {
    corrupted.trajectory = { ...corrupted.trajectory, type: 'LINEAR' };
  }
  const apex = corrupted.triggers.find((t) => t.trigger === 'ON_AIR_APEX');
  const spawn = apex?.actions.find((a) => a.type === 'SPAWN_PROJECTILE');
  if (spawn && spawn.type === 'SPAWN_PROJECTILE' && spawn.projectileTrajectory) {
    spawn.projectileTrajectory = {
      ...spawn.projectileTrajectory,
      type: 'LINEAR',
    };
  }

  const repaired = repairAbilityPayload(corrupted) as AbilitySchema;
  const sanitized = sanitizeAbilitySchema(repaired, 'SECONDARY');
  const balanced = balanceAbilitySchema(sanitized);

  if (balanced.trajectory?.type !== 'BALLISTIC_ARC') {
    return {
      pass: false,
      reason: `root trajectory.type=${balanced.trajectory?.type ?? 'undefined'} expected BALLISTIC_ARC`,
    };
  }

  const apexOut = balanced.triggers.find((t) => t.trigger === 'ON_AIR_APEX');
  if (!apexOut) {
    return { pass: false, reason: 'ON_AIR_APEX node missing after pipeline' };
  }

  const childSpawn = apexOut.actions.find((a) => a.type === 'SPAWN_PROJECTILE');
  if (!childSpawn || childSpawn.type !== 'SPAWN_PROJECTILE') {
    return { pass: false, reason: 'ON_AIR_APEX SPAWN_PROJECTILE missing after pipeline' };
  }

  if (childSpawn.projectileTrajectory?.type !== 'BALLISTIC_ARC') {
    return {
      pass: false,
      reason: `child trajectory.type=${childSpawn.projectileTrajectory?.type ?? 'undefined'} expected BALLISTIC_ARC`,
    };
  }

  const childBounces = childSpawn.projectileTrajectory?.bounces ?? 0;
  if (childBounces < 1) {
    return {
      pass: false,
      reason: `child bounces=${childBounces} expected >= 1`,
    };
  }

  return {
    pass: true,
    reason: `root+child BALLISTIC_ARC recovered; child bounces=${childBounces}`,
  };
}

function schemaHasCasterOnlyField(schema: AbilitySchema): boolean {
  const walk = (nodes: TriggerNode[]): boolean => {
    for (const node of nodes) {
      for (const action of node.actions) {
        if (action.type === 'SPAWN_FIELD' && action.field.affects === 'CASTER_ONLY') {
          return true;
        }
        if (action.type === 'SPAWN_PROJECTILE' && action.triggers && walk(action.triggers)) {
          return true;
        }
        if (action.type === 'CAST_CHILD_PAYLOAD' && walk(action.payload.triggers ?? [])) {
          return true;
        }
        if (action.type === 'SPAWN_ACTOR' && action.actor.triggers && walk(action.actor.triggers)) {
          return true;
        }
      }
      if (node.children && walk(node.children)) return true;
    }
    return false;
  };
  return walk(schema.triggers);
}

/**
 * Phase 3 EVOLUTION gate: hostile flavor must not destroy cluster mortar structure.
 */
function assertClusterMortarStructureSurvives(): { pass: boolean; reason: string } {
  const source = JSON.parse(JSON.stringify(VERTICAL_RECIPES.clusterMortar)) as AbilitySchema;
  source.tagline = 'A ring of burst bomblets for self-defense';
  source.description =
    'Lobs a shell that splits in a ring at apex; self-igniting bomblets bounce and burst on impact.';

  const flavorText = `${source.tagline} ${source.description}`;
  const repaired = repairAbilityPayload(source, flavorText) as AbilitySchema;
  const sanitized = sanitizeAbilitySchema(repaired, 'SECONDARY', 0, flavorText);
  const balanced = balanceAbilitySchema(sanitized);

  if (balanced.trajectory?.type !== 'BALLISTIC_ARC') {
    return {
      pass: false,
      reason: `root trajectory.type=${balanced.trajectory?.type ?? 'undefined'} expected BALLISTIC_ARC`,
    };
  }

  const apexOut = balanced.triggers.find((t) => t.trigger === 'ON_AIR_APEX');
  if (!apexOut) {
    return { pass: false, reason: 'ON_AIR_APEX node missing after EVOLUTION sanitize' };
  }

  const childSpawn = apexOut.actions.find((a) => a.type === 'SPAWN_PROJECTILE');
  if (!childSpawn || childSpawn.type !== 'SPAWN_PROJECTILE') {
    return { pass: false, reason: 'ON_AIR_APEX SPAWN_PROJECTILE missing after EVOLUTION sanitize' };
  }

  const childBounces = childSpawn.projectileTrajectory?.bounces ?? 0;
  if (childBounces < 1) {
    return {
      pass: false,
      reason: `child bounces=${childBounces} expected >= 1`,
    };
  }

  if (schemaHasCasterOnlyField(balanced)) {
    return {
      pass: false,
      reason: 'SPAWN_FIELD forced to CASTER_ONLY by personal-field repair',
    };
  }

  return {
    pass: true,
    reason: `structure preserved under ring/burst/self flavor; child bounces=${childBounces}`,
  };
}

/**
 * Phase 4 — vertical kinematics compose with non-BALLISTIC planar types.
 * HOMING_SLERP + lobApex + bounces must arc, fire apex, and bounce.
 */
function assertHomingBallisticComposition(): { pass: boolean; reason: string } {
  const dt = 1 / 60;
  const world = new PhysicsWorld(Vector2D.zero(), 800);
  world.setViewportBounds(4000, 4000);

  const caster = new Player(new Vector2D(0, 0));
  world.addPlayer(caster);
  const target = new Dummy(new Vector2D(500, 0));
  world.addDummy(target);

  const trajectory = {
    type: 'HOMING_SLERP' as const,
    speed: 320,
    maxRange: 2500,
    turnAccel: 500,
    lobApex: 120,
    bounces: 2,
  };

  const projectile = new Projectile(
    caster.pos.clone(),
    trajectory,
    caster.id,
    0,
    new Map<string, TriggerNode[]>(),
  );
  initBallisticKinematics(projectile, trajectory);
  world.addProjectile(projectile);

  const interpreter = new Interpreter();
  let apexQueued = 0;
  let maxZ = 0;

  for (let i = 0; i < 360; i++) {
    interpreter.updateTrajectories(world, dt);
    if (world.pendingApexEvents.includes(projectile)) {
      apexQueued += 1;
    }
    world.step(dt);
    interpreter.processLifecycleEvents(world, dt, HEADLESS_LIFECYCLE_FX);
    maxZ = Math.max(maxZ, projectile.z);
    if (apexQueued >= 1 && projectile.bounceCount >= 1 && maxZ >= 60) {
      break;
    }
  }

  if (maxZ < 60) {
    return { pass: false, reason: `never arced vertically (maxZ=${maxZ.toFixed(1)})` };
  }
  if (apexQueued < 1) {
    return { pass: false, reason: `ON_AIR_APEX never queued (maxZ=${maxZ.toFixed(1)})` };
  }
  if (projectile.bounceCount < 1) {
    return {
      pass: false,
      reason: `expected bounce, got bounceCount=${projectile.bounceCount} (maxZ=${maxZ.toFixed(1)})`,
    };
  }

  return {
    pass: true,
    reason: `HOMING_SLERP maxZ=${maxZ.toFixed(0)} apexQueued=${apexQueued} bounces=${projectile.bounceCount}`,
  };
}

/**
 * Phase 5 — ON_RAM fires once per contact for the rammer only (Q10: no arming).
 */
function serializePredictivePaths(paths: ReturnType<typeof resolveLiveAimingPaths>): string {
  return JSON.stringify(
    paths.map((p) => ({
      type: p.trajectoryType,
      points: p.points,
      apexIndex: p.apexIndex,
      impactIndex: p.impactIndex,
    })),
  );
}

/**
 * Phase 6 — rollout aiming shows cluster splits and bounces; cache is deterministic.
 */
/**
 * Phase 7 — PLAY_VFX is zero budget cost; impactLayers survive sanitize.
 */
/**
 * Phase 8 — derived impact intensity is monotonic with spell scope and never saturates.
 */
/**
 * Phase 9 — 90° arc hits front, not behind; full circle matches omitted arcDeg.
 */
function assertAngularHitRegions(): { pass: boolean; reason: string } {
  const dt = 1 / 60;
  const makeWorld = (arcDeg?: number) => {
    const world = new PhysicsWorld(Vector2D.zero(), 800);
    world.setViewportBounds(4000, 4000);
    const caster = new Player(new Vector2D(0, 0));
    caster.facingAngle = 0; // +X
    world.addPlayer(caster);
    const front = new Dummy(new Vector2D(60, 0));
    const behind = new Dummy(new Vector2D(-60, 0));
    world.addDummy(front);
    world.addDummy(behind);

    const config = {
      fieldType: 'RADIAL_IMPULSE' as const,
      radius: 100,
      strength: 800,
      durationMs: 500,
      arcDeg,
      arcFacing: 'CASTER_FACING' as const,
      attachToSource: true,
    };
    const zone = new SpatialZone(caster.pos.clone(), config, caster.id, 'KINETIC');
    zone.parentRef = caster;
    zone.offset = Vector2D.zero();
    zone.castHeading = Vector2D.fromAngle(0);
    world.addZone(zone);

    front.vel = Vector2D.zero();
    behind.vel = Vector2D.zero();
    front.accel = Vector2D.zero();
    behind.accel = Vector2D.zero();

    applyField(zone, front, dt, world);
    applyField(zone, behind, dt, world);

    return {
      frontAccel: front.accel.mag(),
      behindAccel: behind.accel.mag(),
    };
  };

  const arc = makeWorld(90);
  if (!(arc.frontAccel > 1)) {
    return { pass: false, reason: `90° arc did not hit front (accel=${arc.frontAccel.toFixed(2)})` };
  }
  if (!(arc.behindAccel < 0.01)) {
    return {
      pass: false,
      reason: `90° arc hit behind unexpectedly (accel=${arc.behindAccel.toFixed(2)})`,
    };
  }

  const full = makeWorld(360);
  const omitted = makeWorld(undefined);
  const eps = 0.5;
  if (Math.abs(full.frontAccel - omitted.frontAccel) > eps) {
    return {
      pass: false,
      reason: `360 vs omitted front mismatch ${full.frontAccel.toFixed(2)} vs ${omitted.frontAccel.toFixed(2)}`,
    };
  }
  if (Math.abs(full.behindAccel - omitted.behindAccel) > eps) {
    return {
      pass: false,
      reason: `360 vs omitted behind mismatch ${full.behindAccel.toFixed(2)} vs ${omitted.behindAccel.toFixed(2)}`,
    };
  }
  if (!(full.behindAccel > 1 && omitted.behindAccel > 1)) {
    return { pass: false, reason: 'full circle should affect behind target' };
  }

  return {
    pass: true,
    reason: `arc front=${arc.frontAccel.toFixed(0)} behind=${arc.behindAccel.toFixed(0)}; full behind=${full.behindAccel.toFixed(0)}`,
  };
}

function assertDerivedImpactIntensity(): { pass: boolean; reason: string } {
  seedEffectiveTierForTests('LOW');
  const runtime = {
    instabilityDelta: 20,
    projectileSpeed: 500,
    plasmaDetonated: false,
  };

  const basicPrimary: AbilitySchema = {
    id: 'test_intensity_primary',
    name: 'Basic Bolt',
    cooldownMs: 800,
    recoilKick: 20,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 300 },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [{ type: 'ADD_INSTABILITY', amount: 8, target: 'TARGET' }],
      },
    ],
  };

  const nestedUltimate: AbilitySchema = {
    id: 'test_intensity_ultimate',
    name: 'Nested Barrage',
    cooldownMs: 8000,
    recoilKick: 200,
    trajectory: { type: 'LINEAR', speed: 500, maxRange: 700 },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          { type: 'ADD_INSTABILITY', amount: 40, target: 'TARGET' },
          {
            type: 'APPLY_IMPULSE',
            baseForce: 900,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
      {
        trigger: 'ON_EXPIRY',
        actions: [
          {
            type: 'CAST_CHILD_PAYLOAD',
            maxRecursionDepth: 2,
            payload: {
              id: 'test_intensity_child',
              name: 'Barrage Child',
              cooldownMs: 0,
              recoilKick: 0,
              triggers: [
                {
                  trigger: 'ON_CAST',
                  actions: [
                    {
                      type: 'SPAWN_PROJECTILE',
                      projectileTrajectory: {
                        type: 'LINEAR',
                        speed: 400,
                        maxRange: 400,
                      },
                      emitter: { count: 8, spreadDeg: 90, distribution: 'FAN' },
                      triggers: [
                        {
                          trigger: 'ON_HIT',
                          actions: [
                            {
                              type: 'SPAWN_FIELD',
                              field: {
                                fieldType: 'RADIAL_IMPULSE',
                                radius: 80,
                                strength: 600,
                                durationMs: 400,
                              },
                            },
                            {
                              type: 'ADD_INSTABILITY',
                              amount: 20,
                              target: 'TARGET',
                            },
                          ],
                        },
                      ],
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

  const primaryScope = normalizeScopePower(basicPrimary, 'PRIMARY');
  const ultimateScope = normalizeScopePower(nestedUltimate, 'ULTIMATE');
  const primaryI = computeImpactIntensity(primaryScope, runtime);
  const ultimateI = computeImpactIntensity(ultimateScope, runtime);

  if (!(ultimateScope > primaryScope)) {
    return {
      pass: false,
      reason: `scope not monotonic: ultimate ${ultimateScope.toFixed(3)} vs primary ${primaryScope.toFixed(3)}`,
    };
  }
  if (!(ultimateI > primaryI)) {
    return {
      pass: false,
      reason: `expected ultimate intensity ${ultimateI.toFixed(3)} > primary ${primaryI.toFixed(3)}`,
    };
  }

  const lowBudget = getTierLimits().particleBudget;
  const primaryScale = intensityParticleScale(primaryI, 1);
  const ultimateScale = intensityParticleScale(ultimateI, 1);
  // Scales are multipliers (~0.25..1+), not particle counts — both must stay modest on LOW.
  if (primaryScale > 2 || ultimateScale > 2) {
    return {
      pass: false,
      reason: `particle scale too high for LOW tier (${primaryScale.toFixed(2)}/${ultimateScale.toFixed(2)}, budget=${lowBudget})`,
    };
  }

  let saturated: string | null = null;
  for (const [name, schema] of Object.entries(PRESETS)) {
    const scope = normalizeScopePower(schema, 'ULTIMATE');
    const intensity = computeImpactIntensity(scope, {
      instabilityDelta: 80,
      projectileSpeed: 2000,
      plasmaDetonated: true,
      closingSpeed: 1000,
    });
    if (intensity >= 1) {
      saturated = name;
      break;
    }
  }
  if (saturated) {
    return { pass: false, reason: `intensity saturated to 1.0 for preset ${saturated}` };
  }

  return {
    pass: true,
    reason: `primary=${primaryI.toFixed(3)} ultimate=${ultimateI.toFixed(3)} scopes ${primaryScope.toFixed(2)}/${ultimateScope.toFixed(2)}`,
  };
}

function assertPlayVfxZeroBudgetAndLayers(): { pass: boolean; reason: string } {
  const base: AbilitySchema = {
    id: 'test_play_vfx_base',
    name: 'Vfx Base',
    cooldownMs: 2000,
    recoilKick: 0,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 400 },
    triggers: [],
  };
  const withPlayVfx: AbilitySchema = {
    ...base,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [{ type: 'PLAY_VFX', vfx: 'MINI_NUKE' }],
      },
    ],
  };
  const baseScore = scoreAbilitySchema(base);
  const withScore = scoreAbilitySchema(withPlayVfx);
  if (baseScore !== withScore) {
    return {
      pass: false,
      reason: `PLAY_VFX changed score ${baseScore} -> ${withScore}`,
    };
  }

  const visuals = sanitizeVisuals({
    color: '#ff4400',
    size: 12,
    projectileStyle: 'DISC',
    trailType: 'NONE',
    impactVfx: 'SPARKS',
    impactLayers: [
      {
        kind: 'RING',
        size: 40,
        lifetime: 0.4,
        colorRef: 'PRIMARY',
        layer: 'CORE',
      },
      {
        kind: 'SPARKS',
        count: 12,
        size: 8,
        lifetime: 0.3,
        colorRef: 'SECONDARY',
        layer: 'PRIMARY',
      },
    ],
  });
  if (!visuals.impactLayers || visuals.impactLayers.length < 2) {
    return { pass: false, reason: 'impactLayers stripped by sanitize' };
  }

  return {
    pass: true,
    reason: `score=${baseScore} layers=${visuals.impactLayers.length}`,
  };
}

function assertClusterMortarAimingRollout(): { pass: boolean; reason: string } {
  clearAimingPathCache();
  const ability = VERTICAL_RECIPES.clusterMortar;
  const origin = { x: 0, y: 0 };
  const aimAngle = -Math.PI / 4;

  // Warm JIT / module paths so "cold" measures uncached physics, not first-load noise.
  resolveLiveAimingPaths(ability, origin, aimAngle + Math.PI / 90, 28, 0);
  clearAimingPathCache();

  const t0 = performance.now();
  const pathsA = resolveLiveAimingPaths(ability, origin, aimAngle, 28, 0);
  const coldMs = performance.now() - t0;

  const t1 = performance.now();
  const pathsB = resolveLiveAimingPaths(ability, origin, aimAngle, 28, 0);
  const cachedMs = performance.now() - t1;

  if (pathsA.length < 2) {
    return {
      pass: false,
      reason: `expected >= 2 projectile groups, got ${pathsA.length}`,
    };
  }

  const hasBounceMarker = pathsA.some(
    (p) =>
      p.points.some((pt) => pt.isImpact) ||
      (p.impactIndex !== undefined && p.impactIndex > 0),
  );
  if (!hasBounceMarker) {
    return { pass: false, reason: 'no bounce/impact marker on child paths' };
  }

  const serializedA = serializePredictivePaths(pathsA);
  const serializedB = serializePredictivePaths(pathsB);
  if (serializedA !== serializedB) {
    return { pass: false, reason: 'cached rollout paths differ from first generation' };
  }

  if (cachedMs > 2) {
    return {
      pass: false,
      reason: `cached rollout took ${cachedMs.toFixed(2)}ms (limit 2ms)`,
    };
  }
  if (coldMs > 40) {
    return {
      pass: false,
      reason: `cold rollout took ${coldMs.toFixed(2)}ms (stop-if 40ms)`,
    };
  }

  return {
    pass: true,
    reason: `paths=${pathsA.length} bounce=yes cache=${cachedMs.toFixed(2)}ms cold=${coldMs.toFixed(2)}ms`,
  };
}

function assertOnRamDispatchesOnce(): { pass: boolean; reason: string } {
  const dt = 1 / 60;
  const world = new PhysicsWorld(Vector2D.zero(), 800);
  world.setViewportBounds(4000, 4000);

  const ramAbility: AbilitySchema = {
    id: 'bench_on_ram',
    name: 'Shoulder Charge',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    visuals: { ...DEFAULT_VISUALS, color: '#ff8866' },
    triggers: [
      {
        trigger: 'ON_RAM',
        actions: [
          {
            type: 'SPAWN_OBSTACLE',
            obstacle: {
              shape: 'CIRCLE',
              width: 32,
              height: 32,
              durationMs: 2000,
              isDestructible: true,
            },
            target: 'CASTER',
          },
        ],
      },
    ],
  };

  const caster = new Player(new Vector2D(0, 0));
  const target = new Player(new Vector2D(38, 0));
  caster.setAbility(0, ramAbility);
  // Target also holds ON_RAM — must not dispatch for the target.
  target.setAbility(0, ramAbility);
  caster.vel = new Vector2D(500, 0);
  target.vel = Vector2D.zero();
  caster.prevPos = caster.pos.sub(caster.vel.scale(dt));
  target.prevPos = target.pos.clone();
  world.addPlayer(caster);
  world.addPlayer(target);

  const interpreter = new Interpreter();
  let queuedRamEvents = 0;

  for (let i = 0; i < 45; i++) {
    world.step(dt);
    queuedRamEvents += world.pendingRamEvents.length;
    interpreter.processLifecycleEvents(world, dt, HEADLESS_LIFECYCLE_FX);
  }

  const obstacles = world.obstacles.filter((o) => !o.isDead).length;

  if (queuedRamEvents !== 1) {
    return {
      pass: false,
      reason: `expected 1 pendingRamEvent over contact, got ${queuedRamEvents}`,
    };
  }
  if (obstacles !== 1) {
    return {
      pass: false,
      reason: `expected 1 obstacle from rammer ON_RAM (not target), got ${obstacles}`,
    };
  }

  return {
    pass: true,
    reason: `ON_RAM once: events=${queuedRamEvents} obstacles=${obstacles}`,
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
    interp.processLifecycleEvents(world, 1 / 60, HEADLESS_LIFECYCLE_FX);
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

function assertLavaShaderTectonicPrototype(): { pass: boolean; reason: string } {
  const src = BACKGROUND_FRAGMENT_SHADER;
  const match = src.match(/vec3 lavaLayer\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  if (!match) {
    return { pass: false, reason: 'lavaLayer function not found in BACKGROUND_FRAGMENT_SHADER' };
  }

  const body = match[1];
  const paletteTokens = [
    'cBasaltCharcoal',
    'cBasaltWarm',
    'cMagmaDull',
    'cMagmaHot',
    'cFissureCore',
    'rockGrain',
  ] as const;
  for (const token of paletteTokens) {
    if (!src.includes(token)) {
      return { pass: false, reason: `missing basalt palette token: ${token}` };
    }
  }
  if (src.includes('cWhiteHot')) {
    return { pass: false, reason: 'cWhiteHot should be removed (overdriven bloom highlight)' };
  }
  const warpMatch = body.match(/\(warp - 0\.5\) \* ([\d.]+)/);
  if (!warpMatch) {
    return { pass: false, reason: 'missing damped warp multiplier in lavaLayer' };
  }
  const warpFactor = parseFloat(warpMatch[1]);
  if (!Number.isFinite(warpFactor) || warpFactor > 0.5) {
    return { pass: false, reason: `warp factor too large: ${warpMatch[1]} (max 0.5)` };
  }
  const fissureMatch = body.match(/pow\(clamp\(ridge, 0\.0, 1\.0\), ([\d.]+)\)/);
  if (!fissureMatch) {
    return { pass: false, reason: 'missing fissure ridge exponent in lavaLayer' };
  }
  const fissureExponent = parseFloat(fissureMatch[1]);
  if (!Number.isFinite(fissureExponent) || fissureExponent < 10.0) {
    return { pass: false, reason: `fissure exponent too soft: ${fissureMatch[1]} (min 10.0)` };
  }
  if (!src.includes('hexSdf')) {
    return { pass: false, reason: 'missing hexSdf helper for rim glow and arena fade' };
  }
  if (!src.includes('u_initialRadius')) {
    return { pass: false, reason: 'missing u_initialRadius uniform for shrink-stable fade' };
  }
  if (body.includes('u_parallaxLava') || body.includes('parallaxPos')) {
    return { pass: false, reason: 'lavaLayer still references parallax uniforms or parallaxPos' };
  }
  if (!body.includes('world - u_hexCenter')) {
    return { pass: false, reason: 'lavaLayer must derive base coords from (world - u_hexCenter)' };
  }
  if ('bgParallaxLava' in getGraphicsSettings()) {
    return { pass: false, reason: 'bgParallaxLava should be removed from GraphicsSettings' };
  }

  return { pass: true, reason: 'Basalt tectonic lava shader with damped warp, narrow fissures, and no bgParallaxLava' };
}

function assertClusterMortarStructure(schema: AbilitySchema): { pass: boolean; reason: string } {
  const apexOut = schema.triggers.find((t) => t.trigger === 'ON_AIR_APEX');
  if (!apexOut) {
    return { pass: false, reason: 'ON_AIR_APEX node missing' };
  }

  const childSpawn = apexOut.actions.find((a) => a.type === 'SPAWN_PROJECTILE');
  if (!childSpawn || childSpawn.type !== 'SPAWN_PROJECTILE') {
    return { pass: false, reason: 'ON_AIR_APEX SPAWN_PROJECTILE missing' };
  }

  if (childSpawn.projectileTrajectory?.type !== 'BALLISTIC_ARC') {
    return {
      pass: false,
      reason: `child trajectory.type=${childSpawn.projectileTrajectory?.type ?? 'undefined'} expected BALLISTIC_ARC`,
    };
  }

  if (schema.trajectory?.type !== 'BALLISTIC_ARC') {
    return {
      pass: false,
      reason: `root trajectory.type=${schema.trajectory?.type ?? 'undefined'} expected BALLISTIC_ARC`,
    };
  }

  return { pass: true, reason: 'cluster mortar structure intact' };
}

function buildEvolutionTree(
  baseSchema: AbilitySchema,
  catalogIds: string[],
): EvolutionTree {
  const tree: EvolutionTree = {
    version: 1,
    rootSpellId: baseSchema.id,
    baseSchema: structuredClone(baseSchema),
    nodes: [],
    activePath: [],
  };

  let parentId: string | null = null;
  for (let i = 0; i < catalogIds.length; i++) {
    const entry = getStatCatalogEntry(catalogIds[i]);
    if (!entry) {
      throw new Error(`Missing stat catalog entry: ${catalogIds[i]}`);
    }
    const node: EvolutionNode = {
      id: `evo-tier-${i + 1}`,
      parentId,
      tier: i + 1,
      kind: 'STAT',
      label: entry.label,
      modifiers: structuredClone(entry.modifiers),
    };
    tree.nodes.push(node);
    tree.activePath.push(node.id);
    parentId = node.id;
  }

  return tree;
}

function assertDrawnPathFollowing(): { pass: boolean; reason: string } {
  const dt = 1 / 60;
  const speed = 300;
  const world = new PhysicsWorld(Vector2D.zero(), 800);
  world.setViewportBounds(4000, 4000);

  const densePath = {
    type: 'DRAWN_PATH' as const,
    speed,
    maxRange: 2000,
    pathSpace: 'CASTER_RELATIVE' as const,
    pathPoints: Array.from({ length: 40 }, (_, i) => ({
      x: i * 5,
      y: Math.sin(i * 0.4) * 12,
    })),
  };
  const sparsePath = {
    ...densePath,
    pathPoints: [
      { x: 0, y: 0 },
      { x: 120, y: 30 },
      { x: 240, y: -20 },
      { x: 360, y: 0 },
    ],
  };

  for (const trajectory of [densePath, sparsePath]) {
    const spawnPos = Vector2D.create(100, 50);
    const aimAngle = Math.PI / 6;
    const projectile = new Projectile(
      spawnPos.clone(),
      trajectory,
      'caster_stub',
      aimAngle,
      new Map<string, TriggerNode[]>(),
    );
    initDrawnPath(projectile, trajectory, spawnPos, aimAngle);

    for (let i = 0; i < 90; i++) {
      if (projectile.isDead) break;
      const prev = projectile.pos.clone();
      updateTrajectory(projectile, dt, world);
      if (projectile.isDead) break;
      const step = projectile.pos.sub(prev).mag();
      const expected = speed * dt;
      if (Math.abs(step - expected) > expected * 0.08 + 0.5) {
        return {
          pass: false,
          reason: `constant-speed drift ${step.toFixed(2)} vs ${expected.toFixed(2)} (${trajectory.pathPoints.length} pts)`,
        };
      }
    }
  }

  const fidelityTrajectory = {
    type: 'DRAWN_PATH' as const,
    speed,
    maxRange: 2000,
    pathSpace: 'CASTER_RELATIVE' as const,
    pathPoints: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 80 },
      { x: 300, y: 80 },
    ],
  };
  const fidelitySpawn = Vector2D.zero();
  const fidelityWorld = resolvePathWorldPoints(fidelityTrajectory, fidelitySpawn, 0);
  const fidelityProj = new Projectile(
    fidelitySpawn.clone(),
    fidelityTrajectory,
    'caster_stub',
    0,
    new Map<string, TriggerNode[]>(),
  );
  initDrawnPath(fidelityProj, fidelityTrajectory, fidelitySpawn, 0);

  let nextCheckpoint = 1;
  for (let i = 0; i < 240 && !fidelityProj.isDead && nextCheckpoint < fidelityWorld.length; i++) {
    updateTrajectory(fidelityProj, dt, world);
    const target = fidelityWorld[nextCheckpoint];
    if (fidelityProj.pos.dist(target) <= 10) {
      nextCheckpoint++;
    }
  }
  if (nextCheckpoint < fidelityWorld.length) {
    return {
      pass: false,
      reason: `path fidelity missed checkpoint ${nextCheckpoint}/${fidelityWorld.length - 1}`,
    };
  }

  const basePath = fidelityTrajectory.pathPoints;
  const world0 = resolvePathWorldPoints(
    { ...fidelityTrajectory, pathPoints: basePath },
    Vector2D.zero(),
    0,
  );
  const world90 = resolvePathWorldPoints(
    { ...fidelityTrajectory, pathPoints: basePath },
    Vector2D.zero(),
    Math.PI / 2,
  );
  for (let i = 0; i < world0.length; i++) {
    const rotated = world0[i].rotate(Math.PI / 2);
    if (rotated.dist(world90[i]) > 0.5) {
      return {
        pass: false,
        reason: `rotation mismatch at point ${i}: ${rotated.dist(world90[i]).toFixed(2)}`,
      };
    }
  }

  const shortRangeTrajectory = {
    ...fidelityTrajectory,
    maxRange: 120,
  };
  const shortProj = new Projectile(
    fidelitySpawn.clone(),
    shortRangeTrajectory,
    'caster_stub',
    0,
    new Map<string, TriggerNode[]>(),
  );
  initDrawnPath(shortProj, shortRangeTrajectory, fidelitySpawn, 0);
  for (let i = 0; i < 120 && !shortProj.isDead; i++) {
    updateTrajectory(shortProj, dt, world);
  }
  if (!shortProj.isDead || shortProj.expiryReason !== 'range') {
    return {
      pass: false,
      reason: `short maxRange expected range expiry, got dead=${shortProj.isDead} reason=${shortProj.expiryReason}`,
    };
  }
  if (shortProj.distanceTraveled < 110 || shortProj.distanceTraveled > 130) {
    return {
      pass: false,
      reason: `short maxRange traveled=${shortProj.distanceTraveled.toFixed(1)} expected ~120`,
    };
  }

  const endTrajectory = {
    ...fidelityTrajectory,
    maxRange: 5000,
  };
  const endProj = new Projectile(
    fidelitySpawn.clone(),
    endTrajectory,
    'caster_stub',
    0,
    new Map<string, TriggerNode[]>(),
  );
  initDrawnPath(endProj, endTrajectory, fidelitySpawn, 0);
  const { total: pathLength } = buildArcLengthTable(fidelityWorld);
  for (let i = 0; i < 600 && !endProj.isDead; i++) {
    updateTrajectory(endProj, dt, world);
  }
  if (!endProj.isDead || endProj.expiryReason !== 'range') {
    return {
      pass: false,
      reason: `path-end expiry expected range, got dead=${endProj.isDead} reason=${endProj.expiryReason}`,
    };
  }
  if (Math.abs(endProj.distanceTraveled - pathLength) > pathLength * 0.05 + 2) {
    return {
      pass: false,
      reason: `path-end traveled=${endProj.distanceTraveled.toFixed(1)} expected ~${pathLength.toFixed(1)}`,
    };
  }

  const verticalTrajectory = {
    type: 'DRAWN_PATH' as const,
    speed: 280,
    maxRange: 2000,
    pathSpace: 'CASTER_RELATIVE' as const,
    pathPoints: [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 360, y: 0 },
    ],
    lobApex: 100,
    bounces: 1,
  };
  const verticalProj = new Projectile(
    Vector2D.zero(),
    verticalTrajectory,
    'caster_stub',
    0,
    new Map<string, TriggerNode[]>(),
  );
  initDrawnPath(verticalProj, verticalTrajectory, Vector2D.zero(), 0);
  initBallisticKinematics(verticalProj, verticalTrajectory);
  world.addProjectile(verticalProj);
  const interpreter = new Interpreter();
  let apexQueued = 0;
  let maxZ = 0;
  for (let i = 0; i < 360 && !verticalProj.isDead; i++) {
    interpreter.updateTrajectories(world, dt);
    if (world.pendingApexEvents.includes(verticalProj)) {
      apexQueued += 1;
    }
    world.step(dt);
    interpreter.processLifecycleEvents(world, dt, HEADLESS_LIFECYCLE_FX);
    maxZ = Math.max(maxZ, verticalProj.z);
    if (apexQueued >= 1 && verticalProj.bounceCount >= 1) {
      break;
    }
  }
  if (maxZ < 40) {
    return { pass: false, reason: `drawn vertical composition never arced (maxZ=${maxZ.toFixed(1)})` };
  }
  if (apexQueued < 1) {
    return { pass: false, reason: 'drawn vertical composition never queued ON_AIR_APEX' };
  }
  if (verticalProj.bounceCount < 1) {
    return {
      pass: false,
      reason: `drawn vertical composition expected bounce, got ${verticalProj.bounceCount}`,
    };
  }

  const noisyStroke = Array.from({ length: 300 }, (_, i) => ({
    x: i * 2,
    y: Math.sin(i * 0.25) * 20 + (i % 3) * 0.5,
  }));
  const simplified = simplifyPath(noisyStroke, 4, 24);
  if (simplified.length > 24) {
    return { pass: false, reason: `simplifyPath returned ${simplified.length} points (>24)` };
  }
  if (
    simplified[0].x !== noisyStroke[0].x ||
    simplified[0].y !== noisyStroke[0].y ||
    simplified[simplified.length - 1].x !== noisyStroke[noisyStroke.length - 1].x ||
    simplified[simplified.length - 1].y !== noisyStroke[noisyStroke.length - 1].y
  ) {
    return { pass: false, reason: 'simplifyPath did not preserve endpoints' };
  }

  return {
    pass: true,
    reason: `constant-speed dense/sparse, fidelity, rotation, expiry, vertical, simplify=${simplified.length}`,
  };
}

function assertCastPhaseTimeline(): { pass: boolean; reason: string } {
  const dt = 1 / 60;
  const player = new Player(Vector2D.zero());
  player.aimTarget = new Vector2D(100, 0);

  const syncAbility: AbilitySchema = {
    id: 'bench_sync_cast',
    name: 'Sync Cast',
    archetype: 'KINETIC',
    cooldownMs: 100,
    recoilKick: 0,
    inputProfile: { mode: 'INSTANT' },
    visuals: DEFAULT_VISUALS,
    triggers: [{ trigger: 'ON_CAST', actions: [] }],
  };

  let dispatchCount = 0;
  let cooldownCount = 0;
  const onCast = (slotIndex: number, _overrides: unknown, isChannelTick: boolean) => {
    dispatchCount++;
    player.triggerSlotCooldown(slotIndex, isChannelTick);
    cooldownCount++;
  };

  player.setAbility(0, syncAbility);
  player.requestCast(0, {}, false, onCast);
  if (dispatchCount !== 1) {
    return { pass: false, reason: `no-phase cast expected 1 dispatch, got ${dispatchCount}` };
  }

  const phasedAbility: AbilitySchema = {
    ...syncAbility,
    id: 'bench_phased_cast',
    inputProfile: {
      mode: 'INSTANT',
      windupMs: 200,
      activeMs: 100,
      recoveryMs: 300,
      moveScale: { windup: 0.5, active: 1.25, recovery: 0.6 },
    },
  };

  player.resetCombatState();
  player.setAbility(0, phasedAbility);
  dispatchCount = 0;
  cooldownCount = 0;

  player.requestCast(0, {}, false, onCast);
  if (dispatchCount !== 0) {
    return { pass: false, reason: `phased cast dispatched during windup (${dispatchCount})` };
  }
  if (!player.activeCastPhase || player.activeCastPhase.phase !== 'WINDUP') {
    return { pass: false, reason: 'expected WINDUP phase after requestCast' };
  }

  if (Math.abs(player.getCastPhaseMoveScale() - 0.5) > 0.001) {
    return {
      pass: false,
      reason: `windup moveScale=${player.getCastPhaseMoveScale()} expected 0.5`,
    };
  }

  const windupRemainingStart = player.activeCastPhase.remainingMs;
  player.stasisRemainingMs = 500;
  player.tickCastPhases(dt, onCast);
  if (player.activeCastPhase?.remainingMs !== windupRemainingStart) {
    return { pass: false, reason: 'cast phase advanced during stasis' };
  }
  player.stasisRemainingMs = 0;

  let elapsed = 0;
  while (dispatchCount === 0 && elapsed < 500) {
    player.tickCastPhases(dt, onCast);
    player.update(dt);
    elapsed += dt * 1000;
  }
  if (dispatchCount !== 1) {
    return { pass: false, reason: `expected exactly 1 deferred dispatch, got ${dispatchCount}` };
  }
  if (cooldownCount !== 1) {
    return { pass: false, reason: `cooldown should arrive with dispatch, got ${cooldownCount}` };
  }
  if (player.activeCastPhase?.phase !== 'ACTIVE') {
    return {
      pass: false,
      reason: `expected ACTIVE after dispatch, got ${player.activeCastPhase?.phase}`,
    };
  }
  if (Math.abs(player.getCastPhaseMoveScale() - 1.25) > 0.001) {
    return {
      pass: false,
      reason: `active moveScale=${player.getCastPhaseMoveScale()} expected 1.25`,
    };
  }
  if (player.isSlotReady(0)) {
    return { pass: false, reason: 'slot ready during ACTIVE phase' };
  }

  elapsed = 0;
  while (player.activeCastPhase && elapsed < 1000) {
    player.tickCastPhases(dt, onCast);
    player.update(dt);
    elapsed += dt * 1000;
    if (player.isSlotReady(0) && player.activeCastPhase) {
      return { pass: false, reason: 'slot ready while cast phase active' };
    }
  }
  if (player.activeCastPhase) {
    return { pass: false, reason: 'cast phases did not complete' };
  }
  if (Math.abs(player.getCastPhaseMoveScale() - 1) > 0.001) {
    return {
      pass: false,
      reason: `moveScale after phases=${player.getCastPhaseMoveScale()} expected 1`,
    };
  }

  while (!player.isSlotReady(0) && elapsed < 5000) {
    player.update(dt);
    elapsed += dt * 1000;
  }
  if (!player.isSlotReady(0)) {
    return { pass: false, reason: 'slot not ready after cooldown cleared' };
  }

  const cancelAbility: AbilitySchema = {
    ...phasedAbility,
    id: 'bench_cancel_cast',
    inputProfile: {
      mode: 'INSTANT',
      windupMs: 200,
      activeMs: 100,
      recoveryMs: 300,
      cancelable: true,
    },
  };
  player.resetCombatState();
  player.setAbility(0, cancelAbility);
  dispatchCount = 0;
  cooldownCount = 0;

  player.setSlotInput(0, true, onCast);
  if (!player.activeCastPhase) {
    return { pass: false, reason: 'cancelable cast did not enter windup' };
  }
  player.setSlotInput(0, false, onCast);
  if (player.activeCastPhase) {
    return { pass: false, reason: 'cancelable feint did not abort windup' };
  }
  player.tickCastPhases(dt, onCast);
  if (dispatchCount !== 0 || cooldownCount !== 0) {
    return { pass: false, reason: 'cancelable feint should not dispatch or cooldown' };
  }

  return {
    pass: true,
    reason: 'sync + deferred + gating + moveScale + stasis + feint',
  };
}

function assertSixTierEvolution(): { pass: boolean; reason: string } {
  const base = structuredClone(VERTICAL_RECIPES.clusterMortar) as AbilitySchema;
  base.id = 'test_cluster_mortar_evolution';
  const category = 'SECONDARY';
  const sequence = ['quickened', 'sharpened', 'extended', 'heavier', 'ricochet', 'braced'];

  const tier1 = resolveEvolutionTree(
    {
      version: 1,
      rootSpellId: base.id,
      baseSchema: structuredClone(base),
      nodes: [],
      activePath: [],
    },
    category,
  );
  const tier1Cooldown = tier1.schema.cooldownMs;
  const schemasByTier: AbilitySchema[] = [tier1.schema];

  for (let tier = 1; tier <= sequence.length; tier++) {
    const tree = buildEvolutionTree(base, sequence.slice(0, tier));
    const resolvedOnce = resolveEvolutionTree(tree, category);
    const resolvedTwice = resolveEvolutionTree(tree, category);

    if (JSON.stringify(resolvedOnce.schema) !== JSON.stringify(resolvedTwice.schema)) {
      return { pass: false, reason: `tier ${tier} resolve is not deterministic` };
    }

    const structure = assertClusterMortarStructure(resolvedOnce.schema);
    if (!structure.pass) {
      return { pass: false, reason: `tier ${tier}: ${structure.reason}` };
    }

    if (resolvedOnce.schema.cooldownMs > tier1Cooldown * 1.6) {
      return {
        pass: false,
        reason: `tier ${tier} cooldown ${resolvedOnce.schema.cooldownMs} exceeds 1.6x tier-1 (${tier1Cooldown})`,
      };
    }

    if (resolvedOnce.schema.recoilKick > MAX_EVOLVED_RECOIL) {
      return {
        pass: false,
        reason: `tier ${tier} recoil ${resolvedOnce.schema.recoilKick} exceeds MAX_EVOLVED_RECOIL`,
      };
    }

    const preClamp = structuredClone(resolvedOnce.schema);
    const postClamp = clampSchemaValues(preClamp);
    const saturation = analyzeSaturation(preClamp, postClamp);
    if (saturation.entityCapRisk) {
      return {
        pass: false,
        reason: `tier ${tier} entityCapRisk (~${saturation.estimatedEntities})`,
      };
    }

    const world = new PhysicsWorld(Vector2D.zero(), 400);
    world.setViewportBounds(2000, 2000);
    const casterRadius = world.getCombatantRadius();
    const caster = new Player(new Vector2D(casterRadius + 1, 0));
    caster.tags.add('kinematic');
    const target = new Dummy(new Vector2D(casterRadius + 1 + 200, 0));
    world.addPlayer(caster);
    world.addDummy(target);
    const interpreter = new Interpreter();
    interpreter.executeAbility(
      resolvedOnce.schema,
      {
        origin: caster.pos.clone(),
        heading: new Vector2D(1, 0),
        caster,
        depth: 0,
      },
      world,
    );
    if (world.getEntityCount() >= MAX_ENTITIES) {
      return {
        pass: false,
        reason: `tier ${tier} headless cast hit MAX_ENTITIES (${MAX_ENTITIES})`,
      };
    }

    schemasByTier.push(resolvedOnce.schema);
  }

  for (let tier = sequence.length; tier >= 2; tier--) {
    const tree = buildEvolutionTree(base, sequence.slice(0, tier));
    tree.activePath = tree.activePath.slice(0, tier - 1);
    const resolved = resolveEvolutionTree(tree, category);
    if (JSON.stringify(resolved.schema) !== JSON.stringify(schemasByTier[tier - 1])) {
      return {
        pass: false,
        reason: `tier ${tier - 1} reversibility failed after dropping tier-${tier} node`,
      };
    }
  }

  return {
    pass: true,
    reason: `6-tier path deterministic, cooldown-banded, reversible; tier-6 cd=${schemasByTier[6].cooldownMs}ms`,
  };
}

function assertGraphicsTierMonotonicLimits(): { pass: boolean; reason: string } {
  const tiers = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const;
  for (const tier of tiers) {
    seedEffectiveTierForTests(tier);
    const limits = getTierLimits();
    if (limits.presentIntervalMs !== 0) {
      return {
        pass: false,
        reason: `${tier} presentIntervalMs should be 0, got ${limits.presentIntervalMs}`,
      };
    }
  }

  seedEffectiveTierForTests('LOW');
  const low = getTierLimits();
  seedEffectiveTierForTests('MEDIUM');
  const medium = getTierLimits();
  seedEffectiveTierForTests('HIGH');
  const high = getTierLimits();

  if (low.particleBudget >= medium.particleBudget || medium.particleBudget >= high.particleBudget) {
    return {
      pass: false,
      reason:
        `particle budgets not monotonic: LOW=${low.particleBudget} MEDIUM=${medium.particleBudget} HIGH=${high.particleBudget}`,
    };
  }

  seedEffectiveTierForTests('LOW');
  const flags = getEffectiveFeatureFlags();
  if (!flags.webglBackground) {
    return {
      pass: false,
      reason: 'LOW should inherit webglBackground when enabled in settings',
    };
  }

  return {
    pass: true,
    reason: 'present uncapped, budgets monotonic, LOW keeps GPU background',
  };
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

  const fieldStatus = assertFieldStatusApplicationAndAirborneClearance();
  const fieldStatusTag = fieldStatus.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${fieldStatusTag} Field status application and airborne clearance`);
  console.log(`  ${DIM}${fieldStatus.reason}${RESET}`);
  if (fieldStatus.pass) passed++;

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

  const lavaWorldLock = assertLavaShaderTectonicPrototype();
  const lavaWorldLockTag = lavaWorldLock.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${lavaWorldLockTag} Lava tectonic prototype shader`);
  console.log(`  ${DIM}${lavaWorldLock.reason}${RESET}`);
  if (lavaWorldLock.pass) passed++;

  const graphicsTiers = assertGraphicsTierMonotonicLimits();
  const graphicsTiersTag = graphicsTiers.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${graphicsTiersTag} Graphics tier monotonic limits`);
  console.log(`  ${DIM}${graphicsTiers.reason}${RESET}`);
  if (graphicsTiers.pass) passed++;

  const clusterMortarTrajectory = assertClusterMortarTrajectorySurvives();
  const clusterMortarTrajectoryTag = clusterMortarTrajectory.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${clusterMortarTrajectoryTag} Cluster mortar trajectory survives pipeline`);
  console.log(`  ${DIM}${clusterMortarTrajectory.reason}${RESET}`);
  if (clusterMortarTrajectory.pass) passed++;

  const clusterMortarStructure = assertClusterMortarStructureSurvives();
  const clusterMortarStructureTag = clusterMortarStructure.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${clusterMortarStructureTag} Cluster mortar structure survives EVOLUTION flavor`);
  console.log(`  ${DIM}${clusterMortarStructure.reason}${RESET}`);
  if (clusterMortarStructure.pass) passed++;

  const homingBallistic = assertHomingBallisticComposition();
  const homingBallisticTag = homingBallistic.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${homingBallisticTag} Homing ballistic composition`);
  console.log(`  ${DIM}${homingBallistic.reason}${RESET}`);
  if (homingBallistic.pass) passed++;

  const onRam = assertOnRamDispatchesOnce();
  const onRamTag = onRam.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${onRamTag} ON_RAM dispatches once`);
  console.log(`  ${DIM}${onRam.reason}${RESET}`);
  if (onRam.pass) passed++;

  const clusterMortarAiming = assertClusterMortarAimingRollout();
  const clusterMortarAimingTag = clusterMortarAiming.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${clusterMortarAimingTag} Cluster mortar aiming rollout`);
  console.log(`  ${DIM}${clusterMortarAiming.reason}${RESET}`);
  if (clusterMortarAiming.pass) passed++;

  const playVfx = assertPlayVfxZeroBudgetAndLayers();
  const playVfxTag = playVfx.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${playVfxTag} PLAY_VFX zero budget + impactLayers`);
  console.log(`  ${DIM}${playVfx.reason}${RESET}`);
  if (playVfx.pass) passed++;

  const derivedIntensity = assertDerivedImpactIntensity();
  const derivedIntensityTag = derivedIntensity.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${derivedIntensityTag} Derived impact intensity monotonicity`);
  console.log(`  ${DIM}${derivedIntensity.reason}${RESET}`);
  if (derivedIntensity.pass) passed++;

  const angularHit = assertAngularHitRegions();
  const angularHitTag = angularHit.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
  console.log(`${angularHitTag} Angular hit regions`);
  console.log(`  ${DIM}${angularHit.reason}${RESET}`);
  if (angularHit.pass) passed++;

  const sixTierEvolution = assertSixTierEvolution();
  const sixTierEvolutionTag = sixTierEvolution.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${sixTierEvolutionTag} Six-tier evolution tree`);
  console.log(`  ${DIM}${sixTierEvolution.reason}${RESET}`);
  if (sixTierEvolution.pass) passed++;

  const castPhaseTimeline = assertCastPhaseTimeline();
  const castPhaseTimelineTag = castPhaseTimeline.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${castPhaseTimelineTag} Cast phase timeline`);
  console.log(`  ${DIM}${castPhaseTimeline.reason}${RESET}`);
  if (castPhaseTimeline.pass) passed++;

  const drawnPathFollowing = assertDrawnPathFollowing();
  const drawnPathFollowingTag = drawnPathFollowing.pass
    ? `${GREEN}[PASS]${RESET}`
    : `${RED}[FAIL]${RESET}`;
  console.log(`${drawnPathFollowingTag} Drawn path following`);
  console.log(`  ${DIM}${drawnPathFollowing.reason}${RESET}`);
  if (drawnPathFollowing.pass) passed++;

  const totalCases = suite.length + 27;

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
