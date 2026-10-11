import type { Entity } from '../../entities/Entity';
import { Vector2D } from '../../math/Vector2D';

export const SLOT_CAPACITY = 512;
export const SLOT_STRIDE = 9;

export const SLOT_PX = 0;
export const SLOT_PY = 1;
export const SLOT_PREV_X = 2;
export const SLOT_PREV_Y = 3;
export const SLOT_VX = 4;
export const SLOT_VY = 5;
export const SLOT_Z = 6;
export const SLOT_PREV_Z = 7;
export const SLOT_RADIUS = 8;

export class TransformSlotMirror {
  readonly data = new Float32Array(SLOT_CAPACITY * SLOT_STRIDE);
  private readonly freeList: number[] = [];

  constructor() {
    for (let i = SLOT_CAPACITY - 1; i >= 0; i--) {
      this.freeList.push(i);
    }
  }

  acquire(): number {
    const slot = this.freeList.pop();
    if (slot === undefined) return -1;
    return slot;
  }

  release(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= SLOT_CAPACITY) return;
    this.freeList.push(slotIndex);
  }

  writeEntity(entity: Entity, slotIndex: number): void {
    if (slotIndex < 0) return;
    const base = slotIndex * SLOT_STRIDE;
    const d = this.data;
    d[base + SLOT_PX] = entity.pos.x;
    d[base + SLOT_PY] = entity.pos.y;
    d[base + SLOT_PREV_X] = entity.prevPos.x;
    d[base + SLOT_PREV_Y] = entity.prevPos.y;
    d[base + SLOT_VX] = entity.vel.x;
    d[base + SLOT_VY] = entity.vel.y;
    d[base + SLOT_Z] = entity.z;
    d[base + SLOT_PREV_Z] = entity.prevZ;
    d[base + SLOT_RADIUS] = entity.radius;
  }

  lerpPos(slotIndex: number, alpha: number, out: Vector2D): Vector2D {
    const base = slotIndex * SLOT_STRIDE;
    const d = this.data;
    const prevX = d[base + SLOT_PREV_X];
    const prevY = d[base + SLOT_PREV_Y];
    const px = d[base + SLOT_PX];
    const py = d[base + SLOT_PY];
    out.x = prevX + (px - prevX) * alpha;
    out.y = prevY + (py - prevY) * alpha;
    return out;
  }

  lerpZ(slotIndex: number, alpha: number): number {
    const base = slotIndex * SLOT_STRIDE;
    const d = this.data;
    const prevZ = d[base + SLOT_PREV_Z];
    const z = d[base + SLOT_Z];
    return prevZ + (z - prevZ) * alpha;
  }
}

export function lerpEntityPos(entity: Entity, alpha: number): Vector2D {
  if (entity.slotIndex >= 0 && entity.slotMirror) {
    const base = entity.slotIndex * SLOT_STRIDE;
    const d = entity.slotMirror.data;
    const prevX = d[base + SLOT_PREV_X];
    const prevY = d[base + SLOT_PREV_Y];
    const px = d[base + SLOT_PX];
    const py = d[base + SLOT_PY];
    return new Vector2D(prevX + (px - prevX) * alpha, prevY + (py - prevY) * alpha);
  }
  return entity.prevPos.lerp(entity.pos, alpha);
}

export function lerpEntityZ(entity: Entity, alpha: number): number {
  if (entity.slotIndex >= 0 && entity.slotMirror) {
    return entity.slotMirror.lerpZ(entity.slotIndex, alpha);
  }
  return entity.prevZ + (entity.z - entity.prevZ) * alpha;
}
