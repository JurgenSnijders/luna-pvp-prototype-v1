import { InspectorUI } from './devtools/InspectorUI';
import { PRESETS } from './devtools/Presets';
import { Loop } from './engine/Loop';
import { PhysicsWorld } from './engine/PhysicsWorld';
import { Player } from './entities/Player';
import { applyField } from './primitives/Fields';
import { Interpreter } from './primitives/Interpreter';
import { Vector2D } from './math/Vector2D';
import { CanvasRenderer, type DebugOptions } from './render/CanvasRenderer';
import { ParticleSystem } from './render/ParticleSystem';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let world: PhysicsWorld;
let player: Player;
let interpreter: Interpreter;
let particles: ParticleSystem;
let renderer: CanvasRenderer;
let inspector: InspectorUI;

const debugOptions: DebugOptions = {
  showVectors: false,
  showRadii: false,
  showIds: false,
};

function getHexRadius(): number {
  return Math.min(window.innerWidth, window.innerHeight) * 0.35;
}

function getHexCenter(): Vector2D {
  return new Vector2D(window.innerWidth / 2, window.innerHeight / 2);
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resetArena(): void {
  const center = getHexCenter();
  player.pos = center.clone();
  player.prevPos = center.clone();
  player.vel = Vector2D.zero();
  player.instabilityPct = 0;
  world.dummies = [];
  world.clearProjectilesAndZones();
}

function tryCast(ability: typeof player.primaryAbility): void {
  if (!ability || player.cooldownTimerMs > 0) return;

  const aimDir = player.aimTarget.sub(player.pos);
  if (aimDir.magSq() < 0.01) return;

  interpreter.executeAbility(ability, player, aimDir, world);
  player.cooldownTimerMs = ability.cooldownMs;
}

function applySpatialFields(dt: number): void {
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

function init(): void {
  resize();
  window.addEventListener('resize', resize);

  const center = getHexCenter();
  world = new PhysicsWorld(center, getHexRadius());
  player = new Player(center.clone());
  world.addPlayer(player);

  interpreter = new Interpreter();
  particles = new ParticleSystem();
  renderer = new CanvasRenderer(ctx);
  interpreter.setParticleSystem(particles);

  player.primaryAbility = structuredClone(PRESETS['Kinetic Railgun']);
  player.secondaryAbility = structuredClone(PRESETS['Phase Nova']);

  inspector = new InspectorUI(
    document.getElementById('inspector-root')!,
    {
      player,
      world,
      interpreter,
      renderer,
      getDebugOptions: () => debugOptions,
      setDebugOptions: (opts) => {
        debugOptions.showVectors = opts.showVectors;
        debugOptions.showRadii = opts.showRadii;
        debugOptions.showIds = opts.showIds;
      },
      onReset: resetArena,
    },
  );

  const keys = new Set<string>();

  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === ' ') {
      e.preventDefault();
      player.primaryCast = true;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  window.addEventListener('mousemove', (e) => {
    player.aimTarget = new Vector2D(e.clientX, e.clientY);
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) player.primaryCast = true;
    if (e.button === 2) player.secondaryCast = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const loop = new Loop({
    onUpdate(dt) {
      world.hexCenter = getHexCenter();
      world.hexRadius = getHexRadius();

      let mx = 0;
      let my = 0;
      if (keys.has('w')) my -= 1;
      if (keys.has('s')) my += 1;
      if (keys.has('a')) mx -= 1;
      if (keys.has('d')) mx += 1;
      const move = new Vector2D(mx, my);
      player.inputMove = move.magSq() > 0 ? move.normalize() : Vector2D.zero();

      if (player.primaryCast) tryCast(player.primaryAbility);
      if (player.secondaryCast) tryCast(player.secondaryAbility);

      interpreter.updateTrajectories(world, dt);
      applySpatialFields(dt);
      world.step(dt);
      interpreter.processLifecycleEvents(world);
      particles.update(dt);

      player.clearCastInputs();
    },
    onRender(alpha) {
      renderer.render(
        world,
        particles,
        alpha,
        debugOptions,
        window.innerWidth,
        window.innerHeight,
      );
      inspector.updateTelemetry();
    },
  });

  loop.start();
}

init();
