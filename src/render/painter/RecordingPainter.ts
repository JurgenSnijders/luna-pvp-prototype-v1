import type { Painter2D } from './Painter2D';

export type RecordedValue = number | string | boolean | null | RecordedValue[] | { [k: string]: RecordedValue };

export interface RecordedOp {
  op: string;
  args: RecordedValue[];
}

function round(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 1000) / 1000;
}

class RecordedGradient implements CanvasGradient {
  readonly stops: [number, string][] = [];
  constructor(readonly kind: 'linear' | 'radial', readonly params: number[]) {}
  addColorStop(offset: number, color: string): void {
    this.stops.push([round(offset), color]);
  }
  describe(): RecordedValue {
    return {
      kind: this.kind,
      params: this.params.map(round),
      stops: this.stops.map(([o, c]) => [o, c]),
    };
  }
}

function describe(value: unknown): RecordedValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return round(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof RecordedGradient) return value.describe();
  if (Array.isArray(value)) return value.map(describe);
  if (typeof value === 'object') {
    const src = value as { __recordId?: string; width?: number; height?: number };
    if (src.__recordId) return `image:${src.__recordId}`;
    if (typeof src.width === 'number' && typeof src.height === 'number') {
      return `image:${src.width}x${src.height}`;
    }
  }
  return String(value);
}

interface RecorderState {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  shadowBlur: number;
  shadowColor: string;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineDash: number[];
}

function defaultState(): RecorderState {
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineDash: [],
  };
}

/**
 * Logs every call and property write with numbers rounded to 1e-3. Used by the
 * golden parity test (module output through the painter API must equal the
 * pre-port log) and by the slice coverage test.
 */
export class RecordingPainter implements Painter2D {
  readonly ops: RecordedOp[] = [];
  /** Module currently drawing, stamped by tests that need per-module attribution. */
  currentModule: string | null = null;
  readonly moduleOps = new Map<string, number>();
  private state: RecorderState = defaultState();
  private stack: RecorderState[] = [];

  constructor(readonly label = 'recorder') {}

  private log(op: string, args: unknown[]): void {
    this.ops.push({ op, args: args.map(describe) });
    if (this.currentModule) {
      this.moduleOps.set(this.currentModule, (this.moduleOps.get(this.currentModule) ?? 0) + 1);
    }
  }

  private setProp<K extends keyof RecorderState>(key: K, value: RecorderState[K]): void {
    this.log(`set:${key}`, [value]);
    this.state[key] = value;
  }

  get fillStyle(): string | CanvasGradient | CanvasPattern { return this.state.fillStyle; }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) { this.setProp('fillStyle', v); }
  get strokeStyle(): string | CanvasGradient | CanvasPattern { return this.state.strokeStyle; }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) { this.setProp('strokeStyle', v); }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(v: number) { this.setProp('lineWidth', v); }
  get lineCap(): CanvasLineCap { return this.state.lineCap; }
  set lineCap(v: CanvasLineCap) { this.setProp('lineCap', v); }
  get lineJoin(): CanvasLineJoin { return this.state.lineJoin; }
  set lineJoin(v: CanvasLineJoin) { this.setProp('lineJoin', v); }
  get globalAlpha(): number { return this.state.globalAlpha; }
  set globalAlpha(v: number) { this.setProp('globalAlpha', v); }
  get globalCompositeOperation(): GlobalCompositeOperation { return this.state.globalCompositeOperation; }
  set globalCompositeOperation(v: GlobalCompositeOperation) { this.setProp('globalCompositeOperation', v); }
  get shadowBlur(): number { return this.state.shadowBlur; }
  set shadowBlur(v: number) { this.setProp('shadowBlur', v); }
  get shadowColor(): string { return this.state.shadowColor; }
  set shadowColor(v: string) { this.setProp('shadowColor', v); }
  get font(): string { return this.state.font; }
  set font(v: string) { this.setProp('font', v); }
  get textAlign(): CanvasTextAlign { return this.state.textAlign; }
  set textAlign(v: CanvasTextAlign) { this.setProp('textAlign', v); }
  get textBaseline(): CanvasTextBaseline { return this.state.textBaseline; }
  set textBaseline(v: CanvasTextBaseline) { this.setProp('textBaseline', v); }

  save(): void {
    this.log('save', []);
    this.stack.push({ ...this.state, lineDash: [...this.state.lineDash] });
  }
  restore(): void {
    this.log('restore', []);
    const prev = this.stack.pop();
    if (prev) this.state = prev;
  }
  translate(x: number, y: number): void { this.log('translate', [x, y]); }
  rotate(a: number): void { this.log('rotate', [a]); }
  scale(x: number, y: number): void { this.log('scale', [x, y]); }
  beginPath(): void { this.log('beginPath', []); }
  moveTo(x: number, y: number): void { this.log('moveTo', [x, y]); }
  lineTo(x: number, y: number): void { this.log('lineTo', [x, y]); }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void {
    this.log('arc', [x, y, r, a0, a1, ccw ?? false]);
  }
  ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rot: number,
    a0: number,
    a1: number,
    ccw?: boolean,
  ): void {
    this.log('ellipse', [x, y, rx, ry, rot, a0, a1, ccw ?? false]);
  }
  closePath(): void { this.log('closePath', []); }
  rect(x: number, y: number, w: number, h: number): void { this.log('rect', [x, y, w, h]); }
  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radii?: number | DOMPointInit | (number | DOMPointInit)[],
  ): void {
    this.log('roundRect', [x, y, w, h, describe(radii)]);
  }
  fill(a?: CanvasFillRule | Path2D, b?: CanvasFillRule): void {
    this.log('fill', [typeof a === 'string' ? a : b ?? null]);
  }
  stroke(): void { this.log('stroke', []); }
  fillRect(x: number, y: number, w: number, h: number): void { this.log('fillRect', [x, y, w, h]); }
  strokeRect(x: number, y: number, w: number, h: number): void { this.log('strokeRect', [x, y, w, h]); }
  clearRect(x: number, y: number, w: number, h: number): void { this.log('clearRect', [x, y, w, h]); }
  clip(a?: CanvasFillRule | Path2D, b?: CanvasFillRule): void {
    this.log('clip', [typeof a === 'string' ? a : b ?? null]);
  }
  setLineDash(segments: Iterable<number>): void {
    const list = [...segments];
    this.log('setLineDash', [list]);
    this.state.lineDash = list;
  }
  getLineDash(): number[] { return [...this.state.lineDash]; }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    this.log('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
    return new RecordedGradient('radial', [x0, y0, r0, x1, y1, r1]);
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    this.log('createLinearGradient', [x0, y0, x1, y1]);
    return new RecordedGradient('linear', [x0, y0, x1, y1]);
  }
  drawImage(image: CanvasImageSource, ...args: number[]): void {
    this.log('drawImage', [image, ...args]);
  }
  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.log('fillText', [text, x, y, maxWidth ?? null]);
  }
  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.log('strokeText', [text, x, y, maxWidth ?? null]);
  }
  measureText(text: string): TextMetrics {
    this.log('measureText', [text]);
    const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.state.font)?.[1] ?? '10');
    return { width: text.length * size * 0.6 } as TextMetrics;
  }

  countOps(op: string): number {
    let n = 0;
    for (const entry of this.ops) if (entry.op === op) n++;
    return n;
  }
}
