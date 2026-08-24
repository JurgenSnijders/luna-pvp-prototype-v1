import { generateOfflineDraft } from './ai/Synthesizer';
import { InspectorUI } from './devtools/InspectorUI';
import { PRESETS } from './devtools/Presets';
import { DraftModal } from './draft/DraftModal';
import { Loop } from './engine/Loop';
import { PhysicsWorld } from './engine/PhysicsWorld';
import { BotController } from './entities/BotController';
import { Player } from './entities/Player';
import { ArenaShrink } from './game/ArenaShrink';
import { MatchManager, type GameMode, type MatchState } from './game/MatchManager';
import { applyField } from './primitives/Fields';
import { Interpreter } from './primitives/Interpreter';
import { Vector2D } from './math/Vector2D';
import { CanvasRenderer, type DebugOptions } from './render/CanvasRenderer';
import { MatchHUD } from './render/MatchHUD';
import { ParticleSystem } from './render/ParticleSystem';
import type { DraftSelection } from './types/cards';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

let world: PhysicsWorld;
let player: Player;
let bot: Player;
let interpreter: Interpreter;
let particles: ParticleSystem;
let renderer: CanvasRenderer;
let inspector: InspectorUI;
let draftModal: DraftModal;
let loop: Loop;
let matchManager: MatchManager;
let arenaShrink: ArenaShrink;
let botController: BotController;
let matchHUD: MatchHUD;
let intermissionHandled = false;
let isIntermissionDraft = false;

const keys = new Set<string>();

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
  arenaShrink?.resize(getHexRadius());
}

function applyDraftSelection(target: Player, selection: DraftSelection): void {
  const { card, slot } = selection;

  if (slot === 'PASSIVE' && card.passivePayload) {
    for (const mod of card.passivePayload) {
      target.applyPassiveModifier(mod);
    }
    return;
  }

  if (card.type === 'ACTIVE_ABILITY' && card.abilityPayload) {
    const ability = structuredClone(card.abilityPayload);
    if (slot === 'PRIMARY') {
      target.primaryAbility = ability;
      target.primaryCooldownTimerMs = 0;
    } else if (slot === 'SECONDARY') {
      target.secondaryAbility = ability;
      target.secondaryCooldownTimerMs = 0;
    }
  }
}

function resetArena(): void {
  const center = getHexCenter();
  matchManager.resetRoundEntities(player, bot, world, arenaShrink, center);
  world.dummies = [];
}

function respawnCombatants(): void {
  matchManager.respawnAllCombatants(
    player,
    bot,
    world,
    arenaShrink,
    getHexCenter(),
  );
  for (const dummy of world.dummies) {
    if (dummy.isDead) continue;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * arenaShrink.initialRadius * 0.5;
    const pos = getHexCenter().add(Vector2D.fromAngle(angle, dist));
    dummy.pos = pos.clone();
    dummy.prevPos = pos.clone();
    dummy.vel = Vector2D.zero();
    dummy.instabilityPct = 0;
  }
}

function tryCastPrimary(caster: Player): void {
  const ability = caster.primaryAbility;
  if (!ability || caster.primaryCooldownTimerMs > 0) return;

  const aimDir = caster.aimTarget.sub(caster.pos);
  if (aimDir.magSq() < 0.01) return;

  interpreter.executeAbility(ability, caster, aimDir, world);
  caster.primaryCooldownTimerMs = caster.getEffectiveCooldown(ability.cooldownMs);
}

function tryCastSecondary(caster: Player): void {
  const ability = caster.secondaryAbility;
  if (!ability || caster.secondaryCooldownTimerMs > 0) return;

  const aimDir = caster.aimTarget.sub(caster.pos);
  if (aimDir.magSq() < 0.01) return;

  interpreter.executeAbility(ability, caster, aimDir, world);
  caster.secondaryCooldownTimerMs = caster.getEffectiveCooldown(ability.cooldownMs);
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

function canDraftOpen(): boolean {
  return (
    matchManager.mode === 'SANDBOX' || matchManager.state === 'LOBBY'
  );
}

function canCombatInput(): boolean {
  if (draftModal.isOpen()) return false;
  if (matchManager.mode === 'SANDBOX') return true;
  return matchManager.state === 'ROUND_ACTIVE';
}

function handleEquip(selection: DraftSelection): void {
  applyDraftSelection(player, selection);
  if (isIntermissionDraft && matchManager.mode === 'MATCH') {
    matchManager.completeIntermission(player, bot, world, arenaShrink, getHexCenter());
    isIntermissionDraft = false;
  }
}

function handleIntermissionDraft(): void {
  if (intermissionHandled) return;
  intermissionHandled = true;
  isIntermissionDraft = true;

  const cards = generateOfflineDraft('intermission combat upgrade');
  const botSelection = botController.selectDraftCard(cards);
  applyDraftSelection(bot, botSelection);
  draftModal.openIntermission(cards);
}

function handleMatchStateChange(): void {
  if (matchManager.mode !== 'MATCH') return;

  const s = matchManager.state;
  if (s === 'INTERMISSION_DRAFT') {
    handleIntermissionDraft();
  } else {
    intermissionHandled = false;
  }

  if (s === 'ROUND_ACTIVE') {
    matchManager.resetRoundEntities(player, bot, world, arenaShrink, getHexCenter());
  }
}

function handleModeChange(mode: GameMode): void {
  intermissionHandled = false;
  isIntermissionDraft = false;

  if (draftModal.isOpen()) {
    draftModal.close();
  }

  if (mode === 'SANDBOX') {
    arenaShrink.enabled = false;
    arenaShrink.reset();
    loop.setPaused(false);
  } else {
    arenaShrink.enabled = true;
    arenaShrink.reset();
  }
}

function applyPlayerInput(): void {
  let mx = 0;
  let my = 0;
  if (keys.has('w')) my -= 1;
  if (keys.has('s')) my += 1;
  if (keys.has('a')) mx -= 1;
  if (keys.has('d')) mx += 1;
  const move = new Vector2D(mx, my);
  player.inputMove = move.magSq() > 0 ? move.normalize() : Vector2D.zero();

  if (player.primaryCast) tryCastPrimary(player);
  if (player.secondaryCast) tryCastSecondary(player);
}

function syncArenaRadius(dt: number): void {
  if (arenaShrink.enabled) {
    arenaShrink.update(dt);
    world.hexRadius = arenaShrink.currentRadius;
  } else {
    world.hexRadius = arenaShrink.initialRadius;
  }
}

function runSimulationStep(dt: number): void {
  syncArenaRadius(dt);
  applyPlayerInput();

  if (botController.enabled) {
    botController.update(dt, player, world, arenaShrink, interpreter);
  }

  interpreter.updateTrajectories(world, dt);
  applySpatialFields(dt);
  world.step(dt);
  interpreter.processLifecycleEvents(world);
  matchManager.checkRoundEliminations(
    player,
    bot,
    world,
    arenaShrink,
    getHexCenter(),
  );
  particles.update(dt);

  player.clearCastInputs();
  bot.clearCastInputs();
}

function init(): void {
  resize();
  window.addEventListener('resize', resize);

  const center = getHexCenter();
  const hexRadius = getHexRadius();
  world = new PhysicsWorld(center, hexRadius);
  player = new Player(center.clone());
  bot = new Player(center.clone(), ['bot', 'combatant']);
  world.addPlayer(player);
  world.addPlayer(bot);

  interpreter = new Interpreter();
  particles = new ParticleSystem();
  renderer = new CanvasRenderer(ctx);
  interpreter.setParticleSystem(particles);

  player.primaryAbility = structuredClone(PRESETS['Kinetic Railgun']);
  player.secondaryAbility = structuredClone(PRESETS['Phase Nova']);
  bot.primaryAbility = structuredClone(PRESETS['Kinetic Railgun']);
  bot.secondaryAbility = structuredClone(PRESETS['Phase Nova']);

  arenaShrink = new ArenaShrink(hexRadius);
  arenaShrink.enabled = false;
  matchManager = new MatchManager();
  botController = new BotController(bot);

  matchHUD = new MatchHUD({
    onStartMatch: () => {
      if (matchManager.mode !== 'MATCH') return;
      arenaShrink.resize(getHexRadius());
      matchManager.startMatch();
    },
    onPlayAgain: () => {
      if (matchManager.mode !== 'MATCH') return;
      arenaShrink.resize(getHexRadius());
      matchManager.startMatch();
    },
  });

  matchManager.onStateChange = (_state: MatchState) => handleMatchStateChange();
  matchManager.onModeChange = (mode: GameMode) => handleModeChange(mode);

  draftModal = new DraftModal({
    getLoadout: () => ({
      primaryAbility: player.primaryAbility,
      secondaryAbility: player.secondaryAbility,
      passives: player.passives,
    }),
    onEquip: handleEquip,
    onOpenChange: (open) => {
      if (
        matchManager.mode === 'SANDBOX' ||
        (matchManager.state === 'LOBBY' && !isIntermissionDraft)
      ) {
        loop.setPaused(open);
      }
    },
  });

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
      openDraftModal: () => {
        if (canDraftOpen()) draftModal.open();
      },
      matchManager,
      botController,
      arenaShrink,
      onRestartMatch: () => {
        if (matchManager.mode !== 'MATCH') return;
        arenaShrink.resize(getHexRadius());
        matchManager.startMatch();
      },
      onRespawnCombatants: respawnCombatants,
    },
  );

  // Position combatants for sandbox start
  matchManager.respawnAllCombatants(
    player,
    bot,
    world,
    arenaShrink,
    getHexCenter(),
  );

  window.addEventListener('keydown', (e) => {
    if (canDraftOpen()) {
      if (e.key === 'Tab') {
        e.preventDefault();
        draftModal.toggle();
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        draftModal.toggle();
        return;
      }
    }

    keys.add(e.key.toLowerCase());
    if (e.key === ' ') {
      e.preventDefault();
      if (canCombatInput()) {
        player.primaryCast = true;
      }
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  window.addEventListener('mousemove', (e) => {
    if (matchManager.mode === 'SANDBOX' || matchManager.state === 'ROUND_ACTIVE') {
      player.aimTarget = new Vector2D(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (!canCombatInput()) return;
    if (e.button === 0) player.primaryCast = true;
    if (e.button === 2) player.secondaryCast = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  loop = new Loop({
    onUpdate(dt) {
      if (matchManager.mode === 'MATCH') {
        matchManager.update(dt);
      }

      matchHUD.update(
        matchManager.state,
        matchManager.getSnapshot(),
        matchManager.stateTimer,
        matchManager.mode,
      );

      world.hexCenter = getHexCenter();

      if (matchManager.mode === 'SANDBOX') {
        if (draftModal.isOpen()) return;
        runSimulationStep(dt);
        return;
      }

      // MATCH mode state gating
      const state = matchManager.state;
      if (state === 'LOBBY' || state === 'MATCH_OVER' || state === 'INTERMISSION_DRAFT') {
        world.hexRadius = arenaShrink.initialRadius;
        return;
      }

      if (state === 'COUNTDOWN' || state === 'ROUND_OVER') {
        world.hexRadius = arenaShrink.initialRadius;
        return;
      }

      if (state === 'ROUND_ACTIVE') {
        runSimulationStep(dt);
      }
    },
    onRender(alpha) {
      renderer.render(
        world,
        particles,
        alpha,
        debugOptions,
        window.innerWidth,
        window.innerHeight,
        arenaShrink.getShrinkProgress(),
        arenaShrink.isShrinking,
      );
      inspector.updateTelemetry();
    },
  });

  loop.start();
}

init();
