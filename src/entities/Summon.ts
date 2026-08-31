import { Vector2D } from '../math/Vector2D';
import type { ActorConfig } from '../types/schema';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { Entity, generateEntityId } from './Entity';
import { Projectile } from './Projectile';

const TURRET_FIRE_INTERVAL_MS = 1000;
const TURRET_TRAJECTORY = { type: 'LINEAR' as const, speed: 400, maxRange: 500 };

export class Summon extends Entity {
  ownerId: string;
  config: ActorConfig;
  remainingDurationMs: number;
  fireCooldownMs: number;

  constructor(pos: Vector2D, config: ActorConfig, ownerId: string) {
    super(generateEntityId('summon'), pos, {
      radius: 15,
      mass: 50,
      health: config.health,
      maxHealth: config.health,
      tags: ['kinematic', 'summon'],
    });
    this.ownerId = ownerId;
    this.config = config;
    this.remainingDurationMs = config.durationMs;
    this.fireCooldownMs = 0;
  }

  override update(dt: number, world?: PhysicsWorld): void {
    this.remainingDurationMs = Math.max(0, this.remainingDurationMs - dt * 1000);
    if (this.remainingDurationMs <= 0 || this.health <= 0) {
      this.isDead = true;
      return;
    }

    if (this.config.archetype !== 'TURRET' || !world) return;

    this.fireCooldownMs = Math.max(0, this.fireCooldownMs - dt * 1000);
    if (this.fireCooldownMs > 0) return;

    const target = this.findNearestEnemy(world);
    if (!target) return;

    const dir = target.pos.sub(this.pos);
    if (dir.magSq() < 0.01) return;

    const aimAngle = Math.atan2(dir.y, dir.x);
    const projectile = new Projectile(
      this.pos.clone(),
      TURRET_TRAJECTORY,
      this.ownerId,
      aimAngle,
    );
    world.addProjectile(projectile);
    this.fireCooldownMs = TURRET_FIRE_INTERVAL_MS;
  }

  private findNearestEnemy(world: PhysicsWorld): Entity | null {
    let nearest: Entity | null = null;
    let nearestDistSq = Infinity;

    for (const combatant of world.getCombatants()) {
      if (combatant.id === this.ownerId) continue;
      if (combatant.isStealthed()) continue;
      if (combatant.isDead) continue;

      const distSq = this.pos.distSq(combatant.pos);
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = combatant;
      }
    }

    return nearest;
  }
}
