export const ATLAS_SIZE = 2048;
export const ATLAS_MAX_PAGES = 4;
const GUTTER = 1;

export interface AtlasEntry {
  page: number;
  /** Texel rect inside the page, excluding the gutter. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Normalised UVs (v grows downward, matching canvas rows). */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface AtlasUpload {
  entry: AtlasEntry;
  source: TexImageSource;
}

interface Shelf {
  y: number;
  h: number;
  x: number;
}

interface Page {
  shelves: Shelf[];
  nextY: number;
}

/**
 * Shelf-packed sprite pages. Entries are keyed by the source object itself
 * (a WeakMap), so two sprites of equal size but different colour can never
 * share a slot. When every page is full the atlas resets at the next frame
 * boundary, the same policy as SpriteCache's 300-entry clear.
 */
export class SpriteAtlas {
  private entries = new WeakMap<object, AtlasEntry>();
  private pages: Page[] = [];
  private pending: AtlasUpload[] = [];
  private resetRequested = false;
  private liveCount = 0;
  private generation = 0;

  constructor(readonly size = ATLAS_SIZE, readonly maxPages = ATLAS_MAX_PAGES) {}

  get pageCount(): number {
    return this.pages.length;
  }

  get spriteCount(): number {
    return this.liveCount;
  }

  /** Bumps when pages are discarded so the GL side can drop stale textures. */
  get resetGeneration(): number {
    return this.generation;
  }

  beginFrame(): void {
    if (!this.resetRequested) return;
    this.reset();
  }

  reset(): void {
    this.entries = new WeakMap();
    this.pages = [];
    this.pending = [];
    this.liveCount = 0;
    this.resetRequested = false;
    this.generation++;
  }

  /** Returns the slot for `source`, packing and queueing an upload on first use. */
  lookup(source: object, width: number, height: number): AtlasEntry | null {
    const hit = this.entries.get(source);
    if (hit) return hit;
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    if (w <= 0 || h <= 0 || w + GUTTER * 2 > this.size || h + GUTTER * 2 > this.size) return null;
    const slot = this.allocate(w + GUTTER * 2, h + GUTTER * 2);
    if (!slot) {
      this.resetRequested = true;
      return null;
    }
    const x = slot.x + GUTTER;
    const y = slot.y + GUTTER;
    const entry: AtlasEntry = {
      page: slot.page,
      x,
      y,
      w,
      h,
      u0: x / this.size,
      v0: y / this.size,
      u1: (x + w) / this.size,
      v1: (y + h) / this.size,
    };
    this.entries.set(source, entry);
    this.pending.push({ entry, source: source as TexImageSource });
    this.liveCount++;
    return entry;
  }

  drainUploads(): AtlasUpload[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  private allocate(w: number, h: number): { page: number; x: number; y: number } | null {
    for (let p = 0; p < this.pages.length; p++) {
      const hit = this.allocateInPage(this.pages[p], w, h);
      if (hit) return { page: p, ...hit };
    }
    if (this.pages.length >= this.maxPages) return null;
    this.pages.push({ shelves: [], nextY: 0 });
    const p = this.pages.length - 1;
    const hit = this.allocateInPage(this.pages[p], w, h);
    return hit ? { page: p, ...hit } : null;
  }

  private allocateInPage(page: Page, w: number, h: number): { x: number; y: number } | null {
    let best: Shelf | null = null;
    for (const shelf of page.shelves) {
      if (shelf.h < h || shelf.x + w > this.size) continue;
      if (!best || shelf.h < best.h) best = shelf;
    }
    if (best && best.h <= h * 1.5) {
      const x = best.x;
      best.x += w;
      return { x, y: best.y };
    }
    if (page.nextY + h > this.size) {
      if (best) {
        const x = best.x;
        best.x += w;
        return { x, y: best.y };
      }
      return null;
    }
    const shelf: Shelf = { y: page.nextY, h, x: w };
    page.shelves.push(shelf);
    page.nextY += h;
    return { x: 0, y: shelf.y };
  }
}
