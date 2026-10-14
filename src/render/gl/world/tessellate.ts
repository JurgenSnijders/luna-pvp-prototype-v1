/**
 * Pure path tessellation in device pixels. Output is a flat triangle list of
 * (x, y, coverage) per vertex. Antialiasing comes from fringe strips whose
 * coverage ramps to 0 across `fringe` px, which matches Canvas2D's analytic
 * coverage closely for 1px fringes and doubles as a soft-shadow profile when
 * the fringe is widened.
 */

export class TriList {
  data: Float32Array;
  length = 0;

  constructor(initialVerts = 1024) {
    this.data = new Float32Array(initialVerts * 3);
  }

  clear(): void {
    this.length = 0;
  }

  get vertexCount(): number {
    return this.length / 3;
  }

  private grow(extra: number): void {
    const need = this.length + extra;
    if (need <= this.data.length) return;
    let cap = this.data.length * 2;
    while (cap < need) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }

  tri(
    ax: number, ay: number, ac: number,
    bx: number, by: number, bc: number,
    cx: number, cy: number, cc: number,
  ): void {
    this.grow(9);
    const d = this.data;
    let o = this.length;
    d[o++] = ax; d[o++] = ay; d[o++] = ac;
    d[o++] = bx; d[o++] = by; d[o++] = bc;
    d[o++] = cx; d[o++] = cy; d[o++] = cc;
    this.length = o;
  }

  quad(
    ax: number, ay: number, ac: number,
    bx: number, by: number, bc: number,
    cx: number, cy: number, cc: number,
    dx: number, dy: number, dc: number,
  ): void {
    this.tri(ax, ay, ac, bx, by, bc, cx, cy, cc);
    this.tri(ax, ay, ac, cx, cy, cc, dx, dy, dc);
  }
}

/** Flat [x0, y0, x1, y1, ...] polyline in device px. */
export interface SubPath {
  pts: number[];
  closed: boolean;
}

const EPS = 1e-4;

/** Removes consecutive duplicates (and the closing duplicate of a closed loop). */
export function cleanPoints(pts: readonly number[], closed: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    const n = out.length;
    if (n >= 2 && Math.abs(out[n - 2] - x) < EPS && Math.abs(out[n - 1] - y) < EPS) continue;
    out.push(x, y);
  }
  if (closed && out.length >= 4) {
    const n = out.length;
    if (Math.abs(out[0] - out[n - 2]) < EPS && Math.abs(out[1] - out[n - 1]) < EPS) {
      out.length = n - 2;
    }
  }
  return out;
}

export function polygonArea(pts: readonly number[]): number {
  let a = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
  }
  return a * 0.5;
}

export function isConvex(pts: readonly number[]): boolean {
  const n = pts.length / 2;
  if (n < 4) return true;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2];
    const ay = pts[i * 2 + 1];
    const bx = pts[((i + 1) % n) * 2];
    const by = pts[((i + 1) % n) * 2 + 1];
    const cx = pts[((i + 2) % n) * 2];
    const cy = pts[((i + 2) % n) * 2 + 1];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function pointInTri(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): boolean {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * Ear-clipping triangulation of a simple polygon. Returns vertex index
 * triples; falls back to a fan when the polygon is degenerate or
 * self-intersecting, so a shape is never silently dropped.
 */
export function triangulate(pts: readonly number[]): number[] {
  const n = pts.length / 2;
  if (n < 3) return [];
  const out: number[] = [];
  if (isConvex(pts)) {
    for (let i = 1; i < n - 1; i++) out.push(0, i, i + 1);
    return out;
  }
  const ccw = polygonArea(pts) > 0;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  let guard = n * n + 8;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      const ax = pts[i0 * 2], ay = pts[i0 * 2 + 1];
      const bx = pts[i1 * 2], by = pts[i1 * 2 + 1];
      const cx = pts[i2 * 2], cy = pts[i2 * 2 + 1];
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (ccw ? cross <= 1e-12 : cross >= -1e-12) continue;
      let inside = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTri(pts[j * 2], pts[j * 2 + 1], ax, ay, bx, by, cx, cy)) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      out.push(i0, i1, i2);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) {
    out.push(idx[0], idx[1], idx[2]);
  } else if (idx.length > 3) {
    for (let i = 1; i < idx.length - 1; i++) out.push(idx[0], idx[i], idx[i + 1]);
  }
  return out;
}

/**
 * Offsets each vertex of a closed polygon along its outward miter. Negative
 * distances move inward. The miter is clamped so spikes stay bounded.
 */
function offsetPolygon(pts: readonly number[], dist: number, outwardSign: number): number[] {
  const n = pts.length / 2;
  const out = new Array<number>(pts.length);
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n;
    const q = (i + 1) % n;
    const x = pts[i * 2], y = pts[i * 2 + 1];
    let e0x = x - pts[p * 2], e0y = y - pts[p * 2 + 1];
    let e1x = pts[q * 2] - x, e1y = pts[q * 2 + 1] - y;
    const l0 = Math.hypot(e0x, e0y) || 1;
    const l1 = Math.hypot(e1x, e1y) || 1;
    e0x /= l0; e0y /= l0; e1x /= l1; e1y /= l1;
    // Right-hand normals are outward for CW (screen-space positive area) loops.
    const n0x = e0y * outwardSign, n0y = -e0x * outwardSign;
    const n1x = e1y * outwardSign, n1y = -e1x * outwardSign;
    let mx = n0x + n1x, my = n0y + n1y;
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) {
      mx = n1x; my = n1y;
    } else {
      mx /= ml; my /= ml;
    }
    const cos = mx * n1x + my * n1y;
    const scale = Math.min(4, 1 / Math.max(cos, 0.25));
    out[i * 2] = x + mx * dist * scale;
    out[i * 2 + 1] = y + my * dist * scale;
  }
  return out;
}

export interface FillOptions {
  /** Coverage of the solid interior (shadow peaks are < 1). */
  peak: number;
  /** Interior is shrunk by this many px before the fringe starts. */
  inset: number;
  /** Fringe reaches coverage 0 this many px outside the path edge. */
  outset: number;
}

export const AA_FILL: FillOptions = { peak: 1, inset: 0.5, outset: 0.5 };

/** Fills one closed subpath (nonzero, per subpath) with an AA fringe. */
export function fillPolygon(rawPts: readonly number[], opts: FillOptions, out: TriList): void {
  const pts = cleanPoints(rawPts, true);
  const n = pts.length / 2;
  if (n < 3) return;
  const area = polygonArea(pts);
  if (Math.abs(area) < 1e-6) return;
  const outward = area > 0 ? 1 : -1;
  // Tiny shapes cannot be inset without inverting; keep their core at the edge.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i];
    if (pts[i] > maxX) maxX = pts[i];
    if (pts[i + 1] < minY) minY = pts[i + 1];
    if (pts[i + 1] > maxY) maxY = pts[i + 1];
  }
  const inset = Math.min(opts.inset, Math.min(maxX - minX, maxY - minY) * 0.25);
  const core = inset > 0 ? offsetPolygon(pts, -inset, outward) : pts;
  const outer = offsetPolygon(pts, opts.outset, outward);
  const peak = opts.peak;

  const tris = triangulate(pts);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    out.tri(
      core[a * 2], core[a * 2 + 1], peak,
      core[b * 2], core[b * 2 + 1], peak,
      core[c * 2], core[c * 2 + 1], peak,
    );
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.quad(
      core[i * 2], core[i * 2 + 1], peak,
      core[j * 2], core[j * 2 + 1], peak,
      outer[j * 2], outer[j * 2 + 1], 0,
      outer[i * 2], outer[i * 2 + 1], 0,
    );
  }
}

export interface StrokeOptions {
  halfWidth: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  miterLimit: number;
  /** Device-space dash pattern (already scaled by the transform). */
  dash: readonly number[];
  /** Width of the coverage ramp on each side of the core. */
  fringe: number;
  /** Coverage of the core (shadows use < 1). */
  peak: number;
  /** Shadows shift the ramp inward by this many px (0 for normal strokes). */
  inset: number;
}

/** Splits polylines by a dash pattern; the pattern restarts per subpath like Canvas2D. */
export function applyDash(path: SubPath, dash: readonly number[]): SubPath[] {
  const pts = cleanPoints(path.pts, path.closed);
  if (path.closed && pts.length >= 4) pts.push(pts[0], pts[1]);
  let total = 0;
  for (const d of dash) total += d;
  if (dash.length === 0 || total <= 1e-6) return [{ pts, closed: path.closed }];
  const out: SubPath[] = [];
  let di = 0;
  let remaining = dash[0];
  let on = true;
  let current: number[] | null = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    let ax = pts[i - 2], ay = pts[i - 1];
    const bx = pts[i], by = pts[i + 1];
    let segLen = Math.hypot(bx - ax, by - ay);
    while (segLen > 1e-9) {
      const step = Math.min(segLen, remaining);
      const t = step / segLen;
      const nx = ax + (bx - ax) * t;
      const ny = ay + (by - ay) * t;
      if (on && current) current.push(nx, ny);
      ax = nx; ay = ny;
      segLen -= step;
      remaining -= step;
      if (remaining <= 1e-9) {
        if (on && current && current.length >= 4) out.push({ pts: current, closed: false });
        on = !on;
        current = on ? [ax, ay] : null;
        di = (di + 1) % dash.length;
        remaining = dash[di];
      }
    }
  }
  if (on && current && current.length >= 4) out.push({ pts: current, closed: false });
  return out;
}

interface Section {
  x: number;
  y: number;
  /** Offset direction for the left side (unit normal * miter scale). */
  lx: number;
  ly: number;
}

function arcFan(
  out: TriList,
  cx: number, cy: number,
  core: number, outer: number, peak: number,
  a0: number, a1: number,
): void {
  const sweep = a1 - a0;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12) * Math.max(1, Math.sqrt(outer) / 2)));
  let px = Math.cos(a0), py = Math.sin(a0);
  for (let s = 1; s <= steps; s++) {
    const a = a0 + (sweep * s) / steps;
    const qx = Math.cos(a), qy = Math.sin(a);
    if (core > 0) out.tri(cx, cy, peak, cx + px * core, cy + py * core, peak, cx + qx * core, cy + qy * core, peak);
    out.quad(
      cx + px * core, cy + py * core, peak,
      cx + qx * core, cy + qy * core, peak,
      cx + qx * outer, cy + qy * outer, 0,
      cx + px * outer, cy + py * outer, 0,
    );
    px = qx; py = qy;
  }
}

function emitBand(out: TriList, a: Section, b: Section, core: number, outer: number, peak: number): void {
  const alx = a.x + a.lx * core, aly = a.y + a.ly * core;
  const arx = a.x - a.lx * core, ary = a.y - a.ly * core;
  const blx = b.x + b.lx * core, bly = b.y + b.ly * core;
  const brx = b.x - b.lx * core, bry = b.y - b.ly * core;
  const aolx = a.x + a.lx * outer, aoly = a.y + a.ly * outer;
  const aorx = a.x - a.lx * outer, aory = a.y - a.ly * outer;
  const bolx = b.x + b.lx * outer, boly = b.y + b.ly * outer;
  const borx = b.x - b.lx * outer, bory = b.y - b.ly * outer;
  if (core > 0) out.quad(alx, aly, peak, blx, bly, peak, brx, bry, peak, arx, ary, peak);
  out.quad(aolx, aoly, 0, bolx, boly, 0, blx, bly, peak, alx, aly, peak);
  out.quad(arx, ary, peak, brx, bry, peak, borx, bory, 0, aorx, aory, 0);
}

/** Strokes one polyline (already dashed) with joins, caps and AA fringe. */
export function strokePolyline(raw: SubPath, opts: StrokeOptions, out: TriList): void {
  let closed = raw.closed;
  const pts = cleanPoints(raw.pts, closed);
  let n = pts.length / 2;
  if (n < 2) return;
  if (!closed && n > 2) {
    const dx = pts[0] - pts[pts.length - 2];
    const dy = pts[1] - pts[pts.length - 1];
    if (dx * dx + dy * dy < 1e-6) {
      pts.length -= 2;
      n -= 1;
      closed = true;
    }
  }
  if (closed && n < 3) closed = false;

  const fr = opts.fringe;
  let half = opts.halfWidth;
  let peak = opts.peak;
  // Sub-pixel lines keep a 1px footprint and fade instead, like Canvas coverage.
  if (half * 2 < fr) {
    peak *= (half * 2) / fr;
    half = fr * 0.5;
  }
  const core = Math.max(0, half - fr * 0.5 - opts.inset);
  const outer = half + fr * 0.5;

  const segCount = closed ? n : n - 1;
  const dirX = new Array<number>(segCount);
  const dirY = new Array<number>(segCount);
  for (let s = 0; s < segCount; s++) {
    const i = s, j = (s + 1) % n;
    const dx = pts[j * 2] - pts[i * 2];
    const dy = pts[j * 2 + 1] - pts[i * 2 + 1];
    const l = Math.hypot(dx, dy) || 1;
    dirX[s] = dx / l;
    dirY[s] = dy / l;
  }

  // Each vertex yields an incoming and an outgoing section (identical for miters).
  const inSec: Section[] = new Array(n);
  const outSec: Section[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    const sPrev = (i - 1 + segCount) % segCount;
    const sNext = i % segCount;
    if (!hasPrev || !hasNext) {
      const s = hasNext ? sNext : sPrev;
      const sec = { x, y, lx: -dirY[s], ly: dirX[s] };
      inSec[i] = sec;
      outSec[i] = sec;
      continue;
    }
    const n0x = -dirY[sPrev], n0y = dirX[sPrev];
    const n1x = -dirY[sNext], n1y = dirX[sNext];
    let mx = n0x + n1x, my = n0y + n1y;
    const ml = Math.hypot(mx, my);
    const cos = ml > 1e-6 ? (mx / ml) * n1x + (my / ml) * n1y : 0;
    const ratio = cos > 1e-6 ? 1 / cos : Infinity;
    const useMiter =
      ratio <= 1.05 ||
      (opts.join === 'miter' && ratio <= opts.miterLimit) ||
      (opts.join === 'round' && ratio <= 1.5);
    if (useMiter && ml > 1e-6) {
      mx /= ml; my /= ml;
      const sec = { x, y, lx: mx * ratio, ly: my * ratio };
      inSec[i] = sec;
      outSec[i] = sec;
      continue;
    }
    inSec[i] = { x, y, lx: n0x, ly: n0y };
    outSec[i] = { x, y, lx: n1x, ly: n1y };
    // Fill the outer wedge of a bevel/round join.
    const turnLeft = dirX[sPrev] * dirY[sNext] - dirY[sPrev] * dirX[sNext] < 0;
    const side = turnLeft ? 1 : -1;
    const a0 = Math.atan2(n0y * side, n0x * side);
    let a1 = Math.atan2(n1y * side, n1x * side);
    if (opts.join === 'round') {
      let sweep = a1 - a0;
      while (sweep > Math.PI) sweep -= Math.PI * 2;
      while (sweep < -Math.PI) sweep += Math.PI * 2;
      a1 = a0 + sweep;
      arcFan(out, x, y, core, outer, peak, a0, a1);
    } else {
      const ox0 = n0x * side, oy0 = n0y * side;
      const ox1 = n1x * side, oy1 = n1y * side;
      if (core > 0) {
        out.tri(x, y, peak, x + ox0 * core, y + oy0 * core, peak, x + ox1 * core, y + oy1 * core, peak);
      }
      out.quad(
        x + ox0 * core, y + oy0 * core, peak,
        x + ox1 * core, y + oy1 * core, peak,
        x + ox1 * outer, y + oy1 * outer, 0,
        x + ox0 * outer, y + oy0 * outer, 0,
      );
    }
  }

  // Butt ends: the band stops half a fringe short so the end fringe abuts it
  // instead of overlapping (overlap would darken translucent line ends).
  if (!closed && opts.cap === 'butt') {
    const pull = fr * 0.5;
    const first = segLength(pts, 0, 1);
    const last = segLength(pts, n - 2, n - 1);
    if (first > pull * 2 && (n > 2 || first > pull * 4)) {
      const s0 = outSec[0];
      outSec[0] = { ...s0, x: s0.x + dirX[0] * pull, y: s0.y + dirY[0] * pull };
    }
    if (last > pull * 2 && (n > 2 || last > pull * 4)) {
      const sl = inSec[n - 1];
      const d = segCount - 1;
      inSec[n - 1] = { ...sl, x: sl.x - dirX[d] * pull, y: sl.y - dirY[d] * pull };
    }
  }

  for (let s = 0; s < segCount; s++) {
    const i = s, j = (s + 1) % n;
    emitBand(out, outSec[i], inSec[j], core, outer, peak);
  }

  if (!closed) {
    emitCap(out, pts[0], pts[1], -dirX[0], -dirY[0], opts.cap, half, core, outer, peak, fr);
    const last = n - 1;
    emitCap(
      out,
      pts[last * 2], pts[last * 2 + 1],
      dirX[segCount - 1], dirY[segCount - 1],
      opts.cap, half, core, outer, peak, fr,
    );
  }
}

function segLength(pts: readonly number[], i: number, j: number): number {
  return Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]);
}

/** Cap at an open end; (tx, ty) points away from the line. */
function emitCap(
  out: TriList,
  x: number, y: number, tx: number, ty: number,
  cap: CanvasLineCap,
  half: number, core: number, outer: number, peak: number, fringe: number,
): void {
  const nx = -ty, ny = tx;
  if (cap === 'round') {
    const a = Math.atan2(ny, nx);
    arcFan(out, x, y, core, outer, peak, a, a - Math.PI);
    return;
  }
  const ext = cap === 'square' ? half : 0;
  const ex = x + tx * ext, ey = y + ty * ext;
  if (ext > fringe * 0.5) {
    const inner = ext - fringe * 0.5;
    const a: Section = { x, y, lx: nx, ly: ny };
    const b: Section = { x: x + tx * inner, y: y + ty * inner, lx: nx, ly: ny };
    emitBand(out, a, b, core, outer, peak);
  }
  // End fringe so the butt edge is antialiased too.
  const fx = ex + tx * fringe * 0.5, fy = ey + ty * fringe * 0.5;
  const bx = ex - tx * fringe * 0.5, by = ey - ty * fringe * 0.5;
  out.quad(
    bx + nx * core, by + ny * core, peak,
    bx - nx * core, by - ny * core, peak,
    fx - nx * outer, fy - ny * outer, 0,
    fx + nx * outer, fy + ny * outer, 0,
  );
}

/** Abramowitz–Stegun 7.1.26, max error ~1.5e-7. */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Peak opacity of a Gaussian-blurred shape whose smallest half-extent is
 * `halfExtent` px, for Canvas `shadowBlur` = `blur` (sigma = blur / 2).
 */
export function shadowPeak(halfExtent: number, blur: number): number {
  const sigma = Math.max(1e-3, blur * 0.5);
  return Math.max(0, Math.min(1, erf(halfExtent / (Math.SQRT2 * sigma))));
}

/** Sutherland–Hodgman clip of one triangle (x, y, c, u, v per vertex) by a convex polygon. */
export function clipPolygonByConvex(
  poly: number[],
  stride: number,
  clip: readonly number[],
  clipCcw: boolean,
): number[] {
  let input = poly;
  const n = clip.length / 2;
  for (let e = 0; e < n && input.length > 0; e++) {
    const ax = clip[e * 2], ay = clip[e * 2 + 1];
    const bx = clip[((e + 1) % n) * 2], by = clip[((e + 1) % n) * 2 + 1];
    const side = (px: number, py: number): number => {
      const c = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      return clipCcw ? c : -c;
    };
    const output: number[] = [];
    const count = input.length / stride;
    for (let i = 0; i < count; i++) {
      const cur = i * stride;
      const prev = ((i + count - 1) % count) * stride;
      const sc = side(input[cur], input[cur + 1]);
      const sp = side(input[prev], input[prev + 1]);
      if (sc >= 0) {
        if (sp < 0) pushLerp(output, input, prev, cur, sp / (sp - sc), stride);
        for (let k = 0; k < stride; k++) output.push(input[cur + k]);
      } else if (sp >= 0) {
        pushLerp(output, input, prev, cur, sp / (sp - sc), stride);
      }
    }
    input = output;
  }
  return input;
}

function pushLerp(out: number[], src: number[], a: number, b: number, t: number, stride: number): void {
  for (let k = 0; k < stride; k++) out.push(src[a + k] + (src[b + k] - src[a + k]) * t);
}
