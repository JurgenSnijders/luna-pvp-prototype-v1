import { Vector2D } from '../math/Vector2D';
import type { MorphConfig } from '../types/schema';

let nextEntityId = 1;

export function generateEntityId(prefix = 'entity'): string {
  return `${prefix}_${nextEntityId++}`;
}

export class Entity {
  id: string;
  pos: Vector2D;
  prevPos: Vector2D;
  vel: Vector2D;
  accel: Vector2D;
  mass: number;
  radius: number;
  linearDrag: number;
  baseLinearDrag: number;
  isDead: boolean;
  instabilityPct: number;
  knockbackResistance: number;
  health: number;
  maxHealth: number;
  tags: Set<string>;
  stasisRemainingMs: number;
  stashedMomentum: Vector2D;
  forceAccumulatorScale: number;
  activeMorph: MorphConfig | null;
  morphRemainingMs: number;
  stealthRemainingMs: number;
  stealthRevealOnCast: boolean;

  constructor(
    id: string,
    pos: Vector2D,
    options: {
      mass?: number;
      radius?: number;
      linearDrag?: number;
      instabilityPct?: number;
      health?: number;
      maxHealth?: number;
      tags?: string[];
    } = {},
  ) {
    this.id = id;
    this.pos = pos;
    this.prevPos = pos.clone();
    this.vel = Vector2D.zero();
    this.accel = Vector2D.zero();
    this.mass = options.mass ?? 1;
    this.radius = options.radius ?? 16;
    this.linearDrag = options.linearDrag ?? 2;
    this.baseLinearDrag = this.linearDrag;
    this.isDead = false;
    this.instabilityPct = options.instabilityPct ?? 0;
    this.knockbackResistance = 0;
    this.maxHealth = options.maxHealth ?? 100;
    this.health = options.health ?? this.maxHealth;
    this.tags = new Set(options.tags ?? []);
    this.stasisRemainingMs = 0;
    this.stashedMomentum = Vector2D.zero();
    this.forceAccumulatorScale = 1.0;
    this.activeMorph = null;
    this.morphRemainingMs = 0;
    this.stealthRemainingMs = 0;
    this.stealthRevealOnCast = true;
  }

  get effectiveRadius(): number {
    return this.activeMorph?.radius ?? this.radius;
  }

  get effectiveMass(): number {
    return this.activeMorph?.mass ?? this.mass;
  }

  isStealthed(): boolean {
    return this.stealthRemainingMs > 0;
  }

  breakStealth(): void {
    this.stealthRemainingMs = 0;
  }

  resetMorphStealth(): void {
    this.activeMorph = null;
    this.morphRemainingMs = 0;
    this.stealthRemainingMs = 0;
    this.stealthRevealOnCast = true;
  }

  isInStasis(): boolean {
    return this.stasisRemainingMs > 0;
  }

  dischargeStasis(): void {
    if (this.stashedMomentum.magSq() > 0) {
      this.vel = this.stashedMomentum.clone();
    }
    this.stashedMomentum = Vector2D.zero();
    this.forceAccumulatorScale = 1.0;
  }

  resetStasis(): void {
    this.stasisRemainingMs = 0;
    this.stashedMomentum = Vector2D.zero();
    this.forceAccumulatorScale = 1.0;
  }

  isImmovable(): boolean {
    return false;
  }

  tickStatusTimers(dt: number): void {
    if (this.morphRemainingMs > 0) {
      this.morphRemainingMs = Math.max(0, this.morphRemainingMs - dt * 1000);
      if (this.morphRemainingMs <= 0) {
        this.activeMorph = null;
      }
    }
    if (this.stealthRemainingMs > 0) {
      this.stealthRemainingMs = Math.max(0, this.stealthRemainingMs - dt * 1000);
    }

    if (this.stasisRemainingMs > 0) {
      this.stasisRemainingMs = Math.max(0, this.stasisRemainingMs - dt * 1000);
      this.vel.set(0, 0);
      this.accel.set(0, 0);
      if (this.stasisRemainingMs <= 0) {
        this.dischargeStasis();
      }
    }
  }

  integrate(dt: number): void {
    this.tickStatusTimers(dt);
    if (this.stasisRemainingMs > 0) return;

    this.prevPos.copyFrom(this.pos);
    this.vel.addScaledMut(this.accel, dt);
    this.vel.scaleMut(Math.max(0, 1 - this.linearDrag * dt));
    this.pos.addScaledMut(this.vel, dt);
    this.accel.set(0, 0);
  }

  update(_dt: number): void {
    // Subclasses override for per-tick logic
  }
}
