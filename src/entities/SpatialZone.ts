import type { FieldConfig, FieldAffectsFilter, SpellArchetype } from '../types/schema';
import { HAZARD_CLEARANCE_Z } from '../engine/verticalConstants';
import { Vector2D } from '../math/Vector2D';
import { Entity, generateEntityId } from './Entity';

function entityFacingAngle(entity: Entity): number {
  const withFacing = entity as Entity & { facingAngle?: number };
  if (typeof withFacing.facingAngle === 'number' && Number.isFinite(withFacing.facingAngle)) {
    return withFacing.facingAngle;
  }
  if (entity.vel.magSq() > 0.01) {
    return Math.atan2(entity.vel.y, entity.vel.x);
  }
  return 0;
}

export class SpatialZone extends Entity {
  config: FieldConfig;
  ownerId: string;
  spellArchetype: SpellArchetype;
  remainingDurationMs: number;
  parentRef: Entity | null;
  offset: Vector2D;
  detachOnParentDeath: boolean;
  zBase: number;
  zHeight: number;
  verticalForce: number;
  affects: FieldAffectsFilter;
  /** Heading captured at spawn for CAST_HEADING arcs. */
  castHeading: Vector2D;
  /** Per-occupant elapsed-ms accumulators for throttled status reapplication. */
  statusAccumulatorsMs = new Map<string, number>();

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
    this.zBase = config.zBase ?? 0;
    this.zHeight = config.zHeight ?? HAZARD_CLEARANCE_Z;
    this.verticalForce = config.verticalForce ?? 0;
    this.affects = config.affects ?? 'ENEMIES';
    this.castHeading = Vector2D.fromAngle(0);
  }

  /** World-space facing angle (radians) for the arc bisector. */
  getArcFacingRad(): number {
    const offset = ((this.config.arcOffsetDeg ?? 0) * Math.PI) / 180;
    switch (this.config.arcFacing ?? 'CAST_HEADING') {
      case 'CASTER_FACING': {
        const parent = this.parentRef;
        const facing = parent ? entityFacingAngle(parent) : Math.atan2(this.castHeading.y, this.castHeading.x);
        return facing + offset;
      }
      case 'FIXED':
        return offset;
      case 'CAST_HEADING':
      default:
        return Math.atan2(this.castHeading.y, this.castHeading.x) + offset;
    }
  }

  /** True when the field uses a partial arc (not a full circle). */
  isPartialArc(): boolean {
    const arc = this.config.arcDeg;
    return arc !== undefined && arc < 360;
  }

  override update(dt: number): void {
    if (this.parentRef) {
      if (this.parentRef.isDead) {
        if (this.detachOnParentDeath) {
          this.remainingDurationMs = 0;
        } else {
          this.parentRef = null;
        }
      } else if (this.config.arcFacing === 'CASTER_FACING') {
        // Offset is local to parent facing — rotate each frame.
        const a = entityFacingAngle(this.parentRef);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const ox = this.offset.x * c - this.offset.y * s;
        const oy = this.offset.x * s + this.offset.y * c;
        this.pos.copyFrom(this.parentRef.pos).addMut(new Vector2D(ox, oy));
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
