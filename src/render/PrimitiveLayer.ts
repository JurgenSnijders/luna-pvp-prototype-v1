import { getTierLimits } from '../devtools/graphicsSettings';
import { ShapeId } from './gl/shaders';

export interface PrimitiveInstance {
  posX: number;
  posY: number;
  size: number;
  rot: number;
  shapeId: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  params: [number, number, number, number];
  additive: boolean;
  life: number;
  maxLife: number;
  growRate: number;
}

export class PrimitiveLayer {
  private active: PrimitiveInstance[] = [];

  beginFrame(): void {
    // no-op; primitives persist until life expires
  }

  update(dt: number): void {
    const next: PrimitiveInstance[] = [];
    for (const p of this.active) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.size += p.growRate * dt;
      p.alpha *= 1 - dt * 0.5;
      next.push(p);
    }
    this.active = next;
  }

  getActive(): PrimitiveInstance[] {
    return this.active;
  }

  private isAtCapacity(): boolean {
    return this.active.length >= getTierLimits().maxPrimitives;
  }

  spawnRing(
    x: number,
    y: number,
    radius: number,
    thickness: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    life: number,
    expanding: boolean,
  ): void {
    if (this.isAtCapacity()) return;
    this.active.push({
      posX: x,
      posY: y,
      size: radius * 2,
      rot: 0,
      shapeId: ShapeId.ANNULUS,
      r,
      g,
      b,
      alpha,
      params: [Math.max(0.15, thickness / Math.max(radius, 1)), 0.42, 0, 0],
      additive: true,
      life,
      maxLife: life,
      growRate: expanding ? radius * 1.2 : 0,
    });
  }

  spawnFlash(
    x: number,
    y: number,
    size: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    life: number,
  ): void {
    if (this.isAtCapacity()) return;
    this.active.push({
      posX: x,
      posY: y,
      size,
      rot: Math.random() * Math.PI * 2,
      shapeId: ShapeId.GLOW,
      r,
      g,
      b,
      alpha,
      params: [0, 0, 0, 0],
      additive: true,
      life,
      maxLife: life,
      growRate: size * 0.5,
    });
  }

  spawnBeam(
    x: number,
    y: number,
    length: number,
    rot: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    life: number,
  ): void {
    if (this.isAtCapacity()) return;
    this.active.push({
      posX: x,
      posY: y,
      size: length,
      rot,
      shapeId: ShapeId.CAPSULE,
      r,
      g,
      b,
      alpha,
      params: [length * 0.004, 0, 0, 0],
      additive: true,
      life,
      maxLife: life,
      growRate: 0,
    });
  }
}
