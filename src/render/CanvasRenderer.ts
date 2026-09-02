import type { PhysicsWorld } from '../engine/PhysicsWorld';

import type { Camera2D } from '../camera/Camera2D';

import type { ParticleSystem } from './ParticleSystem';

import { drawHexPlatform } from './canvas/arena';

import { drawLavaSeaFallback } from './canvas/background';

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

import { flashArenaCrosshair } from '../ui/palette';



export type { DebugOptions } from './canvas/debug';



export class CanvasRenderer {

  private ringRotation = 0;

  private spriteCache = new SpriteCache();

  private cachedHexRadius = -1;

  private cachedHexCenterX = NaN;

  private cachedHexCenterY = NaN;

  private cachedHexVertices: Vector2D[] = [];

  private fctManager = new FloatingCombatTextManager();

  private aimingRenderer = new AimingIndicatorRenderer();

  private lastRenderMs = 0;

  private useWebGLBackground = false;



  constructor(private ctx: CanvasRenderingContext2D) {}



  setUseWebGLBackground(enabled: boolean): void {

    this.useWebGLBackground = enabled;

  }



  private getRenderCtx(): CanvasRenderCtx {

    return {

      ringRotation: this.ringRotation,

      spriteCache: this.spriteCache,

      cachedHexRadius: this.cachedHexRadius,

      cachedHexCenterX: this.cachedHexCenterX,

      cachedHexCenterY: this.cachedHexCenterY,

      cachedHexVertices: this.cachedHexVertices,

    };

  }



  private syncStateFromCtx(state: CanvasRenderCtx): void {

    this.cachedHexRadius = state.cachedHexRadius;

    this.cachedHexCenterX = state.cachedHexCenterX;

    this.cachedHexCenterY = state.cachedHexCenterY;

    this.cachedHexVertices = state.cachedHexVertices;

  }



  render(

    world: PhysicsWorld,

    _particles: ParticleSystem,

    alpha: number,

    debug: DebugOptions,

    camera: Camera2D,

    shrinkProgress = 0,

    isShrinking = false,

    aimingPlayer: Player | null = null,

  ): void {

    const ctx = this.ctx;

    const now = performance.now();

    const renderDt = this.lastRenderMs > 0 ? (now - this.lastRenderMs) / 1000 : 1 / 60;

    this.lastRenderMs = now;



    for (const event of world.drainCombatVisualEvents()) {

      const { text, type, color, value, kinematicProfile } = combatEventToFct(event);

      this.fctManager.spawn(text, event.pos, type, color, value, kinematicProfile, event.targetId);

    }



    if (aimingPlayer) {

      for (const marker of world.drainHitMarkerEvents()) {

        if (marker.sourceId !== aimingPlayer.id) continue;

        if (hitFeedbackConfig.reticleMarkers) {

          flashArenaCrosshair(marker.isHeavy);

        }

      }

    } else {

      world.drainHitMarkerEvents();

    }



    this.ringRotation += 0.02;

    const state = this.getRenderCtx();



    const rect = camera.getVisibleWorldRect();

    ctx.clearRect(rect.minX, rect.minY, rect.width, rect.height);



    if (!this.useWebGLBackground) {

      drawLavaSeaFallback(ctx, world, camera);

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



    this.syncStateFromCtx(state);



    if (debug.showVectors || debug.showRadii || debug.showIds) {

      drawDebugOverlay(ctx, world, alpha, debug, camera);

    }



  }

}


