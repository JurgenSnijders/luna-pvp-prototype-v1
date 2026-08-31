import { isInsideHex } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import { Dummy } from '../entities/Dummy';
import { ConstraintJoint } from '../entities/ConstraintJoint';
import { Entity } from '../entities/Entity';
import { Obstacle } from '../entities/Obstacle';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SpatialZone } from '../entities/SpatialZone';
import type { TerrainMutationConfig, TerrainType } from '../types/schema';

export const MAX_ENTITIES = 256;
export const LAVA_DAMAGE_PER_SEC = 25;
const LAVA_DRAG = 0.15;
const COLLISION_RESTITUTION = 0.3;
const OBSTACLE_PROJECTILE_DAMAGE = 25;

interface PenetrationResult {
  normal: Vector2D;
  depth: number;
}

export interface TerrainPatch {
  pos: Vector2D;
  config: TerrainMutationConfig;
  remainingDurationMs: number;
}

/** DevTools-configurable bounds for the persistent hex platform radius. */
export const MIN_HEX_RADIUS = 150;
export const MAX_HEX_RADIUS = 800;

/** DevTools-configurable bounds for combatant (player/bot/dummy) hitbox radius. */
export const MIN_COMBATANT_RADIUS = 8;
export const MAX_COMBATANT_RADIUS = 60;
export const DEFAULT_COMBATANT_RADIUS = 20;

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
  obstacles: Obstacle[] = [];
  terrainPatches: TerrainPatch[] = [];
  private constraints: ConstraintJoint[] = [];

  hexCenter: Vector2D;
  hexRadius: number;
  baseHexRadius: number;
  viewportBounds: { width: number; height: number } = { width: 0, height: 0 };

  pendingHits: PendingHit[] = [];
  pendingExpirations: Projectile[] = [];
  pendingWallImpacts: Vector2D[] = [];

  private combatantsCache: Entity[] = [];
  private entityRegistry = new Map<string, Entity>();
  private combatantRadius: number = DEFAULT_COMBATANT_RADIUS;

  constructor(hexCenter: Vector2D, hexRadius: number) {
    this.hexCenter = hexCenter;
    this.hexRadius = hexRadius;
    this.baseHexRadius = hexRadius;
  }

  /** Updates the hard screen-edge collision perimeter (called on init and window resize). */
  setViewportBounds(width: number, height: number): void {
    this.viewportBounds = { width, height };
  }

  /** Sets the configured (non-shrinking) arena size, clamped to DevTools slider bounds. */
  setBaseHexRadius(radius: number): void {
    const clamped = Math.max(MIN_HEX_RADIUS, Math.min(MAX_HEX_RADIUS, radius));
    this.baseHexRadius = clamped;
    this.hexRadius = clamped;
  }

  getBaseHexRadius(): number {
    return this.baseHexRadius;
  }

  getCombatantRadius(): number {
    return this.combatantRadius;
  }

  /** Applies the clamped radius to every live combatant; new spawns pick it up via addPlayer/addDummy. */
  setCombatantRadius(radius: number): void {
    this.combatantRadius = Math.max(MIN_COMBATANT_RADIUS, Math.min(MAX_COMBATANT_RADIUS, radius));
    for (const combatant of this.getCombatants()) {
      combatant.radius = this.combatantRadius;
    }
  }

  get entityCount(): number {
    return this.getEntityCount();
  }

  getEntityCount(): number {
    let count = 0;
    for (const e of this.players) if (!e.isDead) count++;
    for (const e of this.dummies) if (!e.isDead) count++;
    for (const e of this.projectiles) if (!e.isDead) count++;
    for (const e of this.zones) if (!e.isDead) count++;
    return count;
  }

  canAddEntity(): boolean {
    return this.getEntityCount() < MAX_ENTITIES;
  }

  getEntityById(id: string): Entity | null {
    const entity = this.entityRegistry.get(id);
    return entity && !entity.isDead ? entity : null;
  }

  addPlayer(player: Player): void {
    if (!this.canAddEntity()) return;
    player.radius = this.combatantRadius;
    this.players.push(player);
    this.entityRegistry.set(player.id, player);
    this.refreshCombatantsCache();
  }

  addDummy(dummy: Dummy): void {
    if (!this.canAddEntity()) return;
    dummy.radius = this.combatantRadius;
    this.dummies.push(dummy);
    this.entityRegistry.set(dummy.id, dummy);
    this.refreshCombatantsCache();
  }

  addProjectile(projectile: Projectile): boolean {
    if (!this.canAddEntity()) return false;
    this.projectiles.push(projectile);
    this.entityRegistry.set(projectile.id, projectile);
    return true;
  }

  addZone(zone: SpatialZone): boolean {
    if (!this.canAddEntity()) return false;
    this.zones.push(zone);
    return true;
  }

  getConstraints(): readonly ConstraintJoint[] {
    return this.constraints;
  }

  addConstraint(c: ConstraintJoint): void {
    this.constraints.push(c);
  }

  addObstacle(obstacle: Obstacle): void {
    this.obstacles.push(obstacle);
  }

  addTerrainPatch(pos: Vector2D, config: TerrainMutationConfig): void {
    this.terrainPatches.push({
      pos: pos.clone(),
      config,
      remainingDurationMs: config.durationMs,
    });
  }

  updateObstaclesAndPatches(dt: number): void {
    for (const obstacle of this.obstacles) {
      if (!obstacle.isDead) obstacle.update(dt);
    }
    this.obstacles = this.obstacles.filter((o) => !o.isDead);

    for (const patch of this.terrainPatches) {
      patch.remainingDurationMs -= dt * 1000;
    }
    this.terrainPatches = this.terrainPatches.filter((p) => p.remainingDurationMs > 0);
  }

  updateConstraints(dt: number): void {
    for (const c of this.constraints) {
      if (!c.isDead) c.update(dt);
    }
    this.constraints = this.constraints.filter((c) => !c.isDead);
  }

  refreshCombatantsCache(): void {
    this.combatantsCache.length = 0;
    for (const p of this.players) {
      if (!p.isDead) this.combatantsCache.push(p);
    }
    for (const d of this.dummies) {
      if (!d.isDead) this.combatantsCache.push(d);
    }
  }

  getCombatants(): Entity[] {
    return this.combatantsCache;
  }

  applyKnockback(target: Entity, direction: Vector2D, baseForce: number): void {
    const dir = direction.magSq() > 0 ? direction.normalize() : Vector2D.zero();
    const instabilityScale = 1 + (target.instabilityPct / 100) * 1.5;
    const resistance = Math.min(0.75, target.knockbackResistance ?? 0);
    const impulse = dir.scale((baseForce / target.mass) * instabilityScale * (1 - resistance));
    if (target.stasisRemainingMs > 0) {
      target.stashedMomentum = target.stashedMomentum.add(
        impulse.scale(target.forceAccumulatorScale),
      );
      return;
    }
    target.vel = target.vel.add(impulse);
  }

  getEntitiesInRadius(center: Vector2D, radius: number): Entity[] {
    const results: Entity[] = [];
    const radiusSq = radius * radius;

    for (const entity of this.players) {
      if (entity.isDead) continue;
      const reach = radius + entity.radius;
      if (entity.pos.distSq(center) <= reach * reach) results.push(entity);
    }
    for (const entity of this.dummies) {
      if (entity.isDead) continue;
      const reach = radius + entity.radius;
      if (entity.pos.distSq(center) <= reach * reach) results.push(entity);
    }
    for (const entity of this.projectiles) {
      if (entity.isDead) continue;
      const reach = radius + entity.radius;
      if (entity.pos.distSq(center) <= reach * reach) results.push(entity);
    }
    return results;
  }

  clearEventQueues(): void {
    this.pendingHits = [];
    this.pendingExpirations = [];
    this.pendingWallImpacts = [];
  }

  /** Syncs attached zone transforms to their parent and ticks zone duration. Runs before
   * `step()` so attached fields (e.g. a moving gravity well) apply forces from their
   * current-frame position rather than lagging a frame behind their parent. */
  updateSpatialZones(dt: number): void {
    for (const zone of this.zones) {
      if (zone.isDead) continue;
      zone.update(dt);
      if (!zone.tags.has('kinematic')) zone.integrate(dt);
    }
  }

  step(dt: number): void {
    this.pendingHits = [];
    this.pendingExpirations = [];
    this.pendingWallImpacts = [];

    this.updateObstaclesAndPatches(dt);
    this.refreshCombatantsCache();

    for (const dummy of this.dummies) {
      if (!dummy.isDead) {
        dummy.chaseVector = dummy.getChaseVector(this.players);
      }
    }

    for (const entity of this.players) {
      if (entity.isDead) continue;
      entity.update(dt);
      if (!entity.tags.has('kinematic')) entity.integrate(dt);
    }
    for (const entity of this.dummies) {
      if (entity.isDead) continue;
      entity.update(dt);
      if (!entity.tags.has('kinematic')) entity.integrate(dt);
    }
    for (const entity of this.projectiles) {
      if (entity.isDead) continue;
      entity.update(dt);
      if (!entity.tags.has('kinematic')) entity.integrate(dt);
    }

    this.updateConstraints(dt);

    this.resolveCircleCollisions();
    this.resolveObstacleCollisions();
    this.resolveHexBoundaries(dt);
    this.resolveProjectileHits();
    this.collectExpirations();
    this.pruneDead();
  }

  private resolveCircleCollisions(): void {
    const combatants = this.combatantsCache;

    for (let i = 0; i < combatants.length; i++) {
      for (let j = i + 1; j < combatants.length; j++) {
        this.resolveCirclePair(combatants[i], combatants[j]);
      }
    }
  }

  private resolveCirclePair(a: Entity, b: Entity): void {
    const aStasis = a.stasisRemainingMs > 0;
    const bStasis = b.stasisRemainingMs > 0;
    if (aStasis && bStasis) return;

    const delta = b.pos.sub(a.pos);
    const dist = delta.mag();
    const minDist = a.radius + b.radius;

    if (dist >= minDist || dist === 0) return;

    const normal = delta.scale(1 / dist);
    const overlap = minDist - dist;
    const totalMass = a.mass + b.mass;
    const aRatio = b.mass / totalMass;
    const bRatio = a.mass / totalMass;

    if (!aStasis) {
      a.pos = a.pos.sub(normal.scale(overlap * aRatio));
    }
    if (!bStasis) {
      b.pos = b.pos.add(normal.scale(overlap * bRatio));
    }

    const relativeVel = b.vel.sub(a.vel);
    const velAlongNormal = relativeVel.dot(normal);

    if (velAlongNormal > 0) return;

    const impulseMag =
      (-(1 + COLLISION_RESTITUTION) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
    const impulse = normal.scale(impulseMag);

    if (!aStasis) {
      a.vel = a.vel.sub(impulse.scale(1 / a.mass));
    }
    if (!bStasis) {
      b.vel = b.vel.add(impulse.scale(1 / b.mass));
    }
  }

  private resolveHexBoundaries(dt: number): void {
    this.resolveViewportBoundaries();

    for (const entity of this.players) {
      if (!entity.isDead) this.updateLavaTag(entity, dt);
    }
    for (const entity of this.dummies) {
      if (!entity.isDead) this.updateLavaTag(entity, dt);
    }
    for (const entity of this.projectiles) {
      if (!entity.isDead) this.updateLavaTag(entity, dt);
    }
  }

  /** Hard screen-edge perimeter: combatants are clamped in place, projectiles die on exit. */
  private resolveViewportBoundaries(): void {
    for (const entity of this.players) {
      if (!entity.isDead) this.clampToViewport(entity);
    }
    for (const entity of this.dummies) {
      if (!entity.isDead) this.clampToViewport(entity);
    }
    for (const entity of this.projectiles) {
      if (!entity.isDead) this.resolveProjectileViewport(entity);
    }
  }

  private clampToViewport(entity: Entity): void {
    const { width, height } = this.viewportBounds;
    const r = entity.radius;
    const minX = r;
    const maxX = Math.max(minX, width - r);
    const minY = r;
    const maxY = Math.max(minY, height - r);

    const clampedX = Math.max(minX, Math.min(maxX, entity.pos.x));
    const clampedY = Math.max(minY, Math.min(maxY, entity.pos.y));
    const hitX = clampedX !== entity.pos.x;
    const hitY = clampedY !== entity.pos.y;

    if (hitX) {
      entity.pos.x = clampedX;
      entity.vel.x = 0;
    }
    if (hitY) {
      entity.pos.y = clampedY;
      entity.vel.y = 0;
    }
    if (hitX || hitY) {
      this.pendingWallImpacts.push(entity.pos.clone());
    }
  }

  /** Screen edges are a hard kill zone for projectiles rather than a bounce surface. */
  private resolveProjectileViewport(proj: Projectile): void {
    const { width, height } = this.viewportBounds;
    const r = proj.radius;
    if (
      proj.pos.x < -r ||
      proj.pos.x > width + r ||
      proj.pos.y < -r ||
      proj.pos.y > height + r
    ) {
      proj.isDead = true;
      proj.expiryReason = 'wall';
    }
  }

  private getTerrainOverride(pos: Vector2D): TerrainType | null {
    let closest: TerrainPatch | null = null;
    let closestDistSq = Infinity;

    for (const patch of this.terrainPatches) {
      const dSq = pos.distSq(patch.pos);
      const radiusSq = patch.config.radius * patch.config.radius;
      if (dSq <= radiusSq && dSq < closestDistSq) {
        closest = patch;
        closestDistSq = dSq;
      }
    }

    return closest?.config.type ?? null;
  }

  private toObstacleLocal(worldPos: Vector2D, obstacle: Obstacle): Vector2D {
    const rel = worldPos.sub(obstacle.pos);
    const angle = obstacle.config.angle ?? 0;
    return rel.rotate(-angle);
  }

  private circleObstaclePenetration(
    entity: Entity,
    obstacle: Obstacle,
  ): PenetrationResult | null {
    const radius = obstacle.config.width / 2;
    const delta = entity.pos.sub(obstacle.pos);
    const dist = delta.mag();
    const minDist = entity.radius + radius;

    if (dist >= minDist) return null;

    if (dist > 0.0001) {
      return { normal: delta.scale(1 / dist), depth: minDist - dist };
    }

    return { normal: Vector2D.fromAngle(0), depth: minDist };
  }

  private boxObstaclePenetration(
    entity: Entity,
    obstacle: Obstacle,
  ): PenetrationResult | null {
    const halfW = obstacle.config.width / 2;
    const halfH = obstacle.config.height / 2;
    const local = this.toObstacleLocal(entity.pos, obstacle);

    const closestX = Math.max(-halfW, Math.min(halfW, local.x));
    const closestY = Math.max(-halfH, Math.min(halfH, local.y));
    const closest = new Vector2D(closestX, closestY);

    const diff = local.sub(closest);
    const dist = diff.mag();

    if (dist >= entity.radius) return null;

    let localNormal: Vector2D;
    let depth: number;

    if (dist > 0.0001) {
      localNormal = diff.scale(1 / dist);
      depth = entity.radius - dist;
    } else {
      const penLeft = entity.radius + (local.x + halfW);
      const penRight = entity.radius + (halfW - local.x);
      const penTop = entity.radius + (local.y + halfH);
      const penBottom = entity.radius + (halfH - local.y);
      const minPen = Math.min(penLeft, penRight, penTop, penBottom);

      if (minPen === penLeft) {
        localNormal = new Vector2D(-1, 0);
        depth = penLeft;
      } else if (minPen === penRight) {
        localNormal = new Vector2D(1, 0);
        depth = penRight;
      } else if (minPen === penTop) {
        localNormal = new Vector2D(0, -1);
        depth = penTop;
      } else {
        localNormal = new Vector2D(0, 1);
        depth = penBottom;
      }
    }

    const angle = obstacle.config.angle ?? 0;
    const worldNormal = localNormal.rotate(angle);
    return { normal: worldNormal, depth };
  }

  private getObstaclePenetration(
    entity: Entity,
    obstacle: Obstacle,
  ): PenetrationResult | null {
    if (obstacle.config.shape === 'CIRCLE') {
      return this.circleObstaclePenetration(entity, obstacle);
    }
    return this.boxObstaclePenetration(entity, obstacle);
  }

  private resolveObstacleCollisions(): void {
    if (this.obstacles.length === 0) return;

    const entities: Entity[] = [];
    for (const p of this.players) {
      if (!p.isDead) entities.push(p);
    }
    for (const d of this.dummies) {
      if (!d.isDead) entities.push(d);
    }
    for (const proj of this.projectiles) {
      if (!proj.isDead) entities.push(proj);
    }

    for (const obstacle of this.obstacles) {
      if (obstacle.isDead) continue;

      for (const entity of entities) {
        const penetration = this.getObstaclePenetration(entity, obstacle);
        if (!penetration) continue;

        if (entity instanceof Projectile) {
          entity.isDead = true;
          entity.expiryReason = 'wall';
          this.pendingWallImpacts.push(entity.pos.clone());
          if (obstacle.config.isDestructible) {
            obstacle.takeDamage(OBSTACLE_PROJECTILE_DAMAGE);
          }
          continue;
        }

        if (entity.stasisRemainingMs > 0) continue;

        entity.pos = entity.pos.add(penetration.normal.scale(penetration.depth));
      }
    }

    this.obstacles = this.obstacles.filter((o) => !o.isDead);
  }

  private updateLavaTag(entity: Entity, dt: number): void {
    const override = this.getTerrainOverride(entity.pos);

    if (override === 'SAFE') {
      entity.tags.delete('in_lava');
      return;
    }

    if (override === 'LAVA') {
      entity.tags.add('in_lava');
      entity.health = Math.max(0, entity.health - LAVA_DAMAGE_PER_SEC * dt);
      entity.linearDrag = LAVA_DRAG;
      return;
    }

    if (isInsideHex(entity.pos, this.hexCenter, this.hexRadius)) {
      entity.tags.delete('in_lava');
    } else {
      entity.tags.add('in_lava');
      entity.health = Math.max(0, entity.health - LAVA_DAMAGE_PER_SEC * dt);
      entity.linearDrag = LAVA_DRAG;
    }
  }

  private resolveProjectileHits(): void {
    const combatants = this.combatantsCache;

    for (const projectile of this.projectiles) {
      if (projectile.isDead) continue;

      for (const target of combatants) {
        if (target.id === projectile.sourceEntityId) continue;

        const minDist = projectile.radius + target.radius;
        const minDistSq = minDist * minDist;
        if (projectile.pos.distSq(target.pos) > minDistSq) continue;

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
      if (projectile.isDead) {
        this.pendingExpirations.push(projectile);
      }
    }
  }

  private pruneDead(): void {
    let pruned = false;

    let write = 0;
    for (let read = 0; read < this.dummies.length; read++) {
      if (!this.dummies[read].isDead) {
        this.dummies[write++] = this.dummies[read];
      } else {
        this.entityRegistry.delete(this.dummies[read].id);
        pruned = true;
      }
    }
    if (write < this.dummies.length) {
      this.dummies.length = write;
      pruned = true;
    }

    write = 0;
    for (let read = 0; read < this.projectiles.length; read++) {
      if (!this.projectiles[read].isDead) {
        this.projectiles[write++] = this.projectiles[read];
      } else {
        this.entityRegistry.delete(this.projectiles[read].id);
        pruned = true;
      }
    }
    if (write < this.projectiles.length) {
      this.projectiles.length = write;
      pruned = true;
    }

    write = 0;
    for (let read = 0; read < this.zones.length; read++) {
      if (!this.zones[read].isDead) {
        this.zones[write++] = this.zones[read];
      } else {
        this.entityRegistry.delete(this.zones[read].id);
        pruned = true;
      }
    }
    if (write < this.zones.length) {
      this.zones.length = write;
      pruned = true;
    }

    if (pruned) {
      this.refreshCombatantsCache();
    }
  }

  clearProjectilesAndZones(): void {
    for (const projectile of this.projectiles) {
      this.entityRegistry.delete(projectile.id);
    }
    for (const zone of this.zones) {
      this.entityRegistry.delete(zone.id);
    }
    this.projectiles = [];
    this.zones = [];
    this.constraints = [];
    this.obstacles = [];
    this.terrainPatches = [];
  }
}
