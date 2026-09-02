import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { getGraphicsSettings } from '../devtools/graphicsSettings';
import type { ParticleSystem } from './ParticleSystem';
import { drawHexPlatform } from './canvas/arena';
import { drawLavaHeatWaves, drawLavaSea } from './canvas/background';
import { drawDebugOverlay, type DebugOptions } from './canvas/debug';
import { drawCombatants, drawSummons } from './canvas/entities';
import { drawOverheadHUD } from './canvas/hud';
import { drawProjectiles } from './canvas/projectiles';
import {
  combatEventToFct,
  FloatingCombatTextManager,
} from './canvas/FloatingCombatText';
import { AimingIndicatorRenderer } from './canvas/AimingIndicator';
import { lerpPos } from './canvas/helpers';
import type { CanvasRenderCtx } from './canvas/renderCtx';
import type { Player } from '../entities/Player';
import { SpriteCache } from './canvas/SpriteCache';
import {
  drawConstraints,
  drawObstacles,
  drawTerrainPatches,
  drawZones,
} from './canvas/worldLayers';
import { Vector2D } from '../math/Vector2D';
import { hitFeedbackConfig } from './hitFeedbackConfig';

export type { DebugOptions } from './canvas/debug';

export class CanvasRenderer {
  private ringRotation = 0;
  private spriteCache = new SpriteCache();
  private cachedHexRadius = -1;
  private cachedHexCenterX = NaN;
  private cachedHexCenterY = NaN;
  private cachedHexVertices: Vector2D[] = [];
  private bgCacheCanvas: HTMLCanvasElement | null = null;
  private bgCacheKey = '';
  private fctManager = new FloatingCombatTextManager();
  private aimingRenderer = new AimingIndicatorRenderer();
  private lastRenderMs = 0;
  private hitMarkerTimer = 0;
  private hitMarkerIsHeavy = false;
  private hitMarkerPos: { x: number; y: number } | null = null;

  constructor(private ctx: CanvasRenderingContext2D) {}

  private getRenderCtx(): CanvasRenderCtx {
    return {
      ringRotation: this.ringRotation,
      spriteCache: this.spriteCache,
      cachedHexRadius: this.cachedHexRadius,
      cachedHexCenterX: this.cachedHexCenterX,
      cachedHexCenterY: this.cachedHexCenterY,
      cachedHexVertices: this.cachedHexVertices,
      bgCacheCanvas: this.bgCacheCanvas,
      bgCacheKey: this.bgCacheKey,
    };
  }

  private syncStateFromCtx(state: CanvasRenderCtx): void {
    this.cachedHexRadius = state.cachedHexRadius;
    this.cachedHexCenterX = state.cachedHexCenterX;
    this.cachedHexCenterY = state.cachedHexCenterY;
    this.cachedHexVertices = state.cachedHexVertices;
    this.bgCacheCanvas = state.bgCacheCanvas;
    this.bgCacheKey = state.bgCacheKey;
  }

  render(
    world: PhysicsWorld,
    _particles: ParticleSystem,
    alpha: number,
    debug: DebugOptions,
    width: number,
    height: number,
    shrinkProgress = 0,
    isShrinking = false,
    aimingPlayer: Player | null = null,
  ): void {
    const ctx = this.ctx;
    const now = performance.now();
    const renderDt = this.lastRenderMs > 0 ? (now - this.lastRenderMs) / 1000 : 1 / 60;
    this.lastRenderMs = now;

    for (const event of world.drainCombatVisualEvents()) {
      const { text, type, color } = combatEventToFct(event);
      this.fctManager.spawn(text, event.pos, type, color);
    }

    if (aimingPlayer) {
      for (const marker of world.drainHitMarkerEvents()) {
        if (marker.sourceId !== aimingPlayer.id) continue;
        this.hitMarkerTimer = 0.09;
        this.hitMarkerIsHeavy = marker.isHeavy;
        this.hitMarkerPos = {
          x: aimingPlayer.aimTarget.x,
          y: aimingPlayer.aimTarget.y,
        };
      }
    } else {
      world.drainHitMarkerEvents();
    }

    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - renderDt);
    }

    this.ringRotation += 0.02;
    const state = this.getRenderCtx();

    drawLavaSea(ctx, state, world, width, height);
    if (getGraphicsSettings().lavaHeatWaves) {
      drawLavaHeatWaves(ctx, world, width, height);
    }
    drawHexPlatform(ctx, state, world, shrinkProgress, isShrinking);
    drawTerrainPatches(ctx, world);
    drawZones(ctx, state, world);
    drawObstacles(ctx, state, world);
    drawCombatants(ctx, state, world, alpha);
    drawSummons(ctx, world, alpha);
    drawConstraints(ctx, world);
    drawProjectiles(ctx, state, world, alpha);
    const aimingState = aimingPlayer?.activeAimingState ?? null;
    if (aimingState && aimingPlayer) {
      const origin = lerpPos(aimingPlayer, alpha);
      this.aimingRenderer.render(ctx, aimingState, origin);
    }
    drawOverheadHUD(ctx, world, alpha);

    this.fctManager.update(renderDt);
    this.fctManager.draw(ctx);

    if (hitFeedbackConfig.reticleMarkers && this.hitMarkerTimer > 0 && this.hitMarkerPos) {
      this.drawReticleHitMarker(ctx, this.hitMarkerPos.x, this.hitMarkerPos.y);
    }

    this.syncStateFromCtx(state);

    if (debug.showVectors || debug.showRadii || debug.showIds) {
      drawDebugOverlay(ctx, world, alpha, debug);
    }

  }

  private drawReticleHitMarker(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const stroke = this.hitMarkerIsHeavy ? '#ff007f' : '#ffffff';
    const inner = 6;
    const outer = 14;
    const angles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    for (const a of angles) {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x + cos * inner, y + sin * inner);
      ctx.lineTo(x + cos * outer, y + sin * outer);
      ctx.stroke();
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    for (const a of angles) {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x + cos * inner, y + sin * inner);
      ctx.lineTo(x + cos * outer, y + sin * outer);
      ctx.stroke();
    }
    ctx.restore();
  }
}
