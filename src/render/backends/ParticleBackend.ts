import type { CameraView } from '../../camera/Camera2D';
import type { Vector2D } from '../../math/Vector2D';
import type { ImpactVfx } from '../../types/schema';

export type SpawnPriority = 'CORE' | 'PRIMARY' | 'SECONDARY' | 'AMBIENT';

export interface VfxCounters {
  liveParticles: number;
  livePrimitives: number;
  drawCalls: number;
  instanceCount: number;
  uploadBytes: number;
}

export interface ParticleBackend {
  readonly name: string;
  beginFrame(dt: number): void;
  update(dt: number): void;
  render(width: number, height: number, view: CameraView): VfxCounters;
  /** Canvas2D fallback path. */
  draw?(ctx: CanvasRenderingContext2D): void;
  resize(width: number, height: number): void;
  getLiveParticleCount(): number;
  getLivePrimitiveCount(): number;
  destroy(): void;

  spawnDisc(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    additive: boolean,
    priority: SpawnPriority,
  ): void;
  spawnGlow(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    additive: boolean,
    priority: SpawnPriority,
  ): void;
  spawnRing(
    pos: Vector2D,
    radius: number,
    thickness: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void;
  spawnStreak(
    pos: Vector2D,
    vel: Vector2D,
    length: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void;
  spawnFlash(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void;
  burstSparks(
    pos: Vector2D,
    count: number,
    color: string,
    priority?: SpawnPriority,
  ): void;
  triggerMuzzleFlash(pos: Vector2D, dir: Vector2D, color: string): void;
  triggerImpactBurst(
    pos: Vector2D,
    color: string,
    secondaryColor: string,
    vfxType: ImpactVfx,
    scale?: number,
  ): void;
  trail(pos: Vector2D, color: string, trailKind: string): void;
  neonRibbon(pos: Vector2D, color: string): void;
  ember(pos: Vector2D): void;
  spawnAmbientEmber(
    bounds: { minX: number; minY: number; width: number; height: number },
    safeCenter: Vector2D,
    safeRadius: number,
  ): void;
  expandingRing(pos: Vector2D, radius: number, color: string): void;
  spawnDirectionalImpactRing(pos: Vector2D, normal: Vector2D, color: string): void;
}

export function parseColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16) / 255,
      parseInt(h[1] + h[1], 16) / 255,
      parseInt(h[2] + h[2], 16) / 255,
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
