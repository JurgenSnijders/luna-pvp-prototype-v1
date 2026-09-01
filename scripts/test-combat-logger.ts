import { PhysicsWorld } from '../src/engine/PhysicsWorld';
import { Dummy } from '../src/entities/Dummy';
import { Player } from '../src/entities/Player';
import { SpatialZone } from '../src/entities/SpatialZone';
import { Vector2D } from '../src/math/Vector2D';
import { applyField } from '../src/primitives/Fields';
import { Interpreter } from '../src/primitives/Interpreter';
import { CombatLogger } from '../src/telemetry/CombatLogger';
import type { AbilitySchema } from '../src/types/schema';
import type {
  CombatEvent as TelemetryEvent,
  ImpulseAppliedEvent,
  RamCollisionEvent,
} from '../src/types/telemetry';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const EPS = 0.01;

const IMPULSE_ABILITY: AbilitySchema = {
  id: 'test_telemetry_impulse',
  name: 'Telemetry Impulse',
  archetype: 'KINETIC',
  cooldownMs: 1000,
  recoilKick: 0,
  triggers: [
    {
      trigger: 'ON_CAST',
      actions: [
        {
          type: 'APPLY_IMPULSE',
          baseForce: 600,
          target: 'TARGET',
          directionMode: 'AWAY_FROM_ORIGIN',
        },
      ],
    },
  ],
};

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

function assert(condition: boolean, message: string, failures: string[]): void {
  if (!condition) failures.push(message);
}

function run(): void {
  const failures: string[] = [];
  const logger = CombatLogger.getInstance();
  logger.clear();

  const dt = 1 / 60;
  const world = new PhysicsWorld(Vector2D.zero(), 400);
  world.setViewportBounds(2000, 2000);

  const caster = new Player(new Vector2D(0, 0));
  caster.tags.add('kinematic');
  const target = new Dummy(new Vector2D(200, 0), { mass: 50 });
  world.addPlayer(caster);
  world.addDummy(target);

  const interpreter = new Interpreter();

  logger.advanceClock(dt);
  interpreter.executeAbility(
    IMPULSE_ABILITY,
    {
      origin: caster.pos.clone(),
      heading: new Vector2D(1, 0),
      caster,
      targetEntity: target,
      depth: 0,
      ability: IMPULSE_ABILITY,
    },
    world,
  );

  const zone = new SpatialZone(
    target.pos.clone(),
    {
      fieldType: 'MASS_ATTRACTOR',
      radius: 250,
      strength: 8000,
      durationMs: 5000,
    },
    caster.id,
    'GRAVITY',
  );
  world.addZone(zone);

  target.pos = new Vector2D(10, 0);
  caster.pos = new Vector2D(-10, 0);
  caster.vel = new Vector2D(500, 0);
  target.vel = new Vector2D(-500, 0);

  for (let i = 0; i < 30; i++) {
    logger.advanceClock(dt);
    world.updateSpatialZones(dt);
    applySpatialFields(world, dt);
    world.step(dt);
    interpreter.processLifecycleEvents(world, dt);
  }

  const events = logger.getRecentEvents();
  assert(events.length > 0, 'expected at least one telemetry event', failures);

  const casts = events.filter((e) => e.type === 'ABILITY_CAST');
  const impulses = events.filter((e) => e.type === 'IMPULSE_APPLIED') as ImpulseAppliedEvent[];
  const rams = events.filter((e) => e.type === 'RAM_COLLISION') as RamCollisionEvent[];
  const fields = events.filter((e) => e.type === 'FIELD_ACCEL_TICK');

  assert(casts.length >= 1, 'expected ABILITY_CAST event', failures);
  assert(impulses.length >= 1, 'expected IMPULSE_APPLIED event', failures);
  assert(rams.length >= 1, 'expected RAM_COLLISION event', failures);
  assert(fields.length >= 1, 'expected FIELD_ACCEL_TICK event', failures);

  for (const imp of impulses) {
    const dx = imp.velocityAfter.x - imp.velocityBefore.x;
    const dy = imp.velocityAfter.y - imp.velocityBefore.y;
    assert(
      Math.abs(dx - imp.deltaVelocity.x) < EPS && Math.abs(dy - imp.deltaVelocity.y) < EPS,
      `IMPULSE_APPLIED delta mismatch: expected (${dx.toFixed(3)},${dy.toFixed(3)}) got (${imp.deltaVelocity.x.toFixed(3)},${imp.deltaVelocity.y.toFixed(3)})`,
      failures,
    );
    assert(
      imp.deltaVelocity.mag > 0,
      'IMPULSE_APPLIED deltaVelocity should be non-zero',
      failures,
    );
  }

  for (const ram of rams) {
    const dvx = ram.targetVelAfter.x - ram.targetVelBefore.x;
    const dvy = ram.targetVelAfter.y - ram.targetVelBefore.y;
    const deltaMag = Math.sqrt(dvx * dvx + dvy * dvy);
    const momentumDelta = target.effectiveMass * deltaMag;
    const relativeError =
      ram.impulseMagnitude > 0
        ? Math.abs(momentumDelta - ram.impulseMagnitude) / ram.impulseMagnitude
        : 1;
    assert(
      relativeError < 0.05,
      `RAM_COLLISION momentum mismatch: |m*dv - J|/J = ${relativeError.toFixed(4)} (J=${ram.impulseMagnitude.toFixed(1)}, m*dv=${momentumDelta.toFixed(1)})`,
      failures,
    );
  }

  let parsed: TelemetryEvent[];
  try {
    parsed = JSON.parse(logger.exportJson()) as TelemetryEvent[];
    assert(Array.isArray(parsed) && parsed.length > 0, 'exportJson should parse to non-empty array', failures);
  } catch {
    assert(false, 'exportJson produced invalid JSON', failures);
    parsed = [];
  }

  const table = logger.exportAsciiTable();
  assert(table.includes('ABILITY_CAST'), 'ASCII table should include event types', failures);

  if (failures.length > 0) {
    console.error(`${RED}test:telemetry  FAIL${RESET}`);
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  console.log(
    `${GREEN}test:telemetry  OK${RESET}  ${events.length} events  ` +
      `(cast=${casts.length} impulse=${impulses.length} ram=${rams.length} field=${fields.length} json=${parsed.length})`,
  );
}

run();
