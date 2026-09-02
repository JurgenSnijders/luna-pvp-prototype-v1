import type { Vector2D } from '../math/Vector2D';
import type { ImpactVfx } from '../types/schema';
import type { ParticleBackend, SpawnPriority } from './backends/ParticleBackend';

const DEV = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;

/** Spawn category for anti-overdraw — same type at same position is deduplicated. */
const SpawnMaterial = {
  TRAIL: 1,
  NEON_RIBBON: 2,
  RING: 3,
  SPARK_BURST: 4,
} as const;

interface RecentSpawn {
  x: number;
  y: number;
  material: number;
  scale: number;
}

export class VfxDirector {
  private recentSpawns: RecentSpawn[] = [];

  constructor(private backend: ParticleBackend) {}
  setBackend(backend: ParticleBackend): void {
    this.backend = backend;
  }

  beginFrame(dt: number): void {
    this.recentSpawns.length = 0;
    this.backend.beginFrame(dt);
  }

  update(dt: number): void {
    this.backend.update(dt);
  }

  render(width: number, height: number) {
    return this.backend.render(width, height);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.backend.draw?.(ctx);
  }

  resize(width: number, height: number): void {
    this.backend.resize(width, height);
  }

  getLiveParticleCount(): number {
    return this.backend.getLiveParticleCount();
  }

  getLivePrimitiveCount(): number {
    return this.backend.getLivePrimitiveCount();
  }

  private checkOverdraw(x: number, y: number, scale: number, material: number): boolean {
    for (const r of this.recentSpawns) {
      if (r.material !== material) continue;
      const dx = r.x - x;
      const dy = r.y - y;
      if (dx * dx + dy * dy < 4) {
        const ratio = scale / r.scale;
        if (ratio < 1.5 && ratio > 1 / 1.5) {
          if (DEV) {
            console.warn('[VfxDirector] Anti-overdraw rejected coincident spawn');
          }
          return false;
        }
      }
    }
    this.recentSpawns.push({ x, y, material, scale });
    return true;
  }

  burstSparks(pos: Vector2D, count: number, color: string, priority: SpawnPriority = 'SECONDARY'): void {
    if (!this.checkOverdraw(pos.x, pos.y, Math.max(4, count), SpawnMaterial.SPARK_BURST)) return;
    this.backend.burstSparks(pos, count, color, priority);
  }

  triggerMuzzleFlash(pos: Vector2D, dir: Vector2D, color: string): void {
    this.backend.triggerMuzzleFlash(pos, dir, color);
  }

  triggerImpactBurst(
    pos: Vector2D,
    color: string,
    secondaryColor: string,
    vfxType: ImpactVfx,
    scale = 1,
  ): void {
    this.backend.triggerImpactBurst(pos, color, secondaryColor, vfxType, scale);
  }

  trail(pos: Vector2D, color: string, trailKind: string): void {
    if (!this.checkOverdraw(pos.x, pos.y, 3, SpawnMaterial.TRAIL)) return;
    this.backend.trail(pos, color, trailKind);
  }

  neonRibbon(pos: Vector2D, color: string): void {
    if (!this.checkOverdraw(pos.x, pos.y, 9, SpawnMaterial.NEON_RIBBON)) return;
    this.backend.neonRibbon(pos, color);
  }
  ember(pos: Vector2D): void {
    this.backend.ember(pos);
  }

  spawnAmbientEmber(
    bounds: { width: number; height: number },
    safeCenter: Vector2D,
    safeRadius: number,
  ): void {
    this.backend.spawnAmbientEmber(bounds, safeCenter, safeRadius);
  }

  expandingRing(pos: Vector2D, radius: number, color: string): void {
    this.backend.expandingRing(pos, radius, color);
  }

  spawnRing(
    pos: Vector2D,
    radius: number,
    thickness: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void {
    if (!this.checkOverdraw(pos.x, pos.y, radius, SpawnMaterial.RING)) return;
    this.backend.spawnRing(pos, radius, thickness, color, alpha, life, priority);
  }

  spawnDirectionalImpactRing(pos: Vector2D, normal: Vector2D, color: string): void {
    this.backend.spawnDirectionalImpactRing(pos, normal, color);
  }
}