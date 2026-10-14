import type { GlWorldSlice } from '../../../devtools/graphicsSettings';
import { BackgroundPass, type BackgroundFrame } from '../BackgroundRenderer';
import { compileShader, createFullscreenQuad, linkProgram } from '../framebuffers';
import { FULLSCREEN_VERTEX } from '../postShaders';
import { canvasRemainderRole } from '../../painter/slices';
import { GLWorldPainter, WORLD_VERTEX_FLOATS } from './GLWorldPainter';
import { RAMP_ROWS, RAMP_WIDTH } from './GradientRamps';
import { ATLAS_SIZE } from './SpriteAtlas';
import {
  WORLD_BLIT_FRAGMENT_SHADER,
  WORLD_FRAGMENT_SHADER,
  WORLD_VERTEX_SHADER,
} from './worldShaders';

export interface WorldFrameSetup {
  slice: GlWorldSlice;
  cssWidth: number;
  cssHeight: number;
  /** Procedural lava on the shared context; null uses the painter's gradient fallback. */
  background: BackgroundFrame | null;
  /** The Canvas2D world canvas: receives text and holds every module GL does not own. */
  canvas: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
}

export interface WorldFrameOutput {
  /** Opaque world (GL slice + lit Canvas2D remainder), GL texture orientation. */
  worldTexture: WebGLTexture;
  /** Unlit overlay composited before CRT, or null. */
  overlayTexture: WebGLTexture | null;
}

export interface WorldRenderStats {
  slice: GlWorldSlice;
  drawCalls: number;
  vertices: number;
  atlasSprites: number;
  atlasPages: number;
  gradientRows: number;
  msaaSamples: number;
  canvasUploads: number;
}

const VOID_CLEAR: [number, number, number] = [0.02, 0.01, 0.03];

interface Target {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
}

/**
 * Draws the GL-owned bottom slice of the world into a 4x MSAA target on the
 * shared VFX context, resolves it, then layers the Canvas2D remainder on top
 * (lit) or hands it back as the overlay. PostFX consumes the resolved
 * texture in place of the old per-frame `#game-canvas` upload.
 */
export class GLWorldRenderer {
  readonly painter = new GLWorldPainter();
  private program: WebGLProgram | null = null;
  private blitProgram: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private vboBytes = 0;
  private fsVao: WebGLVertexArrayObject | null = null;
  private fsVbo: WebGLBuffer | null = null;
  private locResolution: WebGLUniformLocation | null = null;
  private locAtlas: WebGLUniformLocation | null = null;
  private locRamp: WebGLUniformLocation | null = null;
  private locBlitSource: WebGLUniformLocation | null = null;
  private background: BackgroundPass | null = null;
  private atlasPages: WebGLTexture[] = [];
  private atlasGeneration = -1;
  private rampTexture: WebGLTexture | null = null;
  private msaaFbo: WebGLFramebuffer | null = null;
  private msaaRb: WebGLRenderbuffer | null = null;
  private msaaSamples = 0;
  private resolve: Target | null = null;
  private canvasTexture: WebGLTexture | null = null;
  private width = 0;
  private height = 0;
  private frame: WorldFrameSetup | null = null;
  private stats: WorldRenderStats = emptyStats('off');

  constructor(private gl: WebGL2RenderingContext) {
    this.init();
  }

  private init(): void {
    const gl = this.gl;
    const vs = compileShader(gl, gl.VERTEX_SHADER, WORLD_VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, WORLD_FRAGMENT_SHADER);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.locResolution = gl.getUniformLocation(this.program, 'u_resolution');
    this.locAtlas = gl.getUniformLocation(this.program, 'u_atlas');
    this.locRamp = gl.getUniformLocation(this.program, 'u_ramp');

    const fsv = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERTEX);
    const fsb = compileShader(gl, gl.FRAGMENT_SHADER, WORLD_BLIT_FRAGMENT_SHADER);
    this.blitProgram = linkProgram(gl, fsv, fsb);
    gl.deleteShader(fsv);
    gl.deleteShader(fsb);
    this.locBlitSource = gl.getUniformLocation(this.blitProgram, 'u_source');
    const quad = createFullscreenQuad(gl);
    this.fsVao = quad.vao;
    this.fsVbo = quad.vbo;

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    this.vboBytes = 0;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = WORLD_VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 32);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, stride, 40);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.rampTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, RAMP_WIDTH, RAMP_ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    setLinearClamp(gl);
    gl.bindTexture(gl.TEXTURE_2D, null);

    try {
      this.background = new BackgroundPass(gl);
    } catch (err) {
      console.warn('[GLWorldRenderer] background pass unavailable:', err);
      this.background = null;
    }
  }

  /** Recreate GL objects after context restore; CPU-side atlas slots are discarded too. */
  rebuild(): void {
    this.atlasPages = [];
    this.atlasGeneration = -1;
    this.painter.atlas.reset();
    this.msaaFbo = null;
    this.msaaRb = null;
    this.resolve = null;
    this.canvasTexture = null;
    this.width = 0;
    this.height = 0;
    this.init();
  }

  hasBackground(): boolean {
    return this.background !== null;
  }

  isFrameActive(): boolean {
    return this.frame !== null;
  }

  getStats(): WorldRenderStats {
    return this.stats;
  }

  /** Starts a GL world frame and returns the painter for the GL-owned modules. */
  beginFrame(setup: WorldFrameSetup): GLWorldPainter {
    this.frame = setup;
    const bufferW = Math.max(1, this.gl.drawingBufferWidth);
    const dpr = bufferW / Math.max(1, setup.cssWidth);
    const sinkScale = setup.canvas.width / bufferW;
    this.painter.beginFrame(dpr, setup.canvasCtx, sinkScale);
    return this.painter;
  }

  /** Called after PostFX consumed the output (or when the frame is abandoned). */
  endFrame(): void {
    this.frame = null;
  }

  /** Draws the frame into the world target. Must run before the VFX scene pass. */
  render(bufferWidth: number, bufferHeight: number): WorldFrameOutput | null {
    const frame = this.frame;
    const gl = this.gl;
    if (!frame || !this.program) return null;
    this.ensureTargets(bufferWidth, bufferHeight);
    const resolve = this.resolve!;
    const painter = this.painter;
    let drawCalls = 0;
    let canvasUploads = 0;

    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFbo ?? resolve.fbo);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.disable(gl.BLEND);
    gl.clearColor(VOID_CLEAR[0], VOID_CLEAR[1], VOID_CLEAR[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (frame.background && this.background) {
      this.background.draw(frame.background, frame.cssWidth, frame.cssHeight);
      drawCalls++;
    }

    drawCalls += this.drawPainter(bufferWidth, bufferHeight);

    if (this.msaaFbo) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.msaaFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolve.fbo);
      gl.blitFramebuffer(
        0, 0, bufferWidth, bufferHeight,
        0, 0, bufferWidth, bufferHeight,
        gl.COLOR_BUFFER_BIT, gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }

    this.uploadCanvas(frame.canvas);
    canvasUploads++;
    let overlayTexture: WebGLTexture | null = null;
    if (canvasRemainderRole(frame.slice) === 'lit') {
      gl.bindFramebuffer(gl.FRAMEBUFFER, resolve.fbo);
      gl.viewport(0, 0, bufferWidth, bufferHeight);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.blit(this.canvasTexture!);
      drawCalls++;
    } else {
      overlayTexture = this.canvasTexture;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.stats = {
      slice: frame.slice,
      drawCalls,
      vertices: painter.vertCount,
      atlasSprites: painter.atlas.spriteCount,
      atlasPages: painter.atlas.pageCount,
      gradientRows: painter.ramps.rowCount,
      msaaSamples: this.msaaSamples,
      canvasUploads,
    };
    return { worldTexture: resolve.texture, overlayTexture };
  }

  private drawPainter(width: number, height: number): number {
    const gl = this.gl;
    const painter = this.painter;
    if (painter.vertCount === 0 || painter.batches.length === 0) return 0;

    this.syncAtlas();
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    const rows = Math.max(1, painter.ramps.rowCount);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0, RAMP_WIDTH, rows, gl.RGBA, gl.UNSIGNED_BYTE,
      painter.ramps.data.subarray(0, RAMP_WIDTH * rows * 4),
    );

    const floats = painter.vertCount * WORLD_VERTEX_FLOATS;
    const bytes = floats * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    if (bytes > this.vboBytes) {
      this.vboBytes = Math.max(bytes, this.vboBytes * 2);
      gl.bufferData(gl.ARRAY_BUFFER, this.vboBytes, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, painter.verts, 0, floats);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.useProgram(this.program);
    gl.uniform2f(this.locResolution, width, height);
    gl.uniform1i(this.locAtlas, 0);
    gl.uniform1i(this.locRamp, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);

    let calls = 0;
    let boundPage = -2;
    let boundBlend: string | null = null;
    for (const batch of painter.batches) {
      if (batch.count === 0) continue;
      if (batch.blend !== boundBlend) {
        if (batch.blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
        else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        boundBlend = batch.blend;
      }
      const page = batch.page >= 0 ? batch.page : 0;
      if (page !== boundPage) {
        gl.bindTexture(gl.TEXTURE_2D, this.atlasPages[page] ?? null);
        boundPage = page;
      }
      gl.drawArrays(gl.TRIANGLES, batch.first, batch.count);
      calls++;
    }
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return calls;
  }

  private syncAtlas(): void {
    const gl = this.gl;
    const atlas = this.painter.atlas;
    if (atlas.resetGeneration !== this.atlasGeneration) {
      for (const tex of this.atlasPages) gl.deleteTexture(tex);
      this.atlasPages = [];
      this.atlasGeneration = atlas.resetGeneration;
    }
    while (this.atlasPages.length < atlas.pageCount) {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_SIZE, ATLAS_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      setLinearClamp(gl);
      this.atlasPages.push(tex);
    }
    const uploads = atlas.drainUploads();
    if (uploads.length === 0) return;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    for (const up of uploads) {
      gl.bindTexture(gl.TEXTURE_2D, this.atlasPages[up.entry.page]);
      try {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, up.entry.x, up.entry.y, gl.RGBA, gl.UNSIGNED_BYTE, up.source);
      } catch (err) {
        console.warn('[GLWorldRenderer] sprite upload failed:', err);
      }
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private uploadCanvas(canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    if (!this.canvasTexture) {
      this.canvasTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
      setLinearClamp(gl);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private blit(texture: WebGLTexture): void {
    const gl = this.gl;
    gl.useProgram(this.blitProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.locBlitSource, 0);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private ensureTargets(width: number, height: number): void {
    const gl = this.gl;
    if (this.resolve && this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;

    if (!this.resolve) {
      const texture = gl.createTexture()!;
      const fbo = gl.createFramebuffer()!;
      this.resolve = { fbo, texture };
    }
    gl.bindTexture(gl.TEXTURE_2D, this.resolve.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    setLinearClamp(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolve.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.resolve.texture, 0);

    const maxSamples = gl.getParameter(gl.MAX_SAMPLES) as number;
    const samples = Math.min(4, maxSamples || 0);
    if (samples >= 2) {
      if (!this.msaaFbo) {
        this.msaaFbo = gl.createFramebuffer();
        this.msaaRb = gl.createRenderbuffer();
      }
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.msaaRb);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteFramebuffer(this.msaaFbo);
        gl.deleteRenderbuffer(this.msaaRb);
        this.msaaFbo = null;
        this.msaaRb = null;
        this.msaaSamples = 0;
      } else {
        this.msaaSamples = samples;
      }
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    } else {
      this.msaaSamples = 0;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}

function setLinearClamp(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function emptyStats(slice: GlWorldSlice): WorldRenderStats {
  return {
    slice,
    drawCalls: 0,
    vertices: 0,
    atlasSprites: 0,
    atlasPages: 0,
    gradientRows: 0,
    msaaSamples: 0,
    canvasUploads: 0,
  };
}
