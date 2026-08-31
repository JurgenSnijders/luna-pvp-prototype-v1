import { Vector2D } from '../math/Vector2D';
import type { TrajectoryConfig, TriggerNode, VisualDescriptor, SpellArchetype } from '../types/schema';
import { Entity, generateEntityId } from './Entity';

export type ExpiryReason = 'range' | 'lifetime' | 'return' | 'hit' | 'wall' | null;

export class Projectile extends Entity {
  config: TrajectoryConfig;
  sourceEntityId: string;
  /** Name of the root-cast ability that spawned this projectile; empty for emitter-spawned children (root-only recast). */
  abilityName: string;
  spellArchetype?: SpellArchetype;
  distanceTraveled: number;
  lifetimeMs: number;
  maxLifetimeMs: number;
  pierceRemaining: number;
  hitEntityIds: Set<string>;
  triggerMap: Map<string, TriggerNode[]>;
  /** Per-ON_TICK-node elapsed-ms accumulators, keyed by index within getTriggers('ON_TICK'). */
  tickAccumulatorsMs: Map<number, number>;
  /** Indices (within getTriggers('ON_DISTANCE_TRAVELED')) that have already fired, so each node fires exactly once. */
  firedDistanceTriggers: Set<number>;
  /** True while the projectile is over a hazard surface; used to fire ON_HAZARD_CONTACT on entry only. */
  inHazard: boolean;
  aimAngle: number;
  depth: number;
  visuals: VisualDescriptor | null;

  isReturning: boolean;
  onReturnTriggered: boolean;
  orbitAngle: number;
  blinkTimerMs: number;
  expiryReason: ExpiryReason;
  lastTrailPos: Vector2D;

  constructor(
    pos: Vector2D,
    config: TrajectoryConfig,
    sourceEntityId: string,
    aimAngle: number,
    triggerMap: Map<string, TriggerNode[]> = new Map(),
    depth = 0,
    visuals: VisualDescriptor | null = null,
    abilityName = '',
    spellArchetype?: SpellArchetype,
  ) {
    super(generateEntityId('projectile'), pos, {
      mass: 0.1,
      radius: Math.max(4, Math.min(32, visuals?.size ?? 8)),
      linearDrag: 0,
      tags: ['projectile', 'kinematic'],
    });
    this.config = config;
    this.sourceEntityId = sourceEntityId;
    this.abilityName = abilityName;
    this.spellArchetype = spellArchetype;
    this.distanceTraveled = 0;
    this.lifetimeMs = 0;
    this.maxLifetimeMs = 5000;
    this.pierceRemaining = config.piercing ?? 0;
    this.hitEntityIds = new Set();
    this.triggerMap = triggerMap;
    this.tickAccumulatorsMs = new Map();
    this.firedDistanceTriggers = new Set();
    this.inHazard = false;
    this.aimAngle = aimAngle;
    this.depth = depth;
    this.visuals = visuals;

    this.isReturning = false;
    this.onReturnTriggered = false;
    this.orbitAngle = aimAngle;
    this.blinkTimerMs = 0;
    this.expiryReason = null;
    this.lastTrailPos = Vector2D.create(pos.x, pos.y);

    const speed = config.speed ?? 400;
    this.vel = Vector2D.fromAngle(aimAngle, speed);
  }

  registerHit(entityId: string): boolean {
    if (this.hitEntityIds.has(entityId)) {
      return false;
    }
    this.hitEntityIds.add(entityId);
    return true;
  }

  getTriggers(trigger: string): TriggerNode[] {
    return this.triggerMap.get(trigger) ?? [];
  }

  override update(dt: number): void {
    this.lifetimeMs += dt * 1000;
    if (this.lifetimeMs >= this.maxLifetimeMs && !this.isDead) {
      this.isDead = true;
      this.expiryReason = 'lifetime';
    }
  }
}
