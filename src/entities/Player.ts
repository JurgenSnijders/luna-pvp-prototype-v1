import { Vector2D } from '../math/Vector2D';
import type { AbilitySchema } from '../types/schema';
import type { PassiveModifierPayload } from '../types/cards';
import { Entity, generateEntityId } from './Entity';

export class Player extends Entity {
  moveSpeed: number;
  baseMoveSpeed: number;
  baseAcceleration: number;
  friction: number;
  facingAngle: number;
  primaryAbility: AbilitySchema | null;
  secondaryAbility: AbilitySchema | null;
  primaryCooldownTimerMs: number;
  secondaryCooldownTimerMs: number;
  passives: PassiveModifierPayload[];
  cooldownReductionPct: number;

  inputMove: Vector2D;
  aimTarget: Vector2D;
  primaryCast: boolean;
  secondaryCast: boolean;

  constructor(pos: Vector2D, tags: string[] = ['player', 'combatant']) {
    super(generateEntityId('player'), pos, {
      mass: 1,
      radius: 18,
      linearDrag: 3,
      instabilityPct: 0,
      tags,
    });
    this.moveSpeed = 280;
    this.baseMoveSpeed = 280;
    this.baseAcceleration = 1200;
    this.friction = 8;
    this.facingAngle = 0;
    this.primaryAbility = null;
    this.secondaryAbility = null;
    this.primaryCooldownTimerMs = 0;
    this.secondaryCooldownTimerMs = 0;
    this.passives = [];
    this.cooldownReductionPct = 0;
    this.inputMove = Vector2D.zero();
    this.aimTarget = pos.add(Vector2D.fromAngle(0, 100));
    this.primaryCast = false;
    this.secondaryCast = false;
  }

  applyPassiveModifier(mod: PassiveModifierPayload): void {
    this.passives.push(mod);

    switch (mod.stat) {
      case 'MOVE_SPEED':
        if (mod.op === 'ADD') this.moveSpeed += mod.value;
        else this.moveSpeed *= mod.value;
        this.moveSpeed = Math.max(100, Math.min(700, this.moveSpeed));
        break;
      case 'ACCELERATION':
        if (mod.op === 'ADD') this.baseAcceleration += mod.value;
        else this.baseAcceleration *= mod.value;
        this.baseAcceleration = Math.max(400, Math.min(3000, this.baseAcceleration));
        break;
      case 'LINEAR_DRAG':
        if (mod.op === 'ADD') {
          this.baseLinearDrag += mod.value;
          this.linearDrag = this.baseLinearDrag;
        } else {
          this.baseLinearDrag *= mod.value;
          this.linearDrag = this.baseLinearDrag;
        }
        this.baseLinearDrag = Math.max(0.2, Math.min(3.0, this.baseLinearDrag));
        this.linearDrag = this.baseLinearDrag;
        break;
      case 'MASS':
        if (mod.op === 'ADD') this.mass += mod.value;
        else this.mass *= mod.value;
        this.mass = Math.max(0.4, Math.min(3.0, this.mass));
        break;
      case 'KNOCKBACK_RESISTANCE':
        if (mod.op === 'ADD') this.knockbackResistance += mod.value;
        else this.knockbackResistance *= mod.value;
        this.knockbackResistance = Math.max(0, Math.min(0.75, this.knockbackResistance));
        break;
      case 'COOLDOWN_REDUCTION_PCT':
        if (mod.op === 'ADD') this.cooldownReductionPct += mod.value;
        else this.cooldownReductionPct *= mod.value;
        this.cooldownReductionPct = Math.max(0, Math.min(50, this.cooldownReductionPct));
        break;
    }
  }

  getEffectiveCooldown(baseMs: number): number {
    return baseMs * (1 - this.cooldownReductionPct / 100);
  }

  override update(dt: number): void {
    if (this.primaryCooldownTimerMs > 0) {
      this.primaryCooldownTimerMs = Math.max(0, this.primaryCooldownTimerMs - dt * 1000);
    }
    if (this.secondaryCooldownTimerMs > 0) {
      this.secondaryCooldownTimerMs = Math.max(0, this.secondaryCooldownTimerMs - dt * 1000);
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

  resetCombatState(): void {
    this.isDead = false;
    this.instabilityPct = 0;
    this.vel = Vector2D.zero();
    this.accel = Vector2D.zero();
    this.primaryCooldownTimerMs = 0;
    this.secondaryCooldownTimerMs = 0;
    this.clearCastInputs();
  }

  resetPosition(spawn: Vector2D): void {
    this.pos = spawn.clone();
    this.prevPos = spawn.clone();
  }
}
