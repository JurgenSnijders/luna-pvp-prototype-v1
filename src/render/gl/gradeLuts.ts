export const LUT_SIZE = 16;

type Rgb = [number, number, number];

function luma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function buildLut(transform: (r: number, g: number, b: number) => Rgb): Uint8Array {
  const data = new Uint8Array(LUT_SIZE * LUT_SIZE * LUT_SIZE * 4);
  let i = 0;
  for (let b = 0; b < LUT_SIZE; b++) {
    for (let g = 0; g < LUT_SIZE; g++) {
      for (let r = 0; r < LUT_SIZE; r++) {
        const tr = r / (LUT_SIZE - 1);
        const tg = g / (LUT_SIZE - 1);
        const tb = b / (LUT_SIZE - 1);
        const [outR, outG, outB] = transform(tr, tg, tb);
        data[i++] = Math.round(clamp01(outR) * 255);
        data[i++] = Math.round(clamp01(outG) * 255);
        data[i++] = Math.round(clamp01(outB) * 255);
        data[i++] = 255;
      }
    }
  }
  return data;
}

function neutral(r: number, g: number, b: number): Rgb {
  return [r, g, b];
}

function cool(r: number, g: number, b: number): Rgb {
  const lum = luma(r, g, b);
  const outR = r * 0.92;
  const outG = g + (0.06 - lum * 0.04) * (1 - lum);
  const outB = b * 1.08 + 0.04 * (1 - lum);
  return [outR, outG, outB];
}

function warm(r: number, g: number, b: number): Rgb {
  const lum = luma(r, g, b);
  const outR = r * 1.06 + 0.03 * (1 - lum);
  const outG = g * 1.02 + 0.02 * (1 - lum);
  const outB = b * 0.9;
  return [outR, outG, outB];
}

function neonPunch(r: number, g: number, b: number): Rgb {
  const curve = (t: number) => {
    const s = smoothstep(0.15, 0.95, t);
    return t * 0.35 + s * 0.65;
  };
  let outR = curve(r);
  let outG = curve(g);
  let outB = curve(b);
  const lum = luma(outR, outG, outB);
  if (lum > 0.4) {
    const boost = 1.25;
    outR = lum + (outR - lum) * boost;
    outG = lum + (outG - lum) * boost;
    outB = lum + (outB - lum) * boost;
  }
  return [outR, outG, outB];
}

export const GRADE_LUTS: { label: string; data: Uint8Array }[] = [
  { label: 'Neutral', data: buildLut(neutral) },
  { label: 'Cool', data: buildLut(cool) },
  { label: 'Warm', data: buildLut(warm) },
  { label: 'Neon Punch', data: buildLut(neonPunch) },
];

export function getLutData(id: number): Uint8Array {
  return GRADE_LUTS[id]?.data ?? GRADE_LUTS[0].data;
}
