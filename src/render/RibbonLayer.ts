import { getTierLimits } from '../devtools/graphicsSettings';

const MAX_POINTS = 48;
const DEDUPE_DIST_SQ = 1.5 * 1.5;

export interface RibbonPoint {
  x: number;
  y: number;
  born: number;
}

export interface Ribbon {
  id: string;
  r: number;
  g: number;
  b: number;
  width: number;
  intensity: number;
  lifetimeSec: number;
  points: RibbonPoint[];
}

export class RibbonLayer {
  private ribbons = new Map<string, Ribbon>();

  /**
   * @returns false when a new ribbon cannot be added because the tier cap is full.
   * Existing ribbons still accept points.
   */
  push(
    id: string,
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    width: number,
    intensity: number,
    now: number,
    lifetimeSec: number,
  ): boolean {
    let ribbon = this.ribbons.get(id);
    if (!ribbon) {
      if (this.ribbons.size >= getTierLimits().maxRibbons) return false;
      ribbon = {
        id,
        r,
        g,
        b,
        width,
        intensity,
        lifetimeSec,
        points: [],
      };
      this.ribbons.set(id, ribbon);
    }
    ribbon.r = r;
    ribbon.g = g;
    ribbon.b = b;
    ribbon.width = width;
    ribbon.intensity = intensity;
    ribbon.lifetimeSec = Math.max(0.05, lifetimeSec);

    const points = ribbon.points;
    const last = points[points.length - 1];
    if (last) {
      const dx = last.x - x;
      const dy = last.y - y;
      if (dx * dx + dy * dy < DEDUPE_DIST_SQ) {
        last.x = x;
        last.y = y;
        last.born = now;
        return true;
      }
    }
    points.push({ x, y, born: now });
    if (points.length > MAX_POINTS) points.shift();
    return true;
  }

  update(now: number): void {
    for (const [id, ribbon] of this.ribbons) {
      const life = ribbon.lifetimeSec;
      let write = 0;
      const points = ribbon.points;
      for (let i = 0; i < points.length; i++) {
        if (now - points[i].born < life) points[write++] = points[i];
      }
      points.length = write;
      if (points.length === 0) this.ribbons.delete(id);
    }
  }

  getActive(): Ribbon[] {
    return [...this.ribbons.values()];
  }

  getCount(): number {
    return this.ribbons.size;
  }

  clear(): void {
    this.ribbons.clear();
  }
}
