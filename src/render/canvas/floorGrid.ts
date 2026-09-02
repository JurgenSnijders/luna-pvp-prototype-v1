import { getGraphicsSettings } from '../../devtools/graphicsSettings';
import { Vector2D } from '../../math/Vector2D';

export interface FloorRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  intensity: number;
  color: string;
  createdAt: number;
}

const MAX_RIPPLES = 8;
const GRID_SPACING = 48;
const SQRT3 = Math.sqrt(3);
const COS60 = 0.5;
const SIN60 = SQRT3 * 0.5;

function wavefrontBoost(
  x: number,
  y: number,
  ripples: FloorRipple[],
): number {
  let boost = 0;
  for (const ripple of ripples) {
    const dist = Math.hypot(x - ripple.x, y - ripple.y);
    const band = Math.abs(dist - ripple.radius);
    if (band >= 14) continue;
    const p = ripple.radius / ripple.maxRadius;
    boost = Math.max(boost, (1 - p) * ripple.intensity * 0.4 * (1 - band / 14));
  }
  return boost;
}

class FloorGridManager {
  private ripples: FloorRipple[] = [];

  addRipple(
    x: number,
    y: number,
    maxRadius = 240,
    intensity = 1.0,
    color = '#00e5ff',
  ): void {
    if (!getGraphicsSettings().floorSubGrid) return;

    if (this.ripples.length >= MAX_RIPPLES) {
      this.ripples.shift();
    }
    this.ripples.push({
      x,
      y,
      radius: 10,
      maxRadius,
      speed: 650,
      intensity,
      color,
      createdAt: performance.now(),
    });
  }

  update(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.radius += r.speed * dt;
      if (r.radius >= r.maxRadius) {
        this.ripples.splice(i, 1);
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    hexCenter: Vector2D,
    hexRadius: number,
    themeColor = '#00e5ff',
  ): void {
    if (!getGraphicsSettings().floorSubGrid) return;

    const minX = hexCenter.x - hexRadius;
    const maxX = hexCenter.x + hexRadius;
    const minY = hexCenter.y - hexRadius;
    const maxY = hexCenter.y + hexRadius;
    const span = hexRadius * 2.5;

    const startCol = Math.floor((minX - hexCenter.x) / GRID_SPACING) - 1;
    const endCol = Math.ceil((maxX - hexCenter.x) / GRID_SPACING) + 1;
    const startRow = Math.floor((minY - hexCenter.y) / GRID_SPACING) - 2;
    const endRow = Math.ceil((maxY - hexCenter.y) / GRID_SPACING) + 2;

    ctx.lineWidth = 1;

    for (let col = startCol; col <= endCol; col++) {
      const x = hexCenter.x + col * GRID_SPACING;
      const boost = wavefrontBoost(x, hexCenter.y, this.ripples);
      ctx.strokeStyle = `rgba(0, 229, 255, ${0.06 + boost})`;
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
      ctx.stroke();
    }

    const diagFamilies = [
      { nx: -SIN60, ny: COS60 },
      { nx: SIN60, ny: COS60 },
    ];

    for (const { nx, ny } of diagFamilies) {
      const startN = Math.floor((minX * nx + minY * ny - (hexCenter.x * nx + hexCenter.y * ny)) / GRID_SPACING) - 2;
      const endN = Math.ceil((maxX * nx + maxY * ny - (hexCenter.x * nx + hexCenter.y * ny)) / GRID_SPACING) + 2;
      const dx = COS60;
      const dy = SIN60 * Math.sign(nx);

      for (let n = startN; n <= endN; n++) {
        const offset = n * GRID_SPACING;
        const ox = hexCenter.x + nx * offset;
        const oy = hexCenter.y + ny * offset;
        const midBoost = wavefrontBoost(ox, oy, this.ripples);
        ctx.strokeStyle = `rgba(0, 229, 255, ${0.06 + midBoost})`;
        ctx.beginPath();
        ctx.moveTo(ox - dx * span, oy - dy * span);
        ctx.lineTo(ox + dx * span, oy + dy * span);
        ctx.stroke();
      }
    }

    for (let col = startCol; col <= endCol; col++) {
      const x = hexCenter.x + col * GRID_SPACING;
      for (let row = startRow; row <= endRow; row++) {
        const yPlus = hexCenter.y + GRID_SPACING * (2 * row + col * SQRT3);
        if (x >= minX && x <= maxX && yPlus >= minY && yPlus <= maxY) {
          const boost = wavefrontBoost(x, yPlus, this.ripples);
          ctx.fillStyle = `rgba(0, 229, 255, ${0.12 + boost})`;
          ctx.fillRect(x - 0.75, yPlus - 0.75, 1.5, 1.5);
        }
        const yMinus = hexCenter.y + GRID_SPACING * (2 * row - col * SQRT3);
        if (x >= minX && x <= maxX && yMinus >= minY && yMinus <= maxY) {
          const boost = wavefrontBoost(x, yMinus, this.ripples);
          ctx.fillStyle = `rgba(0, 229, 255, ${0.12 + boost})`;
          ctx.fillRect(x - 0.75, yMinus - 0.75, 1.5, 1.5);
        }
      }
    }

    for (const r of this.ripples) {
      const p = r.radius / r.maxRadius;
      const alpha = (1 - p) * r.intensity;

      ctx.save();
      ctx.strokeStyle = r.color || themeColor;
      ctx.lineWidth = 3 * (1 - p * 0.5);
      ctx.globalAlpha = Math.max(0, alpha * 0.6);
      ctx.shadowColor = r.color || themeColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();

      if (r.radius > 30) {
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = Math.max(0, alpha * 0.3);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius - 24, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export const floorGridManager = new FloorGridManager();
