import type { Camera2D } from '../../camera/Camera2D';
import { perfMonitor } from '../../devtools/PerfMonitor';
import { getEffectiveDprCap, getEffectiveTier, getGraphicsSettings } from '../../devtools/graphicsSettings';
import type { Vector2D } from '../../math/Vector2D';
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

export interface BackgroundFrame {
  camera: Pick<Camera2D, 'pos' | 'zoom'>;
  hexCenter: Pick<Vector2D, 'x' | 'y'>;
  hexRadius: number;
  initialRadius: number;
  shake: { x: number; y: number };
  nowMs: number;
}

/**
 * The procedural lava program on any WebGL2 context. Draws a fullscreen quad
 * into whatever framebuffer and viewport are bound.
 */
export class BackgroundPass {
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private locResolution: WebGLUniformLocation | null = null;
  private locCameraPos: WebGLUniformLocation | null = null;
  private locCameraZoom: WebGLUniformLocation | null = null;
  private locTime: WebGLUniformLocation | null = null;
  private locHexRadius: WebGLUniformLocation | null = null;
  private locInitialRadius: WebGLUniformLocation | null = null;
  private locHexCenter: WebGLUniformLocation | null = null;
  private locTier: WebGLUniformLocation | null = null;
  private locParallaxVoid: WebGLUniformLocation | null = null;
  private locLavaScroll: WebGLUniformLocation | null = null;
  private locWarpStrength: WebGLUniformLocation | null = null;
  private isLegacyGpu = false;

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, BACKGROUND_VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, BACKGROUND_FRAGMENT_SHADER);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const quad = createFullscreenQuad(gl);
    this.vao = quad.vao;
    this.vbo = quad.vbo;

    const p = this.program;
    this.locResolution = gl.getUniformLocation(p, 'u_resolution');
    this.locCameraPos = gl.getUniformLocation(p, 'u_cameraPos');
    this.locCameraZoom = gl.getUniformLocation(p, 'u_cameraZoom');
    this.locTime = gl.getUniformLocation(p, 'u_time');
    this.locHexRadius = gl.getUniformLocation(p, 'u_hexRadius');
    this.locInitialRadius = gl.getUniformLocation(p, 'u_initialRadius');
    this.locHexCenter = gl.getUniformLocation(p, 'u_hexCenter');
    this.locTier = gl.getUniformLocation(p, 'u_tier');
    this.locParallaxVoid = gl.getUniformLocation(p, 'u_parallaxVoid');
    this.locLavaScroll = gl.getUniformLocation(p, 'u_lavaScroll');
    this.locWarpStrength = gl.getUniformLocation(p, 'u_warpStrength');

    const caps = perfMonitor.probeCapabilities(gl);
    this.isLegacyGpu = caps.isLegacyGpu;
  }

  /** `cssWidth`/`cssHeight` are the viewport in CSS px (the shader works in world units). */
  draw(frame: BackgroundFrame, cssWidth: number, cssHeight: number): void {
    const gl = this.gl;
    const program = this.program;
    if (!program || !this.vao) return;

    const tierLod = TIER_LOD[getEffectiveTier()] ?? 2;
    const settings = getGraphicsSettings();
    const zoom = Math.max(0.001, frame.camera.zoom);
    const camX = frame.camera.pos.x - frame.shake.x / zoom;
    const camY = frame.camera.pos.y - frame.shake.y / zoom;

    gl.useProgram(program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.locResolution!, cssWidth, cssHeight);
    gl.uniform2f(this.locCameraPos!, camX, camY);
    gl.uniform1f(this.locCameraZoom!, frame.camera.zoom);
    gl.uniform1f(this.locTime!, (frame.nowMs * 0.001) % 628.31853);
    gl.uniform1f(this.locHexRadius!, frame.hexRadius);
    gl.uniform1f(this.locInitialRadius!, frame.initialRadius);
    gl.uniform2f(this.locHexCenter!, frame.hexCenter.x, frame.hexCenter.y);
    gl.uniform1i(this.locTier!, tierLod);
    gl.uniform1f(this.locParallaxVoid!, settings.bgParallaxVoid);
    gl.uniform1f(this.locLavaScroll!, settings.bgLavaScrollSpeed);
    if (this.locWarpStrength) {
      gl.uniform1f(this.locWarpStrength, this.isLegacyGpu || tierLod === 0 ? 0.0 : 1.0);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    this.program = null;
    this.vao = null;
    this.vbo = null;
  }
}

export class BackgroundRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private pass: BackgroundPass | null = null;
  private cssWidth = 1;
  private cssHeight = 1;

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
      this.pass = new BackgroundPass(gl);
    } catch (err) {
      console.warn('[BackgroundRenderer] init failed:', err);
      this.destroy();
    }
  }

  isAvailable(): boolean {
    return this.gl !== null && this.pass !== null;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const gl = this.gl;
    if (!gl) return;

    const dpr = getEffectiveDprCap(cssWidth, cssHeight);
    const pixelW = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelH = Math.max(1, Math.floor(cssHeight * dpr));
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    gl.viewport(0, 0, pixelW, pixelH);
  }

  render(
    camera: Camera2D,
    hexCenter: Vector2D,
    hexRadius: number,
    initialRadius: number,
    shake: { x: number; y: number },
    nowMs: number,
  ): void {
    this.pass?.draw(
      { camera, hexCenter, hexRadius, initialRadius, shake, nowMs },
      this.cssWidth,
      this.cssHeight,
    );
  }

  setVisible(visible: boolean): void {
    this.canvas.style.display = visible ? 'block' : 'none';
  }

  destroy(): void {
    this.pass?.destroy();
    this.pass = null;
    this.gl = null;
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
