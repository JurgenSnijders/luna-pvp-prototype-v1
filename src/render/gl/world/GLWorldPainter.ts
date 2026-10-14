import type { GlPainterMarker, Painter2D } from '../../painter/Painter2D';
import { parseCssColor, type Rgba } from './cssColor';
import { GradientRamps, type GradientStop } from './GradientRamps';
import { SpriteAtlas } from './SpriteAtlas';
import {
  AA_FILL,
  applyDash,
  cleanPoints,
  clipPolygonByConvex,
  fillPolygon,
  isConvex,
  polygonArea,
  shadowPeak,
  strokePolyline,
  TriList,
  type SubPath,
} from './tessellate';

/**
 * Vertex: pos.xy (device px), color.rgba (premultiplied, coverage applied),
 * uv.xy, mode, rampV, paint.xyzw. Modes: 0 solid, 1 atlas, 2 linear, 3 radial.
 */
export const WORLD_VERTEX_FLOATS = 14;

export const MODE_SOLID = 0;
export const MODE_ATLAS = 1;
export const MODE_LINEAR = 2;
export const MODE_RADIAL = 3;

export type WorldBlend = 'over' | 'add';

export interface WorldBatch {
  blend: WorldBlend;
  /** Atlas page, or -1 when the batch samples no sprite. */
  page: number;
  first: number;
  count: number;
}

export class GLGradient implements CanvasGradient {
  readonly stops: GradientStop[] = [];
  constructor(
    readonly kind: 'linear' | 'radial',
    /** linear: x0 y0 x1 y1, radial: x0 y0 r0 x1 y1 r1 (local space). */
    readonly params: readonly number[],
  ) {}

  addColorStop(offset: number, color: string): void {
    if (!Number.isFinite(offset) || offset < 0 || offset > 1) return;
    const rgba = parseCssColor(color);
    if (!rgba) return;
    this.stops.push({ offset, color: rgba });
  }
}

type Style = string | CanvasGradient | CanvasPattern;

interface ClipRegion {
  pts: number[];
  ccw: boolean;
}

interface PainterState {
  a: number; b: number; c: number; d: number; e: number; f: number;
  fillStyle: Style;
  strokeStyle: Style;
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
  clip: ClipRegion | null;
}

function defaultState(scale: number): PainterState {
  return {
    a: scale, b: 0, c: 0, d: scale, e: 0, f: 0,
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
    clip: null,
  };
}

interface ResolvedPaint {
  mode: number;
  /** Premultiplied colour (solid) or (alpha, alpha, alpha, alpha) for ramps/sprites. */
  r: number; g: number; b: number; a: number;
  rampV: number;
  p0: number; p1: number; p2: number; p3: number;
  /** Representative alpha, used to scale the shadow. */
  opacity: number;
}

export interface WorldPainterStats {
  vertices: number;
  batches: number;
  clearRectsIgnored: number;
  nonConvexClipsIgnored: number;
  textForwarded: number;
}

const ARC_TOLERANCE_PX = 0.2;
const MITER_LIMIT = 10;
const CLIP_STRIDE = 5;

/**
 * The Canvas2D subset on WebGL: paths are flattened into device pixels at
 * construction (as Canvas2D applies the CTM then), tessellated with AA fringes
 * on fill/stroke, and appended to one painter-ordered vertex stream. Batches
 * only break on blend or atlas page changes.
 */
export class GLWorldPainter implements Painter2D, GlPainterMarker {
  readonly isGlWorldPainter = true as const;
  readonly atlas = new SpriteAtlas();
  readonly ramps = new GradientRamps();

  verts = new Float32Array(WORLD_VERTEX_FLOATS * 8192);
  vertCount = 0;
  batches: WorldBatch[] = [];

  /** Canvas2D context that receives text, which stays on the canvas layer. */
  textSink: CanvasRenderingContext2D | null = null;

  private state: PainterState = defaultState(1);
  private stack: PainterState[] = [];
  private subpaths: SubPath[] = [];
  private tris = new TriList();
  private clipScratch: number[] = [];
  private stats: WorldPainterStats = {
    vertices: 0,
    batches: 0,
    clearRectsIgnored: 0,
    nonConvexClipsIgnored: 0,
    textForwarded: 0,
  };

  /** Text sink device px per GL device px (the two canvases may use different DPR caps). */
  private textSinkScale = 1;

  beginFrame(
    deviceScale: number,
    textSink: CanvasRenderingContext2D | null = null,
    textSinkScale = 1,
  ): void {
    this.vertCount = 0;
    this.batches = [];
    this.state = defaultState(deviceScale);
    this.stack = [];
    this.subpaths = [];
    this.textSink = textSink;
    this.textSinkScale = textSinkScale;
    this.atlas.beginFrame();
    this.ramps.beginFrame();
    this.stats = {
      vertices: 0,
      batches: 0,
      clearRectsIgnored: 0,
      nonConvexClipsIgnored: 0,
      textForwarded: 0,
    };
  }

  getStats(): WorldPainterStats {
    return { ...this.stats, vertices: this.vertCount, batches: this.batches.length };
  }

  // ---- state -------------------------------------------------------------

  get fillStyle(): Style { return this.state.fillStyle; }
  set fillStyle(v: Style) { if (this.validStyle(v)) this.state.fillStyle = v; }
  get strokeStyle(): Style { return this.state.strokeStyle; }
  set strokeStyle(v: Style) { if (this.validStyle(v)) this.state.strokeStyle = v; }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.state.lineWidth = v; }
  get lineCap(): CanvasLineCap { return this.state.lineCap; }
  set lineCap(v: CanvasLineCap) { if (v === 'butt' || v === 'round' || v === 'square') this.state.lineCap = v; }
  get lineJoin(): CanvasLineJoin { return this.state.lineJoin; }
  set lineJoin(v: CanvasLineJoin) { if (v === 'miter' || v === 'round' || v === 'bevel') this.state.lineJoin = v; }
  get globalAlpha(): number { return this.state.globalAlpha; }
  set globalAlpha(v: number) { if (Number.isFinite(v) && v >= 0 && v <= 1) this.state.globalAlpha = v; }
  get globalCompositeOperation(): GlobalCompositeOperation { return this.state.globalCompositeOperation; }
  set globalCompositeOperation(v: GlobalCompositeOperation) { this.state.globalCompositeOperation = v; }
  get shadowBlur(): number { return this.state.shadowBlur; }
  set shadowBlur(v: number) { if (Number.isFinite(v) && v >= 0) this.state.shadowBlur = v; }
  get shadowColor(): string { return this.state.shadowColor; }
  set shadowColor(v: string) { if (parseCssColor(v)) this.state.shadowColor = v; }
  get font(): string { return this.state.font; }
  set font(v: string) { this.state.font = v; }
  get textAlign(): CanvasTextAlign { return this.state.textAlign; }
  set textAlign(v: CanvasTextAlign) { this.state.textAlign = v; }
  get textBaseline(): CanvasTextBaseline { return this.state.textBaseline; }
  set textBaseline(v: CanvasTextBaseline) { this.state.textBaseline = v; }

  private validStyle(v: Style): boolean {
    if (typeof v === 'string') return parseCssColor(v) !== null;
    return v instanceof GLGradient;
  }

  save(): void {
    this.stack.push({ ...this.state, lineDash: [...this.state.lineDash] });
  }

  restore(): void {
    const prev = this.stack.pop();
    if (prev) this.state = prev;
  }

  translate(x: number, y: number): void {
    const s = this.state;
    s.e += s.a * x + s.c * y;
    s.f += s.b * x + s.d * y;
  }

  scale(x: number, y: number): void {
    const s = this.state;
    s.a *= x; s.b *= x;
    s.c *= y; s.d *= y;
  }

  rotate(angle: number): void {
    const s = this.state;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const a = s.a * cos + s.c * sin;
    const b = s.b * cos + s.d * sin;
    const c = s.c * cos - s.a * sin;
    const d = s.d * cos - s.b * sin;
    s.a = a; s.b = b; s.c = c; s.d = d;
  }

  setLineDash(segments: Iterable<number>): void {
    const list = [...segments];
    if (list.some((v) => !Number.isFinite(v) || v < 0)) return;
    this.state.lineDash = list.length % 2 === 1 ? [...list, ...list] : list;
  }

  getLineDash(): number[] {
    return [...this.state.lineDash];
  }

  /** Uniform scale of the current transform (device px per local unit). */
  private ctmScale(): number {
    const s = this.state;
    return Math.sqrt(Math.abs(s.a * s.d - s.b * s.c));
  }

  private tx(x: number, y: number): number {
    return this.state.a * x + this.state.c * y + this.state.e;
  }

  private ty(x: number, y: number): number {
    return this.state.b * x + this.state.d * y + this.state.f;
  }

  // ---- paths -------------------------------------------------------------

  beginPath(): void {
    this.subpaths = [];
  }

  private currentSubpath(): SubPath | null {
    return this.subpaths.length > 0 ? this.subpaths[this.subpaths.length - 1] : null;
  }

  private pushDevicePoint(x: number, y: number, startNew: boolean): void {
    const cur = this.currentSubpath();
    if (startNew || !cur || cur.closed) {
      this.subpaths.push({ pts: [x, y], closed: false });
      return;
    }
    cur.pts.push(x, y);
  }

  moveTo(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pushDevicePoint(this.tx(x, y), this.ty(x, y), true);
  }

  lineTo(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.pushDevicePoint(this.tx(x, y), this.ty(x, y), false);
  }

  closePath(): void {
    const cur = this.currentSubpath();
    if (!cur || cur.pts.length < 2) return;
    cur.closed = true;
    this.subpaths.push({ pts: [cur.pts[0], cur.pts[1]], closed: false });
  }

  private arcSweep(a0: number, a1: number, ccw: boolean): number {
    const TAU = Math.PI * 2;
    if (!ccw) {
      if (a1 - a0 >= TAU) return TAU;
      return (((a1 - a0) % TAU) + TAU) % TAU;
    }
    if (a0 - a1 >= TAU) return -TAU;
    return -((((a0 - a1) % TAU) + TAU) % TAU);
  }

  private segmentsFor(radiusPx: number, sweep: number): number {
    if (radiusPx <= ARC_TOLERANCE_PX) return Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
    const step = 2 * Math.acos(Math.max(-1, 1 - ARC_TOLERANCE_PX / radiusPx));
    return Math.min(512, Math.max(1, Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3))));
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false): void {
    this.ellipse(x, y, radius, radius, 0, startAngle, endAngle, counterclockwise);
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false,
  ): void {
    if (![x, y, radiusX, radiusY, rotation, startAngle, endAngle].every(Number.isFinite)) return;
    if (radiusX < 0 || radiusY < 0) return;
    const sweep = this.arcSweep(startAngle, endAngle, counterclockwise);
    const scale = this.ctmScale();
    const segs = this.segmentsFor(Math.max(radiusX, radiusY) * scale, sweep);
    const cr = Math.cos(rotation);
    const sr = Math.sin(rotation);
    for (let i = 0; i <= segs; i++) {
      const t = startAngle + (sweep * i) / segs;
      const ex = radiusX * Math.cos(t);
      const ey = radiusY * Math.sin(t);
      const lx = x + ex * cr - ey * sr;
      const ly = y + ex * sr + ey * cr;
      this.pushDevicePoint(this.tx(lx, ly), this.ty(lx, ly), false);
    }
  }

  rect(x: number, y: number, w: number, h: number): void {
    if (![x, y, w, h].every(Number.isFinite)) return;
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    radii?: number | DOMPointInit | (number | DOMPointInit)[],
  ): void {
    if (![x, y, w, h].every(Number.isFinite)) return;
    const list = radii === undefined ? [0] : Array.isArray(radii) ? radii : [radii];
    const val = (r: number | DOMPointInit | undefined): number =>
      Math.max(0, typeof r === 'number' ? r : (r?.x ?? 0));
    let tl: number, tr: number, br: number, bl: number;
    if (list.length === 1) {
      tl = tr = br = bl = val(list[0]);
    } else if (list.length === 2) {
      tl = br = val(list[0]);
      tr = bl = val(list[1]);
    } else if (list.length === 3) {
      tl = val(list[0]);
      tr = bl = val(list[1]);
      br = val(list[2]);
    } else {
      tl = val(list[0]); tr = val(list[1]); br = val(list[2]); bl = val(list[3]);
    }
    const aw = Math.abs(w);
    const ah = Math.abs(h);
    const fit = Math.min(
      1,
      aw / Math.max(1e-9, tl + tr),
      aw / Math.max(1e-9, bl + br),
      ah / Math.max(1e-9, tl + bl),
      ah / Math.max(1e-9, tr + br),
    );
    tl *= fit; tr *= fit; br *= fit; bl *= fit;
    const x0 = Math.min(x, x + w);
    const y0 = Math.min(y, y + h);
    const x1 = x0 + aw;
    const y1 = y0 + ah;
    const H = Math.PI / 2;
    this.moveTo(x0 + tl, y0);
    this.lineTo(x1 - tr, y0);
    if (tr > 0) this.ellipse(x1 - tr, y0 + tr, tr, tr, 0, -H, 0);
    this.lineTo(x1, y1 - br);
    if (br > 0) this.ellipse(x1 - br, y1 - br, br, br, 0, 0, H);
    this.lineTo(x0 + bl, y1);
    if (bl > 0) this.ellipse(x0 + bl, y1 - bl, bl, bl, 0, H, Math.PI);
    this.lineTo(x0, y0 + tl);
    if (tl > 0) this.ellipse(x0 + tl, y0 + tl, tl, tl, 0, Math.PI, Math.PI + H);
    this.closePath();
    this.moveTo(x, y);
  }

  // ---- paint -------------------------------------------------------------

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    return new GLGradient('linear', [x0, y0, x1, y1]);
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient {
    return new GLGradient('radial', [x0, y0, r0, x1, y1, r1]);
  }

  private resolvePaint(style: Style): ResolvedPaint | null {
    const alpha = this.state.globalAlpha;
    if (typeof style === 'string') {
      const c = parseCssColor(style);
      if (!c) return null;
      const a = c[3] * alpha;
      return {
        mode: 0,
        r: c[0] * a, g: c[1] * a, b: c[2] * a, a,
        rampV: 0, p0: 0, p1: 0, p2: 0, p3: 0,
        opacity: a,
      };
    }
    if (!(style instanceof GLGradient) || style.stops.length === 0) return null;
    if (style.stops.length === 1) {
      const c = style.stops[0].color;
      const a = c[3] * alpha;
      return {
        mode: 0, r: c[0] * a, g: c[1] * a, b: c[2] * a, a,
        rampV: 0, p0: 0, p1: 0, p2: 0, p3: 0, opacity: a,
      };
    }
    const row = this.ramps.rowFor(style.stops);
    let maxA = 0;
    for (const s of style.stops) maxA = Math.max(maxA, s.color[3]);
    const p = style.params;
    if (style.kind === 'linear') {
      return {
        mode: MODE_LINEAR, r: alpha, g: alpha, b: alpha, a: alpha,
        rampV: GradientRamps.rowV(row),
        p0: this.tx(p[0], p[1]), p1: this.ty(p[0], p[1]),
        p2: this.tx(p[2], p[3]), p3: this.ty(p[2], p[3]),
        opacity: maxA * alpha * 0.5,
      };
    }
    const scale = this.ctmScale();
    return {
      mode: MODE_RADIAL, r: alpha, g: alpha, b: alpha, a: alpha,
      rampV: GradientRamps.rowV(row),
      p0: this.tx(p[3], p[4]), p1: this.ty(p[3], p[4]),
      p2: p[2] * scale, p3: p[5] * scale,
      opacity: maxA * alpha * 0.5,
    };
  }

  private currentBlend(): WorldBlend {
    return this.state.globalCompositeOperation === 'lighter' ? 'add' : 'over';
  }

  /** Shadow paint when Canvas would draw a shadow for a shape of this opacity. */
  private shadowPaint(opacity: number): ResolvedPaint | null {
    if (this.state.shadowBlur <= 0) return null;
    const c = parseCssColor(this.state.shadowColor);
    if (!c || c[3] <= 0 || opacity <= 0) return null;
    const a = c[3] * opacity;
    return {
      mode: 0, r: c[0] * a, g: c[1] * a, b: c[2] * a, a,
      rampV: 0, p0: 0, p1: 0, p2: 0, p3: 0, opacity: a,
    };
  }

  fill(_a?: CanvasFillRule | Path2D, _b?: CanvasFillRule): void {
    this.fillSubpaths(this.subpaths);
  }

  stroke(): void {
    this.strokeSubpaths(this.subpaths);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (![x, y, w, h].every(Number.isFinite) || w === 0 || h === 0) return;
    this.fillSubpaths([this.rectSubpath(x, y, w, h)]);
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    if (![x, y, w, h].every(Number.isFinite)) return;
    this.strokeSubpaths([this.rectSubpath(x, y, w, h)]);
  }

  clearRect(_x: number, _y: number, _w: number, _h: number): void {
    // The GL world target is cleared once per frame; erasing mid-stream has no batch equivalent.
    this.stats.clearRectsIgnored++;
  }

  private rectSubpath(x: number, y: number, w: number, h: number): SubPath {
    return {
      pts: [
        this.tx(x, y), this.ty(x, y),
        this.tx(x + w, y), this.ty(x + w, y),
        this.tx(x + w, y + h), this.ty(x + w, y + h),
        this.tx(x, y + h), this.ty(x, y + h),
      ],
      closed: true,
    };
  }

  private fillSubpaths(subpaths: readonly SubPath[]): void {
    const paint = this.resolvePaint(this.state.fillStyle);
    if (!paint) return;
    const blend = this.currentBlend();
    const shadow = this.shadowPaint(paint.opacity);
    if (shadow) {
      const blur = this.state.shadowBlur;
      this.tris.clear();
      for (const sp of subpaths) {
        if (sp.pts.length < 6) continue;
        const pts = cleanPoints(sp.pts, true);
        const halfExtent = Math.sqrt(Math.abs(polygonArea(pts)) / Math.PI);
        const peak = halfExtent < blur * 0.55 ? shadowPeak(halfExtent, blur) : 1;
        fillPolygon(pts, { peak, inset: blur * 0.55, outset: blur * 0.55 }, this.tris);
      }
      this.emit(this.tris, shadow, blend);
    }
    this.tris.clear();
    for (const sp of subpaths) {
      if (sp.pts.length < 6) continue;
      fillPolygon(sp.pts, AA_FILL, this.tris);
    }
    this.emit(this.tris, paint, blend);
  }

  private strokeSubpaths(subpaths: readonly SubPath[]): void {
    const paint = this.resolvePaint(this.state.strokeStyle);
    if (!paint) return;
    const blend = this.currentBlend();
    const scale = this.ctmScale();
    const halfWidth = (this.state.lineWidth * scale) / 2;
    const dash = this.state.lineDash.map((d) => d * scale);
    const pieces: SubPath[] = [];
    for (const sp of subpaths) {
      if (sp.pts.length < 4) continue;
      if (dash.length > 0) pieces.push(...applyDash(sp, dash));
      else pieces.push(sp);
    }
    if (pieces.length === 0) return;
    const shadow = this.shadowPaint(paint.opacity);
    if (shadow) {
      this.tris.clear();
      for (const piece of pieces) {
        strokePolyline(
          piece,
          {
            halfWidth,
            cap: this.state.lineCap,
            join: this.state.lineJoin,
            miterLimit: MITER_LIMIT,
            dash: [],
            fringe: Math.max(1, this.state.shadowBlur * 1.1),
            peak: 1,
            inset: 0,
          },
          this.tris,
        );
      }
      this.emit(this.tris, shadow, blend);
    }
    this.tris.clear();
    for (const piece of pieces) {
      strokePolyline(
        piece,
        {
          halfWidth,
          cap: this.state.lineCap,
          join: this.state.lineJoin,
          miterLimit: MITER_LIMIT,
          dash: [],
          fringe: 1,
          peak: 1,
          inset: 0,
        },
        this.tris,
      );
    }
    this.emit(this.tris, paint, blend);
  }

  clip(_a?: CanvasFillRule | Path2D, _b?: CanvasFillRule): void {
    const sp = this.subpaths.find((p) => p.pts.length >= 6);
    if (!sp) {
      this.state.clip = { pts: [], ccw: true };
      return;
    }
    let pts = cleanPoints(sp.pts, true);
    if (!isConvex(pts)) {
      this.stats.nonConvexClipsIgnored++;
      return;
    }
    const prev = this.state.clip;
    if (prev) {
      pts = prev.pts.length === 0 ? [] : clipPolygonByConvex(pts, 2, prev.pts, prev.ccw);
    }
    this.state.clip = { pts, ccw: polygonArea(pts) > 0 };
  }

  // ---- images & text -----------------------------------------------------

  drawImage(image: CanvasImageSource, ...args: number[]): void {
    const src = image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
    const srcW = src.naturalWidth || src.width || 0;
    const srcH = src.naturalHeight || src.height || 0;
    if (srcW <= 0 || srcH <= 0) return;
    let sx = 0, sy = 0, sw = srcW, sh = srcH;
    let dx: number, dy: number, dw: number, dh: number;
    if (args.length >= 8) {
      [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    } else if (args.length >= 4) {
      [dx, dy, dw, dh] = args;
    } else {
      [dx, dy] = args;
      dw = srcW;
      dh = srcH;
    }
    if (![sx, sy, sw, sh, dx, dy, dw, dh].every(Number.isFinite) || dw === 0 || dh === 0) return;
    const entry = this.atlas.lookup(image as object, srcW, srcH);
    if (!entry) return;
    const alpha = this.state.globalAlpha;
    if (alpha <= 0) return;
    const du = entry.u1 - entry.u0;
    const dv = entry.v1 - entry.v0;
    const u0 = entry.u0 + (sx / srcW) * du;
    const v0 = entry.v0 + (sy / srcH) * dv;
    const u1 = entry.u0 + ((sx + sw) / srcW) * du;
    const v1 = entry.v0 + ((sy + sh) / srcH) * dv;
    const paint: ResolvedPaint = {
      mode: MODE_ATLAS, r: alpha, g: alpha, b: alpha, a: alpha,
      rampV: 0, p0: 0, p1: 0, p2: 0, p3: 0, opacity: alpha,
    };
    const corners = [
      [dx, dy, u0, v0],
      [dx + dw, dy, u1, v0],
      [dx + dw, dy + dh, u1, v1],
      [dx, dy + dh, u0, v1],
    ].map(([x, y, u, v]) => [this.tx(x, y), this.ty(x, y), 1, u, v]);
    const blend = this.currentBlend();
    this.emitTexturedTri(corners[0], corners[1], corners[2], paint, blend, entry.page);
    this.emitTexturedTri(corners[0], corners[2], corners[3], paint, blend, entry.page);
  }

  private forwardText(text: string, x: number, y: number, maxWidth: number | undefined, stroke: boolean): void {
    const sink = this.textSink;
    if (!sink) return;
    this.stats.textForwarded++;
    const s = this.state;
    sink.save();
    const k = this.textSinkScale;
    sink.setTransform(s.a * k, s.b * k, s.c * k, s.d * k, s.e * k, s.f * k);
    sink.globalAlpha = s.globalAlpha;
    sink.globalCompositeOperation = s.globalCompositeOperation;
    sink.font = s.font;
    sink.textAlign = s.textAlign;
    sink.textBaseline = s.textBaseline;
    sink.shadowBlur = s.shadowBlur;
    sink.shadowColor = s.shadowColor;
    sink.lineWidth = s.lineWidth;
    sink.lineJoin = s.lineJoin;
    if (typeof s.fillStyle === 'string') sink.fillStyle = s.fillStyle;
    if (typeof s.strokeStyle === 'string') sink.strokeStyle = s.strokeStyle;
    if (stroke) sink.strokeText(text, x, y, maxWidth);
    else sink.fillText(text, x, y, maxWidth);
    sink.restore();
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.forwardText(text, x, y, maxWidth, false);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.forwardText(text, x, y, maxWidth, true);
  }

  measureText(text: string): TextMetrics {
    const sink = this.textSink;
    if (sink) {
      const prev = sink.font;
      sink.font = this.state.font;
      const m = sink.measureText(text);
      sink.font = prev;
      return m;
    }
    const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.state.font)?.[1] ?? '10');
    return { width: text.length * size * 0.6 } as TextMetrics;
  }

  // ---- vertex stream -----------------------------------------------------

  private ensureCapacity(extraVerts: number): void {
    const need = (this.vertCount + extraVerts) * WORLD_VERTEX_FLOATS;
    if (need <= this.verts.length) return;
    let cap = this.verts.length * 2;
    while (cap < need) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.verts.subarray(0, this.vertCount * WORLD_VERTEX_FLOATS));
    this.verts = next;
  }

  private batchFor(blend: WorldBlend, page: number): WorldBatch {
    const last = this.batches.length > 0 ? this.batches[this.batches.length - 1] : null;
    if (last && last.blend === blend && (page < 0 || last.page < 0 || last.page === page)) {
      if (page >= 0) last.page = page;
      return last;
    }
    const batch: WorldBatch = { blend, page, first: this.vertCount, count: 0 };
    this.batches.push(batch);
    return batch;
  }

  private writeVertex(x: number, y: number, cov: number, u: number, v: number, p: ResolvedPaint): void {
    const o = this.vertCount * WORLD_VERTEX_FLOATS;
    const d = this.verts;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = p.r * cov;
    d[o + 3] = p.g * cov;
    d[o + 4] = p.b * cov;
    d[o + 5] = p.a * cov;
    d[o + 6] = u;
    d[o + 7] = v;
    d[o + 8] = p.mode;
    d[o + 9] = p.rampV;
    d[o + 10] = p.p0;
    d[o + 11] = p.p1;
    d[o + 12] = p.p2;
    d[o + 13] = p.p3;
    this.vertCount++;
  }

  private emit(tris: TriList, paint: ResolvedPaint, blend: WorldBlend): void {
    const count = tris.vertexCount;
    if (count === 0) return;
    const clip = this.state.clip;
    if (clip && clip.pts.length === 0) return;
    const batch = this.batchFor(blend, -1);
    const d = tris.data;
    if (!clip) {
      this.ensureCapacity(count);
      for (let i = 0; i < count; i++) {
        this.writeVertex(d[i * 3], d[i * 3 + 1], d[i * 3 + 2], 0, 0, paint);
      }
      batch.count += count;
      return;
    }
    for (let t = 0; t < count; t += 3) {
      const poly = this.clipScratch;
      poly.length = 0;
      for (let k = 0; k < 3; k++) {
        const i = (t + k) * 3;
        poly.push(d[i], d[i + 1], d[i + 2], 0, 0);
      }
      this.emitClippedPolygon(poly, paint, batch);
    }
  }

  private emitTexturedTri(
    a: number[], b: number[], c: number[],
    paint: ResolvedPaint, blend: WorldBlend, page: number,
  ): void {
    const clip = this.state.clip;
    if (clip && clip.pts.length === 0) return;
    const batch = this.batchFor(blend, page);
    if (!clip) {
      this.ensureCapacity(3);
      for (const v of [a, b, c]) this.writeVertex(v[0], v[1], v[2], v[3], v[4], paint);
      batch.count += 3;
      return;
    }
    this.emitClippedPolygon([...a, ...b, ...c], paint, batch);
  }

  private emitClippedPolygon(poly: number[], paint: ResolvedPaint, batch: WorldBatch): void {
    const clip = this.state.clip!;
    const out = clipPolygonByConvex(poly, CLIP_STRIDE, clip.pts, clip.ccw);
    const n = out.length / CLIP_STRIDE;
    if (n < 3) return;
    this.ensureCapacity((n - 2) * 3);
    for (let i = 1; i < n - 1; i++) {
      for (const k of [0, i, i + 1]) {
        const o = k * CLIP_STRIDE;
        this.writeVertex(out[o], out[o + 1], out[o + 2], out[o + 3], out[o + 4], paint);
      }
      batch.count += 3;
    }
  }
}
