import { Vector2D } from '../math/Vector2D';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { MorphConfig, SpellArchetype } from '../types/schema';

let nextEntityId = 1;

export interface StatusEffect {
  durationMs: number;
  stacks: number;
}

const MAX_STATUS_STACKS = 5;

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
  quadraticDrag: number;
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
  activeStatuses: Map<SpellArchetype, StatusEffect>;
  friction: number;
  chronoSnapshot?: { pos: Vector2D; vel: Vector2D };
  arcaneBuffer?: Vector2D;
  voidDistanceAcc: number;

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
    this.quadraticDrag = 0;
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
    this.activeStatuses = new Map();
    this.friction = 0;
    this.voidDistanceAcc = 0;
  }

  get effectiveRadius(): number {
    return this.activeMorph?.radius ?? this.radius;
  }

  getEffectiveMass(): number {
    let mass = this.activeMorph?.mass ?? this.mass;
    if (this.activeStatuses.has('EARTH')) mass *= 3.0;
    if (this.activeStatuses.has('TOXIC')) {
      const status = this.activeStatuses.get('TOXIC')!;
      const pct = Math.min(1, status.durationMs / 4000);
      mass *= Math.max(0.3, pct);
    }
    return mass;
  }

  get effectiveMass(): number {
    return this.getEffectiveMass();
  }

  getEffectiveLinearDrag(): number {
    let drag = this.linearDrag;
    if (this.activeStatuses.has('EARTH')) drag *= 2.0;
    if (this.activeStatuses.has('FROST')) drag *= 0.1;
    if (this.activeStatuses.has('AERO')) drag *= 0.5;
    return drag;
  }

  getEffectiveFriction(): number {
    let friction = this.friction;
    if (this.activeStatuses.has('FROST')) friction *= 0.1;
    if (this.activeStatuses.has('AERO')) friction = 0;
    return friction;
  }

  getEffectiveBounciness(): number {
    return this.activeStatuses.has('SONIC') ? 1.5 : 1.0;
  }

  addInstability(amount: number, world?: PhysicsWorld): void {
    const old = this.instabilityPct;
    const next = Math.min(500, Math.max(0, old + amount));
    this.instabilityPct = next;

    if (old < 100 && next >= 100 && this.activeStatuses.has('PLASMA') && world) {
      this.triggerPlasmaDetonation(world);
    }
  }

  private triggerPlasmaDetonation(world: PhysicsWorld): void {
    world.spawnPlasmaDetonation(this.pos.clone(), this.id);
    this.instabilityPct = 0;
    this.activeStatuses.delete('PLASMA');
    this.chronoSnapshot = undefined;
  }

  applyKineticImpulse(deltaVel: Vector2D, _world?: PhysicsWorld): void {
    if (this.stasisRemainingMs > 0) {
      this.stashedMomentum = this.stashedMomentum.add(
        deltaVel.scale(this.forceAccumulatorScale),
      );
      return;
    }

    let impulse = deltaVel;
    if (this.activeStatuses.has('CHAOS')) {
      impulse = impulse.rotate((Math.random() - 0.5) * Math.PI);
    }

    if (this.activeStatuses.has('ARCANE')) {
      this.arcaneBuffer = (this.arcaneBuffer ?? Vector2D.zero()).add(impulse.scale(-1));
      return;
    }

    this.vel.addMut(impulse);
  }

  onStatusApplied(archetype: SpellArchetype, _world?: PhysicsWorld): void {
    if (archetype === 'CHRONO') {
      this.chronoSnapshot = { pos: this.pos.clone(), vel: this.vel.clone() };
    }
  }

  onStatusExpired(archetype: SpellArchetype, _world?: PhysicsWorld): void {
    if (archetype === 'CHRONO' && this.chronoSnapshot) {
      this.pos.copyFrom(this.chronoSnapshot.pos);
      this.vel.copyFrom(this.chronoSnapshot.vel);
      this.chronoSnapshot = undefined;
    }
    if (archetype === 'ARCANE' && this.arcaneBuffer) {
      this.vel.addMut(this.arcaneBuffer);
      this.arcaneBuffer = undefined;
    }
  }

  applyStatus(
    archetype: SpellArchetype,
    durationMs: number,
    stacks = 1,
    world?: PhysicsWorld,
  ): void {
    const isNew = !this.activeStatuses.has(archetype);
    const existing = this.activeStatuses.get(archetype);
    if (existing) {
      existing.durationMs = Math.max(existing.durationMs, durationMs);
      existing.stacks = Math.min(MAX_STATUS_STACKS, existing.stacks + stacks);
    } else {
      this.activeStatuses.set(archetype, { durationMs, stacks });
    }
    if (isNew) {
      this.onStatusApplied(archetype, world);
    }
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

  tickStatusTimers(dt: number, world?: PhysicsWorld): void {
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

    const expired: SpellArchetype[] = [];
    for (const [archetype, effect] of this.activeStatuses) {
      effect.durationMs -= dt * 1000;
      if (effect.durationMs <= 0) {
        expired.push(archetype);
      }
    }
    for (const archetype of expired) {
      this.onStatusExpired(archetype, world);
      this.activeStatuses.delete(archetype);
    }
  }

  integrate(dt: number, world?: PhysicsWorld): void {
    this.tickStatusTimers(dt, world);
    if (this.stasisRemainingMs > 0) return;

    this.prevPos.copyFrom(this.pos);
    this.vel.addScaledMut(this.accel, dt);
    const preDragSpeed = this.vel.mag();
    const dragCoeff = this.getEffectiveLinearDrag() + this.quadraticDrag * preDragSpeed;
    if (dragCoeff > 0) {
      this.vel.scaleMut(Math.exp(-dragCoeff * dt));
    }
    this.pos.addScaledMut(this.vel, dt);

    const speed = this.vel.mag();
    if (this.activeStatuses.has('FIRE') && speed > 50) {
      this.addInstability((speed * dt) / 50, world);
    }
    if (this.activeStatuses.has('VOID') && world) {
      this.voidDistanceAcc += speed * dt;
      if (this.voidDistanceAcc >= 150) {
        this.voidDistanceAcc = 0;
        world.spawnVoidTrail(this.pos.clone(), this.id);
      }
    }

    this.accel.set(0, 0);
  }

  update(_dt: number): void {
    // Subclasses override for per-tick logic
  }
}
