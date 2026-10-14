/**
 * Headless world fixture for painter tests: replays a fixed input script
 * (same as test-replay) and renders snapshots through CanvasRenderer onto
 * RecordingPainter targets. performance.now and Math.random are pinned so
 * every render of a snapshot issues the same calls.
 */
import type { GameApp } from '../../src/game/GameApp';
import type { RecordingPainter } from '../../src/render/painter/RecordingPainter';
import type { GlWorldSlice } from '../../src/devtools/graphicsSettings';
import type { Painter2D } from '../../src/render/painter/Painter2D';

const FIXED_DT = 1 / 60;
const SEED = 0x9e3779b9;
export const FIXTURE_TICKS = [120, 260, 450] as const;
const PINNED_NOW_MS = 123_456;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let fakeCanvasSeq = 0;

function makeFakeCanvas(RecordingPainterCtor: typeof RecordingPainter): unknown {
  const id = ++fakeCanvasSeq;
  const canvas: Record<string, unknown> = {
    width: 300,
    height: 150,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  let ctx: unknown = null;
  canvas.getContext = () => {
    if (!ctx) {
      const rec = new RecordingPainterCtor(`canvas${id}`);
      ctx = new Proxy(rec, {
        get(target, prop, receiver) {
          if (prop in target) return Reflect.get(target, prop, receiver);
          return () => {};
        },
        set(target, prop, value, receiver) {
          if (prop in target) return Reflect.set(target, prop, value, receiver);
          return true;
        },
      });
      (ctx as { canvas: unknown }).canvas = canvas;
    }
    return ctx;
  };
  return canvas;
}

function installHeadlessGlobals(RecordingPainterCtor: typeof RecordingPainter): void {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: () => null,
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, value),
    } as Storage;
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      innerWidth: 1920,
      innerHeight: 1080,
      devicePixelRatio: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Window & typeof globalThis;
  }
  if (typeof globalThis.document === 'undefined') {
    const styleStub = { setProperty: () => {}, removeProperty: () => {} };
    globalThis.document = {
      createElement: (tag: string) =>
        tag === 'canvas'
          ? makeFakeCanvas(RecordingPainterCtor)
          : { style: styleStub, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
      getElementById: () => null,
      querySelector: () => null,
      documentElement: { style: styleStub, classList: { add() {}, remove() {}, toggle() {} } },
      body: { appendChild() {}, classList: { add() {}, remove() {}, toggle() {} }, style: styleStub },
      addEventListener: () => {},
    } as unknown as Document;
  }
}

export function pinClock(): void {
  Object.defineProperty(globalThis.performance, 'now', {
    value: () => PINNED_NOW_MS,
    configurable: true,
    writable: true,
  });
}

export interface FixtureSnapshot {
  tick: number;
  render(
    canvasTarget: RecordingPainter,
    gl: { painter: Painter2D; slice: GlWorldSlice } | null,
    probe?: (id: string, route: 'gl' | 'canvas') => void,
  ): void;
}

/**
 * Simulates the replay script and calls `onSnapshot` at each FIXTURE_TICKS
 * tick, while the world is in that state.
 */
export async function runWorldFixture(
  onSnapshot: (snap: FixtureSnapshot) => void,
): Promise<void> {
  const { RecordingPainter } = await import('../../src/render/painter/RecordingPainter');
  installHeadlessGlobals(RecordingPainter);
  Math.random = mulberry32(SEED);

  const { seedEffectiveTierForTests } = await import('../../src/devtools/graphicsSettings');
  seedEffectiveTierForTests('HIGH');

  const { PhysicsWorld } = await import('../../src/engine/PhysicsWorld');
  const { Vector2D } = await import('../../src/math/Vector2D');
  const { Player } = await import('../../src/entities/Player');
  const { Obstacle } = await import('../../src/entities/Obstacle');
  const { BotController } = await import('../../src/entities/BotController');
  const { Interpreter } = await import('../../src/primitives/Interpreter');
  const { ParticleSystem } = await import('../../src/render/ParticleSystem');
  const { RecordingBackend } = await import('../../src/render/backends/RecordingBackend');
  const { ArenaShrink } = await import('../../src/game/ArenaShrink');
  const { MatchManager } = await import('../../src/game/MatchManager');
  const { Camera2D } = await import('../../src/camera/Camera2D');
  const { assignDefaultLoadout } = await import('../../src/game/loadout');
  const { runSimulationStep } = await import('../../src/game/simulation');
  const { handleCastInput } = await import('../../src/game/input');
  const { CanvasRenderer } = await import('../../src/render/CanvasRenderer');

  const hexRadius = 420;
  const world = new PhysicsWorld(Vector2D.zero(), hexRadius);
  world.setViewportBounds(1920, 1080);
  const player = new Player(new Vector2D(-140, 0));
  const bot = new Player(new Vector2D(140, 0), ['bot', 'combatant']);
  world.addPlayer(player);
  world.addPlayer(bot);
  assignDefaultLoadout(player);
  assignDefaultLoadout(bot);
  world.addObstacle(
    new Obstacle(new Vector2D(0, 0), {
      shape: 'BOX',
      width: 80,
      height: 40,
      durationMs: 600_000,
      isDestructible: false,
    }),
  );

  const interpreter = new Interpreter();
  const particles = ParticleSystem.fromBackend(new RecordingBackend());
  interpreter.setParticleSystem(particles);
  const arenaShrink = new ArenaShrink(hexRadius);
  arenaShrink.enabled = false;
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
    matchManager: new MatchManager(),
    camera,
    draftModal: { isOpen: () => false },
    matchHUD: { showTransientToast: (_message: string) => {} },
    lastPointerAimMs: 0,
  } as GameApp;

  const castEdges: Record<number, number[]> = {
    45: [0], 105: [0], 120: [1], 200: [3], 260: [0], 320: [1], 380: [3], 450: [2],
  };

  const lastTick = FIXTURE_TICKS[FIXTURE_TICKS.length - 1];
  for (let tick = 0; tick <= lastTick; tick++) {
    app.keys = new Set(tick < 300 ? ['d', ...(tick % 120 < 60 ? ['w'] : [])] : ['a']);
    const angle = tick * 0.04;
    player.aimTarget = new Vector2D(Math.cos(angle) * 400, Math.sin(angle) * 400);
    for (const slot of castEdges[tick] ?? []) handleCastInput(app, slot, true);
    runSimulationStep(app, FIXED_DT);

    if ((FIXTURE_TICKS as readonly number[]).includes(tick)) {
      const realRandom = Math.random;
      const worldState = cloneWorldForRender();
      onSnapshot({
        tick,
        render(canvasTarget, gl, probe) {
          pinClock();
          Math.random = mulberry32(SEED ^ tick);
          const renderer = new CanvasRenderer(canvasTarget as unknown as CanvasRenderingContext2D);
          if (probe) (renderer as unknown as { moduleProbe: typeof probe }).moduleProbe = probe;
          worldState.restore();
          const args: unknown[] = [
            world,
            particles,
            1,
            { showVectors: true, showRadii: true, showIds: true },
            camera,
            0.4,
            true,
            player,
          ];
          if (gl) args.push(gl);
          (renderer.render as (...a: unknown[]) => void).apply(renderer, args);
        },
      });
      worldState.release();
      Math.random = realRandom;
    }
  }

  /**
   * Rendering drains combat events and advances render-only managers, so each
   * render restores the event queues and starts the aim preview fresh.
   */
  function cloneWorldForRender(): { restore(): void; release(): void } {
    const w = world as unknown as Record<string, unknown>;
    const queues = Object.keys(w).filter((k) => /event/i.test(k) && Array.isArray(w[k]));
    const saved = queues.map((k) => [k, [...(w[k] as unknown[])]] as const);
    const prevAim = player.activeAimingState;
    let aimSlot = -1;
    for (let slot = 0; slot < 5 && aimSlot < 0; slot++) {
      if (player.startTrajectoryPreview(slot) || player.startAiming(slot)) aimSlot = slot;
    }
    const aimState = player.activeAimingState;
    return {
      restore() {
        for (const [k, items] of saved) w[k] = [...items];
        player.activeAimingState = aimState;
      },
      release() {
        for (const [k, items] of saved) w[k] = [...items];
        player.activeAimingState = prevAim;
      },
    };
  }
}
