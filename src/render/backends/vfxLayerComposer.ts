import { getTierLimits } from '../../devtools/graphicsSettings';
import { Vector2D } from '../../math/Vector2D';
import type { SpawnPriority } from './ParticleBackend';
import type { VfxColorRef, VfxDrawLayer, VfxLayer } from '../../types/schema';

const MAX_VFX_LAYERS = 6;
const DEFAULT_STREAK_SPARK_COUNT = 8;

export interface VfxLayerSpawnSink {
  spawnRing(
    pos: Vector2D,
    radius: number,
    thickness: number,
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
  spawnStreak(
    pos: Vector2D,
    vel: Vector2D,
    length: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void;
  burstSparks(pos: Vector2D, count: number, color: string, priority?: SpawnPriority): void;
}

export function estimateLayerSpawns(layer: VfxLayer): number {
  switch (layer.kind) {
    case 'RING':
    case 'FLASH':
      return 1;
    case 'STREAK':
    case 'SPARKS':
      return layer.count ?? DEFAULT_STREAK_SPARK_COUNT;
    default:
      return 1;
  }
}

export function maxVfxLayerSpawns(particleBudget?: number): number {
  const budget = particleBudget ?? getTierLimits().particleBudget;
  return Math.min(48, Math.floor(budget / 64));
}

export function truncateVfxLayers(
  layers: VfxLayer[],
  maxSpawns: number,
): VfxLayer[] {
  const capped = layers.slice(0, MAX_VFX_LAYERS);
  const kept: VfxLayer[] = [];
  let used = 0;
  for (const layer of capped) {
    const cost = estimateLayerSpawns(layer);
    if (used + cost > maxSpawns) break;
    kept.push(layer);
    used += cost;
  }
  return kept;
}

export function resolveLayerColor(
  colorRef: VfxColorRef,
  primary: string,
  secondary: string,
): string {
  return colorRef === 'SECONDARY' ? secondary : primary;
}

function toDrawPriority(layer: VfxDrawLayer): SpawnPriority {
  return layer;
}

export function playVfxLayers(
  sink: VfxLayerSpawnSink,
  pos: Vector2D,
  layers: VfxLayer[],
  primary: string,
  secondary: string,
  scale = 1,
): void {
  const maxSpawns = maxVfxLayerSpawns();
  const stack = truncateVfxLayers(layers, maxSpawns);
  for (const layer of stack) {
    const color = resolveLayerColor(layer.colorRef, primary, secondary);
    const priority = toDrawPriority(layer.layer);
    const size = layer.size * scale;
    const life = layer.lifetime;
    switch (layer.kind) {
      case 'RING':
        sink.spawnRing(pos, size, layer.thickness ?? 3, color, 0.85, life, priority);
        break;
      case 'FLASH':
        sink.spawnFlash(pos, size, color, 0.8, life, priority);
        break;
      case 'STREAK': {
        const count = layer.count ?? DEFAULT_STREAK_SPARK_COUNT;
        const spreadRad = ((layer.spreadDeg ?? 360) * Math.PI) / 180;
        const speed = layer.speed ?? 120;
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0.5 : i / (count - 1);
          const angle = -spreadRad / 2 + t * spreadRad;
          sink.spawnStreak(
            pos,
            Vector2D.fromAngle(angle, speed),
            Math.max(6, size * 0.35),
            color,
            0.85,
            life,
            priority,
          );
        }
        break;
      }
      case 'SPARKS':
        sink.burstSparks(pos, layer.count ?? DEFAULT_STREAK_SPARK_COUNT, color, priority);
        break;
    }
  }
}
