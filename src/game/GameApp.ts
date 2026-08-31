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

export class GameApp {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
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
  }
}
