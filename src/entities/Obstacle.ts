import { Vector2D } from '../math/Vector2D';
import type { ObstacleConfig, SpellArchetype } from '../types/schema';
import { generateEntityId } from './Entity';

export class Obstacle {
  id: string;
  pos: Vector2D;
  config: ObstacleConfig;
  health: number;
  remainingDurationMs: number;
  spawnArchetype?: SpellArchetype;
  ownerId?: string;
  /** `performance.now()` at construction; drives the spawn snap. */
  spawnedAtMs: number;
  /** `performance.now()` of the last damaging hit. `0` means never hit. */
  lastHitAtMs = 0;
  lastHitPoint?: Vector2D;
  isDead = false;

  constructor(pos: Vector2D, config: ObstacleConfig) {
    this.id = generateEntityId('obstacle');
    this.pos = pos.clone();
    this.config = config;
    this.health = config.maxHealth ?? 100;
    this.remainingDurationMs = config.durationMs;
    this.spawnedAtMs = performance.now();
  }

  getCollisionRadius(): number {
    if (this.config.shape === 'CIRCLE') {
      return this.config.width / 2;
    }
    return Math.hypot(this.config.width, this.config.height) / 2;
  }

  getLifeRatio(): number | null {
    const total = this.config.durationMs;
    if (total <= 0) return null;
    return Math.max(0, Math.min(1, this.remainingDurationMs / total));
  }

  update(dt: number): void {
    this.remainingDurationMs -= dt * 1000;
    if (this.remainingDurationMs <= 0) {
      this.isDead = true;
    }
  }

  takeDamage(amount: number, hitPoint?: Vector2D): void {
    if (!this.config.isDestructible) return;
    this.health -= amount;
    this.lastHitAtMs = performance.now();
    if (hitPoint) this.lastHitPoint = hitPoint.clone();
    if (this.health <= 0) {
      this.isDead = true;
    }
  }
}
