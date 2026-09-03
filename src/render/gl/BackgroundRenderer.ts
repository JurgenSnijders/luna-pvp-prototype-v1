import type { Camera2D } from '../../camera/Camera2D';
import { getEffectiveDprCap, getEffectiveTier, getGraphicsSettings } from '../../devtools/graphicsSettings';
import {
  compileShader,
  createFullscreenQuad,
  linkProgram,
} from './framebuffers';
import { BACKGROUND_FRAGMENT_SHADER, BACKGROUND_VERTEX_SHADER } from './shaders';

const TIER_LOD: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  ULTRA: 2,
  AUTO: 2,
};

export class BackgroundRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private locResolution: WebGLUniformLocation | null = null;
  private locCameraPos: WebGLUniformLocation | null = null;
  private locCameraZoom: WebGLUniformLocation | null = null;
  private locTime: WebGLUniformLocation | null = null;
  private locHexRadius: WebGLUniformLocation | null = null;
  private locTier: WebGLUniformLocation | null = null;
  private locParallaxVoid: WebGLUniformLocation | null = null;
  private locParallaxLava: WebGLUniformLocation | null = null;
  private locLavaScroll: WebGLUniformLocation | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      antialias: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return;

    this.gl = gl;
    try {
      const vs = compileShader(gl, gl.VERTEX_SHADER, BACKGROUND_VERTEX_SHADER);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, BACKGROUND_FRAGMENT_SHADER);
      this.program = linkProgram(gl, vs, fs);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      const quad = createFullscreenQuad(gl);
      this.vao = quad.vao;

      this.locResolution = gl.getUniformLocation(this.program, 'u_resolution');
      this.locCameraPos = gl.getUniformLocation(this.program, 'u_cameraPos');
      this.locCameraZoom = gl.getUniformLocation(this.program, 'u_cameraZoom');
      this.locTime = gl.getUniformLocation(this.program, 'u_time');
      this.locHexRadius = gl.getUniformLocation(this.program, 'u_hexRadius');
      this.locTier = gl.getUniformLocation(this.program, 'u_tier');
      this.locParallaxVoid = gl.getUniformLocation(this.program, 'u_parallaxVoid');
      this.locParallaxLava = gl.getUniformLocation(this.program, 'u_parallaxLava');
      this.locLavaScroll = gl.getUniformLocation(this.program, 'u_lavaScroll');
    } catch (err) {
      console.warn('[BackgroundRenderer] init failed:', err);
      this.destroy();
    }
  }

  isAvailable(): boolean {
    return this.gl !== null && this.program !== null;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const gl = this.gl;
    if (!gl) return;

    const dpr = getEffectiveDprCap();
    const pixelW = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelH = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    gl.viewport(0, 0, pixelW, pixelH);
  }

  render(camera: Camera2D, hexRadius: number, nowMs: number): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program || !this.vao) return;

    const tier = getEffectiveTier();
    const tierLod = TIER_LOD[tier] ?? 2;

    const settings = getGraphicsSettings();

    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.locResolution!, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.locCameraPos!, camera.pos.x, camera.pos.y);
    gl.uniform1f(this.locCameraZoom!, camera.zoom);
    gl.uniform1f(this.locTime!, nowMs * 0.001);
    gl.uniform1f(this.locHexRadius!, hexRadius);
    gl.uniform1i(this.locTier!, tierLod);
    gl.uniform1f(this.locParallaxVoid!, settings.bgParallaxVoid);
    gl.uniform1f(this.locParallaxLava!, settings.bgParallaxLava);
    gl.uniform1f(this.locLavaScroll!, settings.bgLavaScrollSpeed);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  destroy(): void {
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.vao) gl.deleteVertexArray(this.vao);
    }
    this.gl = null;
    this.program = null;
    this.vao = null;
  }
}

export function createBackgroundCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
  const gameCanvas = document.getElementById('game-canvas');
  if (gameCanvas?.parentElement) {
    gameCanvas.parentElement.insertBefore(canvas, gameCanvas);
  } else {
    document.body.insertBefore(canvas, document.body.firstChild);
  }
  return canvas;
}
