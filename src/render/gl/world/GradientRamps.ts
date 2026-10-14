import type { Rgba } from './cssColor';

export const RAMP_WIDTH = 256;
export const RAMP_ROWS = 256;

export interface GradientStop {
  offset: number;
  color: Rgba;
}

/**
 * Per-frame gradient lookup rows. Canvas2D interpolates colour stops in
 * straight alpha, so rows are baked straight and premultiplied per texel,
 * matching how the browser composites them.
 */
export class GradientRamps {
  readonly data = new Uint8Array(RAMP_WIDTH * RAMP_ROWS * 4);
  private rows = new Map<string, number>();
  private used = 0;
  private overflowed = false;

  get rowCount(): number {
    return this.used;
  }

  get didOverflow(): boolean {
    return this.overflowed;
  }

  beginFrame(): void {
    this.rows.clear();
    this.used = 0;
    this.overflowed = false;
  }

  /** Row index for these stops, baking it on first use this frame. */
  rowFor(stops: readonly GradientStop[]): number {
    let key = '';
    for (const s of stops) key += `${s.offset}:${s.color[0]},${s.color[1]},${s.color[2]},${s.color[3]};`;
    const hit = this.rows.get(key);
    if (hit !== undefined) return hit;
    if (this.used >= RAMP_ROWS) {
      this.overflowed = true;
      return RAMP_ROWS - 1;
    }
    const row = this.used++;
    bakeRamp(stops, this.data, row * RAMP_WIDTH * 4);
    this.rows.set(key, row);
    return row;
  }

  /** Texture-space v for the centre of a row. */
  static rowV(row: number): number {
    return (row + 0.5) / RAMP_ROWS;
  }
}

/** Sorted stops; ties keep insertion order, so the later stop wins past the tie. */
export function sortStops(stops: readonly GradientStop[]): GradientStop[] {
  return stops
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.offset - b.s.offset || a.i - b.i)
    .map((e) => e.s);
}

export function sampleStops(stops: readonly GradientStop[], t: number): [number, number, number, number] {
  if (stops.length === 0) return [0, 0, 0, 0];
  if (t <= stops[0].offset) return [...stops[0].color] as [number, number, number, number];
  const last = stops[stops.length - 1];
  if (t >= last.offset) return [...last.color] as [number, number, number, number];
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    if (t > b.offset) continue;
    const a = stops[i - 1];
    const span = b.offset - a.offset;
    const k = span > 1e-9 ? (t - a.offset) / span : 1;
    return [
      a.color[0] + (b.color[0] - a.color[0]) * k,
      a.color[1] + (b.color[1] - a.color[1]) * k,
      a.color[2] + (b.color[2] - a.color[2]) * k,
      a.color[3] + (b.color[3] - a.color[3]) * k,
    ];
  }
  return [...last.color] as [number, number, number, number];
}

export function bakeRamp(stopsIn: readonly GradientStop[], out: Uint8Array, offset: number): void {
  const stops = sortStops(stopsIn);
  for (let i = 0; i < RAMP_WIDTH; i++) {
    const [r, g, b, a] = sampleStops(stops, i / (RAMP_WIDTH - 1));
    const o = offset + i * 4;
    out[o] = Math.round(r * a * 255);
    out[o + 1] = Math.round(g * a * 255);
    out[o + 2] = Math.round(b * a * 255);
    out[o + 3] = Math.round(a * 255);
  }
}
