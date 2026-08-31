/** Padding around baked sprites so the glow halo is not clipped. */
const GLOW_PAD = 20;
const SPRITE_CACHE_MAX = 300;

export type SpriteKind = 'DISC' | 'ORB' | 'SHURIKEN' | 'BEAM' | 'DOT';

export interface SpriteEntry {
  canvas: HTMLCanvasElement;
  /** Destination size in CSS pixels (canvas backing store may be scaled by DPR). */
  w: number;
  h: number;
}

export function buildSpriteCacheKey(
  kind: SpriteKind,
  color: string,
  radius: number,
  dpr: number,
): string {
  const r = Math.max(1, Math.round(radius));
  return `${kind}|${color}|${r}|${dpr}`;
}

export class SpriteCache {
  private cache = new Map<string, SpriteEntry>();

  getSprite(kind: SpriteKind, color: string, radius: number): SpriteEntry {
    const r = Math.max(1, Math.round(radius));
    const dpr = window.devicePixelRatio || 1;
    const key = buildSpriteCacheKey(kind, color, r, dpr);

    let entry = this.cache.get(key);
    if (!entry) {
      if (this.cache.size >= SPRITE_CACHE_MAX) {
        this.cache.clear();
      }
      entry = bakeSprite(kind, color, r, dpr);
      this.cache.set(key, entry);
    }
    return entry;
  }
}

function createSpriteCanvas(
  w: number,
  h: number,
  dpr: number,
): { canvas: HTMLCanvasElement; bctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * dpr));
  canvas.height = Math.max(1, Math.ceil(h * dpr));
  const bctx = canvas.getContext('2d')!;
  bctx.scale(dpr, dpr);
  bctx.translate(w / 2, h / 2);
  return { canvas, bctx };
}

function bakeSprite(
  kind: SpriteKind,
  color: string,
  radius: number,
  dpr: number,
): SpriteEntry {
  switch (kind) {
    case 'BEAM':
      return bakeBeamSprite(color, radius, dpr);
    case 'ORB':
      return bakeOrbSprite(color, radius, dpr);
    case 'SHURIKEN':
      return bakeShurikenSprite(color, radius, dpr);
    case 'DOT':
      return bakeDotSprite(color, radius, dpr);
    case 'DISC':
    default:
      return bakeDiscSprite(color, radius, dpr);
  }
}

function bakeDiscSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const size = (radius + 4 + GLOW_PAD) * 2;
  const { canvas, bctx } = createSpriteCanvas(size, size, dpr);

  bctx.shadowBlur = 12;
  bctx.shadowColor = color;
  bctx.fillStyle = color;
  bctx.beginPath();
  bctx.arc(0, 0, radius, 0, Math.PI * 2);
  bctx.fill();
  bctx.fillStyle = '#ffffff';
  bctx.globalAlpha = 0.85;
  bctx.beginPath();
  bctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
  bctx.fill();
  bctx.globalAlpha = 1;
  bctx.strokeStyle = color;
  bctx.lineWidth = 1.5;
  bctx.beginPath();
  bctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
  bctx.stroke();

  return { canvas, w: size, h: size };
}

function bakeOrbSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const size = (radius + 6 + GLOW_PAD) * 2;
  const { canvas, bctx } = createSpriteCanvas(size, size, dpr);

  bctx.shadowBlur = 12;
  bctx.shadowColor = color;
  bctx.fillStyle = color;
  bctx.globalAlpha = 0.35;
  bctx.beginPath();
  bctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
  bctx.fill();
  bctx.globalAlpha = 0.55;
  bctx.beginPath();
  bctx.arc(0, 0, radius, 0, Math.PI * 2);
  bctx.fill();
  bctx.globalAlpha = 1;
  bctx.beginPath();
  bctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
  bctx.fill();
  bctx.fillStyle = '#ffffff';
  bctx.globalAlpha = 0.7;
  bctx.beginPath();
  bctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  bctx.fill();
  bctx.globalAlpha = 1;
  bctx.strokeStyle = color;
  bctx.lineWidth = 2;
  bctx.beginPath();
  bctx.arc(0, 0, radius, 0, Math.PI * 2);
  bctx.stroke();

  return { canvas, w: size, h: size };
}

/** Beam capsule baked along the +X axis; rotated to the velocity at draw time. */
function bakeBeamSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const halfLen = (radius * 3) / 2;
  const w = radius * 4 + GLOW_PAD * 2;
  const h = radius + GLOW_PAD * 2;
  const { canvas, bctx } = createSpriteCanvas(w, h, dpr);

  bctx.lineCap = 'round';
  bctx.shadowBlur = 12;
  bctx.shadowColor = color;
  bctx.strokeStyle = color;
  bctx.lineWidth = radius;
  bctx.beginPath();
  bctx.moveTo(-halfLen, 0);
  bctx.lineTo(halfLen, 0);
  bctx.stroke();

  bctx.shadowBlur = 6;
  bctx.strokeStyle = '#ffffff';
  bctx.lineWidth = Math.max(1.5, radius * 0.35);
  bctx.beginPath();
  bctx.moveTo(-halfLen, 0);
  bctx.lineTo(halfLen, 0);
  bctx.stroke();

  return { canvas, w, h };
}

/** Star baked unrotated; spun at draw time. */
function bakeShurikenSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const size = (radius + 2 + GLOW_PAD) * 2;
  const { canvas, bctx } = createSpriteCanvas(size, size, dpr);
  const points = 4;
  const inner = radius * 0.35;

  bctx.shadowBlur = 12;
  bctx.shadowColor = color;
  bctx.fillStyle = color;
  bctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? radius : inner;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) bctx.moveTo(x, y);
    else bctx.lineTo(x, y);
  }
  bctx.closePath();
  bctx.fill();
  bctx.fillStyle = '#ffffff';
  bctx.globalAlpha = 0.8;
  bctx.beginPath();
  bctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
  bctx.fill();
  bctx.globalAlpha = 1;
  bctx.strokeStyle = color;
  bctx.lineWidth = 1.5;
  bctx.beginPath();
  bctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
  bctx.stroke();

  return { canvas, w: size, h: size };
}

/** Small glow dot used as the lightning head. */
function bakeDotSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const size = (radius + GLOW_PAD) * 2;
  const { canvas, bctx } = createSpriteCanvas(size, size, dpr);

  bctx.shadowBlur = 12;
  bctx.shadowColor = color;
  bctx.fillStyle = color;
  bctx.beginPath();
  bctx.arc(0, 0, radius, 0, Math.PI * 2);
  bctx.fill();

  return { canvas, w: size, h: size };
}
