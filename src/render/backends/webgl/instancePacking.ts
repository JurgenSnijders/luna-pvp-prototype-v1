import { FLOATS_PER_INSTANCE } from '../../gl/shaders';
import type { InstancedQuadRenderer } from '../../gl/InstancedQuadRenderer';
import type { SimParticle } from './types';

export function packPrimitive(
  renderer: InstancedQuadRenderer,
  data: Float32Array,
  prim: {
    posX: number;
    posY: number;
    size: number;
    rot: number;
    shapeId: number;
    r: number;
    g: number;
    b: number;
    alpha: number;
    life: number;
    maxLife: number;
    params: [number, number, number, number];
    additive: boolean;
  },
): void {
  const idx = renderer.allocInstance(prim.additive);
  if (idx < 0) return;
  writeInstance(data, idx, {
    posX: prim.posX,
    posY: prim.posY,
    sizeX: prim.size,
    sizeY: prim.size,
    rot: prim.rot,
    shapeId: prim.shapeId,
    r: prim.r,
    g: prim.g,
    b: prim.b,
    alpha: prim.alpha * (prim.life / prim.maxLife),
    params: prim.params,
  });
}

export function packParticle(
  renderer: InstancedQuadRenderer,
  data: Float32Array,
  p: SimParticle,
  alpha: number,
): void {
  const idx = renderer.allocInstance(p.additive);
  if (idx < 0) return;
  writeInstance(data, idx, {
    posX: p.posX,
    posY: p.posY,
    sizeX: p.size,
    sizeY: p.size,
    rot: p.rot,
    shapeId: p.shapeId,
    r: p.r,
    g: p.g,
    b: p.b,
    alpha,
    params: p.params,
  });
}

function writeInstance(
  data: Float32Array,
  idx: number,
  inst: {
    posX: number;
    posY: number;
    sizeX: number;
    sizeY: number;
    rot: number;
    shapeId: number;
    r: number;
    g: number;
    b: number;
    alpha: number;
    params: [number, number, number, number];
  },
): void {
  const off = idx * FLOATS_PER_INSTANCE;
  data[off] = inst.posX;
  data[off + 1] = inst.posY;
  data[off + 2] = inst.sizeX;
  data[off + 3] = inst.sizeY;
  data[off + 4] = inst.rot;
  data[off + 5] = inst.r;
  data[off + 6] = inst.g;
  data[off + 7] = inst.b;
  data[off + 8] = inst.alpha;
  data[off + 9] = inst.shapeId;
  data[off + 10] = inst.params[0];
  data[off + 11] = inst.params[1];
  data[off + 12] = inst.params[2];
  data[off + 13] = inst.params[3];
}
