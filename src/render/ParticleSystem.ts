import type { CameraView } from '../camera/Camera2D';
import { Vector2D } from '../math/Vector2D';
import type { ImpactVfx } from '../types/schema';
import { createParticleBackend } from './backends/createParticleBackend';
import { VfxDirector } from './VfxDirector';

/** Public facade preserving the legacy ParticleSystem API. */
export class ParticleSystem {
  private director: VfxDirector;
  private glContext: ReturnType<typeof createParticleBackend>['glContext'];
  private useCanvas2d: boolean;

  constructor(parent?: HTMLElement) {
    const bundle = createParticleBackend(parent ?? document.body);
    this.director = new VfxDirector(bundle.backend);
    this.glContext = bundle.glContext;
    this.useCanvas2d = bundle.backend.name === 'canvas2d';
  }

  isWebGL(): boolean {
    return !this.useCanvas2d;
  }

  getGlContext() {
    return this.glContext;
  }

  beginFrame(dt: number): void {
    this.director.beginFrame(dt);
  }

  update(dt: number): void {
    this.director.update(dt);
  }

  render(width: number, height: number, view: CameraView) {
    this.director.resize(width, height);
    return this.director.render(width, height, view);
  }

  resize(width: number, height: number): void {
    this.director.resize(width, height);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.useCanvas2d) {
      this.director.draw(ctx);
    }
  }

  getLiveCount(): number {
    return this.director.getLiveParticleCount();
  }

  burstSparks(pos: Vector2D, count: number, color: string): void {
    this.director.burstSparks(pos, count, color);
  }

  trail(pos: Vector2D, color: string, trailKind = 'DEFAULT'): void {
    this.director.trail(pos, color, trailKind);
  }

  neonRibbon(pos: Vector2D, color: string): void {
    this.director.neonRibbon(pos, color);
  }

  ember(pos: Vector2D): void {
    this.director.ember(pos);
  }

  spawnAmbientEmber(
    bounds: { minX: number; minY: number; width: number; height: number },
    safeCenter: Vector2D,
    safeRadius: number,
  ): void {
    this.director.spawnAmbientEmber(bounds, safeCenter, safeRadius);
  }

  expandingRing(pos: Vector2D, radius: number, color: string): void {
    this.director.expandingRing(pos, radius, color);
  }

  triggerMuzzleFlash(pos: Vector2D, dir: Vector2D, color: string): void {
    this.director.triggerMuzzleFlash(pos, dir, color);
  }

  triggerImpactBurst(
    pos: Vector2D,
    color: string,
    vfxType: ImpactVfx = 'SPARKS',
    secondaryColor?: string,
    scale?: number,
  ): void {
    this.director.triggerImpactBurst(
      pos,
      color,
      secondaryColor ?? '#ffffff',
      vfxType,
      scale,
    );
  }

  spawnDirectionalImpactRing(pos: Vector2D, normal: Vector2D, color: string): void {
    this.director.spawnDirectionalImpactRing(pos, normal, color);
  }
}
