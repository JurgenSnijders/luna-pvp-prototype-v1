import type { FieldConfig } from '../types/schema';
import { Vector2D } from '../math/Vector2D';
import { Entity, generateEntityId } from './Entity';

export class SpatialZone extends Entity {
  config: FieldConfig;
  ownerId: string;
  remainingDurationMs: number;

  constructor(pos: Vector2D, config: FieldConfig, ownerId: string) {
    super(generateEntityId('zone'), pos, {
      mass: Infinity,
      radius: config.radius,
      linearDrag: 0,
      tags: ['zone', 'field'],
    });
    this.config = config;
    this.ownerId = ownerId;
    this.remainingDurationMs = config.durationMs;
  }

  override update(dt: number): void {
    this.remainingDurationMs -= dt * 1000;
    if (this.remainingDurationMs <= 0) {
      this.isDead = true;
    }
  }
}
