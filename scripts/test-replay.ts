/**
 * Phase 0 replay oracle: 600 fixed ticks through runSimulationStep, SHA-256 of gameplay state.
 * Run twice in separate processes; hashes must match.
 */
import { createHash } from 'node:crypto';
import type { GameApp } from '../src/game/GameApp';

const FIXED_DT = 1 / 60;
const TICK_COUNT = 600;
const REPLAY_RANDOM_SEED = 0x9e3779b9;

function installHeadlessGlobals(): void {
  installLocalStorageStub();
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as Window & typeof globalThis;
  }
}

function installLocalStorageStub(): void {
  if (typeof globalThis.localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } as Storage;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CastEdge {
  tick: number;
  slot: number;
  down: boolean;
}

/** Instant-cast press edges (starter presets default to INSTANT). */
const CAST_EDGES: CastEdge[] = [
  { tick: 45, slot: 0, down: true },
  { tick: 105, slot: 0, down: true },
  { tick: 120, slot: 1, down: true },
  { tick: 200, slot: 3, down: true },
  { tick: 260, slot: 0, down: true },
  { tick: 320, slot: 1, down: true },
  { tick: 380, slot: 3, down: true },
  { tick: 450, slot: 2, down: true },
  { tick: 510, slot: 4, down: true },
  { tick: 570, slot: 0, down: true },
];

function keysForTick(tick: number): Set<string> {
  const keys = new Set<string>();
  if (tick < 300) {
    keys.add('d');
    if (tick % 120 < 60) keys.add('w');
  } else {
    keys.add('a');
    if (tick % 120 < 60) keys.add('s');
  }
  return keys;
}

function aimTargetForTick(tick: number): { x: number; y: number } {
  const angle = tick * 0.04;
  const radius = 400;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function castEdgesForTick(tick: number): CastEdge[] {
  return CAST_EDGES.filter((e) => e.tick === tick);
}

interface HashableEntity {
  id: string;
  isDead: boolean;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  z: number;
  vz: number;
  health: number;
}

function collectEntityLines(world: {
  players: HashableEntity[];
  dummies: HashableEntity[];
  summons: HashableEntity[];
  projectiles: HashableEntity[];
}): string[] {
  const all: HashableEntity[] = [
    ...world.players,
    ...world.dummies,
    ...world.summons,
    ...world.projectiles,
  ];
  all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return all.map((e) => {
    const alive = e.isDead ? 0 : 1;
    return `${e.id} ${alive} ${e.pos.x} ${e.pos.y} ${e.vel.x} ${e.vel.y} ${e.z} ${e.vz} ${e.health}`;
  });
}

async function main(): Promise<void> {
  installHeadlessGlobals();
  Math.random = mulberry32(REPLAY_RANDOM_SEED);

  const { seedEffectiveTierForTests } = await import('../src/devtools/graphicsSettings');
  seedEffectiveTierForTests('LOW');

  const { PhysicsWorld } = await import('../src/engine/PhysicsWorld');
  const { Vector2D } = await import('../src/math/Vector2D');
  const { Player } = await import('../src/entities/Player');
  const { Obstacle } = await import('../src/entities/Obstacle');
  const { BotController } = await import('../src/entities/BotController');
  const { Interpreter } = await import('../src/primitives/Interpreter');
  const { ParticleSystem } = await import('../src/render/ParticleSystem');
  const { RecordingBackend } = await import('../src/render/backends/RecordingBackend');
  const { ArenaShrink } = await import('../src/game/ArenaShrink');
  const { MatchManager } = await import('../src/game/MatchManager');
  const { Camera2D } = await import('../src/camera/Camera2D');
  const { assignDefaultLoadout } = await import('../src/game/loadout');
  const { runSimulationStep } = await import('../src/game/simulation');
  const { handleCastInput } = await import('../src/game/input');

  const hexRadius = 420;
  const center = Vector2D.zero();
  const world = new PhysicsWorld(center, hexRadius);
  world.setViewportBounds(1920, 1080);

  const player = new Player(new Vector2D(-140, 0));
  const bot = new Player(new Vector2D(140, 0), ['bot', 'combatant']);
  world.addPlayer(player);
  world.addPlayer(bot);
  assignDefaultLoadout(player);
  assignDefaultLoadout(bot);

  const obstacle = new Obstacle(new Vector2D(0, 0), {
    shape: 'BOX',
    width: 80,
    height: 40,
    durationMs: 600_000,
    isDestructible: false,
  });
  world.addObstacle(obstacle);

  const interpreter = new Interpreter();
  const particles = ParticleSystem.fromBackend(new RecordingBackend());
  interpreter.setParticleSystem(particles);

  const arenaShrink = new ArenaShrink(hexRadius);
  arenaShrink.enabled = false;

  const matchManager = new MatchManager();
  const botController = new BotController(bot);
  botController.enabled = true;

  const camera = new Camera2D();
  camera.setViewport(1920, 1080);

  const app = {
    keys: new Set<string>(),
    player,
    bot,
    world,
    interpreter,
    particles,
    botController,
    arenaShrink,
    matchManager,
    camera,
    draftModal: { isOpen: () => false },
    matchHUD: { showTransientToast: (_message: string) => {} },
    lastPointerAimMs: 0,
  } as GameApp;

  for (let tick = 0; tick < TICK_COUNT; tick++) {
    app.keys = keysForTick(tick);
    const aim = aimTargetForTick(tick);
    player.aimTarget = new Vector2D(aim.x, aim.y);

    for (const edge of castEdgesForTick(tick)) {
      handleCastInput(app, edge.slot, edge.down);
    }

    runSimulationStep(app, FIXED_DT);
  }

  const lines = collectEntityLines(world);
  const digest = createHash('sha256').update(lines.join('\n')).digest('hex');
  console.log(`REPLAY_HASH ${digest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
