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
  isDead = false;

  constructor(pos: Vector2D, config: ObstacleConfig) {
    this.id = generateEntityId('obstacle');
    this.pos = pos.clone();
    this.config = config;
    this.health = config.maxHealth ?? 100;
    this.remainingDurationMs = config.durationMs;
  }

  getCollisionRadius(): number {
    if (this.config.shape === 'CIRCLE') {
      return this.config.width / 2;
    }
    return Math.hypot(this.config.width, this.config.height) / 2;
  }

  update(dt: number): void {
    this.remainingDurationMs -= dt * 1000;
    if (this.remainingDurationMs <= 0) {
      this.isDead = true;
    }
  }

  takeDamage(amount: number): void {
    if (!this.config.isDestructible) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.isDead = true;
    }
  }
}
