import type { SpawnPriority } from '../ParticleBackend';

const PRIORITY_COST: Record<SpawnPriority, number> = {
  CORE: 0,
  PRIMARY: 1,
  SECONDARY: 2,
  AMBIENT: 3,
};

export function canSpawnAtCount(
  particleCount: number,
  budget: number,
  priority: SpawnPriority,
): boolean {
  if (particleCount >= budget) {
    return PRIORITY_COST[priority] < PRIORITY_COST.SECONDARY;
  }
  return true;
}
