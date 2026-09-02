export const MAX_PALETTE_SIZE = 16;

export interface RetroPalette {
  label: string;
  colors: [number, number, number][];
}

function hex(rgb: string): [number, number, number] {
  const n = parseInt(rgb.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const RETRO_PALETTES: RetroPalette[] = [
  {
    label: 'Game Boy',
    colors: [hex('#0f380f'), hex('#306230'), hex('#8bac0f'), hex('#9bbc0f')],
  },
  {
    label: 'Greyscale',
    colors: [hex('#0a0a0a'), hex('#555555'), hex('#aaaaaa'), hex('#f0f0f0')],
  },
  {
    label: 'CGA',
    colors: [hex('#000000'), hex('#00aaaa'), hex('#aa00aa'), hex('#ffffff')],
  },
  {
    label: 'NES',
    colors: [
      hex('#000000'),
      hex('#383838'),
      hex('#8c8c8c'),
      hex('#fcfcfc'),
      hex('#f83800'),
      hex('#e45c10'),
      hex('#f8b800'),
      hex('#fcd8a8'),
      hex('#00a800'),
      hex('#58f898'),
      hex('#004058'),
      hex('#00e8d8'),
      hex('#0058f8'),
      hex('#6888fc'),
      hex('#6844fc'),
      hex('#d800cc'),
    ],
  },
];

export function packPaletteUniform(paletteId: number): Float32Array {
  const palette = RETRO_PALETTES[paletteId] ?? RETRO_PALETTES[0];
  const out = new Float32Array(MAX_PALETTE_SIZE * 3);
  for (let i = 0; i < MAX_PALETTE_SIZE; i++) {
    const c = palette.colors[i] ?? ([0, 0, 0] as [number, number, number]);
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  }
  return out;
}

export function getPaletteSize(paletteId: number): number {
  const palette = RETRO_PALETTES[paletteId] ?? RETRO_PALETTES[0];
  return palette.colors.length;
}
