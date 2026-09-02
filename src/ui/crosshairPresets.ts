export type CrosshairStyleId =
  | 'TACTICAL'
  | 'CLASSIC_CROSS'
  | 'DOT_RING'
  | 'MINIMAL'
  | 'SYSTEM';

export const CROSSHAIR_STYLE_IDS: CrosshairStyleId[] = [
  'TACTICAL',
  'CLASSIC_CROSS',
  'DOT_RING',
  'MINIMAL',
  'SYSTEM',
];

export interface CrosshairPresetMeta {
  id: CrosshairStyleId;
  label: string;
  hotspot: [number, number];
}

export const CROSSHAIR_PRESETS: Record<CrosshairStyleId, CrosshairPresetMeta> = {
  TACTICAL: { id: 'TACTICAL', label: 'Tactical', hotspot: [16, 16] },
  CLASSIC_CROSS: { id: 'CLASSIC_CROSS', label: 'Classic Cross', hotspot: [16, 16] },
  DOT_RING: { id: 'DOT_RING', label: 'Dot Ring', hotspot: [16, 16] },
  MINIMAL: { id: 'MINIMAL', label: 'Minimal', hotspot: [16, 16] },
  SYSTEM: { id: 'SYSTEM', label: 'System Default', hotspot: [16, 16] },
};

const VALID_CROSSHAIR_STYLES = new Set<CrosshairStyleId>(CROSSHAIR_STYLE_IDS);

export function isCrosshairStyleId(id: string): id is CrosshairStyleId {
  return VALID_CROSSHAIR_STYLES.has(id as CrosshairStyleId);
}

const SVG_HEADER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">';

function encodeSvgCursor(svg: string, hotspot: [number, number] = [16, 16]): string {
  return `url(data:image/svg+xml,${encodeURIComponent(svg)}) ${hotspot[0]} ${hotspot[1]}, crosshair`;
}

function dualLayerPath(path: string, neonColor: string): string {
  return `${SVG_HEADER}<g stroke="#000000" stroke-width="3" stroke-linecap="square" fill="none"><path d="${path}"/></g><g stroke="${neonColor}" stroke-width="1.5" stroke-linecap="square" fill="none"><path d="${path}"/></g></svg>`;
}

function buildTacticalCrosshair(neonColor: string): string {
  const shapes = [
    'M 16 2 L 16 10',
    'M 16 22 L 16 30',
    'M 2 16 L 10 16',
    'M 22 16 L 30 16',
    'M 11 13 L 11 11 L 13 11',
    'M 21 11 L 19 11 M 21 11 L 21 13',
    'M 11 19 L 11 21 L 13 21',
    'M 21 21 L 19 21 M 21 21 L 21 19',
  ].join(' ');
  return encodeSvgCursor(dualLayerPath(shapes, neonColor));
}

function buildClassicCrosshair(neonColor: string): string {
  const shapes = [
    'M 16 2 L 16 10',
    'M 16 22 L 16 30',
    'M 2 16 L 10 16',
    'M 22 16 L 30 16',
  ].join(' ');
  return encodeSvgCursor(dualLayerPath(shapes, neonColor));
}

function buildDotRingCrosshair(neonColor: string): string {
  const ring = 'M 16 6 A 10 10 0 1 1 15.99 6';
  const ticks = [
    'M 16 2 L 16 6',
    'M 16 26 L 16 30',
    'M 2 16 L 6 16',
    'M 26 16 L 30 16',
  ].join(' ');
  const path = `${ring} ${ticks}`;
  const svg = `${SVG_HEADER}<g stroke="#000000" stroke-width="3" stroke-linecap="square" fill="none"><path d="${path}"/></g><g stroke="${neonColor}" stroke-width="1.5" stroke-linecap="square" fill="none"><path d="${path}"/></g><circle cx="16" cy="16" r="2" fill="#000000"/><circle cx="16" cy="16" r="1.5" fill="${neonColor}"/></svg>`;
  return encodeSvgCursor(svg);
}

function buildMinimalCrosshair(neonColor: string): string {
  const shapes = [
    'M 16 2 L 16 10',
    'M 16 22 L 16 30',
    'M 2 16 L 10 16',
    'M 22 16 L 30 16',
  ].join(' ');
  const svg = `${SVG_HEADER}<g stroke="${neonColor}" stroke-width="1.5" stroke-linecap="square" fill="none"><path d="${shapes}"/></g></svg>`;
  return encodeSvgCursor(svg);
}

export function buildCrosshairCursor(styleId: CrosshairStyleId, neonColor: string): string {
  switch (styleId) {
    case 'TACTICAL':
      return buildTacticalCrosshair(neonColor);
    case 'CLASSIC_CROSS':
      return buildClassicCrosshair(neonColor);
    case 'DOT_RING':
      return buildDotRingCrosshair(neonColor);
    case 'MINIMAL':
      return buildMinimalCrosshair(neonColor);
    case 'SYSTEM':
      return 'crosshair';
  }
}
