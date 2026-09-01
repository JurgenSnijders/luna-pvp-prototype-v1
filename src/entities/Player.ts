import { Vector2D } from '../math/Vector2D';
import type { AbilitySchema, InputProfile } from '../types/schema';
import type { ExecutionOverrides } from '../types/triggerContext';
import type { PassiveModifierPayload } from '../types/cards';
import { Entity, generateEntityId } from './Entity';

const SLOT_COUNT = 5;

type AbilitySlotTuple = [
  AbilitySchema | null,
  AbilitySchema | null,
  AbilitySchema | null,
  AbilitySchema | null,
  AbilitySchema | null,
];
type NumberSlotTuple = [number, number, number, number, number];
type BoolSlotTuple = [boolean, boolean, boolean, boolean, boolean];

export interface SlotInputState {
  isHeld: boolean;
  chargeMs: number;
  channelTimerMs: number;
  comboStep: number;
  idleMs: number;
  channelArmed: boolean;
  charging: boolean;
}

export interface SlotResourceState {
  heat: number;
  isOverheated: boolean;
  currentAmmo: number;
  isReloading: boolean;
  lockoutTimerMs: number;
  lockoutTotalMs: number;
}

export type SlotCastCallback = (
  slotIndex: number,
  overrides: ExecutionOverrides,
  isChannelTick: boolean,
) => void;

function createDefaultSlotInput(): SlotInputState {
  return {
    isHeld: false,
    chargeMs: 0,
    channelTimerMs: 0,
    comboStep: 0,
    idleMs: 0,
    channelArmed: false,
    charging: false,
  };
}

function createDefaultSlotResource(): SlotResourceState {
  return {
    heat: 0,
    isOverheated: false,
    currentAmmo: 0,
    isReloading: false,
    lockoutTimerMs: 0,
    lockoutTotalMs: 0,
  };
}

function getInputProfile(ability: AbilitySchema): InputProfile {
  return ability.inputProfile ?? { mode: 'INSTANT' };
}

export class Player extends Entity {
  /** DevTools-configurable pacing knobs, shared across all Player instances (player + bot). */
  static globalCooldownScale = 1.5;
  static globalCooldownDurationMs = 350;

  moveSpeed: number;
  baseMoveSpeed: number;
  baseAcceleration: number;
  friction: number;
  facingAngle: number;
  abilities: AbilitySlotTuple;
  cooldownTimersMs: NumberSlotTuple;
  slotCooldownTotalsMs: NumberSlotTuple;
  passives: PassiveModifierPayload[];
  cooldownReductionPct: number;
  /** Mandatory casting lockout shared across all slots, started on every successful cast. */
  globalCooldownTimerMs: number;

  inputMove: Vector2D;
  aimTarget: Vector2D;
  slotCastFlags: BoolSlotTuple;
  /** Phase 2 lazy compilation: true while a slot's AbilitySchema is being synthesized in the background. */
  slotCompiling: BoolSlotTuple;
  slotInputs: SlotInputState[];
  slotResources: SlotResourceState[];

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
    this.abilities = [null, null, null, null, null];
    this.cooldownTimersMs = [0, 0, 0, 0, 0];
    this.slotCooldownTotalsMs = [0, 0, 0, 0, 0];
    this.passives = [];
    this.cooldownReductionPct = 0;
    this.globalCooldownTimerMs = 0;
    this.inputMove = Vector2D.zero();
    this.aimTarget = pos.add(Vector2D.fromAngle(0, 100));
    this.slotCastFlags = [false, false, false, false, false];
    this.slotCompiling = [false, false, false, false, false];
    this.slotInputs = Array.from({ length: SLOT_COUNT }, () => createDefaultSlotInput());
    this.slotResources = Array.from({ length: SLOT_COUNT }, () => createDefaultSlotResource());
  }

  initSlotResourceState(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return;

    const ability = this.abilities[slotIndex];
    const res = createDefaultSlotResource();

    if (ability?.resourceCost?.type === 'AMMO') {
      res.currentAmmo = ability.resourceCost.maxCapacity ?? 6;
    }

    this.slotResources[slotIndex] = res;
  }

  setAbility(slotIndex: number, ability: AbilitySchema | null): void {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return;
    this.abilities[slotIndex] = ability;
    this.cooldownTimersMs[slotIndex] = 0;
    this.slotCooldownTotalsMs[slotIndex] = 0;
    this.initSlotResourceState(slotIndex);
  }

  getAbility(slotIndex: number): AbilitySchema | null {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return null;
    return this.abilities[slotIndex];
  }

  isSlotReady(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return false;
    if (this.slotCompiling[slotIndex]) return false;

    const ability = this.abilities[slotIndex];
    if (!ability) return false;
    if (this.globalCooldownTimerMs > 0) return false;

    const resourceCost = ability.resourceCost;
    const res = this.slotResources[slotIndex];

    if (resourceCost?.type === 'HEAT') {
      return !res.isOverheated;
    }

    if (resourceCost?.type === 'AMMO') {
      return !res.isReloading && res.currentAmmo >= resourceCost.cost;
    }

    if (resourceCost?.type === 'HEALTH_PCT') {
      const threshold = (this.maxHealth * resourceCost.cost) / 100;
      return this.health > threshold && this.cooldownTimersMs[slotIndex] <= 0;
    }

    return this.cooldownTimersMs[slotIndex] <= 0;
  }

  setSlotCompiling(slotIndex: number, compiling: boolean): void {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return;
    this.slotCompiling[slotIndex] = compiling;
  }

  isSlotCompiling(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return false;
    return this.slotCompiling[slotIndex];
  }

  triggerSlotCooldown(slotIndex: number, ignoreGCD = false): void {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return;
    const ability = this.abilities[slotIndex];
    if (!ability) return;

    const resourceCost = ability.resourceCost;
    const res = this.slotResources[slotIndex];

    if (resourceCost?.type === 'HEAT') {
      res.heat += resourceCost.cost;
      if (res.heat >= 100) {
        res.heat = 100;
        res.isOverheated = true;
        const lockout = resourceCost.lockoutDurationMs ?? 3000;
        res.lockoutTimerMs = lockout;
        res.lockoutTotalMs = lockout;
      }
    } else if (resourceCost?.type === 'AMMO') {
      res.currentAmmo -= resourceCost.cost;
      if (res.currentAmmo <= 0) {
        res.currentAmmo = 0;
        res.isReloading = true;
        const lockout = resourceCost.lockoutDurationMs ?? ability.cooldownMs ?? 2000;
        res.lockoutTimerMs = lockout;
        res.lockoutTotalMs = lockout;
      }
    } else if (resourceCost?.type === 'HEALTH_PCT') {
      const healthCost = (this.maxHealth * resourceCost.cost) / 100;
      this.health = Math.max(0, this.health - healthCost);
      const effective = this.getEffectiveCooldown(ability.cooldownMs);
      this.cooldownTimersMs[slotIndex] = effective;
      this.slotCooldownTotalsMs[slotIndex] = effective;
    } else {
      const effective = this.getEffectiveCooldown(ability.cooldownMs);
      this.cooldownTimersMs[slotIndex] = effective;
      this.slotCooldownTotalsMs[slotIndex] = effective;
    }

    if (!ignoreGCD) {
      this.globalCooldownTimerMs = Player.globalCooldownDurationMs;
    }
  }

  setSlotInput(
    slotIndex: number,
    isHeld: boolean,
    onCast: SlotCastCallback,
  ): void {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return;

    const slot = this.slotInputs[slotIndex];
    if (isHeld === slot.isHeld) return;

    const ability = this.abilities[slotIndex];
    if (!ability || this.slotCompiling[slotIndex]) return;

    slot.isHeld = isHeld;
    const profile = getInputProfile(ability);

    if (isHeld) {
      switch (profile.mode) {
        case 'INSTANT':
          if (this.isSlotReady(slotIndex)) {
            onCast(slotIndex, {}, false);
          }
          break;
        case 'COMBO_CHAIN':
          if (this.isSlotReady(slotIndex) || slot.comboStep > 0) {
            onCast(slotIndex, { comboStep: slot.comboStep }, false);
            slot.comboStep++;
            slot.idleMs = 0;
          }
          break;
        case 'CHARGE_AND_RELEASE':
          if (this.isSlotReady(slotIndex)) {
            if (this.isStealthed() && this.stealthRevealOnCast) {
              this.breakStealth();
            }
            slot.charging = true;
            slot.chargeMs = 0;
          }
          break;
        case 'CHANNELED':
          if (this.isSlotReady(slotIndex)) {
            slot.channelArmed = true;
            slot.channelTimerMs = 0;
          }
          break;
      }
    } else {
      switch (profile.mode) {
        case 'CHARGE_AND_RELEASE': {
          if (slot.charging) {
            const minCharge = profile.minChargeMs ?? 0;
            const maxCharge = profile.maxChargeMs ?? 1000;
            if (slot.chargeMs >= minCharge) {
              const ratio = Math.min(1, slot.chargeMs / maxCharge);
              onCast(slotIndex, { chargeRatio: ratio }, false);
            }
            slot.chargeMs = 0;
            slot.charging = false;
          }
          break;
        }
        case 'CHANNELED':
          slot.channelTimerMs = 0;
          slot.channelArmed = false;
          break;
      }
    }
  }

  updateSlotInputs(dt: number, onCast: SlotCastCallback): void {
    const dtMs = dt * 1000;

    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = this.slotInputs[i];
      const ability = this.abilities[i];
      if (!ability) continue;

      const profile = getInputProfile(ability);

      if (profile.mode === 'COMBO_CHAIN' && slot.comboStep > 0) {
        slot.idleMs += dtMs;
        const windowMs = profile.comboWindowMs ?? 1500;
        if (slot.idleMs > windowMs) {
          slot.comboStep = 0;
          slot.idleMs = 0;
        }
      }

      if (slot.isHeld && profile.mode === 'CHARGE_AND_RELEASE' && slot.charging) {
        slot.chargeMs += dtMs;
      }

      if (slot.isHeld && profile.mode === 'CHANNELED' && slot.channelArmed) {
        slot.channelTimerMs += dtMs;
        const intervalMs = profile.channelIntervalMs ?? 100;
        if (slot.channelTimerMs >= intervalMs) {
          onCast(i, {}, true);
          slot.channelTimerMs = 0;
        }
      }
    }
  }

  resetSlotInputs(): void {
    for (let i = 0; i < SLOT_COUNT; i++) {
      this.slotInputs[i] = createDefaultSlotInput();
    }
  }

  getGlobalCooldownRatio(): number {
    if (Player.globalCooldownDurationMs <= 0) return 0;
    return Math.max(0, Math.min(1, this.globalCooldownTimerMs / Player.globalCooldownDurationMs));
  }

  getSlotCooldownRatio(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return 0;
    const total = this.slotCooldownTotalsMs[slotIndex];
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, this.cooldownTimersMs[slotIndex] / total));
  }

  getSlotCooldownRemainingMs(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return 0;
    return Math.max(0, this.cooldownTimersMs[slotIndex]);
  }

  getSlotHeatRatio(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return 0;
    return Math.max(0, Math.min(1, this.slotResources[slotIndex].heat / 100));
  }

  getSlotAmmoCount(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return 0;
    return this.slotResources[slotIndex].currentAmmo;
  }

  getSlotAmmoCapacity(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return 0;
    const ability = this.abilities[slotIndex];
    return ability?.resourceCost?.maxCapacity ?? 6;
  }

  getSlotLockoutRatio(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return 0;
    const res = this.slotResources[slotIndex];
    if (res.lockoutTotalMs <= 0) return 0;
    return Math.max(0, Math.min(1, res.lockoutTimerMs / res.lockoutTotalMs));
  }

  isSlotOverheated(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return false;
    return this.slotResources[slotIndex].isOverheated;
  }

  isSlotReloading(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return false;
    return this.slotResources[slotIndex].isReloading;
  }

  getSlotLockoutRemainingMs(slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return 0;
    return Math.max(0, this.slotResources[slotIndex].lockoutTimerMs);
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
    const scaled = baseMs * Player.globalCooldownScale;
    return Math.max(100, Math.round(scaled * (1 - this.cooldownReductionPct / 100)));
  }

  override update(dt: number): void {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (this.cooldownTimersMs[i] > 0) {
        this.cooldownTimersMs[i] = Math.max(0, this.cooldownTimersMs[i] - dt * 1000);
      }
    }
    if (this.globalCooldownTimerMs > 0) {
      this.globalCooldownTimerMs = Math.max(0, this.globalCooldownTimerMs - dt * 1000);
    }

    for (let i = 0; i < SLOT_COUNT; i++) {
      const ability = this.abilities[i];
      const resourceCost = ability?.resourceCost;
      if (!resourceCost) continue;

      const res = this.slotResources[i];

      if (resourceCost.type === 'HEAT') {
        if (res.isOverheated) {
          res.lockoutTimerMs = Math.max(0, res.lockoutTimerMs - dt * 1000);
          if (res.lockoutTimerMs <= 0) {
            res.isOverheated = false;
            res.heat = 0;
            res.lockoutTotalMs = 0;
          }
        } else {
          const rate = resourceCost.rechargeRate ?? 25;
          res.heat = Math.max(0, res.heat - rate * dt);
        }
      } else if (resourceCost.type === 'AMMO' && res.isReloading) {
        res.lockoutTimerMs = Math.max(0, res.lockoutTimerMs - dt * 1000);
        if (res.lockoutTimerMs <= 0) {
          res.isReloading = false;
          res.currentAmmo = resourceCost.maxCapacity ?? 6;
          res.lockoutTotalMs = 0;
        }
      }
    }

    const moveDir = this.inputMove.magSq() > 0 ? this.inputMove.normalize() : Vector2D.zero();
    const speedMultiplier = this.activeMorph?.speedMultiplier ?? 1;
    const targetVel = moveDir.scale(this.moveSpeed * speedMultiplier);
    const velDiff = targetVel.sub(this.vel);
    const accelMag = this.baseAcceleration * dt;
    const accel =
      velDiff.mag() > accelMag
        ? velDiff.normalize().scale(accelMag / dt)
        : velDiff.scale(1 / dt);

    if (moveDir.magSq() === 0) {
      this.accel = this.accel.add(this.vel.scale(-this.friction));
    } else {
      this.accel = this.accel.add(accel);
    }

    const aimDir = this.aimTarget.sub(this.pos);
    if (aimDir.magSq() > 0.01) {
      this.facingAngle = Math.atan2(aimDir.y, aimDir.x);
    }
  }

  clearCastInputs(): void {
    this.slotCastFlags = [false, false, false, false, false];
  }

  takeDamage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  resetCombatState(): void {
    this.isDead = false;
    this.instabilityPct = 0;
    this.health = this.maxHealth;
    this.vel = Vector2D.zero();
    this.accel = Vector2D.zero();
    this.cooldownTimersMs = [0, 0, 0, 0, 0];
    this.slotCooldownTotalsMs = [0, 0, 0, 0, 0];
    this.slotCompiling = [false, false, false, false, false];
    this.globalCooldownTimerMs = 0;
    this.clearCastInputs();
    this.resetSlotInputs();
    this.resetStasis();
    this.resetMorphStealth();
    for (let i = 0; i < SLOT_COUNT; i++) {
      this.initSlotResourceState(i);
    }
  }

  resetPosition(spawn: Vector2D): void {
    this.pos = spawn.clone();
    this.prevPos = spawn.clone();
  }
}
