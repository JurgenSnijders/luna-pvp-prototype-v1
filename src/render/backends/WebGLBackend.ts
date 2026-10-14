import type { CameraView } from '../../camera/Camera2D';
import { Vector2D } from '../../math/Vector2D';
import type { ImpactVfx, VfxLayer } from '../../types/schema';
import {
  getEffectiveCrtSettings,
  getEffectiveLightingSettings,
  getShadowBlurPasses,
  getTierLimits,
  isHdrActive,
} from '../../devtools/graphicsSettings';
import type { GLContext } from '../gl/GLContext';
import { InstancedQuadRenderer } from '../gl/InstancedQuadRenderer';
import { PostFX } from '../gl/PostFX';
import { reactiveFx } from '../gl/reactiveFx';
import { RibbonRenderer } from '../gl/RibbonRenderer';
import { computeLightScissor, LightRenderer } from '../gl/LightRenderer';
import { ShadowRenderer } from '../gl/ShadowRenderer';
import { selectShadowCasters } from '../shadowGeometry';
import { PrimitiveLayer } from '../PrimitiveLayer';
import { LightLayer } from '../LightLayer';
import { RibbonLayer } from '../RibbonLayer';
import {
  type ParticleBackend,
  type SpawnPriority,
  type VfxCounters,
  parseColor,
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
  zoneHazardPulse as zoneHazardPulseImpl,
  zoneVortexTick as zoneVortexTickImpl,
  statusFrostOrbit as statusFrostOrbitImpl,
  statusKineticSlipstream as statusKineticSlipstreamImpl,
  statusThermalSparks as statusThermalSparksImpl,
  statusVoidCollapse as statusVoidCollapseImpl,
  lavaSizzleParticle as lavaSizzleParticleImpl,
} from './webgl/vfxRecipes';

const EMPTY_COUNTERS: VfxCounters = {
  liveParticles: 0,
  livePrimitives: 0,
  liveRibbons: 0,
  liveLights: 0,
  shadowedLights: 0,
  drawCalls: 0,
  instanceCount: 0,
  uploadBytes: 0,
  hdrActive: false,
};

export class WebGLBackend implements ParticleBackend {
  readonly name = 'webgl';
  private particles: SimParticle[] = [];
  private renderer: InstancedQuadRenderer;
  private ribbonRenderer: RibbonRenderer;
  private lightRenderer: LightRenderer;
  private shadowRenderer: ShadowRenderer;
  private postFx: PostFX;
  private lightPackOrder: number[] = [];
  private shadowCasterIndices: number[] = [];
  private primitives: PrimitiveLayer;
  private ribbons: RibbonLayer;
  private lights: LightLayer;
  private elapsed = 0;
  private lastRenderTime = 0;
  private prevCamX = 0;
  private prevCamY = 0;
  private prevZoom = 1;
  private prevShakeX = 0;
  private prevShakeY = 0;

  constructor(
    private glCtx: GLContext,
    gl: WebGL2RenderingContext,
  ) {
    this.renderer = new InstancedQuadRenderer(gl);
    this.ribbonRenderer = new RibbonRenderer(gl);
    this.lightRenderer = new LightRenderer(gl);
    this.shadowRenderer = new ShadowRenderer(gl);
    this.postFx = new PostFX(gl);
    this.primitives = new PrimitiveLayer();
    this.ribbons = new RibbonLayer();
    this.lights = new LightLayer();
  }

  private spawnCtx(): WebGLSpawnCtx {
    return {
      particles: this.particles,
      primitives: this.primitives,
      spawnParticle: (p, priority) => this.spawnParticle(p, priority),
      canSpawn: (priority) => this.canSpawn(priority),
      light: (x, y, color, radius, intensity, lifeMs) => {
        if (!this.supportsLights()) return;
        const [r, g, b] = parseColor(color);
        this.lights.pushTimedLight(
          x,
          y,
          radius,
          r,
          g,
          b,
          intensity,
          lifeMs,
          performance.now(),
        );
      },
    };
  }

  rebuild(): void {
    const gl = this.glCtx.gl;
    if (!gl) return;
    this.renderer.rebuild();
    this.ribbonRenderer.rebuild();
    this.lightRenderer.rebuild();
    this.shadowRenderer.rebuild();
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
    this.ribbons.update(this.elapsed);
    this.lights.update(performance.now());

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
    const lightingSettings = getEffectiveLightingSettings();
    this.postFx.resize(
      bufferW,
      bufferH,
      limits.bloomResolution,
      isHdrActive(),
      lightingSettings.lightmapScale,
      lightingSettings.shadows,
    );
    this.postFx.beginScene();

    gl.enable(gl.BLEND);
    const stats = this.renderer.drawSorted(width, height, view);
    const ribbonStats = this.ribbonRenderer.draw(
      this.ribbons.getActive(),
      width,
      height,
      view,
      this.elapsed,
    );

    let lightStats = { drawCalls: 0, vertexCount: 0, uploadBytes: 0 };
    let shadowStats = { drawCalls: 0, vertexCount: 0, uploadBytes: 0 };
    let shadowedLights = 0;
    const lightTarget = lightingSettings.enabled ? this.postFx.beginLights() : null;
    if (lightTarget) {
      const activeLights = this.lights.getActive();
      const occluders = view.occluders ?? [];
      const shadowsOn =
        lightingSettings.shadows &&
        this.postFx.supportsShadows() &&
        occluders.length > 0;

      this.lightRenderer.drawLava(
        width,
        height,
        view,
        lightTarget.width,
        lightTarget.height,
      );

      const packOrder = this.lightPackOrder;
      packOrder.length = 0;
      const casterIndices = this.shadowCasterIndices;
      casterIndices.length = 0;

      if (shadowsOn) {
        selectShadowCasters(
          activeLights,
          occluders,
          lightingSettings.maxShadowedLights,
          casterIndices,
        );
        shadowedLights = casterIndices.length;
        const casterSet = new Set(casterIndices);
        packOrder.push(...casterIndices);
        for (let i = 0; i < activeLights.length; i++) {
          if (!casterSet.has(i)) packOrder.push(i);
        }
      } else {
        for (let i = 0; i < activeLights.length; i++) packOrder.push(i);
      }

      const packedSlots = this.lightRenderer.pack(activeLights, packOrder);

      if (shadowsOn && shadowedLights > 0) {
        const penumbra = 1 - lightingSettings.shadowStrength;
        for (let slot = 0; slot < shadowedLights; slot++) {
          const light = activeLights[casterIndices[slot]];
          const scissor = computeLightScissor(
            light,
            view,
            lightTarget.width,
            lightTarget.height,
            width,
            height,
          );
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(scissor.x, scissor.y, scissor.w, scissor.h);
          gl.clear(gl.STENCIL_BUFFER_BIT);

          gl.colorMask(false, false, false, false);
          gl.enable(gl.STENCIL_TEST);
          gl.stencilFunc(gl.ALWAYS, 1, 0xff);
          gl.stencilOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
          const vol = this.shadowRenderer.drawVolumes(
            light,
            occluders,
            view,
            lightTarget.width,
            lightTarget.height,
            width,
            height,
          );
          shadowStats.drawCalls += vol.drawCalls;
          shadowStats.vertexCount += vol.vertexCount;
          shadowStats.uploadBytes += vol.uploadBytes;

          gl.colorMask(true, true, true, true);
          gl.stencilFunc(gl.EQUAL, 0, 0xff);
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
          const lit = this.lightRenderer.drawRange(
            slot,
            1,
            1,
            view,
            lightTarget.width,
            lightTarget.height,
            width,
            height,
          );
          lightStats.drawCalls += lit.drawCalls;

          if (penumbra > 0.001) {
            gl.stencilFunc(gl.EQUAL, 1, 0xff);
            const umbra = this.lightRenderer.drawRange(
              slot,
              1,
              penumbra,
              view,
              lightTarget.width,
              lightTarget.height,
              width,
              height,
            );
            lightStats.drawCalls += umbra.drawCalls;
          }
          gl.disable(gl.SCISSOR_TEST);
        }
        gl.disable(gl.STENCIL_TEST);
        if (packedSlots > shadowedLights) {
          const rest = this.lightRenderer.drawRange(
            shadowedLights,
            packedSlots - shadowedLights,
            1,
            view,
            lightTarget.width,
            lightTarget.height,
            width,
            height,
          );
          lightStats.drawCalls += rest.drawCalls;
        }
      } else if (packedSlots > 0) {
        const all = this.lightRenderer.drawRange(
          0,
          packedSlots,
          1,
          view,
          lightTarget.width,
          lightTarget.height,
          width,
          height,
        );
        lightStats = all;
      }

      const blurPasses = getShadowBlurPasses(lightingSettings.shadowSoftness);
      this.postFx.softenLights(blurPasses);
      gl.disable(gl.SCISSOR_TEST);
    }
    this.lights.clearFrameLights();

    const postFxLighting = {
      enabled: lightingSettings.enabled,
      ambient: lightingSettings.ambient,
      tintStrength: lightingSettings.lightTint,
    };

    const chroma = limits.bloomPasses >= 2 && limits.refraction ? 0.002 : 0;
    this.postFx.endSceneAndComposite(
      limits.bloomPasses,
      crt.bloomIntensity,
      chroma,
      crt.bloomThreshold,
      crt.bloomKnee,
      bufferW,
      bufferH,
      crt.webglCrt,
      postFxLighting,
    );

    const worldCanvas = crt.webglCrt
      ? (document.getElementById('game-canvas') as HTMLCanvasElement | null)
      : null;

    const now = performance.now();
    const frameDt = this.lastRenderTime
      ? Math.min((now - this.lastRenderTime) / 1000, 0.1)
      : 1 / 60;
    this.lastRenderTime = now;
    reactiveFx.update(frameDt, crt.reactive);

    let reactiveActive = false;
    if (worldCanvas) {
      const moveX =
        -(view.camX - this.prevCamX) * view.zoom + (view.shakeX - this.prevShakeX);
      const moveY =
        -(view.camY - this.prevCamY) * view.zoom + (view.shakeY - this.prevShakeY);
      const zoomChanged =
        this.prevZoom > 0 &&
        Math.abs(view.zoom - this.prevZoom) / this.prevZoom > 0.02;
      const decay = Math.pow(crt.persistence.decay, frameDt * 60);

      const snap = reactiveFx.snapshot();
      const shockLive = snap.shockAge < reactiveFx.getShockDuration();
      const sx = width / 2 + view.shakeX + (snap.worldX - view.camX) * view.zoom;
      const sy = height / 2 + view.shakeY + (snap.worldY - view.camY) * view.zoom;
      const reactiveBlur = crt.reactive.blurAmount * snap.blur;
      const reactiveGlitch = crt.reactive.glitchAmount * snap.glitch;
      const reactiveShock =
        crt.reactive.shockStrength * (shockLive ? snap.shock : 0);
      reactiveActive =
        crt.reactive.enabled &&
        (reactiveBlur > 0.001 || reactiveGlitch > 0.001 || reactiveShock > 0.001);

      this.postFx.presentCrt(
        worldCanvas,
        {
          scanline: crt.scanlineIntensity,
          curvature: crt.curvature,
          vignette: crt.vignette,
          phosphor: crt.phosphor,
          maskType: crt.maskType,
          bloomIntensity: crt.bloomIntensity,
          bloomPasses: limits.bloomPasses,
          bloomThreshold: crt.bloomThreshold,
          bloomKnee: crt.bloomKnee,
          tintColor: crt.tintColor,
          tintAmount: crt.tintAmount,
          brightness: crt.brightness,
          time: this.elapsed,
          effectUniforms: crt.effectUniforms,
          persistence: {
            enabled: crt.persistence.enabled,
            decay,
            threshold: crt.persistence.threshold,
            reprojectU: -moveX / width,
            reprojectV: moveY / height,
            reset: zoomChanged,
          },
          retro: crt.retro,
          reactive: {
            active: reactiveActive,
            blur: reactiveBlur,
            glitch: reactiveGlitch,
            glitchSlices: crt.reactive.glitchSlices,
            glitchChroma: crt.reactive.glitchChroma,
            shock: reactiveShock,
            shockRadius: snap.shockAge * crt.reactive.shockSpeed,
            shockWidth: crt.reactive.shockWidth,
            shockU: sx / width,
            shockV: 1 - sy / height,
          },
          grade: crt.grade,
        },
        bufferW,
        bufferH,
        width,
        height,
        view,
        postFxLighting,
      );

      this.prevCamX = view.camX;
      this.prevCamY = view.camY;
      this.prevZoom = view.zoom;
      this.prevShakeX = view.shakeX;
      this.prevShakeY = view.shakeY;
    }

    return {
      liveParticles: this.particles.length,
      livePrimitives: this.primitives.getActive().length,
      liveRibbons: this.ribbons.getCount(),
      liveLights: this.lights.getCount(),
      shadowedLights,
      drawCalls:
        stats.drawCalls +
        ribbonStats.drawCalls +
        lightStats.drawCalls +
        shadowStats.drawCalls +
        (lightTarget ? 1 : 0) +
        (limits.bloomPasses > 0 ? 3 : 0) +
        (crt.persistence.enabled ? 1 : 0) +
        (crt.retro.enabled ? 1 : 0) +
        (reactiveActive ? 1 : 0) +
        (crt.grade.streakIntensity > 0 &&
        limits.bloomPasses > 0 &&
        crt.bloomIntensity > 0
          ? crt.grade.streakTarget !== 'ALL'
            ? 2
            : 1
          : 0),
      instanceCount: stats.instanceCount,
      uploadBytes:
        stats.uploadBytes +
        ribbonStats.uploadBytes +
        lightStats.uploadBytes +
        shadowStats.uploadBytes,
      hdrActive: this.postFx.isHdr(),
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
    this.ribbons.clear();
    this.lights.clearAll();
  }

  supportsRibbons(): boolean {
    return getTierLimits().maxRibbons > 0;
  }

  supportsLights(): boolean {
    return getTierLimits().maxLights > 0;
  }

  pushFrameLight(
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
  ): void {
    if (!this.supportsLights()) return;
    this.lights.pushFrameLight(x, y, radius, r, g, b, intensity);
  }

  pushTimedLight(
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
    lifeMs: number,
  ): void {
    if (!this.supportsLights()) return;
    this.lights.pushTimedLight(
      x,
      y,
      radius,
      r,
      g,
      b,
      intensity,
      lifeMs,
      performance.now(),
    );
  }

  ribbonPush(
    id: string,
    pos: Vector2D,
    color: string,
    width: number,
    intensity: number,
    pointLifetimeMs?: number,
  ): void {
    if (!this.supportsRibbons()) {
      neonRibbonImpl(this.spawnCtx(), pos, color);
      return;
    }
    const [r, g, b] = parseColor(color);
    const tierLife = getTierLimits().ribbonPointLifetimeMs / 1000;
    const life = pointLifetimeMs !== undefined ? pointLifetimeMs / 1000 : tierLife;
    const added = this.ribbons.push(
      id,
      pos.x,
      pos.y,
      r,
      g,
      b,
      width,
      intensity,
      this.elapsed,
      life,
    );
    if (!added) neonRibbonImpl(this.spawnCtx(), pos, color);
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
    intensity?: number,
  ): void {
    spawnRingImpl(this.spawnCtx(), pos, radius, thickness, color, alpha, life, priority, intensity);
  }

  spawnStreak(
    pos: Vector2D,
    vel: Vector2D,
    length: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
    intensity?: number,
  ): void {
    spawnStreakImpl(this.spawnCtx(), pos, vel, length, color, alpha, life, priority, intensity);
  }

  spawnFlash(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
    intensity?: number,
  ): void {
    spawnFlashImpl(this.spawnCtx(), pos, size, color, alpha, life, priority, intensity);
  }

  burstSparks(
    pos: Vector2D,
    count: number,
    color: string,
    priority: SpawnPriority = 'SECONDARY',
    intensity?: number,
  ): void {
    burstSparksImpl(this.spawnCtx(), pos, count, color, priority, intensity);
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
    layers?: VfxLayer[],
    emissiveMul = 1,
  ): void {
    triggerImpactBurstImpl(
      this.spawnCtx(),
      pos,
      color,
      secondaryColor,
      vfxType,
      scale,
      layers,
      emissiveMul,
    );
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

  zoneVortexTick(pos: Vector2D, radius: number, color: string): void {
    zoneVortexTickImpl(this.spawnCtx(), pos, radius, color);
  }

  zoneHazardPulse(pos: Vector2D, radius: number, color: string): void {
    zoneHazardPulseImpl(this.spawnCtx(), pos, radius, color);
  }

  statusFrost(pos: Vector2D, radius: number): void {
    statusFrostOrbitImpl(this.spawnCtx(), pos, radius);
  }

  statusThermal(pos: Vector2D, radius: number, intensity: number, color: string): void {
    statusThermalSparksImpl(this.spawnCtx(), pos, radius, intensity, color);
  }

  statusVoid(pos: Vector2D, radius: number, color: string): void {
    statusVoidCollapseImpl(this.spawnCtx(), pos, radius, color);
  }

  statusKinetic(pos: Vector2D, velocity: Vector2D): void {
    statusKineticSlipstreamImpl(this.spawnCtx(), pos, velocity);
  }

  emitLavaSizzle(pos: Vector2D): void {
    lavaSizzleParticleImpl(this.spawnCtx(), pos);
  }
}
