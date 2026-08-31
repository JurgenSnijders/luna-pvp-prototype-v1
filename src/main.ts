import { compileAbilityPayload, generateOfflineDraft } from './ai/Synthesizer';
import { balanceAbilitySchema, sanitizeAbilitySchema } from './ai/BudgetEngine';
import { InspectorUI } from './devtools/InspectorUI';
import { PRESETS } from './devtools/Presets';
import { SpellLibrary } from './devtools/SpellLibrary';
import { getGraphicsSettings } from './devtools/graphicsSettings';
import { DraftModal } from './draft/DraftModal';
import { Loop } from './engine/Loop';
import {
  DEFAULT_COMBATANT_RADIUS,
  MAX_COMBATANT_RADIUS,
  MAX_HEX_RADIUS,
  MIN_COMBATANT_RADIUS,
  MIN_HEX_RADIUS,
  PhysicsWorld,
} from './engine/PhysicsWorld';
import { BotController } from './entities/BotController';
import { Player } from './entities/Player';
import { ArenaShrink } from './game/ArenaShrink';
import { MatchManager, type GameMode, type MatchState } from './game/MatchManager';
import { applyField } from './primitives/Fields';
import { Interpreter } from './primitives/Interpreter';
import { Vector2D } from './math/Vector2D';
import { ActionBarHUD } from './render/ActionBarHUD';
import { CanvasRenderer, type DebugOptions } from './render/CanvasRenderer';
import { MatchHUD } from './render/MatchHUD';
import { ParticleSystem } from './render/ParticleSystem';
import { ACTION_SLOT_INDEX, type DraftSelection } from './types/cards';
import type { AbilitySchema } from './types/schema';

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
let actionBarHUD: ActionBarHUD;
let spellLibrary: SpellLibrary;
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

const ARENA_HEX_RADIUS_KEY = 'LUNA_ARENA_HEX_RADIUS';
const DEFAULT_ARENA_HEX_RADIUS = 340;

function getStoredHexRadius(): number {
  const raw = parseFloat(localStorage.getItem(ARENA_HEX_RADIUS_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_ARENA_HEX_RADIUS;
  return Math.max(MIN_HEX_RADIUS, Math.min(MAX_HEX_RADIUS, value));
}

const COMBATANT_RADIUS_KEY = 'LUNA_COMBATANT_RADIUS';

function getStoredCombatantRadius(): number {
  const raw = parseFloat(localStorage.getItem(COMBATANT_RADIUS_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_COMBATANT_RADIUS;
  return Math.max(MIN_COMBATANT_RADIUS, Math.min(MAX_COMBATANT_RADIUS, value));
}

const COOLDOWN_SCALE_KEY = 'LUNA_COOLDOWN_SCALE';
const GLOBAL_COOLDOWN_MS_KEY = 'LUNA_GLOBAL_COOLDOWN_MS';
const DEFAULT_COOLDOWN_SCALE = 1.5;
const DEFAULT_GLOBAL_COOLDOWN_MS = 350;
const MIN_COOLDOWN_SCALE = 0.5;
const MAX_COOLDOWN_SCALE = 3.0;
const MIN_GLOBAL_COOLDOWN_MS = 0;
const MAX_GLOBAL_COOLDOWN_MS = 1000;

function getStoredCooldownScale(): number {
  const raw = parseFloat(localStorage.getItem(COOLDOWN_SCALE_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_COOLDOWN_SCALE;
  return Math.max(MIN_COOLDOWN_SCALE, Math.min(MAX_COOLDOWN_SCALE, value));
}

function getStoredGlobalCooldownMs(): number {
  const raw = parseFloat(localStorage.getItem(GLOBAL_COOLDOWN_MS_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_GLOBAL_COOLDOWN_MS;
  return Math.max(MIN_GLOBAL_COOLDOWN_MS, Math.min(MAX_GLOBAL_COOLDOWN_MS, value));
}

function applyCooldownPacingSettings(): void {
  Player.globalCooldownScale = getStoredCooldownScale();
  Player.globalCooldownDurationMs = getStoredGlobalCooldownMs();
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
  world?.setViewportBounds(window.innerWidth, window.innerHeight);
  arenaShrink?.resize(getStoredHexRadius());
}

function assignDefaultLoadout(target: Player): void {
  target.setAbility(0, structuredClone(PRESETS['Kinetic Railgun']));
  target.setAbility(1, structuredClone(PRESETS['Graviton Boomerang']));
  target.setAbility(2, structuredClone(PRESETS['Cryo Ice Trail']));
  target.setAbility(3, structuredClone(PRESETS['Singularity Scatter']));
  target.setAbility(4, structuredClone(PRESETS['Phase Nova']));
}

// Phase 2 lazy compilation: per-slot generation counter (module-level, not per-target — the
// bot draft path always carries a full abilityPayload today, so it never reaches the async
// branch below). A newer equip on the same slot bumps this, so a slower in-flight compile
// that resolves later is detected as stale and discarded instead of clobbering the new pick.
const compileGen: number[] = [0, 0, 0, 0, 0];
// Applied instead of the ability's real cooldown right after a lazy compile resolves, so the
// slot has a brief, deliberate "arming" beat rather than snapping instantly to ready.
const COMPILE_READY_DELAY_MS = 500;

function applyDraftSelection(target: Player, selection: DraftSelection): void {
  const { card, slot } = selection;

  if (slot === 'PASSIVE' && card.passivePayload) {
    for (const mod of card.passivePayload) {
      target.applyPassiveModifier(mod);
    }
    return;
  }

  if (card.type !== 'ACTIVE_ABILITY') return;

  const slotIndex = ACTION_SLOT_INDEX[slot as keyof typeof ACTION_SLOT_INDEX];
  if (slotIndex === undefined) return;
  const category = card.category ?? 'SECONDARY';

  if (card.abilityPayload) {
    const ability = sanitizeAbilitySchema(structuredClone(card.abilityPayload), category);
    target.setAbility(slotIndex, ability);
    if (target === player) {
      spellLibrary.addSpell(ability);
    }
    return;
  }

  // Token-diet metadata card (no abilityPayload yet): mark the slot compiling, close the
  // modal instantly (already done by DraftModal.equip), and synthesize the physics schema
  // in the background so the player can keep moving/casting other slots meanwhile.
  target.setSlotCompiling(slotIndex, true);
  const gen = ++compileGen[slotIndex];
  const baseAbility = target.getAbility(slotIndex) ?? undefined;

  const resolveCompiled = (schema: AbilitySchema): void => {
    if (compileGen[slotIndex] !== gen) return; // superseded by a newer equip on this slot
    const ability = balanceAbilitySchema(sanitizeAbilitySchema(schema, category), category);
    target.setAbility(slotIndex, ability);
    target.setSlotCompiling(slotIndex, false);
    target.cooldownTimersMs[slotIndex] = COMPILE_READY_DELAY_MS;
    target.slotCooldownTotalsMs[slotIndex] = COMPILE_READY_DELAY_MS;
    if (target === player) {
      spellLibrary.addSpell(ability);
    }
  };

  compileAbilityPayload(card, baseAbility)
    .then(resolveCompiled)
    .catch(() => {
      // compileAbilityPayload already falls back internally and should never reject — this
      // only guards against the compiling flag getting stuck if it somehow does.
      if (compileGen[slotIndex] !== gen) return;
      resolveCompiled(sanitizeAbilitySchema(structuredClone(baseAbility ?? {}), category));
    });
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
    dummy.health = dummy.maxHealth;
  }
  world.setCombatantRadius(world.getCombatantRadius());
}

function tryCastSlot(caster: Player, slotIndex: number): void {
  const ability = caster.getAbility(slotIndex);
  if (!ability || !caster.isSlotReady(slotIndex)) return;

  const aimDir = caster.aimTarget.sub(caster.pos);
  if (aimDir.magSq() < 0.01) return;

  const heading = aimDir.normalize();
  interpreter.executeAbility(
    ability,
    {
      origin: caster.pos.clone(),
      heading,
      caster,
      depth: 0,
    },
    world,
  );
  caster.triggerSlotCooldown(slotIndex);
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
    botController.enabled = false;
  } else {
    arenaShrink.enabled = true;
    arenaShrink.reset();
    botController.enabled = true;
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
  world.updateSpatialZones(dt);
  applySpatialFields(dt);
  world.step(dt);
  interpreter.processLifecycleEvents(world, dt);

  for (const impact of world.pendingWallImpacts) {
    particles.burstSparks(impact, 6, '#ffaa44');
  }
  for (const entity of world.getCombatants()) {
    if (entity.tags.has('in_lava') && Math.random() < 0.2) {
      particles.ember(entity.pos);
    }
  }
  if (getGraphicsSettings().ambientEmbers) {
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      particles.spawnAmbientEmber(
        { width: window.innerWidth, height: window.innerHeight },
        world.hexCenter,
        world.hexRadius,
      );
    }
  }

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
  applyCooldownPacingSettings();

  const center = getHexCenter();
  const hexRadius = getStoredHexRadius();
  world = new PhysicsWorld(center, hexRadius);
  world.setViewportBounds(window.innerWidth, window.innerHeight);
  world.setBaseHexRadius(hexRadius);
  player = new Player(center.clone());
  bot = new Player(center.clone(), ['bot', 'combatant']);
  world.addPlayer(player);
  world.addPlayer(bot);
  world.setCombatantRadius(getStoredCombatantRadius());

  interpreter = new Interpreter();
  particles = new ParticleSystem();
  renderer = new CanvasRenderer(ctx);
  interpreter.setParticleSystem(particles);

  assignDefaultLoadout(player);
  assignDefaultLoadout(bot);

  arenaShrink = new ArenaShrink(hexRadius);
  arenaShrink.enabled = false;
  matchManager = new MatchManager();
  botController = new BotController(bot);
  botController.enabled = matchManager.mode === 'MATCH';

  matchHUD = new MatchHUD({
    onStartMatch: () => {
      if (matchManager.mode !== 'MATCH') return;
      arenaShrink.resize(getStoredHexRadius());
      matchManager.startMatch();
    },
    onPlayAgain: () => {
      if (matchManager.mode !== 'MATCH') return;
      arenaShrink.resize(getStoredHexRadius());
      matchManager.startMatch();
    },
  });

  matchManager.onStateChange = (_state: MatchState) => handleMatchStateChange();
  matchManager.onModeChange = (mode: GameMode) => handleModeChange(mode);

  spellLibrary = new SpellLibrary({
    onAssign: (slotIndex, schema) => {
      player.setAbility(slotIndex, structuredClone(schema));
    },
  });

  actionBarHUD = new ActionBarHUD({
    onSlotAssign: (slotIndex, schema) => {
      player.setAbility(slotIndex, structuredClone(schema));
    },
    onEmptySlotClick: (slotIndex) => {
      spellLibrary.openForSlot(slotIndex);
    },
  });

  draftModal = new DraftModal({
    getLoadout: () => ({
      abilities: [...player.abilities],
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
        arenaShrink.resize(getStoredHexRadius());
        matchManager.startMatch();
      },
      onRespawnCombatants: respawnCombatants,
    },
  );

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

    if (!canCombatInput()) return;

    if (e.code === 'KeyQ') tryCastSlot(player, 2);
    if (e.code === 'KeyE') tryCastSlot(player, 3);

    if (e.key === ' ') {
      e.preventDefault();
      tryCastSlot(player, 4);
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
    if (e.button === 0) tryCastSlot(player, 0);
    if (e.button === 2) tryCastSlot(player, 1);
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
      actionBarHUD.update(player);
    },
  });

  loop.start();
}

init();
