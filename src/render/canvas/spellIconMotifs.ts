import type { IconRng, SpellIconColors } from './spellIconAnalysis';
import type { ZoneVfxFamily } from '../zoneVfx';

const ICON = 48;
const ALPHA_LO = 0.35;
const ALPHA_HI = 0.5;

function alpha(rng: IconRng): number {
  return ALPHA_LO + rng() * (ALPHA_HI - ALPHA_LO);
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function drawEmber(ctx: CanvasRenderingContext2D, colors: SpellIconColors, rng: IconRng): void {
  for (let i = 0; i < 6; i++) {
    const x = 14 + rng() * 20;
    const y0 = 18 + rng() * 18;
    const h = 6 + rng() * 8;
    ctx.strokeStyle = hexToRgba(i % 2 === 0 ? colors.primary : colors.secondary, alpha(rng));
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x + (rng() - 0.5) * 4, y0 - h);
    ctx.stroke();
  }
}

function drawFrost(ctx: CanvasRenderingContext2D, colors: SpellIconColors, rng: IconRng): void {
  const count = 6;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + rng() * 0.4;
    const radius = 12 + rng() * 6;
    const x = ICON / 2 + Math.cos(angle) * radius;
    const y = ICON / 2 + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.strokeStyle = hexToRgba(colors.primary, alpha(rng));
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(1.6, 3);
    ctx.lineTo(-1.6, 3);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawVoid(ctx: CanvasRenderingContext2D, colors: SpellIconColors, rng: IconRng): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.arc(ICON / 2, ICON / 2, 4, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6 + rng() * 0.3;
    const outer = 14 + rng() * 4;
    ctx.strokeStyle = hexToRgba(colors.primary, alpha(rng));
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(ICON / 2 + Math.cos(angle) * outer, ICON / 2 + Math.sin(angle) * outer);
    ctx.lineTo(ICON / 2 + Math.cos(angle) * 5, ICON / 2 + Math.sin(angle) * 5);
    ctx.stroke();
  }
}

function drawArc(ctx: CanvasRenderingContext2D, colors: SpellIconColors, rng: IconRng): void {
  for (let i = 0; i < 5; i++) {
    const x = 10 + rng() * 28;
    const y = 10 + rng() * 28;
    ctx.strokeStyle = hexToRgba(i % 2 === 0 ? colors.secondary : colors.primary, alpha(rng));
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 4);
    ctx.lineTo(x + 1, y - 4);
    ctx.lineTo(x + 5, y - 9);
    ctx.stroke();
  }
}

function drawBloom(ctx: CanvasRenderingContext2D, colors: SpellIconColors, rng: IconRng): void {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6 + rng() * 0.25;
    const radius = 8 + rng() * 6;
    const x = ICON / 2 + Math.cos(angle) * radius;
    const y = ICON / 2 + Math.sin(angle) * radius;
    ctx.strokeStyle = hexToRgba(colors.secondary, alpha(rng));
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.ellipse(x, y, 3.2, 1.6, angle, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGrit(ctx: CanvasRenderingContext2D, colors: SpellIconColors, rng: IconRng): void {
  for (let i = 0; i < 6; i++) {
    const x = 10 + rng() * 28;
    const y = 10 + rng() * 28;
    const s = 2 + rng() * 2.5;
    ctx.fillStyle = hexToRgba(i % 2 === 0 ? colors.primary : colors.secondary, alpha(rng));
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y + s * 0.6);
    ctx.lineTo(x - s * 0.8, y + s * 0.4);
    ctx.closePath();
    ctx.fill();
  }
}

/** Seeded family texture behind the main mark. No glow, so it stays behind the silhouette. */
export function drawFamilyMotif(
  ctx: CanvasRenderingContext2D,
  family: ZoneVfxFamily,
  colors: SpellIconColors,
  rng: IconRng,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (family) {
    case 'EMBER':
      drawEmber(ctx, colors, rng);
      break;
    case 'FROST':
      drawFrost(ctx, colors, rng);
      break;
    case 'VOID':
      drawVoid(ctx, colors, rng);
      break;
    case 'ARC':
      drawArc(ctx, colors, rng);
      break;
    case 'BLOOM':
      drawBloom(ctx, colors, rng);
      break;
    case 'GRIT':
      drawGrit(ctx, colors, rng);
      break;
  }
  ctx.restore();
}
