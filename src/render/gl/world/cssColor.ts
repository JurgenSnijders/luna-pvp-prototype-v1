/** Straight (non-premultiplied) RGBA, channels in 0..1. */
export type Rgba = readonly [number, number, number, number];

const cache = new Map<string, Rgba | null>();
const CACHE_MAX = 4096;

const NAMED: Record<string, Rgba> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [1, 1, 1, 1],
  red: [1, 0, 0, 1],
  lime: [0, 1, 0, 1],
  blue: [0, 0, 1, 1],
  yellow: [1, 1, 0, 1],
  cyan: [0, 1, 1, 1],
  magenta: [1, 0, 1, 1],
  orange: [1, 165 / 255, 0, 1],
  gray: [128 / 255, 128 / 255, 128 / 255, 1],
  grey: [128 / 255, 128 / 255, 128 / 255, 1],
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function parseHex(body: string): Rgba | null {
  if (!/^[0-9a-f]+$/i.test(body)) return null;
  const expand = body.length === 3 || body.length === 4;
  const full = expand ? body.replace(/./g, (c) => c + c) : body;
  if (full.length !== 6 && full.length !== 8) return null;
  const n = (i: number) => parseInt(full.substring(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), full.length === 8 ? n(6) : 1];
}

function parseChannel(token: string, scale: number): number {
  const t = token.trim();
  if (t.endsWith('%')) return clamp01(parseFloat(t) / 100);
  return clamp01(parseFloat(t) / scale);
}

function hueToRgb(p: number, q: number, t: number): number {
  let h = t;
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  if (h < 1 / 6) return p + (q - p) * 6 * h;
  if (h < 1 / 2) return q;
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6;
  return p;
}

function parseFunctional(name: string, args: string): Rgba | null {
  const parts = args.split(/[\s,/]+/).filter((s) => s.length > 0);
  if (parts.length < 3) return null;
  const alpha = parts.length >= 4 ? parseChannel(parts[3], 1) : 1;
  if (name === 'rgb' || name === 'rgba') {
    const rgb = parts.slice(0, 3).map((p) => parseChannel(p, 255));
    if (rgb.some((v) => !Number.isFinite(v)) || !Number.isFinite(alpha)) return null;
    return [rgb[0], rgb[1], rgb[2], alpha];
  }
  if (name === 'hsl' || name === 'hsla') {
    const h = (((parseFloat(parts[0]) % 360) + 360) % 360) / 360;
    const s = clamp01(parseFloat(parts[1]) / 100);
    const l = clamp01(parseFloat(parts[2]) / 100);
    if (![h, s, l, alpha].every(Number.isFinite)) return null;
    if (s === 0) return [l, l, l, alpha];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3), alpha];
  }
  return null;
}

let normalizeCtx: CanvasRenderingContext2D | null | undefined;

/** Unknown syntaxes (named colours etc.) fall back to the browser's parser. */
function normalizeViaCanvas(input: string): string | null {
  if (normalizeCtx === undefined) {
    normalizeCtx =
      typeof document !== 'undefined' && typeof document.createElement === 'function'
        ? ((document.createElement('canvas') as HTMLCanvasElement).getContext?.('2d') ?? null)
        : null;
  }
  if (!normalizeCtx) return null;
  const sentinel = '#010203';
  normalizeCtx.fillStyle = sentinel;
  normalizeCtx.fillStyle = input;
  const out = String(normalizeCtx.fillStyle);
  if (out === sentinel && input.trim().toLowerCase() !== sentinel) return null;
  return out;
}

function parseUncached(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith('#')) return parseHex(s.slice(1));
  const fn = /^([a-z]+)\((.*)\)$/.exec(s);
  if (fn) return parseFunctional(fn[1], fn[2]);
  const named = NAMED[s];
  if (named) return named;
  const normalized = normalizeViaCanvas(input);
  if (normalized && normalized !== input) return parseUncached(normalized);
  return null;
}

/** Parses a CSS colour string; null when it is not a valid colour (Canvas then keeps the old style). */
export function parseCssColor(input: string): Rgba | null {
  let hit = cache.get(input);
  if (hit !== undefined) return hit;
  hit = parseUncached(input);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(input, hit);
  return hit;
}
