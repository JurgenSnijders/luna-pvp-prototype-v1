import { Camera2D } from '../camera/Camera2D';
import { InspectorUI } from '../devtools/InspectorUI';
import { SpellLibrary } from '../devtools/SpellLibrary';
import { perfMonitor } from '../devtools/PerfMonitor';
import { screenShake } from '../render/ScreenShake';
import { DraftModal } from '../draft/DraftModal';
import { Loop } from '../engine/Loop';
import { PhysicsWorld } from '../engine/PhysicsWorld';
import { BotController } from '../entities/BotController';
import { Player } from '../entities/Player';
import { ArenaShrink } from './ArenaShrink';
import { MatchManager, type GameMode, type MatchState } from './MatchManager';
import { Interpreter } from '../primitives/Interpreter';
import { ActionBarHUD } from '../render/ActionBarHUD';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { MatchHUD } from '../render/MatchHUD';
import { ParticleSystem } from '../render/ParticleSystem';
import { PhysicsDebugLayer } from '../render/PhysicsDebugLayer';
import { CombatLogger } from '../telemetry/CombatLogger';
import { TelemetryModal } from '../telemetry/TelemetryModal';
import { GameApp } from './GameApp';
import { getHexCenter, resize, resetArena, respawnCombatants } from './arena';
import { isCameraInputBlocked, updatePlayerAimFromScreen } from './cameraInput';
import { handleCastInput, cancelPlayerAiming } from './input';
import { assignDefaultLoadout, storeForgedSpell } from './loadout';
import { SpellInventoryManager } from './SpellInventory';
import { ACTION_SLOT_KEYS } from '../types/cards';
import {
  canDraftOpen,
  canCombatInput,
  handleEquip,
  handleMatchStateChange,
  handleModeChange,
} from './matchFlow';
import { drawPerfOverlay } from './perfOverlay';
import { runSimulationStep } from './simulation';
import {
  applyCooldownPacingSettings,
  applyInstabilitySettings,
  applyMovementSettings,
  getStoredCombatantRadius,
  getStoredHexRadius,
} from './settings';
import { subscribeGraphicsSettings, getGraphicsSettings } from '../devtools/graphicsSettings';
import { BackgroundRenderer, createBackgroundCanvas } from '../render/gl/BackgroundRenderer';
import { applyArcadeBezel } from '../ui/arcadeBezel';
import { applyCrtOverlay } from '../ui/crtOverlay';
import { applyPalette } from '../ui/palette';
import { loadFctClusterConfig } from '../render/fctClusterConfig';
import { loadHitFeedbackConfig } from '../render/hitFeedbackConfig';
import { lerpPos } from '../render/canvas/helpers';

function syncWebGLBackground(app: GameApp): void {
  const settings = getGraphicsSettings();
  const renderer = app.backgroundRenderer;
  const active =
    settings.webglBackground && renderer !== null && renderer.isAvailable();
  renderer?.setVisible(active);
  app.renderer.setWebGLBackground(
    active,
    active && renderer ? renderer.getCanvas() : null,
  );
}

function init(app: GameApp): void {
  loadHitFeedbackConfig();
  loadFctClusterConfig();
  app.camera = new Camera2D();
  app.camera.setViewport(window.innerWidth, window.innerHeight);
  resize(app);
  window.addEventListener('resize', () => resize(app));
  document.addEventListener('fullscreenchange', () => resize(app));
  applyCooldownPacingSettings();
  applyInstabilitySettings();

  SpellInventoryManager.initialize();

  const center = getHexCenter();
  const hexRadius = getStoredHexRadius();
  app.world = new PhysicsWorld(center, hexRadius);
  app.world.setViewportBounds(window.innerWidth, window.innerHeight);
  app.world.setBaseHexRadius(hexRadius);
  app.player = new Player(center.clone());
  app.bot = new Player(center.clone(), ['bot', 'combatant']);
  app.world.addPlayer(app.player);
  app.world.addPlayer(app.bot);
  app.world.setCombatantRadius(getStoredCombatantRadius());
  applyMovementSettings(app.player, app.bot, app.world);
  app.camera.snapTo(app.player.pos.x, app.player.pos.y);

  const bgCanvas = createBackgroundCanvas();
  app.backgroundRenderer = new BackgroundRenderer(bgCanvas);
  if (!app.backgroundRenderer.isAvailable()) {
    app.backgroundRenderer = null;
  } else {
    app.backgroundRenderer.resize(window.innerWidth, window.innerHeight);
  }

  app.interpreter = new Interpreter();
  app.particles = new ParticleSystem(document.body);
  app.physicsDebugLayer = new PhysicsDebugLayer();
  app.physicsDebugLayer.resize(window.innerWidth, window.innerHeight);
  const glCtx = app.particles.getGlContext();
  if (glCtx) {
    (window as unknown as { __lunaGlCtx?: typeof glCtx }).__lunaGlCtx = glCtx;
  }
  applyPalette();
  applyCrtOverlay();
  applyArcadeBezel();
  // A tier change moves dprCap, so the world canvas has to be re-sized in step
  // with the GL drawing buffer or the CRT world texture samples at the wrong scale.
  subscribeGraphicsSettings(() => {
    resize(app);
    syncWebGLBackground(app);
    applyPalette();
    applyCrtOverlay();
    applyArcadeBezel();
  });
  app.renderer = new CanvasRenderer(app.ctx);
  syncWebGLBackground(app);
  app.interpreter.setParticleSystem(app.particles);
  perfMonitor.probeCapabilities(app.particles.getGlContext()?.gl ?? null);

  app.player.applyEquippedLoadout();
  app.player.subscribeLoadoutChanges();
  assignDefaultLoadout(app.bot);

  app.arenaShrink = new ArenaShrink(hexRadius);
  app.arenaShrink.enabled = false;
  app.matchManager = new MatchManager();
  app.botController = new BotController(app.bot);
  app.botController.enabled = app.matchManager.mode === 'MATCH';

  app.matchHUD = new MatchHUD({
    onStartMatch: () => {
      if (app.matchManager.mode !== 'MATCH') return;
      app.arenaShrink.resize(getStoredHexRadius());
      app.matchManager.startMatch();
    },
    onPlayAgain: () => {
      if (app.matchManager.mode !== 'MATCH') return;
      app.arenaShrink.resize(getStoredHexRadius());
      app.matchManager.startMatch();
    },
  });

  app.matchManager.onStateChange = (_state: MatchState) => handleMatchStateChange(app);
  app.matchManager.onModeChange = (mode: GameMode) => handleModeChange(app, mode);

  app.spellLibrary = new SpellLibrary({
    onAssign: (slotIndex, schema) => {
      const stored = SpellInventoryManager.addSpell(schema);
      SpellInventoryManager.equipSpell(ACTION_SLOT_KEYS[slotIndex], stored.id);
      app.spellLibrary.addSpell(stored);
    },
  });

  for (const spell of SpellInventoryManager.getCustomSpells()) {
    app.spellLibrary.addSpell(spell);
  }

  app.actionBarHUD = new ActionBarHUD({
    onSlotAssign: (slotIndex, schema) => {
      const stored = SpellInventoryManager.addSpell(schema);
      SpellInventoryManager.equipSpell(ACTION_SLOT_KEYS[slotIndex], stored.id);
      app.spellLibrary.addSpell(stored);
    },
    onEmptySlotClick: (slotIndex) => {
      app.spellLibrary.openForSlot(slotIndex);
    },
  });

  app.draftModal = new DraftModal({
    getLoadout: () => ({
      abilities: [...app.player.abilities],
      passives: app.player.passives,
    }),
    onEquip: (selection) => handleEquip(app, selection),
    onStoreSpell: (ability) => storeForgedSpell(app, ability),
    onOpenChange: (open) => {
      if (
        app.matchManager.mode === 'SANDBOX' ||
        (app.matchManager.state === 'LOBBY' && !app.isIntermissionDraft)
      ) {
        app.loop.setPaused(open);
      }
    },
  });

  app.telemetryModal = new TelemetryModal({
    onOpenChange: (open) => {
      if (app.loop) app.loop.setPaused(open);
    },
    onCopyJson: (ms) => app.copyCombatLog(ms),
  });

  app.inspector = new InspectorUI(
    document.getElementById('inspector-root')!,
    {
      player: app.player,
      bot: app.bot,
      world: app.world,
      camera: app.camera,
      interpreter: app.interpreter,
      renderer: app.renderer,
      getDebugOptions: () => app.debugOptions,
      setDebugOptions: (opts) => {
        app.debugOptions.showVectors = opts.showVectors;
        app.debugOptions.showRadii = opts.showRadii;
        app.debugOptions.showIds = opts.showIds;
      },
      onReset: () => resetArena(app),
      openDraftModal: () => {
        if (canDraftOpen(app)) app.draftModal.open();
      },
      matchManager: app.matchManager,
      botController: app.botController,
      arenaShrink: app.arenaShrink,
      onRestartMatch: () => {
        if (app.matchManager.mode !== 'MATCH') return;
        app.arenaShrink.resize(getStoredHexRadius());
        app.matchManager.startMatch();
      },
      onRespawnCombatants: () => respawnCombatants(app),
    },
  );

  app.matchManager.respawnAllCombatants(
    app.player,
    app.bot,
    app.world,
    app.arenaShrink,
    getHexCenter(),
  );
  app.camera.snapTo(app.player.pos.x, app.player.pos.y);

  let pendingAimMouse: { x: number; y: number } | null = null;
  let aimMouseRafPending = false;
  let middleMouseDown = false;
  let lastPanX = 0;
  let lastPanY = 0;

  const updatePointerState = (e: MouseEvent): void => {
    app.camera.pointerScreenX = e.clientX;
    app.camera.pointerScreenY = e.clientY;
    app.camera.pointerOverGame = !isCameraInputBlocked(e.target);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F8' || (e.code === 'F2' && e.shiftKey)) {
      e.preventDefault();
      app.toggleTelemetryInspector();
      return;
    }

    if (e.code === 'F2') {
      e.preventDefault();
      app.copyCombatLog().then((count) => {
        app.matchHUD.showTransientToast(`Copied ${count} combat events`);
        console.log(`[CombatLogger] Copied ${count} events (last 10s)`);
      });
      return;
    }

    if (e.code === 'F3' || e.code === 'Backquote') {
      e.preventDefault();
      app.togglePhysicsDebug();
      return;
    }

    if (e.code === 'F4') {
      e.preventDefault();
      perfMonitor.toggleOverlay();
      return;
    }

    if (canDraftOpen(app)) {
      if (e.key === 'Tab') {
        e.preventDefault();
        app.draftModal.toggle();
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        app.draftModal.toggle();
        return;
      }
    }

    app.keys.add(e.key.toLowerCase());

    if (
      !e.repeat &&
      !isCameraInputBlocked(e.target) &&
      !app.draftModal.isOpen() &&
      !app.telemetryModal.isOpened()
    ) {
      if (e.code === 'KeyY' || e.code === 'KeyC') {
        app.camera.toggleMode();
        return;
      }
    }

    if (!canCombatInput(app)) return;

    if (e.code === 'Escape') {
      if (cancelPlayerAiming(app)) {
        e.preventDefault();
        return;
      }
    }

    if (e.repeat) return;

    if (e.code === 'KeyQ') handleCastInput(app, 2, true);
    if (e.code === 'KeyE') handleCastInput(app, 3, true);

    if (e.key === ' ') {
      e.preventDefault();
      handleCastInput(app, 4, true);
    }
  });
  window.addEventListener('keyup', (e) => {
    app.keys.delete(e.key.toLowerCase());
    if (!canCombatInput(app)) return;

    if (e.code === 'KeyQ') handleCastInput(app, 2, false);
    if (e.code === 'KeyE') handleCastInput(app, 3, false);
    if (e.key === ' ') handleCastInput(app, 4, false);
  });

  window.addEventListener('mousemove', (e) => {
    updatePointerState(e);

    if (middleMouseDown) {
      const dx = e.clientX - lastPanX;
      const dy = e.clientY - lastPanY;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      app.camera.mode = 'FREE';
      app.camera.panBy(-dx / app.camera.zoom, -dy / app.camera.zoom);
    }

    if (app.matchManager.mode !== 'SANDBOX' && app.matchManager.state !== 'ROUND_ACTIVE') {
      return;
    }
    pendingAimMouse = { x: e.clientX, y: e.clientY };
    if (!aimMouseRafPending) {
      aimMouseRafPending = true;
      requestAnimationFrame(() => {
        aimMouseRafPending = false;
        if (pendingAimMouse) {
          updatePlayerAimFromScreen(app, pendingAimMouse.x, pendingAimMouse.y);
        }
      });
    }
  });

  window.addEventListener('wheel', (e) => {
    if (isCameraInputBlocked(e.target)) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * app.camera.getZoomSpeed();
    if (app.camera.mode === 'FREE') {
      app.camera.setZoomAtScreen(app.camera.targetZoom + delta, e.clientX, e.clientY);
    } else {
      app.camera.setZoom(app.camera.targetZoom + delta);
    }
  }, { passive: false });

  app.canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      middleMouseDown = true;
      lastPanX = e.clientX;
      lastPanY = e.clientY;
      app.camera.mode = 'FREE';
      return;
    }
    if (!canCombatInput(app)) return;
    if (e.button === 0) handleCastInput(app, 0, true);
    if (e.button === 2) handleCastInput(app, 1, true);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 1) {
      middleMouseDown = false;
      return;
    }
    if (!canCombatInput(app)) return;
    if (e.button === 0) handleCastInput(app, 0, false);
    if (e.button === 2) handleCastInput(app, 1, false);
  });
  app.canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  app.loop = new Loop({
    onUpdate(dt) {
      if (app.matchManager.mode === 'MATCH') {
        app.matchManager.update(dt);
      }

      app.matchHUD.update(
        app.matchManager.state,
        app.matchManager.getSnapshot(),
        app.matchManager.stateTimer,
        app.matchManager.mode,
      );

      app.world.hexCenter = getHexCenter();

      if (app.matchManager.mode === 'SANDBOX') {
        if (app.draftModal.isOpen() || app.telemetryModal.isOpened()) return;
        runSimulationStep(app, dt);
        return;
      }

      const state = app.matchManager.state;
      if (state === 'LOBBY' || state === 'MATCH_OVER' || state === 'INTERMISSION_DRAFT') {
        app.world.hexRadius = app.arenaShrink.initialRadius;
        return;
      }

      if (state === 'COUNTDOWN' || state === 'ROUND_OVER') {
        app.world.hexRadius = app.arenaShrink.initialRadius;
        return;
      }

      if (state === 'ROUND_ACTIVE') {
        runSimulationStep(app, dt);
      }
    },
    onRender(alpha) {
      const shake = screenShake.update(1 / 60);
      const followPos = lerpPos(app.player, alpha);
      app.camera.update(1 / 60, followPos);

      const settings = getGraphicsSettings();
      const bg = app.backgroundRenderer;
      const webglBg = settings.webglBackground && bg !== null && bg.isAvailable();
      if (webglBg) {
        bg.render(app.camera, app.world.hexRadius, performance.now());
      }

      app.ctx.save();
      app.camera.applyTransform(app.ctx, shake.x, shake.y);
      app.renderer.render(
        app.world,
        app.particles,
        alpha,
        app.debugOptions,
        app.camera,
        app.arenaShrink.getShrinkProgress(),
        app.arenaShrink.isShrinking,
        app.player,
      );
      if (!app.particles.isWebGL()) {
        app.particles.draw(app.ctx);
      }
      app.ctx.restore();

      const isWebGL = app.particles.isWebGL();
      const showPerfOverlay = perfMonitor.isOverlayVisible();
      if (isWebGL && showPerfOverlay) {
        drawPerfOverlay(app);
      }

      const cameraView = app.camera.getView(shake.x, shake.y);
      const vfxStats = app.particles.render(
        window.innerWidth,
        window.innerHeight,
        cameraView,
      );
      perfMonitor.setCounters({
        liveParticles: vfxStats.liveParticles,
        livePrimitives: vfxStats.livePrimitives,
        drawCalls: vfxStats.drawCalls,
        instanceCount: vfxStats.instanceCount,
        uploadBytes: vfxStats.uploadBytes,
      });

      if (!isWebGL && showPerfOverlay) {
        drawPerfOverlay(app);
      }

      app.physicsDebugLayer.render(app.world, app.camera, alpha, shake.x, shake.y);

      app.inspector.updateTelemetry();
      app.actionBarHUD.update(app.player);
    },
  });

  app.loop.start();

  window.combatLog = {
    dump: (ms?, type?) => CombatLogger.getInstance().dumpConsoleTable(ms, type),
    json: (ms?) => CombatLogger.getInstance().getRecentEvents(ms),
    summary: (ms?) => CombatLogger.getInstance().getEventSummary(ms),
    clear: () => CombatLogger.getInstance().clear(),
    copy: (ms?) => app.copyCombatLog(ms ?? 10_000),
    exportAscii: (ms?) => console.log(CombatLogger.getInstance().exportAsciiTable(ms)),
  };
}

export function startGame(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: true })!;
  const app = new GameApp(canvas, ctx);
  init(app);
}
