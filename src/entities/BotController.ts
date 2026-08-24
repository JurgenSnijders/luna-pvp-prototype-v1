import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { ArenaShrink } from '../game/ArenaShrink';
import {
  getClosestEdgeNormal,
  getDistanceToNearestEdge,
  isInsideHex,
} from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import type { Interpreter } from '../primitives/Interpreter';
import type { DraftCard, DraftSelection } from '../types/cards';
import type { AbilitySchema } from '../types/schema';
import type { Player } from './Player';

const W_PURSUIT = 1.0;
const W_HAZARD = 3.5;
const W_DODGE = 2.0;
const PURSUE_DIST = 350;
const KITE_DIST = 180;
const EDGE_REPEL_DIST = 120;
const DODGE_RADIUS = 200;
const AIM_TOLERANCE_DEG = 15;
const OFFENSIVE_SLOTS = [0, 1, 2, 3];
const MOBILITY_SLOT = 4;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function hasImpulseAction(ability: AbilitySchema | null | undefined): boolean {
  if (!ability) return false;
  for (const node of ability.triggers) {
    for (const action of node.actions) {
      if (action.type === 'APPLY_IMPULSE') return true;
    }
  }
  return false;
}

function hasTeleportAction(ability: AbilitySchema | null | undefined): boolean {
  if (!ability) return false;
  for (const node of ability.triggers) {
    for (const action of node.actions) {
      if (action.type === 'TELEPORT') return true;
    }
  }
  return false;
}

export class BotController {
  enabled = true;
  difficulty = 1.0;

  constructor(private bot: Player) {}

  update(
    dt: number,
    target: Player,
    world: PhysicsWorld,
    arena: ArenaShrink,
    interpreter: Interpreter,
  ): void {
    void dt;
    if (!this.enabled || this.bot.isDead || target.isDead) return;

    const diff = this.difficulty;
    const toTarget = target.pos.sub(this.bot.pos);
    const dist = toTarget.mag();

    let pursuit = Vector2D.zero();
    if (dist > PURSUE_DIST) {
      pursuit = toTarget.normalize();
    } else if (dist < KITE_DIST && dist > 0.01) {
      pursuit = toTarget.normalize().scale(-1);
    }

    let hazard = Vector2D.zero();
    const edgeDist = getDistanceToNearestEdge(
      this.bot.pos,
      world.hexCenter,
      arena.currentRadius,
    );
    if (edgeDist < EDGE_REPEL_DIST) {
      const normal = getClosestEdgeNormal(
        this.bot.pos,
        world.hexCenter,
        arena.currentRadius,
      );
      const strength = (EDGE_REPEL_DIST - edgeDist) / EDGE_REPEL_DIST;
      hazard = normal.scale(-strength);
    }

    let dodge = Vector2D.zero();
    for (const proj of world.projectiles) {
      if (proj.isDead || proj.sourceEntityId === this.bot.id) continue;
      const toBot = this.bot.pos.sub(proj.pos);
      if (toBot.mag() > DODGE_RADIUS) continue;
      const relVel = proj.vel;
      if (relVel.dot(toBot) <= 0) continue;

      const perp = new Vector2D(-proj.vel.y, proj.vel.x).normalize();
      const side = perp.dot(toBot) >= 0 ? perp : perp.scale(-1);
      dodge = dodge.add(side);
    }

    const steering = pursuit
      .scale(W_PURSUIT)
      .add(hazard.scale(W_HAZARD))
      .add(dodge.scale(W_DODGE))
      .scale(diff);

    if (steering.magSq() > 0.01) {
      const move = steering.normalize();
      this.bot.inputMove = new Vector2D(
        clamp(move.x, -1, 1),
        clamp(move.y, -1, 1),
      );
    } else {
      this.bot.inputMove = Vector2D.zero();
    }

    const projSpeed = this.bot.getAbility(0)?.trajectory?.speed ?? 400;
    const tFlight = dist / projSpeed;
    const intercept = target.pos.add(target.vel.scale(tFlight));
    this.bot.aimTarget = intercept;
    this.bot.facingAngle = Math.atan2(
      intercept.y - this.bot.pos.y,
      intercept.x - this.bot.pos.x,
    );

    const aimAngle = Math.atan2(
      intercept.y - this.bot.pos.y,
      intercept.x - this.bot.pos.x,
    );

    const outsideHex = !isInsideHex(
      this.bot.pos,
      world.hexCenter,
      arena.currentRadius,
    );

    if (
      (this.bot.instabilityPct > 80 ||
        this.bot.tags.has('in_lava') ||
        outsideHex) &&
      this.bot.isSlotReady(MOBILITY_SLOT)
    ) {
      this.tryCastSlot(this.bot, MOBILITY_SLOT, interpreter, world);
    } else if (
      angleDiff(this.bot.facingAngle, aimAngle) < (AIM_TOLERANCE_DEG * Math.PI) / 180
    ) {
      for (const slotIndex of OFFENSIVE_SLOTS) {
        if (this.bot.isSlotReady(slotIndex)) {
          this.tryCastSlot(this.bot, slotIndex, interpreter, world);
          break;
        }
      }
    }
  }

  selectDraftCard(cards: DraftCard[]): DraftSelection {
    let best = cards[0];
    let bestScore = -Infinity;

    for (const card of cards) {
      let score = 0;
      if (card.type === 'PASSIVE_UPGRADE' && card.passivePayload) {
        for (const mod of card.passivePayload) {
          if (mod.stat === 'MOVE_SPEED') score += 30;
          if (mod.stat === 'KNOCKBACK_RESISTANCE') score += 15;
        }
      }
      if (card.type === 'ACTIVE_ABILITY' && card.abilityPayload) {
        if (card.abilityPayload.recoilKick >= 200) score += 20;
        if (hasImpulseAction(card.abilityPayload)) score += 20;
      }
      score += card.budgetCost * 0.01;

      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }

    let slot: DraftSelection['slot'] = 'PASSIVE';
    if (best.type === 'ACTIVE_ABILITY' && best.abilityPayload) {
      const ability = best.abilityPayload;
      const isMobility =
        ability.recoilKick >= 200 ||
        hasImpulseAction(ability) ||
        hasTeleportAction(ability);

      if (isMobility) {
        slot = 'SPACE';
      } else {
        let targetSlot = 0;
        let bestCd = -1;
        for (const i of OFFENSIVE_SLOTS) {
          const existing = this.bot.getAbility(i);
          const cd = existing?.cooldownMs ?? 0;
          if (existing === null) {
            targetSlot = i;
            bestCd = Infinity;
            break;
          }
          if (cd > bestCd) {
            bestCd = cd;
            targetSlot = i;
          }
        }
        slot = (['LMB', 'RMB', 'Q', 'E'] as const)[targetSlot];
      }
    }

    return { card: best, slot };
  }

  private tryCastSlot(
    bot: Player,
    slotIndex: number,
    interpreter: Interpreter,
    world: PhysicsWorld,
  ): void {
    const ability = bot.getAbility(slotIndex);
    if (!ability || !bot.isSlotReady(slotIndex)) return;

    const aimDir = bot.aimTarget.sub(bot.pos);
    if (aimDir.magSq() < 0.01) return;

    interpreter.executeAbility(ability, bot, aimDir, world);
    bot.triggerSlotCooldown(slotIndex);
  }
}
