import {
  BLUR_SHADER,
  BLOOM_THRESHOLD_SHADER,
  COMPOSITE_SHADER,
  CRT_SHADER,
  FULLSCREEN_VERTEX,
  LIGHT_OVERLAY_SHADER,
  OPAQUE_COMPOSITE_SHADER,
  PERSISTENCE_SHADER,
  REACTIVE_SHADER,
  RETRO_SHADER,
  STREAK_EXTRACT_SHADER,
  STREAK_SHADER,
} from './postShaders';
import {
  STREAK_BODY_CAP,
  streakTargetFiltersArena,
  streakTargetNeedsExtract,
  type StreakTarget,
} from './postEffects';
import type { CameraView } from '../../camera/Camera2D';
import { getLutData, LUT_SIZE } from './gradeLuts';
import { getPaletteSize, packPaletteUniform } from './retroPalettes';
import {
  compileShader,
  createFramebuffer,
  createFullscreenQuad,
  createLutTexture,
  linkProgram,
  resizeFramebuffer,
  type FramebufferTarget,
} from './framebuffers';

export interface PostFxLighting {
  enabled: boolean;
  ambient: number;
  tintStrength: number;
}

export interface CrtPresentParams {
  scanline: number;
  curvature: number;
  vignette: number;
  phosphor: number;
  maskType: number;
  bloomIntensity: number;
  bloomPasses: number;
  bloomThreshold: number;
  bloomKnee: number;
  tintColor: [number, number, number];
  tintAmount: number;
  brightness: number;
  time: number;
  effectUniforms: Record<string, number>;
  persistence: {
    enabled: boolean;
    decay: number;
    threshold: number;
    reprojectU: number;
    reprojectV: number;
    reset: boolean;
  };
  retro: {
    enabled: boolean;
    pixelSize: number;
    paletteId: number;
    paletteMix: number;
    dither: number;
  };
  reactive: {
    active: boolean;
    blur: number;
    glitch: number;
    glitchSlices: number;
    glitchChroma: number;
    shock: number;
    shockRadius: number;
    shockWidth: number;
    shockU: number;
    shockV: number;
  };
  grade: {
    streakIntensity: number;
    streakLength: number;
    streakTarget: StreakTarget;
    lutEnabled: boolean;
    lutId: number;
    lutMix: number;
    saturation: number;
    contrast: number;
  };
}

export class PostFX {
  private thresholdProgram: WebGLProgram;
  private blurProgram: WebGLProgram;
  private compositeProgram: WebGLProgram;
  private opaqueCompositeProgram: WebGLProgram;
  private lightOverlayProgram: WebGLProgram;
  private crtProgram: WebGLProgram;
  private persistProgram: WebGLProgram;
  private retroProgram: WebGLProgram;
  private reactiveProgram: WebGLProgram;
  private streakProgram: WebGLProgram;
  private streakExtractProgram: WebGLProgram;
  private fsVao: WebGLVertexArrayObject;
  private sceneFbo: FramebufferTarget | null = null;
  private bloomFboA: FramebufferTarget | null = null;
  private bloomFboB: FramebufferTarget | null = null;
  private streakFbo: FramebufferTarget | null = null;
  private vfxCompositeFbo: FramebufferTarget | null = null;
  private persistFboA: FramebufferTarget | null = null;
  private persistFboB: FramebufferTarget | null = null;
  private persistIndex = 0;
  private persistValid = false;
  private retroFbo: FramebufferTarget | null = null;
  private reactiveFbo: FramebufferTarget | null = null;
  private lightFbo: FramebufferTarget | null = null;
  private lightFboB: FramebufferTarget | null = null;
  private lightScale = 0;
  private lightStencilRequested = false;
  private lightOutputTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private lutId = -1;
  private paletteUniformData = new Float32Array(16 * 3);
  private worldTexture: WebGLTexture | null = null;
  private worldTexW = 0;
  private worldTexH = 0;
  private width = 0;
  private height = 0;
  private hdrRequested = false;
  private hdrActive = false;
  private streakBodyData = new Float32Array(STREAK_BODY_CAP * 4);
  private uniformCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
    const fsT = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_THRESHOLD_SHADER);
    const fsB = compileShader(gl, gl.FRAGMENT_SHADER, BLUR_SHADER);
    const fsC = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_SHADER);
    const fsOpaque = compileShader(gl, gl.FRAGMENT_SHADER, OPAQUE_COMPOSITE_SHADER);
    const fsLightOverlay = compileShader(gl, gl.FRAGMENT_SHADER, LIGHT_OVERLAY_SHADER);
    const fsCrt = compileShader(gl, gl.FRAGMENT_SHADER, CRT_SHADER);
    const fsPersist = compileShader(gl, gl.FRAGMENT_SHADER, PERSISTENCE_SHADER);
    const fsRetro = compileShader(gl, gl.FRAGMENT_SHADER, RETRO_SHADER);
    const fsReactive = compileShader(gl, gl.FRAGMENT_SHADER, REACTIVE_SHADER);
    const fsStreak = compileShader(gl, gl.FRAGMENT_SHADER, STREAK_SHADER);
    const fsStreakExtract = compileShader(gl, gl.FRAGMENT_SHADER, STREAK_EXTRACT_SHADER);
    this.thresholdProgram = linkProgram(gl, vs, fsT);
    this.blurProgram = linkProgram(gl, vs, fsB);
    this.compositeProgram = linkProgram(gl, vs, fsC);
    this.opaqueCompositeProgram = linkProgram(gl, vs, fsOpaque);
    this.lightOverlayProgram = linkProgram(gl, vs, fsLightOverlay);
    this.crtProgram = linkProgram(gl, vs, fsCrt);
    this.persistProgram = linkProgram(gl, vs, fsPersist);
    this.retroProgram = linkProgram(gl, vs, fsRetro);
    this.reactiveProgram = linkProgram(gl, vs, fsReactive);
    this.streakProgram = linkProgram(gl, vs, fsStreak);
    this.streakExtractProgram = linkProgram(gl, vs, fsStreakExtract);
    gl.deleteShader(vs);
    gl.deleteShader(fsT);
    gl.deleteShader(fsB);
    gl.deleteShader(fsC);
    gl.deleteShader(fsOpaque);
    gl.deleteShader(fsLightOverlay);
    gl.deleteShader(fsCrt);
    gl.deleteShader(fsPersist);
    gl.deleteShader(fsRetro);
    gl.deleteShader(fsReactive);
    gl.deleteShader(fsStreak);
    gl.deleteShader(fsStreakExtract);
    const quad = createFullscreenQuad(gl);
    this.fsVao = quad.vao;
  }

  rebuild(): void {
    this.destroyFbos();
    this.uniformCache.clear();
    this.width = 0;
    this.height = 0;
    this.persistValid = false;
    this.lutId = -1;
  }

  private releaseFramebufferTarget(target: FramebufferTarget): void {
    const gl = this.gl;
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.texture);
    if (target.stencilRb) gl.deleteRenderbuffer(target.stencilRb);
  }

  private destroyFbos(): void {
    const gl = this.gl;
    for (const fbo of [
      this.sceneFbo,
      this.bloomFboA,
      this.bloomFboB,
      this.streakFbo,
      this.vfxCompositeFbo,
      this.persistFboA,
      this.persistFboB,
      this.retroFbo,
      this.reactiveFbo,
      this.lightFbo,
      this.lightFboB,
    ]) {
      if (!fbo) continue;
      this.releaseFramebufferTarget(fbo);
    }
    this.sceneFbo = null;
    this.hdrActive = false;
    this.bloomFboA = null;
    this.bloomFboB = null;
    this.streakFbo = null;
    this.vfxCompositeFbo = null;
    this.persistFboA = null;
    this.persistFboB = null;
    this.persistIndex = 0;
    this.retroFbo = null;
    this.reactiveFbo = null;
    this.lightFbo = null;
    this.lightFboB = null;
    this.lightScale = 0;
    this.lightStencilRequested = false;
    this.lightOutputTexture = null;
    if (this.worldTexture) {
      gl.deleteTexture(this.worldTexture);
      this.worldTexture = null;
      this.worldTexW = 0;
      this.worldTexH = 0;
    }
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture);
      this.lutTexture = null;
      this.lutId = -1;
    }
  }

  isHdr(): boolean {
    return this.hdrActive;
  }

  resize(
    width: number,
    height: number,
    bloomRes = 0.5,
    hdr = false,
    lightmapScale = 0,
    lightStencil = false,
  ): void {
    if (hdr !== this.hdrRequested) {
      this.hdrRequested = hdr;
      this.destroyFbos();
      this.width = 0;
      this.height = 0;
    }
    if (lightmapScale !== this.lightScale || lightStencil !== this.lightStencilRequested) {
      this.lightScale = lightmapScale;
      this.lightStencilRequested = lightStencil;
      if (this.lightFbo) {
        this.releaseFramebufferTarget(this.lightFbo);
        this.lightFbo = null;
      }
      if (this.lightFboB) {
        this.releaseFramebufferTarget(this.lightFboB);
        this.lightFboB = null;
      }
    }
    if (width === this.width && height === this.height && this.sceneFbo) {
      this.ensureLightFbo(width, height, lightmapScale, lightStencil);
      return;
    }
    this.width = width;
    this.height = height;
    this.persistValid = false;
    const bw = Math.max(1, Math.floor(width * bloomRes));
    const bh = Math.max(1, Math.floor(height * bloomRes));
    if (!this.sceneFbo) {
      this.sceneFbo = createFramebuffer(this.gl, width, height, this.hdrRequested);
      this.hdrActive = this.sceneFbo.hdr;
      const useHdr = this.hdrActive;
      this.bloomFboA = createFramebuffer(this.gl, bw, bh, useHdr);
      this.bloomFboB = createFramebuffer(this.gl, bw, bh, useHdr);
      this.streakFbo = createFramebuffer(this.gl, bw, bh, useHdr);
      this.vfxCompositeFbo = createFramebuffer(this.gl, width, height, useHdr);
    } else {
      resizeFramebuffer(this.gl, this.sceneFbo, width, height);
      resizeFramebuffer(this.gl, this.bloomFboA!, bw, bh);
      resizeFramebuffer(this.gl, this.bloomFboB!, bw, bh);
      resizeFramebuffer(this.gl, this.streakFbo!, bw, bh);
      resizeFramebuffer(this.gl, this.vfxCompositeFbo!, width, height);
    }
    if (this.persistFboA) {
      resizeFramebuffer(this.gl, this.persistFboA, width, height);
      resizeFramebuffer(this.gl, this.persistFboB!, width, height);
    }
    if (this.retroFbo) {
      resizeFramebuffer(this.gl, this.retroFbo, width, height);
    }
    if (this.reactiveFbo) {
      resizeFramebuffer(this.gl, this.reactiveFbo, width, height);
    }
    this.ensureLightFbo(width, height, lightmapScale, lightStencil);
  }

  private ensureLightFbo(
    width: number,
    height: number,
    lightmapScale: number,
    stencil: boolean,
  ): void {
    if (lightmapScale <= 0) {
      if (this.lightFbo) {
        this.releaseFramebufferTarget(this.lightFbo);
        this.lightFbo = null;
      }
      if (this.lightFboB) {
        this.releaseFramebufferTarget(this.lightFboB);
        this.lightFboB = null;
      }
      return;
    }
    const lw = Math.max(1, Math.floor(width * lightmapScale));
    const lh = Math.max(1, Math.floor(height * lightmapScale));
    const useHdr = this.hdrActive || this.hdrRequested;
    if (!this.lightFbo) {
      this.lightFbo = createFramebuffer(this.gl, lw, lh, useHdr, stencil);
    } else {
      resizeFramebuffer(this.gl, this.lightFbo, lw, lh);
    }
  }

  supportsShadows(): boolean {
    return this.lightFbo?.stencil === true;
  }

  beginLights(): { width: number; height: number } | null {
    if (!this.lightFbo) return null;
    const gl = this.gl;
    this.lightOutputTexture = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFbo.fbo);
    gl.viewport(0, 0, this.lightFbo.width, this.lightFbo.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    const clearMask = gl.COLOR_BUFFER_BIT | (this.lightFbo.stencil ? gl.STENCIL_BUFFER_BIT : 0);
    gl.clear(clearMask);
    return { width: this.lightFbo.width, height: this.lightFbo.height };
  }

  softenLights(passes: number): void {
    if (!this.lightFbo || passes <= 0) return;
    const useHdr = this.lightFbo.hdr;
    if (!this.lightFboB) {
      this.lightFboB = createFramebuffer(
        this.gl,
        this.lightFbo.width,
        this.lightFbo.height,
        useHdr,
        false,
      );
    } else {
      resizeFramebuffer(this.gl, this.lightFboB, this.lightFbo.width, this.lightFbo.height);
    }
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    for (let p = 0; p < passes; p++) {
      this.blurPass(this.lightFbo!.texture, this.lightFboB!, true);
      this.blurPass(this.lightFboB!.texture, this.lightFbo!, false);
    }
    this.lightOutputTexture = this.lightFbo.texture;
  }

  getLightTexture(): WebGLTexture | null {
    return this.lightOutputTexture ?? this.lightFbo?.texture ?? null;
  }

  private bindLightingUniforms(
    program: WebGLProgram,
    lighting: PostFxLighting,
    lightTex: WebGLTexture | null,
  ): void {
    const gl = this.gl;
    const enabled = lighting.enabled && lightTex !== null;
    const locLight = this.uniform(program, 'u_light');
    if (locLight) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, enabled ? lightTex : this.sceneFbo!.texture);
      gl.uniform1i(locLight, 2);
    }
    const locAmbient = this.uniform(program, 'u_ambient');
    if (locAmbient) {
      gl.uniform1f(locAmbient, enabled ? lighting.ambient : 1);
    }
    const locUse = this.uniform(program, 'u_useLighting');
    if (locUse) {
      gl.uniform1f(locUse, enabled ? 1 : 0);
    }
  }

  beginScene(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo!.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Without CRT, bloom-composites the particle scene onto the transparent VFX
   * canvas. With CRT, particles stay in `sceneFbo` for `presentCrt`.
   */
  endSceneAndComposite(
    bloomPasses: number,
    bloomIntensity: number,
    chroma: number,
    bloomThreshold: number,
    bloomKnee: number,
    bufferWidth: number,
    bufferHeight: number,
    crtIntermediate: boolean,
    lighting: PostFxLighting,
  ): void {
    if (crtIntermediate) return;

    const gl = this.gl;
    const lightTex = this.getLightTexture();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (lighting.enabled && lightTex) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.lightOverlayProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lightTex);
      gl.uniform1i(this.uniform(this.lightOverlayProgram, 'u_light')!, 0);
      gl.uniform1f(this.uniform(this.lightOverlayProgram, 'u_ambient')!, lighting.ambient);
      gl.uniform1f(
        this.uniform(this.lightOverlayProgram, 'u_tintStrength')!,
        lighting.tintStrength,
      );
      this.drawFullscreen();
    }

    if (bloomPasses <= 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.blit(this.sceneFbo!.texture);
      return;
    }

    this.extractBloom(this.sceneFbo!.texture, bloomPasses, bloomThreshold, bloomKnee);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.texture);
    gl.uniform1i(this.uniform(this.compositeProgram, 'u_scene')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomFboA!.texture);
    gl.uniform1i(this.uniform(this.compositeProgram, 'u_bloom')!, 1);
    gl.uniform1f(
      this.uniform(this.compositeProgram, 'u_bloomIntensity')!,
      bloomIntensity,
    );
    gl.uniform1f(this.uniform(this.compositeProgram, 'u_chroma')!, chroma);
    this.drawFullscreen();
  }

  /**
   * Uploads the Canvas2D world (Y-flipped into GL), composites VFX over it,
   * blooms that combined image, then applies CRT to the backbuffer.
   */
  presentCrt(
    worldCanvas: HTMLCanvasElement,
    params: CrtPresentParams,
    bufferWidth: number,
    bufferHeight: number,
    effectWidth: number,
    effectHeight: number,
    view: CameraView,
    lighting: PostFxLighting,
  ): void {
    const gl = this.gl;
    this.ensureWorldTexture(worldCanvas.width, worldCanvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.worldTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, worldCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    const target = this.vfxCompositeFbo!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(this.opaqueCompositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.worldTexture);
    gl.uniform1i(this.uniform(this.opaqueCompositeProgram, 'u_world')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.texture);
    gl.uniform1i(this.uniform(this.opaqueCompositeProgram, 'u_vfx')!, 1);
    this.bindLightingUniforms(
      this.opaqueCompositeProgram,
      lighting,
      this.getLightTexture(),
    );
    this.drawFullscreen();

    let sourceTex = target.texture;
    if (params.persistence.enabled) {
      sourceTex = this.applyPersistence(target.texture, bufferWidth, bufferHeight, params);
    } else {
      this.releasePersistTargets();
    }

    if (params.retro.enabled) {
      sourceTex = this.applyRetro(
        sourceTex,
        bufferWidth,
        bufferHeight,
        effectWidth,
        effectHeight,
        params,
      );
    } else {
      this.releaseRetroTargets();
    }

    if (params.reactive.active) {
      sourceTex = this.applyReactive(sourceTex, bufferWidth, bufferHeight, params);
    } else {
      this.releaseReactiveTargets();
    }

    const hasBloom = params.bloomPasses > 0 && params.bloomIntensity > 0;
    let hasStreak = false;
    if (hasBloom) {
      this.extractBloom(sourceTex, params.bloomPasses, params.bloomThreshold, params.bloomKnee);
      if (params.grade.streakIntensity > 0) {
        hasStreak = true;
        this.applyStreak(
          params.grade.streakLength,
          params.grade.streakTarget,
          sourceTex,
          params.bloomThreshold,
          params.bloomKnee,
          effectWidth,
          effectHeight,
          view,
        );
      }
    }

    const grade = params.grade;
    const lutMix = grade.lutEnabled ? grade.lutMix : 0;
    // CRT always samples u_lut (sampler3D). Bind it on unit 3 even when mix is 0
    // so it never shares a unit with the 2D scene/bloom/streak samplers.
    this.ensureLutTexture(grade.lutId);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.crtProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.uniform1i(this.uniform(this.crtProgram, 'u_scene')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, hasBloom ? this.bloomFboA!.texture : sourceTex);
    gl.uniform1i(this.uniform(this.crtProgram, 'u_bloom')!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(
      gl.TEXTURE_2D,
      hasStreak ? this.bloomFboB!.texture : hasBloom ? this.bloomFboA!.texture : sourceTex,
    );
    gl.uniform1i(this.uniform(this.crtProgram, 'u_streak')!, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.uniform1i(this.uniform(this.crtProgram, 'u_lut')!, 3);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_hasBloom')!, hasBloom ? 1 : 0);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_hasStreak')!, hasStreak ? 1 : 0);
    gl.uniform1f(
      this.uniform(this.crtProgram, 'u_streakIntensity')!,
      params.grade.streakIntensity,
    );
    gl.uniform1f(this.uniform(this.crtProgram, 'u_lutMix')!, lutMix);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_saturation')!, grade.saturation);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_contrast')!, grade.contrast);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_bloomIntensity')!, params.bloomIntensity);
    gl.uniform2f(this.uniform(this.crtProgram, 'u_effectResolution')!, effectWidth, effectHeight);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_scanline')!, params.scanline);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_curvature')!, params.curvature);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_vignette')!, params.vignette);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_phosphor')!, params.phosphor);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_maskType')!, params.maskType);
    gl.uniform3f(
      this.uniform(this.crtProgram, 'u_tintColor')!,
      params.tintColor[0],
      params.tintColor[1],
      params.tintColor[2],
    );
    gl.uniform1f(this.uniform(this.crtProgram, 'u_tintAmount')!, params.tintAmount);
    gl.uniform1f(this.uniform(this.crtProgram, 'u_brightness')!, params.brightness);
    for (const [name, value] of Object.entries(params.effectUniforms)) {
      gl.uniform1f(this.uniform(this.crtProgram, name)!, value);
    }
    this.drawFullscreen();
  }

  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let byName = this.uniformCache.get(program);
    if (!byName) {
      byName = new Map();
      this.uniformCache.set(program, byName);
    }
    let loc = byName.get(name);
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(program, name);
      byName.set(name, loc);
    }
    return loc;
  }

  private ensurePersistTargets(width: number, height: number): void {
    if (!this.persistFboA) {
      this.persistFboA = createFramebuffer(this.gl, width, height, this.hdrActive);
      this.persistFboB = createFramebuffer(this.gl, width, height, this.hdrActive);
      this.persistIndex = 0;
      this.persistValid = false;
      return;
    }
    if (this.persistFboA.width !== width || this.persistFboA.height !== height) {
      resizeFramebuffer(this.gl, this.persistFboA, width, height);
      resizeFramebuffer(this.gl, this.persistFboB!, width, height);
      this.persistValid = false;
    }
  }

  private releasePersistTargets(): void {
    if (!this.persistFboA) return;
    const gl = this.gl;
    gl.deleteFramebuffer(this.persistFboA.fbo);
    gl.deleteTexture(this.persistFboA.texture);
    gl.deleteFramebuffer(this.persistFboB!.fbo);
    gl.deleteTexture(this.persistFboB!.texture);
    this.persistFboA = null;
    this.persistFboB = null;
    this.persistIndex = 0;
    this.persistValid = false;
  }

  private applyPersistence(
    srcTex: WebGLTexture,
    width: number,
    height: number,
    params: CrtPresentParams,
  ): WebGLTexture {
    this.ensurePersistTargets(width, height);
    const gl = this.gl;
    const readFbo = this.persistIndex === 0 ? this.persistFboA! : this.persistFboB!;
    const writeFbo = this.persistIndex === 0 ? this.persistFboB! : this.persistFboA!;
    const needsReset = !this.persistValid || params.persistence.reset;
    const decay = needsReset ? 0 : params.persistence.decay;

    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo.fbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.persistProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.uniform(this.persistProgram, 'u_current')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readFbo.texture);
    gl.uniform1i(this.uniform(this.persistProgram, 'u_history')!, 1);
    gl.uniform1f(this.uniform(this.persistProgram, 'u_decay')!, decay);
    gl.uniform1f(
      this.uniform(this.persistProgram, 'u_persistThreshold')!,
      params.persistence.threshold,
    );
    gl.uniform2f(
      this.uniform(this.persistProgram, 'u_reproject')!,
      params.persistence.reprojectU,
      params.persistence.reprojectV,
    );
    this.drawFullscreen();

    this.persistIndex = 1 - this.persistIndex;
    this.persistValid = true;
    return writeFbo.texture;
  }

  private ensureRetroTarget(width: number, height: number): void {
    if (!this.retroFbo) {
      this.retroFbo = createFramebuffer(this.gl, width, height, this.hdrActive);
      return;
    }
    if (this.retroFbo.width !== width || this.retroFbo.height !== height) {
      resizeFramebuffer(this.gl, this.retroFbo, width, height);
    }
  }

  private releaseRetroTargets(): void {
    if (!this.retroFbo) return;
    const gl = this.gl;
    gl.deleteFramebuffer(this.retroFbo.fbo);
    gl.deleteTexture(this.retroFbo.texture);
    this.retroFbo = null;
  }

  private applyRetro(
    srcTex: WebGLTexture,
    width: number,
    height: number,
    effectWidth: number,
    effectHeight: number,
    params: CrtPresentParams,
  ): WebGLTexture {
    this.ensureRetroTarget(width, height);
    const gl = this.gl;
    const target = this.retroFbo!;
    const palettePacked = packPaletteUniform(params.retro.paletteId);
    this.paletteUniformData.set(palettePacked);

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.retroProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.uniform(this.retroProgram, 'u_source')!, 0);
    gl.uniform2f(
      this.uniform(this.retroProgram, 'u_effectResolution')!,
      effectWidth,
      effectHeight,
    );
    gl.uniform1f(this.uniform(this.retroProgram, 'u_pixelSize')!, params.retro.pixelSize);
    gl.uniform1f(this.uniform(this.retroProgram, 'u_paletteMix')!, params.retro.paletteMix);
    gl.uniform1i(
      this.uniform(this.retroProgram, 'u_paletteSize')!,
      getPaletteSize(params.retro.paletteId),
    );
    gl.uniform3fv(
      this.uniform(this.retroProgram, 'u_palette[0]')!,
      this.paletteUniformData,
    );
    gl.uniform1f(this.uniform(this.retroProgram, 'u_dither')!, params.retro.dither);
    this.drawFullscreen();
    return target.texture;
  }

  private ensureReactiveTarget(width: number, height: number): void {
    if (!this.reactiveFbo) {
      this.reactiveFbo = createFramebuffer(this.gl, width, height, this.hdrActive);
      return;
    }
    if (this.reactiveFbo.width !== width || this.reactiveFbo.height !== height) {
      resizeFramebuffer(this.gl, this.reactiveFbo, width, height);
    }
  }

  private releaseReactiveTargets(): void {
    if (!this.reactiveFbo) return;
    const gl = this.gl;
    gl.deleteFramebuffer(this.reactiveFbo.fbo);
    gl.deleteTexture(this.reactiveFbo.texture);
    this.reactiveFbo = null;
  }

  private applyReactive(
    srcTex: WebGLTexture,
    width: number,
    height: number,
    params: CrtPresentParams,
  ): WebGLTexture {
    this.ensureReactiveTarget(width, height);
    const gl = this.gl;
    const target = this.reactiveFbo!;
    const reactive = params.reactive;

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.reactiveProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.uniform(this.reactiveProgram, 'u_source')!, 0);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_time')!, params.time);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_blur')!, reactive.blur);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_glitch')!, reactive.glitch);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_glitchSlices')!, reactive.glitchSlices);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_glitchChroma')!, reactive.glitchChroma);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_shock')!, reactive.shock);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_shockRadius')!, reactive.shockRadius);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_shockWidth')!, reactive.shockWidth);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_shockU')!, reactive.shockU);
    gl.uniform1f(this.uniform(this.reactiveProgram, 'u_shockV')!, reactive.shockV);
    this.drawFullscreen();
    return target.texture;
  }

  private applyStreak(
    streakLength: number,
    target: StreakTarget,
    sourceTex: WebGLTexture,
    threshold: number,
    knee: number,
    effectWidth: number,
    effectHeight: number,
    view: CameraView,
  ): void {
    const gl = this.gl;
    const bloomA = this.bloomFboA!;
    const bloomB = this.bloomFboB!;
    const hexApothem = (view.hexRadius ?? 200) * 0.866025404;
    const filterArena = streakTargetFiltersArena(target);

    let blurSource: WebGLTexture;
    if (streakTargetNeedsExtract(target)) {
      const streakFbo = this.streakFbo!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, streakFbo.fbo);
      gl.viewport(0, 0, streakFbo.width, streakFbo.height);
      gl.useProgram(this.streakExtractProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTex);
      gl.uniform1i(this.uniform(this.streakExtractProgram, 'u_source')!, 0);
      gl.uniform1f(this.uniform(this.streakExtractProgram, 'u_threshold')!, threshold);
      this.bindBloomKnee(this.streakExtractProgram, knee);
      gl.uniform2f(
        this.uniform(this.streakExtractProgram, 'u_resolution')!,
        effectWidth,
        effectHeight,
      );
      gl.uniform2f(
        this.uniform(this.streakExtractProgram, 'u_cameraPos')!,
        view.camX,
        view.camY,
      );
      gl.uniform1f(this.uniform(this.streakExtractProgram, 'u_cameraZoom')!, view.zoom);
      gl.uniform2f(
        this.uniform(this.streakExtractProgram, 'u_shake')!,
        view.shakeX,
        view.shakeY,
      );
      gl.uniform2f(
        this.uniform(this.streakExtractProgram, 'u_hexCenter')!,
        view.hexCenterX ?? 0,
        view.hexCenterY ?? 0,
      );
      gl.uniform1f(this.uniform(this.streakExtractProgram, 'u_hexRadius')!, hexApothem);
      gl.uniform1i(this.uniform(this.streakExtractProgram, 'u_filterArena')!, filterArena ? 1 : 0);

      const bodies = view.streakBodies ?? [];
      const bodyCount = Math.min(bodies.length, STREAK_BODY_CAP);
      this.streakBodyData.fill(0);
      for (let i = 0; i < bodyCount; i++) {
        const body = bodies[i];
        const o = i * 4;
        this.streakBodyData[o] = body.x;
        this.streakBodyData[o + 1] = body.y;
        this.streakBodyData[o + 2] = body.r;
        this.streakBodyData[o + 3] = body.up ?? 0;
      }
      gl.uniform1i(this.uniform(this.streakExtractProgram, 'u_bodyCount')!, bodyCount);
      gl.uniform4fv(
        this.uniform(this.streakExtractProgram, 'u_bodies[0]')!,
        this.streakBodyData,
      );
      this.drawFullscreen();
      blurSource = streakFbo.texture;
    } else {
      blurSource = bloomA.texture;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fbo);
    gl.viewport(0, 0, bloomB.width, bloomB.height);
    gl.useProgram(this.streakProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blurSource);
    gl.uniform1i(this.uniform(this.streakProgram, 'u_source')!, 0);
    gl.uniform2f(
      this.uniform(this.streakProgram, 'u_texelSize')!,
      1 / bloomB.width,
      1 / bloomB.height,
    );
    gl.uniform1f(this.uniform(this.streakProgram, 'u_length')!, streakLength);
    this.drawFullscreen();
  }

  private ensureLutTexture(id: number): void {
    if (this.lutTexture && this.lutId === id) return;
    const gl = this.gl;
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture);
      this.lutTexture = null;
    }
    this.lutTexture = createLutTexture(gl, getLutData(id), LUT_SIZE);
    this.lutId = id;
  }

  private bindBloomKnee(program: WebGLProgram, knee: number): void {
    const gl = this.gl;
    gl.uniform1f(this.uniform(program, 'u_knee')!, knee);
    gl.uniform1f(this.uniform(program, 'u_maxBloom')!, 8);
  }

  private extractBloom(
    source: WebGLTexture,
    bloomPasses: number,
    bloomThreshold: number,
    bloomKnee: number,
  ): void {
    const gl = this.gl;
    const bloomA = this.bloomFboA!;
    const bloomB = this.bloomFboB!;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
    gl.viewport(0, 0, bloomA.width, bloomA.height);
    gl.useProgram(this.thresholdProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(this.uniform(this.thresholdProgram, 'u_source')!, 0);
    gl.uniform1f(this.uniform(this.thresholdProgram, 'u_threshold')!, bloomThreshold);
    this.bindBloomKnee(this.thresholdProgram, bloomKnee);
    this.drawFullscreen();

    for (let pass = 0; pass < bloomPasses; pass++) {
      this.blurPass(bloomA.texture, bloomB, true);
      this.blurPass(bloomB.texture, bloomA, false);
    }
  }

  private ensureWorldTexture(width: number, height: number): void {
    const gl = this.gl;
    if (this.worldTexture && this.worldTexW === width && this.worldTexH === height) return;
    if (this.worldTexture) gl.deleteTexture(this.worldTexture);
    this.worldTexture = gl.createTexture();
    this.worldTexW = width;
    this.worldTexH = height;
    gl.bindTexture(gl.TEXTURE_2D, this.worldTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private blurPass(
    srcTex: WebGLTexture,
    dst: FramebufferTarget,
    horizontal: boolean,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.width, dst.height);
    gl.useProgram(this.blurProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.uniform(this.blurProgram, 'u_source')!, 0);
    gl.uniform2f(
      this.uniform(this.blurProgram, 'u_direction')!,
      horizontal ? 1 : 0,
      horizontal ? 0 : 1,
    );
    gl.uniform2f(
      this.uniform(this.blurProgram, 'u_texelSize')!,
      1 / dst.width,
      1 / dst.height,
    );
    this.drawFullscreen();
  }

  private blit(tex: WebGLTexture): void {
    const gl = this.gl;
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uniform(this.compositeProgram, 'u_scene')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uniform(this.compositeProgram, 'u_bloom')!, 1);
    gl.uniform1f(this.uniform(this.compositeProgram, 'u_bloomIntensity')!, 0);
    gl.uniform1f(this.uniform(this.compositeProgram, 'u_chroma')!, 0);
    this.drawFullscreen();
  }

  private drawFullscreen(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
