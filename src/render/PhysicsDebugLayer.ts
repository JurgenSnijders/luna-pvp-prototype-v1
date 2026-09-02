import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Camera2D } from '../camera/Camera2D';
import { getEffectiveDprCap } from '../devtools/graphicsSettings';
import { drawPhysicsDebugBadge, drawPhysicsDebugOverlay } from './canvas/debug';

export class PhysicsDebugLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'physics-debug-canvas';
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;display:none;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = getEffectiveDprCap();
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    world: PhysicsWorld,
    camera: Camera2D,
    alpha: number,
    shakeX: number,
    shakeY: number,
  ): void {
    if (!world.debugPhysicsEnabled) {
      this.canvas.style.display = 'none';
      return;
    }

    this.canvas.style.display = 'block';
    this.ctx.clearRect(0, 0, camera.viewportWidth, camera.viewportHeight);

    this.ctx.save();
    camera.applyTransform(this.ctx, shakeX, shakeY);
    drawPhysicsDebugOverlay(this.ctx, world, alpha);
    this.ctx.restore();

    drawPhysicsDebugBadge(this.ctx, world);
  }
}
