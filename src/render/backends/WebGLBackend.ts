import type { CameraView } from '../../camera/Camera2D';
import { Vector2D } from '../../math/Vector2D';
import type { ImpactVfx } from '../../types/schema';
import { getEffectiveCrtSettings, getTierLimits } from '../../devtools/graphicsSettings';
import type { GLContext } from '../gl/GLContext';
import { InstancedQuadRenderer } from '../gl/InstancedQuadRenderer';
import { PostFX } from '../gl/PostFX';
import { PrimitiveLayer } from '../PrimitiveLayer';
import {
  type ParticleBackend,
  type SpawnPriority,
  type VfxCounters,
} from './ParticleBackend';
import { packParticle, packPrimitive } from './webgl/instancePacking';
import { integrateParticles } from './webgl/particleSim';
import { canSpawnAtCount } from './webgl/spawnPriority';
import {
  burstSparks as burstSparksImpl,
  spawnDisc as spawnDiscImpl,
  spawnFlash as spawnFlashImpl,
  spawnGlow as spawnGlowImpl,
  spawnRing as spawnRingImpl,
  spawnStreak as spawnStreakImpl,
  type WebGLSpawnCtx,
} from './webgl/spawnPrimitives';
import type { SimParticle } from './webgl/types';
import {
  ember as emberImpl,
  expandingRing as expandingRingImpl,
  neonRibbon as neonRibbonImpl,
  spawnAmbientEmber as spawnAmbientEmberImpl,
  spawnDirectionalImpactRing as spawnDirectionalImpactRingImpl,
  trail as trailImpl,
  triggerImpactBurst as triggerImpactBurstImpl,
  triggerMuzzleFlash as triggerMuzzleFlashImpl,
} from './webgl/vfxRecipes';

const EMPTY_COUNTERS: VfxCounters = {
  liveParticles: 0,
  livePrimitives: 0,
  drawCalls: 0,
  instanceCount: 0,
  uploadBytes: 0,
};

export class WebGLBackend implements ParticleBackend {
  readonly name = 'webgl';
  private particles: SimParticle[] = [];
  private renderer: InstancedQuadRenderer;
  private postFx: PostFX;
  private primitives: PrimitiveLayer;
  private elapsed = 0;

  constructor(
    private glCtx: GLContext,
    gl: WebGL2RenderingContext,
  ) {
    this.renderer = new InstancedQuadRenderer(gl);
    this.postFx = new PostFX(gl);
    this.primitives = new PrimitiveLayer();
  }

  private spawnCtx(): WebGLSpawnCtx {
    return {
      particles: this.particles,
      primitives: this.primitives,
      spawnParticle: (p, priority) => this.spawnParticle(p, priority),
      canSpawn: (priority) => this.canSpawn(priority),
    };
  }

  rebuild(): void {
    const gl = this.glCtx.gl;
    if (!gl) return;
    this.renderer.rebuild();
    this.postFx.rebuild();
  }

  beginFrame(dt: number): void {
    this.elapsed += dt;
    this.renderer.beginFrame(dt);
    this.primitives.beginFrame();
  }

  update(dt: number): void {
    this.particles = integrateParticles(this.particles, dt);
    this.primitives.update(dt);

    const data = this.renderer.getInstanceData();

    for (const prim of this.primitives.getActive()) {
      if (prim.additive) continue;
      packPrimitive(this.renderer, data, prim);
    }
    for (const p of this.particles) {
      const alpha = p.peakAlpha * (p.life / p.maxLife);
      if (alpha < 0.02 || p.additive) continue;
      packParticle(this.renderer, data, p, alpha);
    }
    for (const prim of this.primitives.getActive()) {
      if (!prim.additive) continue;
      packPrimitive(this.renderer, data, prim);
    }
    for (const p of this.particles) {
      const alpha = p.peakAlpha * (p.life / p.maxLife);
      if (alpha < 0.02 || !p.additive) continue;
      packParticle(this.renderer, data, p, alpha);
    }
  }

  render(width: number, height: number, view: CameraView): VfxCounters {
    const gl = this.glCtx.gl;
    if (!gl || this.glCtx.isLost()) return EMPTY_COUNTERS;

    const bufferW = gl.drawingBufferWidth;
    const bufferH = gl.drawingBufferHeight;
    const limits = getTierLimits();
    const crt = getEffectiveCrtSettings();
    this.postFx.resize(bufferW, bufferH, limits.bloomResolution);
    this.postFx.beginScene();

    gl.enable(gl.BLEND);
    const stats = this.renderer.drawSorted(width, height, view);

    const chroma = limits.bloomPasses >= 2 && limits.refraction ? 0.002 : 0;
    this.postFx.endSceneAndComposite(
      limits.bloomPasses,
      crt.bloomIntensity,
      chroma,
      crt.bloomThreshold,
      bufferW,
      bufferH,
      crt.webglCrt,
    );

    const worldCanvas = crt.webglCrt
      ? (document.getElementById('game-canvas') as HTMLCanvasElement | null)
      : null;
    if (worldCanvas) {
      this.postFx.presentCrt(
        worldCanvas,
        {
          scanline: crt.scanlineIntensity,
          curvature: crt.curvature,
          vignette: crt.vignette,
          phosphor: crt.phosphor,
          bloomIntensity: crt.bloomIntensity,
          bloomPasses: limits.bloomPasses,
          bloomThreshold: crt.bloomThreshold,
          tintColor: crt.tintColor,
          tintAmount: crt.tintAmount,
          brightness: crt.brightness,
          time: this.elapsed,
          effectUniforms: crt.effectUniforms,
        },
        bufferW,
        bufferH,
        width,
        height,
      );
    }

    return {
      liveParticles: this.particles.length,
      livePrimitives: this.primitives.getActive().length,
      drawCalls: stats.drawCalls + (limits.bloomPasses > 0 ? 3 : 0),
      instanceCount: stats.instanceCount,
      uploadBytes: stats.uploadBytes,
    };
  }

  resize(width: number, height: number): void {
    this.glCtx.resize(width, height);
  }

  getLiveParticleCount(): number {
    return this.particles.length;
  }

  getLivePrimitiveCount(): number {
    return this.primitives.getActive().length;
  }

  destroy(): void {
    this.particles = [];
  }

  private canSpawn(priority: SpawnPriority): boolean {
    const limits = getTierLimits();
    return canSpawnAtCount(this.particles.length, limits.particleBudget, priority);
  }

  private spawnParticle(p: SimParticle, priority: SpawnPriority): void {
    if (!this.canSpawn(priority)) return;
    this.particles.push(p);
  }

  spawnDisc(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    additive: boolean,
    priority: SpawnPriority,
  ): void {
    spawnDiscImpl(this.spawnCtx(), pos, size, color, alpha, additive, priority);
  }

  spawnGlow(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    additive: boolean,
    priority: SpawnPriority,
  ): void {
    spawnGlowImpl(this.spawnCtx(), pos, size, color, alpha, additive, priority);
  }

  spawnRing(
    pos: Vector2D,
    radius: number,
    thickness: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void {
    spawnRingImpl(this.spawnCtx(), pos, radius, thickness, color, alpha, life, priority);
  }

  spawnStreak(
    pos: Vector2D,
    vel: Vector2D,
    length: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void {
    spawnStreakImpl(this.spawnCtx(), pos, vel, length, color, alpha, life, priority);
  }

  spawnFlash(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void {
    spawnFlashImpl(this.spawnCtx(), pos, size, color, alpha, life, priority);
  }

  burstSparks(
    pos: Vector2D,
    count: number,
    color: string,
    priority: SpawnPriority = 'SECONDARY',
  ): void {
    burstSparksImpl(this.spawnCtx(), pos, count, color, priority);
  }

  triggerMuzzleFlash(pos: Vector2D, dir: Vector2D, color: string): void {
    triggerMuzzleFlashImpl(this.spawnCtx(), pos, dir, color);
  }

  triggerImpactBurst(
    pos: Vector2D,
    color: string,
    secondaryColor: string,
    vfxType: ImpactVfx,
    scale = 1,
  ): void {
    triggerImpactBurstImpl(this.spawnCtx(), pos, color, secondaryColor, vfxType, scale);
  }

  trail(pos: Vector2D, color: string, trailKind: string): void {
    trailImpl(this.spawnCtx(), pos, color, trailKind);
  }

  neonRibbon(pos: Vector2D, color: string): void {
    neonRibbonImpl(this.spawnCtx(), pos, color);
  }

  ember(pos: Vector2D): void {
    emberImpl(this.spawnCtx(), pos);
  }

  spawnAmbientEmber(
    bounds: { minX: number; minY: number; width: number; height: number },
    safeCenter: Vector2D,
    safeRadius: number,
  ): void {
    spawnAmbientEmberImpl(this.spawnCtx(), bounds, safeCenter, safeRadius);
  }

  expandingRing(pos: Vector2D, radius: number, color: string): void {
    expandingRingImpl(this.spawnCtx(), pos, radius, color);
  }

  spawnDirectionalImpactRing(pos: Vector2D, normal: Vector2D, color: string): void {
    spawnDirectionalImpactRingImpl(this.spawnCtx(), pos, normal, color);
  }
}
