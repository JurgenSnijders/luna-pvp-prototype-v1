import type { Camera2D } from '../camera/Camera2D';
import type { InspectorUI } from '../devtools/InspectorUI';
import type { SpellLibrary } from '../devtools/SpellLibrary';
import type { DraftModal } from '../draft/DraftModal';
import type { Loop } from '../engine/Loop';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { BotController } from '../entities/BotController';
import type { Player } from '../entities/Player';
import type { ArenaShrink } from './ArenaShrink';
import type { MatchManager } from './MatchManager';
import type { Interpreter } from '../primitives/Interpreter';
import type { ActionBarHUD } from '../render/ActionBarHUD';
import type { CanvasRenderer, DebugOptions } from '../render/CanvasRenderer';
import type { MatchHUD } from '../render/MatchHUD';
import type { ParticleSystem } from '../render/ParticleSystem';
import type { PhysicsDebugLayer } from '../render/PhysicsDebugLayer';
import { CombatLogger } from '../telemetry/CombatLogger';
import type { TelemetryModal } from '../telemetry/TelemetryModal';

export class GameApp {
  static instance: GameApp | null = null;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera!: Camera2D;
  world!: PhysicsWorld;
  player!: Player;
  bot!: Player;
  interpreter!: Interpreter;
  particles!: ParticleSystem;
  renderer!: CanvasRenderer;
  inspector!: InspectorUI;
  draftModal!: DraftModal;
  actionBarHUD!: ActionBarHUD;
  spellLibrary!: SpellLibrary;
  loop!: Loop;
  matchManager!: MatchManager;
  arenaShrink!: ArenaShrink;
  botController!: BotController;
  matchHUD!: MatchHUD;
  physicsDebugLayer!: PhysicsDebugLayer;
  telemetryModal!: TelemetryModal;
  intermissionHandled = false;
  isIntermissionDraft = false;
  keys = new Set<string>();
  debugOptions: DebugOptions = {
    showVectors: false,
    showRadii: false,
    showIds: false,
  };

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
    GameApp.instance = this;
  }

  togglePhysicsDebug(): void {
    this.world.debugPhysicsEnabled = !this.world.debugPhysicsEnabled;
    if (!this.world.debugPhysicsEnabled) {
      this.world.debugVectors.length = 0;
    }
    console.log('[DEBUG] Physics Overlay:', this.world.debugPhysicsEnabled);
  }

  async copyCombatLog(durationMs = 10_000): Promise<number> {
    const logger = CombatLogger.getInstance();
    const events = logger.getRecentEvents(durationMs);
    const json = logger.exportJson(durationMs);
    await navigator.clipboard.writeText(json);
    return events.length;
  }

  toggleTelemetryInspector(): void {
    this.telemetryModal.toggle();
  }
}
