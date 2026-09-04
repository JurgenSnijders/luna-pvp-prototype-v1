import { Vector2D } from '../math/Vector2D';
import type { ActorConfig, SpellArchetype, TriggerNode, VisualDescriptor } from '../types/schema';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { isAlliedTo } from '../engine/allegiance';
import { buildTriggerMap } from '../primitives/interpreter/helpers';
import { Entity, generateEntityId } from './Entity';
import { Projectile } from './Projectile';

const TURRET_FIRE_INTERVAL_MS = 1000;
const TURRET_TRAJECTORY = { type: 'LINEAR' as const, speed: 400, maxRange: 500 };

export interface SummonSpawnOptions {
  depth?: number;
  spellArchetype?: SpellArchetype;
  abilityName?: string;
  visuals?: VisualDescriptor | null;
}

export class Summon extends Entity {
  ownerId: string;
  config: ActorConfig;
  remainingDurationMs: number;
  fireCooldownMs: number;
  triggerMap: Map<string, TriggerNode[]>;
  tickAccumulatorsMs: Map<number, number>;
  depth: number;
  visuals: VisualDescriptor | null;
  spellArchetype?: SpellArchetype;
  abilityName: string;
  facingAngle: number;

  constructor(
    pos: Vector2D,
    config: ActorConfig,
    ownerId: string,
    options: SummonSpawnOptions = {},
  ) {
    const anchored = config.anchored !== false;
    const radius = config.radius ?? 15;
    const mass = config.mass ?? 50;
    const tags = anchored ? ['kinematic', 'summon'] : ['summon', 'combatant'];

    super(generateEntityId('summon'), pos, {
      radius,
      mass,
      health: config.health,
      maxHealth: config.health,
      tags,
    });
    this.ownerId = ownerId;
    this.config = config;
    this.remainingDurationMs = config.durationMs;
    this.fireCooldownMs = 0;
    this.triggerMap = buildTriggerMap(config.triggers ?? []);
    this.tickAccumulatorsMs = new Map();
    this.depth = options.depth ?? 0;
    this.visuals = options.visuals ?? config.visuals ?? null;
    this.spellArchetype = options.spellArchetype;
    this.abilityName = options.abilityName ?? '';
    this.facingAngle = 0;
    this.hitHeight = this.radius * 1.6;
    if (config.anchored !== false) {
      this.z = 0;
      this.vz = 0;
      this.gravityScale = 0;
      this.isGrounded = true;
    }
  }

  override isImmovable(): boolean {
    return this.config.anchored !== false;
  }

  getTriggers(trigger: string): TriggerNode[] {
    return this.triggerMap.get(trigger) ?? [];
  }

  override update(dt: number, world?: PhysicsWorld): void {
    this.tickStatusTimers(dt, world);
    this.remainingDurationMs = Math.max(0, this.remainingDurationMs - dt * 1000);
    if (this.remainingDurationMs <= 0 || this.health <= 0) {
      this.isDead = true;
      return;
    }

    if (this.getTriggers('ON_TICK').length > 0 || this.config.actorArchetype !== 'TURRET' || !world) {
      this.pinAnchoredVertical();
      return;
    }

    this.fireCooldownMs = Math.max(0, this.fireCooldownMs - dt * 1000);
    if (this.fireCooldownMs > 0) return;

    const target = this.findNearestEnemy(world);
    if (!target) return;

    const dir = target.pos.sub(this.pos);
    if (dir.magSq() < 0.01) return;

    const aimAngle = Math.atan2(dir.y, dir.x);
    this.facingAngle = aimAngle;
    const heading = dir.normalize();
    const spawnPos = this.pos.add(heading.scale(this.radius + 8));
    const projectile = new Projectile(
      spawnPos,
      TURRET_TRAJECTORY,
      this.ownerId,
      aimAngle,
      new Map(),
      this.depth + 1,
      this.visuals,
      this.abilityName,
      this.spellArchetype,
    );
    projectile.registerHit(this.id);
    world.addProjectile(projectile);
    this.fireCooldownMs = TURRET_FIRE_INTERVAL_MS;
    this.pinAnchoredVertical();
  }

  private pinAnchoredVertical(): void {
    if (this.config.anchored === false) return;
    this.z = 0;
    this.vz = 0;
    this.gravityScale = 0;
    this.isGrounded = true;
  }

  findNearestEnemy(world: PhysicsWorld, maxRange?: number): Entity | null {
    let nearest: Entity | null = null;
    let nearestDistSq = Infinity;
    const maxRangeSq = maxRange !== undefined ? maxRange * maxRange : Infinity;

    for (const combatant of world.getCombatants()) {
      if (isAlliedTo(this.ownerId, combatant)) continue;
      if (combatant.isStealthed()) continue;
      if (combatant.isDead) continue;

      const distSq = this.pos.distSq(combatant.pos);
      if (distSq > maxRangeSq) continue;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = combatant;
      }
    }

    return nearest;
  }
}
