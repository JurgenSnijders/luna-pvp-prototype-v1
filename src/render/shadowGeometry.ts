import type { Light } from './LightLayer';

export type ShadowOccluder =
  | { kind: 'CIRCLE'; x: number; y: number; r: number }
  | { kind: 'BOX'; x: number; y: number; hw: number; hh: number; angle: number };

export interface ShadowLight {
  x: number;
  y: number;
  radius: number;
}

function writeTri(
  out: Float32Array,
  offset: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  let o = offset;
  out[o++] = ax;
  out[o++] = ay;
  out[o++] = bx;
  out[o++] = by;
  out[o++] = cx;
  out[o++] = cy;
  return o;
}

function extrude(
  lx: number,
  ly: number,
  px: number,
  py: number,
  dist: number,
): [number, number] {
  const dx = px - lx;
  const dy = py - ly;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [px, py];
  const s = dist / len;
  return [lx + dx * s, ly + dy * s];
}

function occluderInLightRange(light: ShadowLight, occ: ShadowOccluder): boolean {
  const dx = occ.x - light.x;
  const dy = occ.y - light.y;
  const dist = Math.hypot(dx, dy);
  if (occ.kind === 'CIRCLE') {
    return dist - occ.r <= light.radius;
  }
  const reach = Math.hypot(occ.hw, occ.hh);
  return dist - reach <= light.radius;
}

export function circleShadow(
  light: ShadowLight,
  occ: Extract<ShadowOccluder, { kind: 'CIRCLE' }>,
  out: Float32Array,
  offset: number,
): number {
  const lx = light.x;
  const ly = light.y;
  const cx = occ.x;
  const cy = occ.y;
  const r = occ.r;
  const dx = cx - lx;
  const dy = cy - ly;
  const dist = Math.hypot(dx, dy);
  if (dist <= r || dist > light.radius + r) return offset;
  const a = Math.atan2(cy - ly, cx - lx);
  const b = Math.asin(r / dist);
  const t1x = cx + r * Math.sin(a + b);
  const t1y = cy - r * Math.cos(a + b);
  const t2x = cx + r * Math.sin(a - b);
  const t2y = cy - r * Math.cos(a - b);
  const extend = light.radius * 2;
  const [e1x, e1y] = extrude(lx, ly, t1x, t1y, extend);
  const [e2x, e2y] = extrude(lx, ly, t2x, t2y, extend);
  let o = writeTri(out, offset, t1x, t1y, t2x, t2y, e2x, e2y);
  o = writeTri(out, o, t1x, t1y, e2x, e2y, e1x, e1y);
  return o;
}

const BOX_CORNER_SIGNS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

export function boxShadow(
  light: ShadowLight,
  occ: Extract<ShadowOccluder, { kind: 'BOX' }>,
  out: Float32Array,
  offset: number,
): number {
  const cos = Math.cos(occ.angle);
  const sin = Math.sin(occ.angle);
  const corners: [number, number][] = [];
  for (const [sx, sy] of BOX_CORNER_SIGNS) {
    const lx = sx * occ.hw;
    const ly = sy * occ.hh;
    corners.push([occ.x + lx * cos - ly * sin, occ.y + lx * sin + ly * cos]);
  }
  const extend = light.radius * 2;
  let o = offset;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % n];
    const cross = (bx - ax) * (light.y - ay) - (by - ay) * (light.x - ax);
    if (cross <= 0) continue;
    const [eax, eay] = extrude(light.x, light.y, ax, ay, extend);
    const [ebx, eby] = extrude(light.x, light.y, bx, by, extend);
    o = writeTri(out, o, ax, ay, bx, by, ebx, eby);
    o = writeTri(out, o, ax, ay, ebx, eby, eax, eay);
  }
  return o;
}

export function shadowVolumeVerts(
  light: ShadowLight,
  occ: ShadowOccluder,
  out: Float32Array,
  offset: number,
): number {
  if (!occluderInLightRange(light, occ)) return offset;
  if (occ.kind === 'CIRCLE') return circleShadow(light, occ, out, offset);
  return boxShadow(light, occ, out, offset);
}

export function lightScore(light: Light): number {
  return light.intensity * light.fade * light.radius;
}

export function hasOccluderInRange(light: Light, occluders: ShadowOccluder[]): boolean {
  const sl: ShadowLight = { x: light.x, y: light.y, radius: light.radius };
  for (const occ of occluders) {
    if (occluderInLightRange(sl, occ)) return true;
  }
  return false;
}

/** Indices into `lights` for the top shadow casters (brightest with occluders in range). */
export function selectShadowCasters(
  lights: Light[],
  occluders: ShadowOccluder[],
  max: number,
  out: number[] = [],
): number[] {
  out.length = 0;
  if (max <= 0 || occluders.length === 0) return out;
  const scored: { index: number; score: number }[] = [];
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    if (light.intensity * light.fade <= 0.001) continue;
    if (!hasOccluderInRange(light, occluders)) continue;
    scored.push({ index: i, score: lightScore(light) });
  }
  scored.sort((a, b) => b.score - a.score);
  for (let i = 0; i < scored.length && i < max; i++) {
    out.push(scored[i].index);
  }
  return out;
}
