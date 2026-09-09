import { isLegacyIntegratedGpu } from '../render/detectQualityTier';

const HISTORY_SIZE = 120;

export interface GpuCapabilities {
  webgl2Available: boolean;
  maxTextureSize: number;
  extensions: string[];
  dpr: number;
  renderer: string;
  vendor: string;
  /** Bits of mantissa from gl.getShaderPrecisionFormat(FRAGMENT_SHADER, HIGH_FLOAT). */
  fragmentHighpPrecision: number;
  /** Unmasked renderer string from WEBGL_debug_renderer_info, or empty. */
  unmaskedRenderer: string;
  /** True when fragment highp is unreliable or a legacy iGPU is detected. */
  isLegacyGpu: boolean;
}

function probeGpuTraits(gl: WebGL2RenderingContext): {
  fragmentHighpPrecision: number;
  unmaskedRenderer: string;
  isLegacyGpu: boolean;
} {
  const fmt = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const fragmentHighpPrecision = fmt?.precision ?? 0;
  let unmaskedRenderer = '';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    unmaskedRenderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '');
  }
  const isLegacyGpu =
    fragmentHighpPrecision < 23 || isLegacyIntegratedGpu(unmaskedRenderer);
  return { fragmentHighpPrecision, unmaskedRenderer, isLegacyGpu };
}

export interface PerfSnapshot {
  fps: number;
  frameMsP50: number;
  frameMsP95: number;
  simMs: number;
  renderMs: number;
  gpuMs: number;
  liveParticles: number;
  livePrimitives: number;
  drawCalls: number;
  instanceCount: number;
  uploadBytes: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export class PerfMonitor {
  private frameHistory: number[] = [];
  private presentHistory: number[] = [];
  private lastPresentTime = 0;
  private simMs = 0;
  private renderMs = 0;
  private gpuMs = 0;
  private liveParticles = 0;
  private livePrimitives = 0;
  private drawCalls = 0;
  private instanceCount = 0;
  private uploadBytes = 0;
  private frameStart = 0;
  private simStart = 0;
  private renderStart = 0;
  private overlayVisible = false;
  private capabilities: GpuCapabilities | null = null;
  /** Recorded baseline p95 under VFX stress preset (ms). Set via inspector. */
  baselineP95Ms: number | null = null;

  getCapabilities(): GpuCapabilities | null {
    return this.capabilities;
  }

  probeCapabilities(gl?: WebGL2RenderingContext | null): GpuCapabilities {
    const dpr = window.devicePixelRatio || 1;
    if (!gl) {
      const probe = document.createElement('canvas');
      gl = probe.getContext('webgl2');
    }
    const traits = gl
      ? probeGpuTraits(gl)
      : { fragmentHighpPrecision: 0, unmaskedRenderer: '', isLegacyGpu: true };
    const prev = this.capabilities;
    const caps: GpuCapabilities = {
      webgl2Available: !!gl,
      maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
      extensions: gl ? gl.getSupportedExtensions() ?? [] : [],
      dpr,
      renderer: gl
        ? String(gl.getParameter(gl.RENDERER))
        : 'N/A',
      vendor: gl
        ? String(gl.getParameter(gl.VENDOR))
        : 'N/A',
      fragmentHighpPrecision: traits.fragmentHighpPrecision,
      unmaskedRenderer: traits.unmaskedRenderer || prev?.unmaskedRenderer || '',
      isLegacyGpu: traits.isLegacyGpu || prev?.isLegacyGpu === true,
    };
    this.capabilities = caps;
    return caps;
  }

  beginFrame(): void {
    this.frameStart = performance.now();
  }

  beginSim(): void {
    this.simStart = performance.now();
  }

  endSim(): void {
    this.simMs = performance.now() - this.simStart;
  }

  beginRender(): void {
    this.renderStart = performance.now();
  }

  endRender(rafNow: number): void {
    this.renderMs = performance.now() - this.renderStart;
    const frameMs = Math.max(0, performance.now() - this.frameStart);
    this.frameHistory.push(frameMs);
    if (this.frameHistory.length > HISTORY_SIZE) {
      this.frameHistory.shift();
    }

    if (this.lastPresentTime > 0) {
      const presentMs = Math.max(0, rafNow - this.lastPresentTime);
      this.presentHistory.push(presentMs);
      if (this.presentHistory.length > HISTORY_SIZE) {
        this.presentHistory.shift();
      }
    }
    this.lastPresentTime = rafNow;
  }

  setGpuMs(ms: number): void {
    this.gpuMs = ms;
  }

  setCounters(counters: {
    liveParticles?: number;
    livePrimitives?: number;
    drawCalls?: number;
    instanceCount?: number;
    uploadBytes?: number;
  }): void {
    if (counters.liveParticles !== undefined) this.liveParticles = counters.liveParticles;
    if (counters.livePrimitives !== undefined) this.livePrimitives = counters.livePrimitives;
    if (counters.drawCalls !== undefined) this.drawCalls = counters.drawCalls;
    if (counters.instanceCount !== undefined) this.instanceCount = counters.instanceCount;
    if (counters.uploadBytes !== undefined) this.uploadBytes = counters.uploadBytes;
  }

  getSnapshot(): PerfSnapshot {
    const workSorted = [...this.frameHistory].sort((a, b) => a - b);
    const workP50 = percentile(workSorted, 0.5);
    const workP95 = percentile(workSorted, 0.95);
    const presentSorted = [...this.presentHistory].sort((a, b) => a - b);
    const presentP50 = percentile(presentSorted, 0.5);
    return {
      fps: presentP50 > 0 ? 1000 / presentP50 : 0,
      frameMsP50: workP50,
      frameMsP95: workP95,
      simMs: this.simMs,
      renderMs: this.renderMs,
      gpuMs: this.gpuMs,
      liveParticles: this.liveParticles,
      livePrimitives: this.livePrimitives,
      drawCalls: this.drawCalls,
      instanceCount: this.instanceCount,
      uploadBytes: this.uploadBytes,
    };
  }

  setOverlayVisible(v: boolean): void {
    this.overlayVisible = v;
  }

  isOverlayVisible(): boolean {
    return this.overlayVisible;
  }

  toggleOverlay(): void {
    this.overlayVisible = !this.overlayVisible;
  }

  formatOverlayText(): string {
    const s = this.getSnapshot();
    const lines = [
      `FPS ~${s.fps.toFixed(0)}`,
      `sim ${s.simMs.toFixed(2)}ms  render ${s.renderMs.toFixed(2)}ms  gpu ${s.gpuMs.toFixed(2)}ms`,
      `particles ${s.liveParticles}  primitives ${s.livePrimitives}`,
      `draws ${s.drawCalls}  instances ${s.instanceCount}  upload ${(s.uploadBytes / 1024).toFixed(1)}KB`,
    ];
    if (this.baselineP95Ms !== null) {
      lines.push(`baseline p95 ${this.baselineP95Ms.toFixed(1)}ms`);
    }
    return lines.join('\n');
  }
}

export const perfMonitor = new PerfMonitor();
