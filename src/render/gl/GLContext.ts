import { perfMonitor } from '../../devtools/PerfMonitor';
import { getEffectiveDprCap } from '../../devtools/graphicsSettings';

export type BackendPreference = 'auto' | 'webgl' | 'canvas2d';

const STORAGE_KEY_BACKEND = 'LUNA_VFX_BACKEND';

export function getBackendPreference(): BackendPreference {
  const raw = localStorage.getItem(STORAGE_KEY_BACKEND);
  if (raw === 'webgl' || raw === 'canvas2d' || raw === 'auto') return raw;
  return 'auto';
}

export function setBackendPreference(pref: BackendPreference): void {
  localStorage.setItem(STORAGE_KEY_BACKEND, pref);
}

export class GLContext {
  readonly canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null = null;
  private lost = false;
  private restoreAttempts = 0;
  private onContextLostCallback: (() => void) | null = null;
  private onContextRestoredCallback: (() => void) | null = null;
  private onPermanentFallback: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'vfx-canvas';
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    const gameCanvas = document.getElementById('game-canvas');
    if (gameCanvas && gameCanvas.parentElement === parent) {
      gameCanvas.after(this.canvas);
    } else {
      parent.appendChild(this.canvas);
    }

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.onContextLostCallback?.();
      console.warn('[GLContext] WebGL context lost');
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.restoreAttempts++;
      if (this.restoreAttempts > 3) {
        console.error('[GLContext] Too many restore attempts, falling back to Canvas2D');
        this.onPermanentFallback?.();
        return;
      }
      this.initGl();
      this.onContextRestoredCallback?.();
      console.info('[GLContext] WebGL context restored');
    });
  }

  setCallbacks(callbacks: {
    onLost?: () => void;
    onRestored?: () => void;
    onPermanentFallback?: () => void;
  }): void {
    this.onContextLostCallback = callbacks.onLost ?? null;
    this.onContextRestoredCallback = callbacks.onRestored ?? null;
    this.onPermanentFallback = callbacks.onPermanentFallback ?? null;
  }

  initGl(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.gl = gl;
    if (gl) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      perfMonitor.probeCapabilities(gl);
    }
    return !!gl;
  }

  isLost(): boolean {
    return this.lost || !this.gl;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dprCap = getEffectiveDprCap();
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const pixelW = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelH = Math.max(1, Math.floor(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Dev-only: deliberately lose the GL context for testing recovery. */
  forceContextLoss(): void {
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }

  destroy(): void {
    this.canvas.remove();
    this.gl = null;
  }
}

export function tryCreateWebGLContext(parent: HTMLElement): GLContext | null {
  const ctx = new GLContext(parent);
  if (!ctx.initGl()) {
    ctx.destroy();
    return null;
  }
  return ctx;
}
