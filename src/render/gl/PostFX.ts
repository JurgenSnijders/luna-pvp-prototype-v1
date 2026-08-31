import {
  BLUR_SHADER,
  BLOOM_THRESHOLD_SHADER,
  COMPOSITE_SHADER,
  FULLSCREEN_VERTEX,
} from './shaders';
import {
  compileShader,
  createFramebuffer,
  createFullscreenQuad,
  linkProgram,
  resizeFramebuffer,
  type FramebufferTarget,
} from './framebuffers';

export class PostFX {
  private thresholdProgram: WebGLProgram;
  private blurProgram: WebGLProgram;
  private compositeProgram: WebGLProgram;
  private fsVao: WebGLVertexArrayObject;
  private sceneFbo: FramebufferTarget | null = null;
  private bloomFboA: FramebufferTarget | null = null;
  private bloomFboB: FramebufferTarget | null = null;
  private width = 0;
  private height = 0;

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
    const fsT = compileShader(gl, gl.FRAGMENT_SHADER, BLOOM_THRESHOLD_SHADER);
    const fsB = compileShader(gl, gl.FRAGMENT_SHADER, BLUR_SHADER);
    const fsC = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_SHADER);
    this.thresholdProgram = linkProgram(gl, vs, fsT);
    this.blurProgram = linkProgram(gl, vs, fsB);
    this.compositeProgram = linkProgram(gl, vs, fsC);
    gl.deleteShader(vs);
    gl.deleteShader(fsT);
    gl.deleteShader(fsB);
    gl.deleteShader(fsC);
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
    for (const fbo of [this.sceneFbo, this.bloomFboA, this.bloomFboB]) {
      if (!fbo) continue;
      gl.deleteFramebuffer(fbo.fbo);
      gl.deleteTexture(fbo.texture);
    }
    this.sceneFbo = null;
    this.bloomFboA = null;
    this.bloomFboB = null;
  }

  resize(width: number, height: number, bloomRes = 0.5): void {
    if (width === this.width && height === this.height && this.sceneFbo) return;
    this.width = width;
    this.height = height;
    if (!this.sceneFbo) {
      this.sceneFbo = createFramebuffer(this.gl, width, height);
      const bw = Math.max(1, Math.floor(width * bloomRes));
      const bh = Math.max(1, Math.floor(height * bloomRes));
      this.bloomFboA = createFramebuffer(this.gl, bw, bh);
      this.bloomFboB = createFramebuffer(this.gl, bw, bh);
    } else {
      resizeFramebuffer(this.gl, this.sceneFbo, width, height);
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
    bloomIntensity: number,
    chroma: number,
    bufferWidth: number,
    bufferHeight: number,
  ): void {
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

    const bloomA = this.bloomFboA!;
    const bloomB = this.bloomFboB!;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
    gl.viewport(0, 0, bloomA.width, bloomA.height);
    gl.useProgram(this.thresholdProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFbo!.texture);
    gl.uniform1i(gl.getUniformLocation(this.thresholdProgram, 'u_source')!, 0);
    gl.uniform1f(gl.getUniformLocation(this.thresholdProgram, 'u_threshold')!, 0.6);
    this.drawFullscreen();

    for (let pass = 0; pass < bloomPasses; pass++) {
      this.blurPass(bloomA.texture, bloomB, true);
      this.blurPass(bloomB.texture, bloomA, false);
    }

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
