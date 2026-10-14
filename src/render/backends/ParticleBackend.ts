import type { CameraView } from '../../camera/Camera2D';
import type { Vector2D } from '../../math/Vector2D';
import type { ImpactVfx, VfxLayer } from '../../types/schema';

export type SpawnPriority = 'CORE' | 'PRIMARY' | 'SECONDARY' | 'AMBIENT';

export interface VfxCounters {
  liveParticles: number;
  livePrimitives: number;
  liveRibbons: number;
  liveLights: number;
  shadowedLights: number;
  drawCalls: number;
  instanceCount: number;
  uploadBytes: number;
  hdrActive: boolean;
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
  supportsRibbons(): boolean;
  supportsLights(): boolean;
  pushFrameLight(
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
  ): void;
  pushTimedLight(
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    intensity: number,
    lifeMs: number,
  ): void;
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
    intensity?: number,
  ): void;
  spawnStreak(
    pos: Vector2D,
    vel: Vector2D,
    length: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
    intensity?: number,
  ): void;
  spawnFlash(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
    intensity?: number,
  ): void;
  burstSparks(
    pos: Vector2D,
    count: number,
    color: string,
    priority?: SpawnPriority,
    intensity?: number,
  ): void;
  triggerMuzzleFlash(pos: Vector2D, dir: Vector2D, color: string): void;
  triggerImpactBurst(
    pos: Vector2D,
    color: string,
    secondaryColor: string,
    vfxType: ImpactVfx,
    scale?: number,
    layers?: VfxLayer[],
    emissiveMul?: number,
  ): void;
  trail(pos: Vector2D, color: string, trailKind: string): void;
  neonRibbon(pos: Vector2D, color: string): void;
  ribbonPush(
    id: string,
    pos: Vector2D,
    color: string,
    width: number,
    intensity: number,
    pointLifetimeMs?: number,
  ): void;
  ember(pos: Vector2D): void;
  spawnAmbientEmber(
    bounds: { minX: number; minY: number; width: number; height: number },
    safeCenter: Vector2D,
    safeRadius: number,
  ): void;
  expandingRing(pos: Vector2D, radius: number, color: string): void;
  spawnDirectionalImpactRing(pos: Vector2D, normal: Vector2D, color: string): void;
  zoneVortexTick(pos: Vector2D, radius: number, color: string): void;
  zoneHazardPulse(pos: Vector2D, radius: number, color: string): void;
  statusFrost(pos: Vector2D, radius: number): void;
  statusThermal(pos: Vector2D, radius: number, intensity: number, color: string): void;
  statusVoid(pos: Vector2D, radius: number, color: string): void;
  statusKinetic(pos: Vector2D, velocity: Vector2D): void;
  emitLavaSizzle(pos: Vector2D): void;
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
