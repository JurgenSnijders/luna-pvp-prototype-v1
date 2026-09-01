import {
  BLUR_SHADER,
  BLOOM_THRESHOLD_SHADER,
  COMPOSITE_SHADER,
  CRT_SHADER,
  FULLSCREEN_VERTEX,
  SCENE_BLIT_SHADER,
} from './shaders';
import {
  compileShader,
  createFramebuffer,
  createFullscreenQuad,
  linkProgram,
  resizeFramebuffer,
  type FramebufferTarget,
} from './framebuffers';

export interface CrtPresentParams {
  scanline: number;
  curvature: number;
  vignette: number;
  phosphor: number;
  bloomIntensity: number;
}

export class PostFX {
  private thresholdProgram: WebGLProgram;
  private blurProgram: WebGLProgram;
  private compositeProgram: WebGLProgram;
  private sceneBlitProgram: WebGLProgram;
  private crtProgram: WebGLProgram;
  private fsVao: WebGLVertexArrayObject;
  private sceneFbo: FramebufferTarget | null = null;
  private bloomFboA: FramebufferTarget | null = null;
  private bloomFboB: FramebufferTarget | null = null;
  private vfxCompositeFbo: FramebufferTarget | null = null;
  private worldTexture: WebGLTexture | null = null;
  private worldTexW = 0;
  private worldTexH = 0;
  private width = 0;
  private height = 0;
  /** Bloom result handed to the CRT pass, or null when bloom is disabled. */
  private crtBloomTexture: WebGLTexture | null = null;

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
    const fsT = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_THRESHOLD_SHADER);
    const fsB = compileShader(gl, gl.FRAGMENT_SHADER, BLUR_SHADER);
    const fsC = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_SHADER);
    const fsBlit = compileShader(gl, gl.FRAGMENT_SHADER, SCENE_BLIT_SHADER);
    const fsCrt = compileShader(gl, gl.FRAGMENT_SHADER, CRT_SHADER);
    this.thresholdProgram = linkProgram(gl, vs, fsT);
    this.blurProgram = linkProgram(gl, vs, fsB);
    this.compositeProgram = linkProgram(gl, vs, fsC);
    this.sceneBlitProgram = linkProgram(gl, vs, fsBlit);
    this.crtProgram = linkProgram(gl, vs, fsCrt);
    gl.deleteShader(vs);
    gl.deleteShader(fsT);
    gl.deleteShader(fsB);
    gl.deleteShader(fsC);
    gl.deleteShader(fsBlit);
    gl.deleteShader(fsCrt);
    const quad = createFullscreenQuad(gl);
    this.fsVao = quad.vao;
  }

  rebuild(): void {
    this.destroyFbos();
    this.width = 0;
    this.height = 0;
  }

  private destroyFbos(): void {
    const gl = this.gl;
    for (const fbo of [this.sceneFbo, this.bloomFboA, this.bloomFboB, this.vfxCompositeFbo]) {
      if (!fbo) continue;
      gl.deleteFramebuffer(fbo.fbo);
      gl.deleteTexture(fbo.texture);
    }
    this.sceneFbo = null;
    this.bloomFboA = null;
    this.bloomFboB = null;
    this.vfxCompositeFbo = null;
    this.crtBloomTexture = null;
    if (this.worldTexture) {
      gl.deleteTexture(this.worldTexture);
      this.worldTexture = null;
      this.worldTexW = 0;
      this.worldTexH = 0;
    }
  }

  resize(width: number, height: number, bloomRes = 0.5): void {
    if (width === this.width && height === this.height && this.sceneFbo) return;
    this.width = width;
    this.height = height;
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
  }

  beginScene(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo!.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Resolves bloom. Without CRT this composites straight to the screen as a
   * transparent VFX overlay; with CRT the particle scene and bloom are kept
   * apart so `presentCrt` can blend them against the world itself.
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
    const gl = this.gl;

    if (!crtIntermediate) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, bufferWidth, bufferHeight);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (bloomPasses <= 0) {
      this.crtBloomTexture = null;
      if (crtIntermediate) {
        this.blitScene(this.sceneFbo!.texture, this.vfxCompositeFbo!, bufferWidth, bufferHeight);
      } else {
        this.blit(this.sceneFbo!.texture);
      }
      return;
    }

    const bloomA = this.bloomFboA!;
    const bloomB = this.bloomFboB!;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
    gl.viewport(0, 0, bloomA.width, bloomA.height);
    gl.useProgram(this.thresholdProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.texture);
    gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'u_source')!, 0);
    gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'u_threshold')!, bloomThreshold);
    this.drawFullscreen();

    for (let pass = 0; pass < bloomPasses; pass++) {
      this.blurPass(bloomA.texture, bloomB, true);
      this.blurPass(bloomB.texture, bloomA, false);
    }

    if (crtIntermediate) {
      this.blitScene(this.sceneFbo!.texture, this.vfxCompositeFbo!, bufferWidth, bufferHeight);
      this.crtBloomTexture = bloomA.texture;
      return;
    }

    this.crtBloomTexture = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.texture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_scene')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.texture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_bloom')!, 1);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_bloomIntensity')!, bloomIntensity);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_chroma')!, chroma);
    this.drawFullscreen();
  }

  /** Uploads the Canvas2D world and presents the combined opaque CRT frame. */
  presentCrt(
    worldCanvas: HTMLCanvasElement,
    params: CrtPresentParams,
    bufferWidth: number,
    bufferHeight: number,
  ): void {
    const gl = this.gl;
    this.ensureWorldTexture(worldCanvas.width, worldCanvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.worldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, worldCanvas);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.crtProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.worldTexture);
    gl.uniform1i(gl.getUniformLocation(this.crtProgram, 'u_world')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.vfxCompositeFbo!.texture);
    gl.uniform1i(gl.getUniformLocation(this.crtProgram, 'u_vfx')!, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.crtBloomTexture ?? this.vfxCompositeFbo!.texture);
    gl.uniform1i(gl.getUniformLocation(this.crtProgram, 'u_bloom')!, 2);
    gl.uniform1f(
      gl.getUniformLocation(this.crtProgram, 'u_hasBloom')!,
      this.crtBloomTexture ? 1 : 0,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.crtProgram, 'u_bloomIntensity')!,
      params.bloomIntensity,
    );
    gl.uniform2f(gl.getUniformLocation(this.crtProgram, 'u_resolution')!, bufferWidth, bufferHeight);
    gl.uniform1f(gl.getUniformLocation(this.crtProgram, 'u_scanline')!, params.scanline);
    gl.uniform1f(gl.getUniformLocation(this.crtProgram, 'u_curvature')!, params.curvature);
    gl.uniform1f(gl.getUniformLocation(this.crtProgram, 'u_vignette')!, params.vignette);
    gl.uniform1f(gl.getUniformLocation(this.crtProgram, 'u_phosphor')!, params.phosphor);
    this.drawFullscreen();
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

  private blitScene(
    sceneTex: WebGLTexture,
    target: FramebufferTarget,
    bufferWidth: number,
    bufferHeight: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.sceneBlitProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(gl.getUniformLocation(this.sceneBlitProgram, 'u_scene')!, 0);
    this.drawFullscreen();
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
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, 'u_source')!, 0);
    gl.uniform2f(
      gl.getUniformLocation(this.blurProgram, 'u_direction')!,
      horizontal ? 1 : 0,
      horizontal ? 0 : 1,
    );
    gl.uniform2f(
      gl.getUniformLocation(this.blurProgram, 'u_texelSize')!,
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
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_scene')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_bloom')!, 1);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_bloomIntensity')!, 0);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_chroma')!, 0);
    this.drawFullscreen();
  }

  private drawFullscreen(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
