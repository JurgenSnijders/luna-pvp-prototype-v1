import {
  BLUR_SHADER,
  BLOOM_THRESHOLD_SHADER,
  COMPOSITE_SHADER,
  CRT_SHADER,
  FULLSCREEN_VERTEX,
} from './shaders';
import { retroVfxConfig } from './retroVfxConfig';
import {
  compileShader,
  createFramebuffer,
  createFullscreenQuad,
  linkProgram,
  resizeFramebuffer,
  type FramebufferTarget,
} from './framebuffers';

interface CrtUniforms {
  texture: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  scanlineIntensity: WebGLUniformLocation | null;
  scanlineDensity: WebGLUniformLocation | null;
  vignetteIntensity: WebGLUniformLocation | null;
  curvature: WebGLUniformLocation | null;
  chromaticAberration: WebGLUniformLocation | null;
  phosphorGridIntensity: WebGLUniformLocation | null;
  flickerIntensity: WebGLUniformLocation | null;
  tintColor: WebGLUniformLocation | null;
  tintAmount: WebGLUniformLocation | null;
  contrast: WebGLUniformLocation | null;
  brightness: WebGLUniformLocation | null;
}

export class PostFX {
  private thresholdProgram: WebGLProgram;
  private blurProgram: WebGLProgram;
  private compositeProgram: WebGLProgram;
  private crtProgram: WebGLProgram;
  private crtUniforms: CrtUniforms;
  private fsVao: WebGLVertexArrayObject;
  private sceneFbo: FramebufferTarget | null = null;
  private compositeFbo: FramebufferTarget | null = null;
  private bloomFboA: FramebufferTarget | null = null;
  private bloomFboB: FramebufferTarget | null = null;
  private width = 0;
  private height = 0;

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
    const fsT = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_THRESHOLD_SHADER);
    const fsB = compileShader(gl, gl.FRAGMENT_SHADER, BLUR_SHADER);
    const fsC = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_SHADER);
    const fsCrt = compileShader(gl, gl.FRAGMENT_SHADER, CRT_SHADER);
    this.thresholdProgram = linkProgram(gl, vs, fsT);
    this.blurProgram = linkProgram(gl, vs, fsB);
    this.compositeProgram = linkProgram(gl, vs, fsC);
    this.crtProgram = linkProgram(gl, vs, fsCrt);
    gl.deleteShader(vs);
    gl.deleteShader(fsT);
    gl.deleteShader(fsB);
    gl.deleteShader(fsC);
    gl.deleteShader(fsCrt);
    this.crtUniforms = {
      texture: gl.getUniformLocation(this.crtProgram, 'u_texture'),
      time: gl.getUniformLocation(this.crtProgram, 'u_time'),
      resolution: gl.getUniformLocation(this.crtProgram, 'u_resolution'),
      scanlineIntensity: gl.getUniformLocation(this.crtProgram, 'u_scanlineIntensity'),
      scanlineDensity: gl.getUniformLocation(this.crtProgram, 'u_scanlineDensity'),
      vignetteIntensity: gl.getUniformLocation(this.crtProgram, 'u_vignetteIntensity'),
      curvature: gl.getUniformLocation(this.crtProgram, 'u_curvature'),
      chromaticAberration: gl.getUniformLocation(this.crtProgram, 'u_chromaticAberration'),
      phosphorGridIntensity: gl.getUniformLocation(this.crtProgram, 'u_phosphorGridIntensity'),
      flickerIntensity: gl.getUniformLocation(this.crtProgram, 'u_flickerIntensity'),
      tintColor: gl.getUniformLocation(this.crtProgram, 'u_tintColor'),
      tintAmount: gl.getUniformLocation(this.crtProgram, 'u_tintAmount'),
      contrast: gl.getUniformLocation(this.crtProgram, 'u_contrast'),
      brightness: gl.getUniformLocation(this.crtProgram, 'u_brightness'),
    };
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
    for (const fbo of [this.sceneFbo, this.compositeFbo, this.bloomFboA, this.bloomFboB]) {
      if (!fbo) continue;
      gl.deleteFramebuffer(fbo.fbo);
      gl.deleteTexture(fbo.texture);
    }
    this.sceneFbo = null;
    this.compositeFbo = null;
    this.bloomFboA = null;
    this.bloomFboB = null;
  }

  resize(width: number, height: number, bloomRes = 0.5): void {
    if (width === this.width && height === this.height && this.sceneFbo) return;
    this.width = width;
    this.height = height;
    if (!this.sceneFbo) {
      this.sceneFbo = createFramebuffer(this.gl, width, height);
      this.compositeFbo = createFramebuffer(this.gl, width, height);
      const bw = Math.max(1, Math.floor(width * bloomRes));
      const bh = Math.max(1, Math.floor(height * bloomRes));
      this.bloomFboA = createFramebuffer(this.gl, bw, bh);
      this.bloomFboB = createFramebuffer(this.gl, bw, bh);
    } else {
      resizeFramebuffer(this.gl, this.sceneFbo, width, height);
      resizeFramebuffer(this.gl, this.compositeFbo!, width, height);
      const bw = Math.max(1, Math.floor(width * bloomRes));
      const bh = Math.max(1, Math.floor(height * bloomRes));
      resizeFramebuffer(this.gl, this.bloomFboA!, bw, bh);
      resizeFramebuffer(this.gl, this.bloomFboB!, bw, bh);
    }
  }

  beginScene(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo!.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  endSceneAndComposite(
    bloomPasses: number,
    _bloomIntensity: number,
    chroma: number,
    bufferWidth: number,
    bufferHeight: number,
  ): void {
    const gl = this.gl;
    const cfg = retroVfxConfig;
    const bloomIntensity = cfg.bloomIntensity;
    const bloomChroma = chroma > 0 ? cfg.chromaticAberration : 0;

    gl.disable(gl.BLEND);

    if (bloomPasses <= 0) {
      this.compositeToFbo(
        this.sceneFbo!.texture,
        this.sceneFbo!.texture,
        0,
        0,
      );
    } else {
      const bloomA = this.bloomFboA!;
      const bloomB = this.bloomFboB!;

      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
      gl.viewport(0, 0, bloomA.width, bloomA.height);
      gl.useProgram(this.thresholdProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.texture);
      gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'u_source')!, 0);
      gl.uniform1f(
        gl.getUniformLocation(this.thresholdProgram, 'u_threshold')!,
        cfg.bloomThreshold,
      );
      this.drawFullscreen();

      for (let pass = 0; pass < bloomPasses; pass++) {
        this.blurPass(bloomA.texture, bloomB, true);
        this.blurPass(bloomB.texture, bloomA, false);
      }

      this.compositeToFbo(
        this.sceneFbo!.texture,
        bloomA.texture,
        bloomIntensity,
        bloomChroma,
      );
    }

    this.presentComposite(bufferWidth, bufferHeight);
  }

  private compositeToFbo(
    sceneTex: WebGLTexture,
    bloomTex: WebGLTexture,
    bloomIntensity: number,
    chroma: number,
  ): void {
    const gl = this.gl;
    const dst = this.compositeFbo!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.width, dst.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_scene')!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_bloom')!, 1);
    gl.uniform1f(
      gl.getUniformLocation(this.compositeProgram, 'u_bloomIntensity')!,
      bloomIntensity,
    );
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_chroma')!, chroma);
    this.drawFullscreen();
  }

  private presentComposite(bufferWidth: number, bufferHeight: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (retroVfxConfig.enabled) {
      this.crtPass(bufferWidth, bufferHeight);
    } else {
      this.blitToScreen(this.compositeFbo!.texture);
    }
  }

  private crtPass(bufferWidth: number, bufferHeight: number): void {
    const gl = this.gl;
    const cfg = retroVfxConfig;
    gl.useProgram(this.crtProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.compositeFbo!.texture);
    gl.uniform1i(this.crtUniforms.texture, 0);
    gl.uniform1f(this.crtUniforms.time, performance.now() * 0.001);
    gl.uniform2f(this.crtUniforms.resolution, bufferWidth, bufferHeight);
    gl.uniform1f(this.crtUniforms.scanlineIntensity, cfg.scanlineIntensity);
    gl.uniform1f(this.crtUniforms.scanlineDensity, cfg.scanlineDensity);
    gl.uniform1f(this.crtUniforms.vignetteIntensity, cfg.vignetteIntensity);
    gl.uniform1f(this.crtUniforms.curvature, cfg.curvature);
    gl.uniform1f(this.crtUniforms.chromaticAberration, cfg.chromaticAberration);
    gl.uniform1f(this.crtUniforms.phosphorGridIntensity, cfg.phosphorGridIntensity);
    gl.uniform1f(this.crtUniforms.flickerIntensity, cfg.flickerIntensity);
    gl.uniform3f(
      this.crtUniforms.tintColor,
      cfg.tintColor[0],
      cfg.tintColor[1],
      cfg.tintColor[2],
    );
    gl.uniform1f(this.crtUniforms.tintAmount, cfg.tintAmount);
    gl.uniform1f(this.crtUniforms.contrast, cfg.contrast);
    gl.uniform1f(this.crtUniforms.brightness, cfg.brightness);
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

  private blitToScreen(tex: WebGLTexture): void {
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
