import { Vector2D } from '../math/Vector2D';
import type { AbilitySchema } from '../types/schema';
import { Entity, generateEntityId } from './Entity';

export class Player extends Entity {
  moveSpeed: number;
  baseAcceleration: number;
  friction: number;
  facingAngle: number;
  primaryAbility: AbilitySchema | null;
  secondaryAbility: AbilitySchema | null;
  cooldownTimerMs: number;

  inputMove: Vector2D;
  aimTarget: Vector2D;
  primaryCast: boolean;
  secondaryCast: boolean;

  constructor(pos: Vector2D) {
    super(generateEntityId('player'), pos, {
      mass: 1,
      radius: 18,
      linearDrag: 3,
      instabilityPct: 0,
      tags: ['player', 'combatant'],
    });
    this.moveSpeed = 280;
    this.baseAcceleration = 1200;
    this.friction = 8;
    this.facingAngle = 0;
    this.primaryAbility = null;
    this.secondaryAbility = null;
    this.cooldownTimerMs = 0;
    this.inputMove = Vector2D.zero();
    this.aimTarget = pos.add(Vector2D.fromAngle(0, 100));
    this.primaryCast = false;
    this.secondaryCast = false;
  }

  override update(dt: number): void {
    if (this.cooldownTimerMs > 0) {
      this.cooldownTimerMs = Math.max(0, this.cooldownTimerMs - dt * 1000);
    }

    const moveDir = this.inputMove.magSq() > 0 ? this.inputMove.normalize() : Vector2D.zero();
    const targetVel = moveDir.scale(this.moveSpeed);
    const velDiff = targetVel.sub(this.vel);
    const accelMag = this.baseAcceleration * dt;
    const accel =
      velDiff.mag() > accelMag
        ? velDiff.normalize().scale(accelMag / dt)
        : velDiff.scale(1 / dt);

    if (moveDir.magSq() === 0) {
      this.accel = this.vel.scale(-this.friction);
    } else {
      this.accel = accel;
    }

    const aimDir = this.aimTarget.sub(this.pos);
    if (aimDir.magSq() > 0.01) {
      this.facingAngle = Math.atan2(aimDir.y, aimDir.x);
    }
  }

  clearCastInputs(): void {
    this.primaryCast = false;
    this.secondaryCast = false;
  }
}
