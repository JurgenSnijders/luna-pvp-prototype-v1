import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { getGraphicsSettings } from '../devtools/graphicsSettings';
import type { ParticleSystem } from './ParticleSystem';
import { drawHexPlatform } from './canvas/arena';
import { drawLavaHeatWaves, drawLavaSea } from './canvas/background';
import { drawDebugOverlay, type DebugOptions } from './canvas/debug';
import { drawCombatants, drawSummons } from './canvas/entities';
import { drawOverheadHUD } from './canvas/hud';
import { drawProjectiles } from './canvas/projectiles';
import type { CanvasRenderCtx } from './canvas/renderCtx';
import { SpriteCache } from './canvas/SpriteCache';
import {
  drawConstraints,
  drawObstacles,
  drawTerrainPatches,
  drawZones,
} from './canvas/worldLayers';
import { Vector2D } from '../math/Vector2D';

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
  ): void {
    const ctx = this.ctx;
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
    drawOverheadHUD(ctx, world, alpha);

    this.syncStateFromCtx(state);

    if (debug.showVectors || debug.showRadii || debug.showIds) {
      drawDebugOverlay(ctx, world, alpha, debug);
    }

  }
}
