import {
  getEffectiveDprCap,
  getEffectiveTier,
} from '../../devtools/graphicsSettings';
import type { AbilitySchema, ProjectileStyle } from '../../types/schema';
import { getIconRenderStyle, type IconRenderStyle } from '../gl/retroVfxConfig';
import { resolveIconTrajectoryPaths } from './trajectoryTracer';
import { analyzeSpellIcon, createIconRng } from './spellIconAnalysis';
import { drawCornerHint, drawPayloadGlyph, drawPrimaryMark } from './spellIconMarks';
import { drawFamilyMotif } from './spellIconMotifs';

export { getArchetypeColor } from './archetypeColors';

const LOGICAL_SIZE = 48;

interface IconRasterContext {
  dpr: number;
  cheapGlow: boolean;
  snapPx: (val: number) => number;
}

interface IconNetworkDrawResult {
  drew: boolean;
}

function createIconRasterContext(): IconRasterContext {
  const dpr = Math.max(1, Math.round(getEffectiveDprCap()));
  const cheapGlow = getEffectiveTier() === 'LOW' || dpr <= 1;
  return {
    dpr,
    cheapGlow,
    snapPx: (val) => Math.round(val * dpr) / dpr,
  };
}

let activeRaster = createIconRasterContext();

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawPathChevrons(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
): void {
  if (points.length < 2) return;

  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < LOGICAL_SIZE * 0.25) return;

  const angle = Math.atan2(dy, dx);
  const ux = dx / length;
  const uy = dy / length;
  const chevronSpacing = LOGICAL_SIZE * 0.2;
  const chevronSize = LOGICAL_SIZE * 0.08;
  const startDist = LOGICAL_SIZE * 0.15;
  const endMargin = LOGICAL_SIZE * 0.12;

  ctx.save();
  ctx.lineWidth = 1.5;
  for (let dist = startDist; dist < length - endMargin; dist += chevronSpacing) {
    const t = (dist - startDist) / Math.max(1, length - startDist - endMargin);
    const cx = activeRaster.snapPx(start.x + ux * dist);
    const cy = activeRaster.snapPx(start.y + uy * dist);
    ctx.strokeStyle = hexToRgba(color, 0.3 + t * 0.55);
    ctx.beginPath();
    ctx.moveTo(
      cx - Math.cos(angle) * chevronSize * 0.3 - Math.sin(angle) * chevronSize * 0.5,
      cy - Math.sin(angle) * chevronSize * 0.3 + Math.cos(angle) * chevronSize * 0.5,
    );
    ctx.lineTo(cx, cy);
    ctx.lineTo(
      cx - Math.cos(angle) * chevronSize * 0.3 + Math.sin(angle) * chevronSize * 0.5,
      cy - Math.sin(angle) * chevronSize * 0.3 - Math.cos(angle) * chevronSize * 0.5,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawIconTrajectoryNetwork(
  ctx: CanvasRenderingContext2D,
  ability: AbilitySchema,
  archetypeColor: string,
  payloadStyle: ProjectileStyle,
): IconNetworkDrawResult {
  const result = resolveIconTrajectoryPaths(ability, LOGICAL_SIZE, 8);
  if (result.paths.length === 0) return { drew: false };

  const markerSize = LOGICAL_SIZE * 0.16;
  const originRadius = Math.max(2, LOGICAL_SIZE * 0.04);
  const lineWidth = Math.max(1.5, LOGICAL_SIZE * 0.035);

  ctx.fillStyle = hexToRgba(archetypeColor, 0.6);
  ctx.beginPath();
  ctx.arc(
    activeRaster.snapPx(result.origin.x),
    activeRaster.snapPx(result.origin.y),
    originRadius,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  for (const path of result.paths) {
    if (path.points.length < 2) continue;
    const start = path.points[0];
    const end = path.points[path.points.length - 1];
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, hexToRgba(archetypeColor, 0.15));
    gradient.addColorStop(0.7, hexToRgba(archetypeColor, 0.7));
    gradient.addColorStop(1, hexToRgba(archetypeColor, 1));

    ctx.strokeStyle = gradient;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = archetypeColor;
    ctx.shadowBlur = activeRaster.cheapGlow ? 0 : 4;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    if (path.isClosed) ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (result.trajectoryType === 'LINEAR') {
      drawPathChevrons(ctx, path.points, archetypeColor);
    }
  }

  for (const endpoint of result.endpoints) {
    drawPayloadGlyph(ctx, endpoint.x, endpoint.y, payloadStyle, archetypeColor, markerSize, true);
  }

  return { drew: true };
}

function drawSemanticGlyph(ctx: CanvasRenderingContext2D, ability: AbilitySchema): void {
  const spec = analyzeSpellIcon(ability);
  const rng = createIconRng(spec.seed);
  drawFamilyMotif(ctx, spec.family, spec.colors, rng);
  drawPrimaryMark(ctx, spec, rng);
  drawCornerHint(ctx, spec);
}

function drawSimulationTrace(ctx: CanvasRenderingContext2D, ability: AbilitySchema): void {
  const spec = analyzeSpellIcon(ability);
  const network = drawIconTrajectoryNetwork(ctx, ability, spec.colors.primary, spec.style);
  if (!network.drew) {
    drawPrimaryMark(ctx, spec, createIconRng(spec.seed));
  }
}

export function generateSpellIcon(
  ability: AbilitySchema,
  sizePx = 48,
  forcedStyle?: IconRenderStyle,
): HTMLCanvasElement {
  activeRaster = createIconRasterContext();
  const dpr = activeRaster.dpr;

  const canvas = document.createElement('canvas');
  canvas.width = sizePx * dpr;
  canvas.height = sizePx * dpr;
  canvas.style.width = `${sizePx}px`;
  canvas.style.height = `${sizePx}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;
  const scale = sizePx / LOGICAL_SIZE;
  ctx.scale(dpr * scale, dpr * scale);

  const style = forcedStyle ?? getIconRenderStyle();
  if (style === 'SIMULATION_TRACE') {
    drawSimulationTrace(ctx, ability);
  } else {
    drawSemanticGlyph(ctx, ability);
  }

  return canvas;
}
