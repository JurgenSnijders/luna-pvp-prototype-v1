import type { PhysicsWorld } from '../engine/PhysicsWorld';

import type { Camera2D, StreakBody } from '../camera/Camera2D';

import type { ParticleSystem } from './ParticleSystem';

import { drawHexPlatform } from './canvas/arena';

import { drawLavaSeaFallback } from './canvas/background';

import { decalManager } from './canvas/decals';

import { drawDebugOverlay, type DebugOptions } from './canvas/debug';

import { drawCombatants, drawSummons } from './canvas/entities';

import {
  drawOverheadHUD,
  OVERHEAD_INSTABILITY_FONT_SIZE,
  OVERHEAD_INSTABILITY_LABEL_OFFSET,
  OVERHEAD_STATUS_BAR_TOTAL_WIDTH,
} from './canvas/hud';

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

import { getEffectiveDprCap } from '../devtools/graphicsSettings';
import { STREAK_BODY_CAP } from './gl/postEffects';
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

  private webglBackgroundCanvas: HTMLCanvasElement | null = null;



  constructor(private ctx: CanvasRenderingContext2D) {}



  setWebGLBackground(enabled: boolean, canvas: HTMLCanvasElement | null = null): void {
    this.useWebGLBackground = enabled;
    this.webglBackgroundCanvas = enabled ? canvas : null;
  }

  collectStreakBodies(
    world: PhysicsWorld,
    alpha: number,
    includeEntities: boolean,
  ): StreakBody[] {
    const bodies: StreakBody[] = [];
    const push = (body: StreakBody): void => {
      if (bodies.length >= STREAK_BODY_CAP) return;
      bodies.push(body);
    };
    const hudHalfW = OVERHEAD_STATUS_BAR_TOTAL_WIDTH * 0.5 + 6;
    const hudUp = OVERHEAD_INSTABILITY_LABEL_OFFSET + OVERHEAD_INSTABILITY_FONT_SIZE;
    const glowPad = 14;

    const addCombatant = (
      isDead: boolean,
      stealthed: boolean,
      pos: { x: number; y: number },
      radius: number,
    ): void => {
      if (isDead) return;
      if (includeEntities) {
        push({
          x: pos.x,
          y: pos.y,
          r: Math.max(radius + glowPad, hudHalfW),
          up: radius + hudUp,
        });
        return;
      }
      if (stealthed) return;
      push({
        x: pos.x,
        y: pos.y - radius,
        r: hudHalfW,
        up: hudUp,
      });
    };

    for (const entity of world.players) {
      const pos = lerpPos(entity, alpha);
      addCombatant(entity.isDead, entity.isStealthed(), pos, entity.effectiveRadius);
    }
    for (const dummy of world.dummies) {
      const pos = lerpPos(dummy, alpha);
      addCombatant(dummy.isDead, dummy.isStealthed(), pos, dummy.effectiveRadius);
    }
    for (const summon of world.summons) {
      const pos = lerpPos(summon, alpha);
      addCombatant(
        summon.isDead,
        summon.isStealthed(),
        pos,
        summon.config.radius ?? summon.radius,
      );
    }

    this.fctManager.collectStreakBodies(bodies, STREAK_BODY_CAP);
    return bodies;
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

    if (this.useWebGLBackground && this.webglBackgroundCanvas) {
      const dpr = getEffectiveDprCap(window.innerWidth, window.innerHeight);
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(
        this.webglBackgroundCanvas,
        0,
        0,
        window.innerWidth,
        window.innerHeight,
      );
      ctx.restore();
    } else {
      ctx.clearRect(rect.minX, rect.minY, rect.width, rect.height);
      drawLavaSeaFallback(ctx, world, camera);
    }



    drawHexPlatform(ctx, state, world, shrinkProgress, isShrinking);

    decalManager.render(ctx, performance.now());

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


