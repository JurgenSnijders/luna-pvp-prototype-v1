import type { FieldConfig, SpellArchetype } from '../types/schema';
import { HAZARD_CLEARANCE_Z } from '../engine/verticalConstants';
import { Vector2D } from '../math/Vector2D';
import { Entity, generateEntityId } from './Entity';

export class SpatialZone extends Entity {
  config: FieldConfig;
  ownerId: string;
  spellArchetype: SpellArchetype;
  remainingDurationMs: number;
  parentRef: Entity | null;
  offset: Vector2D;
  detachOnParentDeath: boolean;
  zBase = 0;
  zHeight = HAZARD_CLEARANCE_Z;

  constructor(
    pos: Vector2D,
    config: FieldConfig,
    ownerId: string,
    spellArchetype: SpellArchetype = 'KINETIC',
  ) {
    super(generateEntityId('zone'), pos, {
      mass: Infinity,
      radius: config.radius,
      linearDrag: 0,
      tags: ['zone', 'field'],
    });
    this.config = config;
    this.ownerId = ownerId;
    this.spellArchetype = spellArchetype;
    this.remainingDurationMs = config.durationMs;
    this.parentRef = null;
    this.offset = Vector2D.zero();
    this.detachOnParentDeath = true;
  }

  override update(dt: number): void {
    if (this.parentRef) {
      if (this.parentRef.isDead) {
        if (this.detachOnParentDeath) {
          this.remainingDurationMs = 0;
        } else {
          this.parentRef = null;
        }
      } else {
        this.pos.copyFrom(this.parentRef.pos).addMut(this.offset);
      }
    }

    this.remainingDurationMs -= dt * 1000;
    if (this.remainingDurationMs <= 0) {
      this.isDead = true;
    }
  }
}
