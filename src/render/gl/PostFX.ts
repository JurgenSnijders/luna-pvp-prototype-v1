import {
  BLUR_SHADER,
  BLOOM_THRESHOLD_SHADER,
  COMPOSITE_SHADER,
  CRT_SHADER,
  FULLSCREEN_VERTEX,
  OPAQUE_COMPOSITE_SHADER,
  PERSISTENCE_SHADER,
  REACTIVE_SHADER,
  RETRO_SHADER,
  STREAK_SHADER,
} from './postShaders';
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

export interface CrtPresentParams {
  scanline: number;
  curvature: number;
  vignette: number;
  phosphor: number;
  maskType: number;
  bloomIntensity: number;
  bloomPasses: number;
  bloomThreshold: number;
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
  private crtProgram: WebGLProgram;
  private persistProgram: WebGLProgram;
  private retroProgram: WebGLProgram;
  private reactiveProgram: WebGLProgram;
  private streakProgram: WebGLProgram;
  private fsVao: WebGLVertexArrayObject;
  private sceneFbo: FramebufferTarget | null = null;
  private bloomFboA: FramebufferTarget | null = null;
  private bloomFboB: FramebufferTarget | null = null;
  private vfxCompositeFbo: FramebufferTarget | null = null;
  private persistFboA: FramebufferTarget | null = null;
  private persistFboB: FramebufferTarget | null = null;
  private persistIndex = 0;
  private persistValid = false;
  private retroFbo: FramebufferTarget | null = null;
  private reactiveFbo: FramebufferTarget | null = null;
  private lutTexture: WebGLTexture | null = null;
  private lutId = -1;
  private paletteUniformData = new Float32Array(16 * 3);
  private worldTexture: WebGLTexture | null = null;
  private worldTexW = 0;
  private worldTexH = 0;
  private width = 0;
  private height = 0;
  private uniformCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
    const fsT = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_THRESHOLD_SHADER);
    const fsB = compileShader(gl, gl.FRAGMENT_SHADER, BLUR_SHADER);
    const fsC = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_SHADER);
    const fsOpaque = compileShader(gl, gl.FRAGMENT_SHADER, OPAQUE_COMPOSITE_SHADER);
    const fsCrt = compileShader(gl, gl.FRAGMENT_SHADER, CRT_SHADER);
    const fsPersist = compileShader(gl, gl.FRAGMENT_SHADER, PERSISTENCE_SHADER);
    const fsRetro = compileShader(gl, gl.FRAGMENT_SHADER, RETRO_SHADER);
    const fsReactive = compileShader(gl, gl.FRAGMENT_SHADER, REACTIVE_SHADER);
    const fsStreak = compileShader(gl, gl.FRAGMENT_SHADER, STREAK_SHADER);
    this.thresholdProgram = linkProgram(gl, vs, fsT);
    this.blurProgram = linkProgram(gl, vs, fsB);
    this.compositeProgram = linkProgram(gl, vs, fsC);
    this.opaqueCompositeProgram = linkProgram(gl, vs, fsOpaque);
    this.crtProgram = linkProgram(gl, vs, fsCrt);
    this.persistProgram = linkProgram(gl, vs, fsPersist);
    this.retroProgram = linkProgram(gl, vs, fsRetro);
    this.reactiveProgram = linkProgram(gl, vs, fsReactive);
    this.streakProgram = linkProgram(gl, vs, fsStreak);
    gl.deleteShader(vs);
    gl.deleteShader(fsT);
    gl.deleteShader(fsB);
    gl.deleteShader(fsC);
    gl.deleteShader(fsOpaque);
    gl.deleteShader(fsCrt);
    gl.deleteShader(fsPersist);
    gl.deleteShader(fsRetro);
    gl.deleteShader(fsReactive);
    gl.deleteShader(fsStreak);
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

  private destroyFbos(): void {
    const gl = this.gl;
    for (const fbo of [
      this.sceneFbo,
      this.bloomFboA,
      this.bloomFboB,
      this.vfxCompositeFbo,
      this.persistFboA,
      this.persistFboB,
      this.retroFbo,
      this.reactiveFbo,
    ]) {
      if (!fbo) continue;
      gl.deleteFramebuffer(fbo.fbo);
      gl.deleteTexture(fbo.texture);
    }
    this.sceneFbo = null;
    this.bloomFboA = null;
    this.bloomFboB = null;
    this.vfxCompositeFbo = null;
    this.persistFboA = null;
    this.persistFboB = null;
    this.persistIndex = 0;
    this.retroFbo = null;
    this.reactiveFbo = null;
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

  resize(width: number, height: number, bloomRes = 0.5): void {
    if (width === this.width && height === this.height && this.sceneFbo) return;
    this.width = width;
    this.height = height;
    this.persistValid = false;
    const bw = Math.max(1, Math.floor(width * bloomRes));
    const bh = Math.max(1, Math.floor(height * bloomRes));
    if (!this.sceneFbo) {
      this.sceneFbo = createFramebuffer(this.gl, width, height);
      this.bloomFboA = createFramebuffer(this.gl, bw, bh);
      this.bloomFboB = createFramebuffer(this.gl, bw, bh);
      this.vfxCompositeFbo = createFramebuffer(this.gl, width, height);
    } else {
      resizeFramebuffer(this.gl, this.sceneFbo, width, height);
      resizeFramebuffer(this.gl, this.bloomFboA!, bw, bh);
      resizeFramebuffer(this.gl, this.bloomFboB!, bw, bh);
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
    bufferWidth: number,
    bufferHeight: number,
    crtIntermediate: boolean,
  ): void {
    if (crtIntermediate) return;

    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (bloomPasses <= 0) {
      this.blit(this.sceneFbo!.texture);
      return;
    }

    this.extractBloom(this.sceneFbo!.texture, bloomPasses, bloomThreshold);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
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
      this.extractBloom(sourceTex, params.bloomPasses, params.bloomThreshold);
      if (params.grade.streakIntensity > 0) {
        hasStreak = true;
        this.applyStreak(params.grade.streakLength);
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
      this.persistFboA = createFramebuffer(this.gl, width, height);
      this.persistFboB = createFramebuffer(this.gl, width, height);
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
      this.retroFbo = createFramebuffer(this.gl, width, height);
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
      this.reactiveFbo = createFramebuffer(this.gl, width, height);
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

  private applyStreak(streakLength: number): void {
    const gl = this.gl;
    const bloomA = this.bloomFboA!;
    const bloomB = this.bloomFboB!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fbo);
    gl.viewport(0, 0, bloomB.width, bloomB.height);
    gl.useProgram(this.streakProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.texture);
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

  private extractBloom(source: WebGLTexture, bloomPasses: number, bloomThreshold: number): void {
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
