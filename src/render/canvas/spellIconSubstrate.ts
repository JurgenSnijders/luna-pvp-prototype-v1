import type { SpellIconSpec } from './spellIconAnalysis';

const ICON = 48;
const CX = 24;
const CY = 24;
const SQRT3 = Math.sqrt(3);

function drawMicroReticle(ctx: CanvasRenderingContext2D, x: number, y: number, arm: number): void {
  ctx.beginPath();
  ctx.moveTo(x - arm, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x, y + arm);
  ctx.stroke();
}

function drawBallisticGrid(ctx: CanvasRenderingContext2D): void {
  const gridStep = 5;
  const tickHalf = 0.75;

  ctx.globalAlpha = 0.05;
  for (let pos = gridStep; pos < ICON; pos += gridStep) {
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, ICON);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(ICON, pos);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.1;
  for (let x = 10; x <= 40; x += 10) {
    for (let y = 10; y <= 40; y += 10) {
      drawMicroReticle(ctx, x, y, 2);
    }
  }

  ctx.globalAlpha = 0.07;
  for (let pos = gridStep; pos < ICON; pos += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, pos - tickHalf);
    ctx.lineTo(0, pos + tickHalf);
    ctx.moveTo(pos - tickHalf, ICON);
    ctx.lineTo(pos + tickHalf, ICON);
    ctx.stroke();
  }
}

function drawPolarSonar(ctx: CanvasRenderingContext2D): void {
  const solidRadii = [8, 16, 24];
  const dashedRadii = [4, 12, 20];
  const spokeInner = 6;
  const spokeOuter = 24;

  ctx.globalAlpha = 0.07;
  for (const r of solidRadii) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.setLineDash([1.5, 2.5]);
  ctx.globalAlpha = 0.05;
  for (const r of dashedRadii) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (Math.PI / 2) * i;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(CX + cos * spokeInner, CY + sin * spokeInner);
    ctx.lineTo(CX + cos * spokeOuter, CY + sin * spokeOuter);
    ctx.stroke();
  }
}

function drawIsothermContours(ctx: CanvasRenderingContext2D): void {
  let index = 0;
  for (let offset = 4; offset <= 44; offset += 4) {
    ctx.globalAlpha = index % 3 === 2 ? 0.1 : 0.07;
    ctx.beginPath();
    for (let x = 0; x <= ICON; x += 2) {
      const y = offset + Math.sin((x + offset) * 0.18) * 2.5;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    index++;
  }
}

function drawCircuitTrace(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function drawCircuitVia(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawCircuitBus(ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 0.04;
  for (let y = 1.5; y < ICON; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ICON, y);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.09;
  const traces: { x: number; y: number }[][] = [
    [{ x: 0, y: 8 }, { x: 14, y: 8 }, { x: 20, y: 14 }, { x: 36, y: 14 }],
    [{ x: 0, y: 40 }, { x: 12, y: 40 }, { x: 18, y: 34 }, { x: 32, y: 34 }],
    [{ x: 6, y: 22 }, { x: 18, y: 22 }, { x: 24, y: 16 }, { x: 48, y: 16 }],
    [{ x: 4, y: 30 }, { x: 16, y: 30 }, { x: 22, y: 36 }, { x: 44, y: 36 }],
    [{ x: 38, y: 6 }, { x: 38, y: 18 }, { x: 44, y: 24 }, { x: 44, y: 42 }],
  ];

  for (const trace of traces) {
    drawCircuitTrace(ctx, trace);
  }

  drawCircuitVia(ctx, 20, 14);
  drawCircuitVia(ctx, 18, 34);
  drawCircuitVia(ctx, 24, 16);
}

function strokeHexagon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function hexIntersectsCanvas(cx: number, cy: number, radius: number): boolean {
  return (
    cx + radius >= 0 &&
    cx - radius <= ICON &&
    cy + radius >= 0 &&
    cy - radius <= ICON
  );
}

function drawHexMatrix(ctx: CanvasRenderingContext2D): void {
  const R = 4.5;
  const colMin = -2;
  const colMax = Math.ceil(ICON / (R * SQRT3)) + 2;
  const rowMin = -2;
  const rowMax = Math.ceil(ICON / (R * 1.5)) + 2;

  ctx.globalAlpha = 0.06;
  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const cx = R * SQRT3 * (col + 0.5 * (row & 1));
      const cy = R * 1.5 * row;
      if (!hexIntersectsCanvas(cx, cy, R)) continue;

      strokeHexagon(ctx, cx, cy, R);

      if ((col + row) % 2 === 0) {
        ctx.globalAlpha = 0.09;
        ctx.beginPath();
        ctx.arc(cx, cy, 0.375, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.06;
      }
    }
  }
}

export function drawTacticalSubstrate(
  ctx: CanvasRenderingContext2D,
  analysis: SpellIconSpec,
  color: string,
  dpr: number,
): void {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1 / dpr;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  switch (analysis.patternFamily) {
    case 'BALLISTIC_GRID':
      drawBallisticGrid(ctx);
      break;
    case 'POLAR_SONAR':
      drawPolarSonar(ctx);
      break;
    case 'ISOTHERM_CONTOURS':
      drawIsothermContours(ctx);
      break;
    case 'CIRCUIT_BUS':
      drawCircuitBus(ctx);
      break;
    case 'HEX_MATRIX':
      drawHexMatrix(ctx);
      break;
  }

  ctx.setLineDash([]);
  ctx.restore();
}
