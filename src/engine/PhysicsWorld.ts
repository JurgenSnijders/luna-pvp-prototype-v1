import {
  clampToHex,
  getVoidRadius,
  isInsideHex,
} from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import { Dummy } from '../entities/Dummy';
import { Entity } from '../entities/Entity';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SpatialZone } from '../entities/SpatialZone';

export const MAX_ENTITIES = 256;
const HAZARD_INSTABILITY_PER_SEC = 15;
const HAZARD_DRAG = 0.05;
const COLLISION_RESTITUTION = 0.3;

export interface PendingHit {
  projectile: Projectile;
  target: Entity;
  hitPos: Vector2D;
}

export class PhysicsWorld {
  players: Player[] = [];
  dummies: Dummy[] = [];
  projectiles: Projectile[] = [];
  zones: SpatialZone[] = [];

  hexCenter: Vector2D;
  hexRadius: number;

  pendingHits: PendingHit[] = [];
  pendingExpirations: Projectile[] = [];

  constructor(hexCenter: Vector2D, hexRadius: number) {
    this.hexCenter = hexCenter;
    this.hexRadius = hexRadius;
  }

  get entityCount(): number {
    return this.getEntityCount();
  }

  getEntityCount(): number {
    return (
      this.players.filter((e) => !e.isDead).length +
      this.dummies.filter((e) => !e.isDead).length +
      this.projectiles.filter((e) => !e.isDead).length +
      this.zones.filter((e) => !e.isDead).length
    );
  }

  canAddEntity(): boolean {
    return this.getEntityCount() < MAX_ENTITIES;
  }

  getEntityById(id: string): Entity | null {
    for (const p of this.players) if (p.id === id && !p.isDead) return p;
    for (const d of this.dummies) if (d.id === id && !d.isDead) return d;
    for (const pr of this.projectiles) if (pr.id === id && !pr.isDead) return pr;
    for (const z of this.zones) if (z.id === id && !z.isDead) return z;
    return null;
  }

  addPlayer(player: Player): void {
    if (!this.canAddEntity()) return;
    this.players.push(player);
  }

  addDummy(dummy: Dummy): void {
    if (!this.canAddEntity()) return;
    this.dummies.push(dummy);
  }

  addProjectile(projectile: Projectile): boolean {
    if (!this.canAddEntity()) return false;
    this.projectiles.push(projectile);
    return true;
  }

  addZone(zone: SpatialZone): boolean {
    if (!this.canAddEntity()) return false;
    this.zones.push(zone);
    return true;
  }

  getCombatants(): Entity[] {
    return [
      ...this.players.filter((e) => !e.isDead),
      ...this.dummies.filter((e) => !e.isDead),
    ];
  }

  applyKnockback(target: Entity, direction: Vector2D, baseForce: number): void {
    const dir = direction.magSq() > 0 ? direction.normalize() : Vector2D.zero();
    const instabilityScale = 1 + (target.instabilityPct / 100) * 1.5;
    const resistance = Math.min(0.75, target.knockbackResistance ?? 0);
    const impulse = dir.scale((baseForce / target.mass) * instabilityScale * (1 - resistance));
    target.vel = target.vel.add(impulse);
  }

  getEntitiesInRadius(center: Vector2D, radius: number): Entity[] {
    const results: Entity[] = [];
    const all = [
      ...this.players,
      ...this.dummies,
      ...this.projectiles,
    ].filter((e) => !e.isDead);

    for (const entity of all) {
      if (entity.pos.dist(center) <= radius + entity.radius) {
        results.push(entity);
      }
    }
    return results;
  }

  clearEventQueues(): void {
    this.pendingHits = [];
    this.pendingExpirations = [];
  }

  step(dt: number): void {
    this.pendingHits = [];
    this.pendingExpirations = [];

    for (const dummy of this.dummies) {
      if (!dummy.isDead) {
        dummy.chaseVector = dummy.getChaseVector(this.players);
      }
    }

    const updatables: Entity[] = [
      ...this.players,
      ...this.dummies,
      ...this.projectiles,
      ...this.zones,
    ];

    for (const entity of updatables) {
      if (entity.isDead) continue;
      entity.update(dt);
      if (!entity.tags.has('kinematic')) {
        entity.integrate(dt);
      }
    }

    this.resolveCircleCollisions();
    this.resolveHexBoundaries(dt);
    this.resolveProjectileHits();
    this.collectExpirations();
    this.pruneDead();
  }

  private resolveCircleCollisions(): void {
    const combatants = this.getCombatants();

    for (let i = 0; i < combatants.length; i++) {
      for (let j = i + 1; j < combatants.length; j++) {
        this.resolveCirclePair(combatants[i], combatants[j]);
      }
    }
  }

  private resolveCirclePair(a: Entity, b: Entity): void {
    const delta = b.pos.sub(a.pos);
    const dist = delta.mag();
    const minDist = a.radius + b.radius;

    if (dist >= minDist || dist === 0) return;

    const normal = delta.scale(1 / dist);
    const overlap = minDist - dist;
    const totalMass = a.mass + b.mass;
    const aRatio = b.mass / totalMass;
    const bRatio = a.mass / totalMass;

    a.pos = a.pos.sub(normal.scale(overlap * aRatio));
    b.pos = b.pos.add(normal.scale(overlap * bRatio));

    const relativeVel = b.vel.sub(a.vel);
    const velAlongNormal = relativeVel.dot(normal);

    if (velAlongNormal > 0) return;

    const impulseMag =
      (-(1 + COLLISION_RESTITUTION) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
    const impulse = normal.scale(impulseMag);

    a.vel = a.vel.sub(impulse.scale(1 / a.mass));
    b.vel = b.vel.add(impulse.scale(1 / b.mass));
  }

  private resolveHexBoundaries(dt: number): void {
    const voidRadius = getVoidRadius(this.hexRadius);
    const movable = [...this.players, ...this.dummies, ...this.projectiles].filter(
      (e) => !e.isDead,
    );

    for (const entity of movable) {
      const distFromCenter = entity.pos.dist(this.hexCenter);

      if (distFromCenter > voidRadius) {
        entity.isDead = true;
        if (entity instanceof Projectile && !entity.expiryReason) {
          entity.expiryReason = 'lifetime';
        }
        continue;
      }

      if (!isInsideHex(entity.pos, this.hexCenter, this.hexRadius)) {
        entity.instabilityPct = Math.min(
          500,
          entity.instabilityPct + HAZARD_INSTABILITY_PER_SEC * dt,
        );
        entity.linearDrag = HAZARD_DRAG;
        entity.pos = clampToHex(entity.pos, this.hexCenter, this.hexRadius);
      }
    }
  }

  private resolveProjectileHits(): void {
    const combatants = this.getCombatants();

    for (const projectile of this.projectiles) {
      if (projectile.isDead) continue;

      for (const target of combatants) {
        if (target.id === projectile.sourceEntityId) continue;

        const dist = projectile.pos.dist(target.pos);
        if (dist > projectile.radius + target.radius) continue;

        if (!projectile.registerHit(target.id)) continue;

        const hitPos = projectile.pos.lerp(target.pos, 0.5);
        this.pendingHits.push({ projectile, target, hitPos });

        if (projectile.pierceRemaining <= 0) {
          projectile.isDead = true;
          projectile.expiryReason = 'hit';
        } else {
          projectile.pierceRemaining -= 1;
        }
      }
    }
  }

  private collectExpirations(): void {
    for (const projectile of this.projectiles) {
      if (projectile.isDead && projectile.expiryReason !== 'hit') {
        this.pendingExpirations.push(projectile);
      }
    }
  }

  private pruneDead(): void {
    this.players = this.players.filter((e) => !e.isDead);
    this.dummies = this.dummies.filter((e) => !e.isDead);
    this.projectiles = this.projectiles.filter((e) => !e.isDead);
    this.zones = this.zones.filter((e) => !e.isDead);
  }

  clearProjectilesAndZones(): void {
    this.projectiles = [];
    this.zones = [];
  }
}
