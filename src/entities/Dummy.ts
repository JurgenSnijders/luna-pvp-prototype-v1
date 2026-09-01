import { Vector2D } from '../math/Vector2D';
import { Entity, generateEntityId } from './Entity';
import type { Player } from './Player';

export class Dummy extends Entity {
  isAiActive: boolean;
  moveSpeed: number;
  /** Set by PhysicsWorld before update when AI is active. */
  chaseVector: Vector2D;

  constructor(pos: Vector2D, options: { instabilityPct?: number; mass?: number } = {}) {
    super(generateEntityId('dummy'), pos, {
      mass: options.mass ?? 1,
      radius: 18,
      linearDrag: 3,
      instabilityPct: options.instabilityPct ?? 0,
      tags: ['dummy', 'combatant'],
    });
    this.isAiActive = false;
    this.moveSpeed = 120;
    this.chaseVector = Vector2D.zero();
  }

  /** Returns a normalized chase vector toward the nearest player, or zero. */
  getChaseVector(players: Player[]): Vector2D {
    if (!this.isAiActive || players.length === 0) {
      return Vector2D.zero();
    }

    let nearest: Player | null = null;
    let nearestDistSq = Infinity;

    for (const player of players) {
      if (player.isDead) continue;
      const distSq = this.pos.distSq(player.pos);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = player;
      }
    }

    if (!nearest) return Vector2D.zero();

    const dir = nearest.pos.sub(this.pos);
    return dir.magSq() > 0 ? dir.normalize() : Vector2D.zero();
  }

  override update(dt: number): void {
    if (this.chaseVector.magSq() === 0) return;

    const targetVel = this.chaseVector.scale(this.moveSpeed);
    const velDiff = targetVel.sub(this.vel);
    const accelMag = 600 * dt;
    const steeringAccel =
      velDiff.mag() > accelMag
        ? velDiff.normalize().scale(accelMag / dt)
        : velDiff.scale(1 / dt);
    this.accel = this.accel.add(steeringAccel);
  }
}
