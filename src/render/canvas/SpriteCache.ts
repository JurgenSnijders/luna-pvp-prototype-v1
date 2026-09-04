import { getEffectiveDprCap } from '../../devtools/graphicsSettings';

/** Padding around baked sprites so the glow halo is not clipped. */
const GLOW_PAD = 20;
const SPRITE_CACHE_MAX = 300;

export type SpriteKind =
  | 'DISC'
  | 'ORB'
  | 'SHURIKEN'
  | 'BEAM'
  | 'DOT'
  | 'COMBATANT'
  | 'PRISM'
  | 'RUNE_SIGIL'
  | 'VOID_RIFT'
  | 'CRYSTAL_SHARD';

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
    const dpr = Math.round(getEffectiveDprCap() * 100) / 100;
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
    case 'COMBATANT':
      return bakeCombatantGlowSprite(color, radius, dpr);
    case 'PRISM':
      return bakePrismSprite(color, radius, dpr);
    case 'RUNE_SIGIL':
      return bakeRuneSigilSprite(color, radius, dpr);
    case 'VOID_RIFT':
      return bakeVoidRiftSprite(color, radius, dpr);
    case 'CRYSTAL_SHARD':
      return bakeCrystalShardSprite(color, radius, dpr);
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

/**
 * Outer halo drawn beneath the live combatant body. Baked once per
 * colour/radius so the neon look costs no per-frame shadowBlur.
 */
function bakeCombatantGlowSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const glowRadius = radius + 14;
  const size = (glowRadius + GLOW_PAD) * 2;
  const { canvas, bctx } = createSpriteCanvas(size, size, dpr);

  const grad = bctx.createRadialGradient(0, 0, radius * 0.4, 0, 0, glowRadius);
  grad.addColorStop(0, `${color}66`);
  grad.addColorStop(0.55, `${color}33`);
  grad.addColorStop(1, `${color}00`);
  bctx.fillStyle = grad;
  bctx.beginPath();
  bctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
  bctx.fill();

  bctx.strokeStyle = `${color}55`;
  bctx.lineWidth = 2;
  bctx.beginPath();
  bctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
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

/** Elongated crystal prism baked along +X; rotated at draw time. */
function bakePrismSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const halfLen = radius * 1.4;
  const w = radius * 3.5 + GLOW_PAD * 2;
  const h = radius * 2.2 + GLOW_PAD * 2;
  const { canvas, bctx } = createSpriteCanvas(w, h, dpr);

  const facets = [
    { x: halfLen, y: 0 },
    { x: halfLen * 0.35, y: radius * 0.75 },
    { x: -halfLen * 0.35, y: radius * 0.75 },
    { x: -halfLen, y: 0 },
    { x: -halfLen * 0.35, y: -radius * 0.75 },
    { x: halfLen * 0.35, y: -radius * 0.75 },
  ];

  bctx.shadowBlur = 6;
  bctx.shadowColor = color;
  bctx.fillStyle = color;
  bctx.globalAlpha = 0.75;
  bctx.beginPath();
  for (let i = 0; i < facets.length; i++) {
    const p = facets[i];
    if (i === 0) bctx.moveTo(p.x, p.y);
    else bctx.lineTo(p.x, p.y);
  }
  bctx.closePath();
  bctx.fill();

  bctx.globalAlpha = 1;
  bctx.strokeStyle = color;
  bctx.lineWidth = 1.5;
  bctx.beginPath();
  for (let i = 0; i < facets.length; i++) {
    const p = facets[i];
    if (i === 0) bctx.moveTo(p.x, p.y);
    else bctx.lineTo(p.x, p.y);
  }
  bctx.closePath();
  bctx.stroke();

  bctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  bctx.lineWidth = 1;
  bctx.beginPath();
  bctx.moveTo(-halfLen * 0.2, -radius * 0.35);
  bctx.lineTo(halfLen * 0.5, 0);
  bctx.lineTo(-halfLen * 0.2, radius * 0.35);
  bctx.stroke();

  bctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  bctx.beginPath();
  bctx.moveTo(halfLen * 0.15, 0);
  bctx.lineTo(halfLen * 0.55, radius * 0.2);
  bctx.lineTo(halfLen * 0.55, -radius * 0.2);
  bctx.closePath();
  bctx.fill();

  return { canvas, w, h };
}

/** Concentric rune ring with cardinal spokes and diagonal ticks. */
function bakeRuneSigilSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const size = (radius + 4 + GLOW_PAD) * 2;
  const { canvas, bctx } = createSpriteCanvas(size, size, dpr);

  bctx.shadowBlur = 8;
  bctx.shadowColor = color;
  bctx.strokeStyle = color;
  bctx.lineWidth = 1.5;
  bctx.beginPath();
  bctx.arc(0, 0, radius, 0, Math.PI * 2);
  bctx.stroke();
  bctx.beginPath();
  bctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
  bctx.stroke();

  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    bctx.beginPath();
    bctx.moveTo(Math.cos(a) * radius * 0.3, Math.sin(a) * radius * 0.3);
    bctx.lineTo(Math.cos(a) * radius * 0.9, Math.sin(a) * radius * 0.9);
    bctx.stroke();
  }

  bctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (Math.PI / 2) * i;
    const cx = Math.cos(a) * radius * 0.72;
    const cy = Math.sin(a) * radius * 0.72;
    const tx = Math.cos(a + Math.PI / 2) * radius * 0.12;
    const ty = Math.sin(a + Math.PI / 2) * radius * 0.12;
    bctx.beginPath();
    bctx.moveTo(cx - tx, cy - ty);
    bctx.lineTo(cx + tx, cy + ty);
    bctx.stroke();
  }

  bctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  bctx.beginPath();
  bctx.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
  bctx.fill();

  return { canvas, w: size, h: size };
}

/** Dark void spindle with event-horizon rim and barb notches. */
function bakeVoidRiftSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const halfLen = radius * 1.6;
  const w = radius * 4 + GLOW_PAD * 2;
  const h = radius * 2 + GLOW_PAD * 2;
  const { canvas, bctx } = createSpriteCanvas(w, h, dpr);

  bctx.shadowBlur = 10;
  bctx.shadowColor = color;
  bctx.strokeStyle = color;
  bctx.lineWidth = 2;
  bctx.beginPath();
  bctx.ellipse(0, 0, halfLen, radius * 0.35, 0, 0, Math.PI * 2);
  bctx.stroke();

  bctx.shadowBlur = 0;
  bctx.fillStyle = '#04020a';
  bctx.beginPath();
  bctx.ellipse(0, 0, halfLen * 0.75, radius * 0.22, 0, 0, Math.PI * 2);
  bctx.fill();

  bctx.strokeStyle = '#00e5ff';
  bctx.lineWidth = 1;
  for (const sx of [-halfLen * 0.5, halfLen * 0.5]) {
    bctx.beginPath();
    bctx.moveTo(sx - radius * 0.15, -radius * 0.08);
    bctx.lineTo(sx + radius * 0.15, 0);
    bctx.lineTo(sx - radius * 0.15, radius * 0.08);
    bctx.stroke();
  }

  bctx.strokeStyle = color;
  bctx.globalAlpha = 0.6;
  bctx.lineWidth = 1;
  bctx.beginPath();
  bctx.ellipse(0, 0, halfLen * 0.9, radius * 0.42, 0, 0, Math.PI * 2);
  bctx.stroke();
  bctx.globalAlpha = 1;

  return { canvas, w, h };
}

/** Asymmetric faceted shard with acute forward point along +X. */
function bakeCrystalShardSprite(color: string, radius: number, dpr: number): SpriteEntry {
  const w = radius * 3.5 + GLOW_PAD * 2;
  const h = radius * 2.2 + GLOW_PAD * 2;
  const { canvas, bctx } = createSpriteCanvas(w, h, dpr);
  const tip = radius * 1.5;
  const back = -radius * 0.9;
  const top = -radius * 0.55;
  const bot = radius * 0.7;

  bctx.shadowBlur = 8;
  bctx.shadowColor = color;
  bctx.fillStyle = color;
  bctx.globalAlpha = 0.8;
  bctx.beginPath();
  bctx.moveTo(tip, 0);
  bctx.lineTo(back, top);
  bctx.lineTo(back * 0.6, 0);
  bctx.lineTo(back, bot);
  bctx.closePath();
  bctx.fill();

  bctx.globalAlpha = 1;
  bctx.strokeStyle = color;
  bctx.lineWidth = 1.5;
  bctx.beginPath();
  bctx.moveTo(tip, 0);
  bctx.lineTo(back, top);
  bctx.lineTo(back * 0.6, 0);
  bctx.lineTo(back, bot);
  bctx.closePath();
  bctx.stroke();

  bctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  bctx.lineWidth = 1;
  bctx.beginPath();
  bctx.moveTo(tip * 0.2, 0);
  bctx.lineTo(back * 0.5, top * 0.5);
  bctx.stroke();
  bctx.beginPath();
  bctx.moveTo(tip * 0.15, 0);
  bctx.lineTo(back * 0.45, bot * 0.45);
  bctx.stroke();

  return { canvas, w, h };
}
