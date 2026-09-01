import { clampToHex, getClosestEdgeNormal, isInsideHex } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import { Dummy } from '../entities/Dummy';
import { ConstraintJoint } from '../entities/ConstraintJoint';
import { Entity } from '../entities/Entity';
import { Obstacle } from '../entities/Obstacle';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SpatialZone } from '../entities/SpatialZone';
import { Summon } from '../entities/Summon';
import { isAlliedTo, isOwnerSummonPair } from './allegiance';
import type { TerrainMutationConfig, TerrainType } from '../types/schema';
import {
  DEBUG_VECTOR_COLORS,
  makeDebugVector,
  type DebugForceVector,
} from '../types/debug';
import { CombatLogger } from '../telemetry/CombatLogger';
import { vecTelemetry } from '../types/telemetry';

export const MAX_ENTITIES = 256;
export const BASELINE_INSTABILITY_ON_HIT = 10;
export const LAVA_DAMAGE_PER_SEC = 25;

export function getInstabilityScale(instabilityPct: number): number {
  return 1 + (instabilityPct / 100) * 1.5;
}
const LAVA_DRAG = 0.15;
const DEFAULT_COLLISION_RESTITUTION = 0.3;
const OBSTACLE_PROJECTILE_DAMAGE = 25;
const RAMMING_SPEED_THRESHOLD = 350;
const RAMMING_IMPULSE_FACTOR = 0.6;
const RAMMING_RECOIL_FACTOR = 0.35;
const RAMMING_INSTABILITY_SCALE = 0.06;
const RAMMING_INSTABILITY_CAP = 45;
const SLAM_SPEED_THRESHOLD = 400;
const SLAM_INSTABILITY_SCALE = 0.07;
const SLAM_INSTABILITY_CAP = 50;

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
  summons: Summon[] = [];
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

  debugPhysicsEnabled = false;
  debugVectors: DebugForceVector[] = [];
  collisionRestitution = DEFAULT_COLLISION_RESTITUTION;

  constructor(hexCenter: Vector2D, hexRadius: number) {
    this.hexCenter = hexCenter;
    this.hexRadius = hexRadius;
    this.baseHexRadius = hexRadius;
  }

  /** Clears per-frame debug vectors at the start of a simulation tick (before field forces). */
  beginDebugFrame(): void {
    if (!this.debugPhysicsEnabled) return;
    this.debugVectors.length = 0;
  }

  recordDebugVector(vec: DebugForceVector): void {
    if (!this.debugPhysicsEnabled) return;
    this.debugVectors.push(vec);
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
      if (combatant instanceof Summon) continue;
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
    for (const e of this.summons) if (!e.isDead) count++;
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

  addSummon(summon: Summon): boolean {
    if (!this.canAddEntity()) return false;
    this.summons.push(summon);
    this.entityRegistry.set(summon.id, summon);
    this.refreshCombatantsCache();
    return true;
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

  spawnPlasmaDetonation(pos: Vector2D, ownerId: string): void {
    const zone = new SpatialZone(
      pos,
      { fieldType: 'RADIAL_IMPULSE', strength: 2500, radius: 250, durationMs: 200 },
      ownerId,
      'PLASMA',
    );
    this.addZone(zone);
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
      if (!c.isDead) c.update(dt, this);
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
    for (const s of this.summons) {
      if (!s.isDead) this.combatantsCache.push(s);
    }
  }

  getCombatants(): Entity[] {
    return this.combatantsCache;
  }

  applyKnockback(target: Entity, direction: Vector2D, baseForce: number): void {
    const dir = direction.magSq() > 0 ? direction.normalize() : Vector2D.zero();
    const instabilityScale = getInstabilityScale(target.instabilityPct);
    const resistance = Math.min(0.75, target.knockbackResistance ?? 0);
    const impulse = dir.scale(
      (baseForce / target.effectiveMass) * instabilityScale * (1 - resistance),
    );
    if (target.stasisRemainingMs > 0) {
      target.stashedMomentum = target.stashedMomentum.add(
        impulse.scale(target.forceAccumulatorScale),
      );
      if (this.debugPhysicsEnabled && impulse.magSq() > 0) {
        this.recordDebugVector(
          makeDebugVector(target.pos, impulse, impulse.mag(), DEBUG_VECTOR_COLORS.IMPULSE),
        );
      }
      return;
    }
    target.vel = target.vel.add(impulse);
    if (this.debugPhysicsEnabled && impulse.magSq() > 0) {
      this.recordDebugVector(
        makeDebugVector(target.pos, impulse, impulse.mag(), DEBUG_VECTOR_COLORS.IMPULSE),
      );
    }
  }

  private addInstability(entity: Entity, amount: number): void {
    entity.addInstability(amount, this);
  }

  private applyVelocityImpulse(entity: Entity, impulse: Vector2D): void {
    if (entity.stasisRemainingMs > 0) {
      entity.stashedMomentum = entity.stashedMomentum.add(
        impulse.scale(entity.forceAccumulatorScale),
      );
      if (this.debugPhysicsEnabled && impulse.magSq() > 0) {
        this.recordDebugVector(
          makeDebugVector(entity.pos, impulse, impulse.mag(), DEBUG_VECTOR_COLORS.IMPULSE),
        );
      }
      return;
    }
    entity.vel = entity.vel.add(impulse);
    if (this.debugPhysicsEnabled && impulse.magSq() > 0) {
      this.recordDebugVector(
        makeDebugVector(entity.pos, impulse, impulse.mag(), DEBUG_VECTOR_COLORS.IMPULSE),
      );
    }
  }

  private applyRammingImpulse(
    rammer: Entity,
    target: Entity,
    closingSpeed: number,
  ): { J: number; knockDir: Vector2D; reducedMass: number } {
    const knockDelta = target.pos.sub(rammer.pos);
    const knockDir =
      knockDelta.magSq() > 0 ? knockDelta.normalize() : Vector2D.fromAngle(0);

    const reducedMass =
      (rammer.effectiveMass * target.effectiveMass) /
      (rammer.effectiveMass + target.effectiveMass);
    const J = closingSpeed * RAMMING_IMPULSE_FACTOR * reducedMass;

    const rammerVelBefore = vecTelemetry(rammer.vel);
    const targetVelBefore = vecTelemetry(target.vel);
    const instabBefore = target.instabilityPct;

    this.applyVelocityImpulse(target, knockDir.scale(J / target.effectiveMass));
    this.applyVelocityImpulse(
      rammer,
      knockDir.scale(-(J * RAMMING_RECOIL_FACTOR) / rammer.effectiveMass),
    );

    const rammingInstability = Math.min(
      RAMMING_INSTABILITY_CAP,
      (closingSpeed - RAMMING_SPEED_THRESHOLD) * RAMMING_INSTABILITY_SCALE,
    );
    this.addInstability(target, rammingInstability);

    CombatLogger.getInstance().record({
      type: 'RAM_COLLISION',
      rammerId: rammer.id,
      targetId: target.id,
      relativeVelocityNormal: closingSpeed,
      collisionNormal: vecTelemetry(knockDir),
      impulseMagnitude: J,
      reducedMass,
      rammerVelBefore,
      rammerVelAfter: vecTelemetry(rammer.vel),
      targetVelBefore,
      targetVelAfter: vecTelemetry(target.vel),
      targetInstabDelta: target.instabilityPct - instabBefore,
      targetInstabTotal: target.instabilityPct,
    });

    return { J, knockDir, reducedMass };
  }

  private applySlamInstability(entity: Entity, impactSpeed: number): number {
    const slamInstability = Math.min(
      SLAM_INSTABILITY_CAP,
      (impactSpeed - SLAM_SPEED_THRESHOLD) * SLAM_INSTABILITY_SCALE,
    );
    this.addInstability(entity, slamInstability);
    return slamInstability;
  }

  private recordSlamCollision(
    entity: Entity,
    surfaceType: 'OBSTACLE' | 'HEX_BOUNDARY' | 'VIEWPORT',
    impactSpeed: number,
    surfaceNormal: Vector2D,
    velBefore: Vector2D,
    instabDelta: number,
  ): void {
    CombatLogger.getInstance().record({
      type: 'SLAM_COLLISION',
      entityId: entity.id,
      surfaceType,
      impactSpeed,
      surfaceNormal: vecTelemetry(surfaceNormal),
      instabDelta,
      instabTotal: entity.instabilityPct,
      velBefore: vecTelemetry(velBefore),
      velAfter: vecTelemetry(entity.vel),
    });
  }

  private reflectVelocityAlongNormal(entity: Entity, normal: Vector2D): void {
    const vn = entity.vel.dot(normal);
    if (vn >= 0) return;
    const bounceMag = Math.abs((1 + this.collisionRestitution) * vn);
    if (this.debugPhysicsEnabled) {
      this.recordDebugVector(
        makeDebugVector(entity.pos, normal, bounceMag, DEBUG_VECTOR_COLORS.COLLISION, 'bounce'),
      );
    }
    entity.vel = entity.vel.sub(normal.scale((1 + this.collisionRestitution) * vn));
    const bounce = entity.getEffectiveBounciness();
    if (bounce !== 1) {
      const vnOut = entity.vel.dot(normal);
      if (vnOut > 0) {
        entity.vel = entity.vel.add(normal.scale(vnOut * (bounce - 1)));
      }
    }
  }

  getEntitiesInRadius(center: Vector2D, radius: number): Entity[] {
    const results: Entity[] = [];
    const radiusSq = radius * radius;

    for (const entity of this.players) {
      if (entity.isDead) continue;
      const reach = radius + entity.effectiveRadius;
      if (entity.pos.distSq(center) <= reach * reach) results.push(entity);
    }
    for (const entity of this.dummies) {
      if (entity.isDead) continue;
      const reach = radius + entity.effectiveRadius;
      if (entity.pos.distSq(center) <= reach * reach) results.push(entity);
    }
    for (const entity of this.summons) {
      if (entity.isDead) continue;
      const reach = radius + entity.effectiveRadius;
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

    if (this.debugPhysicsEnabled) {
      for (const player of this.players) {
        if (player.isDead) continue;
        if (player.inputMove.magSq() > 0) {
          const steerDir = player.inputMove.normalize();
          this.recordDebugVector(
            makeDebugVector(
              player.pos,
              steerDir,
              player.moveSpeed,
              DEBUG_VECTOR_COLORS.STEERING,
              'steer',
            ),
          );
        }
      }
    }

    for (const entity of this.players) {
      if (entity.isDead) continue;
      entity.update(dt);
      if (!entity.tags.has('kinematic')) entity.integrate(dt, this);
    }
    for (const entity of this.dummies) {
      if (entity.isDead) continue;
      entity.update(dt);
      if (!entity.tags.has('kinematic')) entity.integrate(dt, this);
    }
    for (const summon of this.summons) {
      if (summon.isDead) continue;
      summon.update(dt, this);
      if (summon.config.anchored === false) summon.integrate(dt, this);
    }
    for (const entity of this.projectiles) {
      if (entity.isDead) continue;
      entity.update(dt);
      if (!entity.tags.has('kinematic')) entity.integrate(dt, this);
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
    if (isOwnerSummonPair(a, b)) return;
    const aStasis = a.stasisRemainingMs > 0;
    const bStasis = b.stasisRemainingMs > 0;
    if (aStasis && bStasis) return;

    const delta = b.pos.sub(a.pos);
    const dist = delta.mag();
    const minDist = a.effectiveRadius + b.effectiveRadius;

    if (dist >= minDist) return;

    const normal = dist === 0 ? Vector2D.fromAngle(0) : delta.scale(1 / dist);
    const overlap = minDist - dist;
    const totalMass = a.effectiveMass + b.effectiveMass;
    const aRatio = b.effectiveMass / totalMass;
    const bRatio = a.effectiveMass / totalMass;

    if (!aStasis && !a.isImmovable()) {
      a.pos = a.pos.sub(normal.scale(overlap * aRatio));
    }
    if (!bStasis && !b.isImmovable()) {
      b.pos = b.pos.add(normal.scale(overlap * bRatio));
    }

    const relativeVel = b.vel.sub(a.vel);
    const velAlongNormal = relativeVel.dot(normal);

    if (velAlongNormal > 0) return;

    const closingSpeed = -velAlongNormal;
    if (closingSpeed > RAMMING_SPEED_THRESHOLD) {
      const aApproach = a.vel.dot(normal);
      const bApproach = b.vel.dot(normal.scale(-1));
      const rammer = aApproach >= bApproach ? a : b;
      const target = rammer === a ? b : a;
      const { J, knockDir } = this.applyRammingImpulse(rammer, target, closingSpeed);
      if (this.debugPhysicsEnabled && J > 0) {
        const contact = rammer.pos.add(target.pos).scale(0.5);
        this.recordDebugVector(
          makeDebugVector(contact, knockDir, J, DEBUG_VECTOR_COLORS.COLLISION, 'ram'),
        );
      }
      return;
    }

    const impulseMag =
      (-(1 + this.collisionRestitution) * velAlongNormal) /
      (1 / a.effectiveMass + 1 / b.effectiveMass);
    const impulse = normal.scale(impulseMag);

    if (!aStasis) {
      a.vel = a.vel.sub(impulse.scale(1 / a.effectiveMass));
    }
    if (!bStasis) {
      b.vel = b.vel.add(impulse.scale(1 / b.effectiveMass));
    }

    if (this.debugPhysicsEnabled && impulseMag > 0) {
      this.recordDebugVector(
        makeDebugVector(
          b.pos,
          normal,
          impulseMag / b.effectiveMass,
          DEBUG_VECTOR_COLORS.COLLISION,
          'circle',
        ),
      );
      this.recordDebugVector(
        makeDebugVector(
          a.pos,
          normal.scale(-1),
          impulseMag / a.effectiveMass,
          DEBUG_VECTOR_COLORS.COLLISION,
          'circle',
        ),
      );
    }
  }

  private resolveHexBoundaries(dt: number): void {
    this.resolveViewportBoundaries();

    for (const entity of this.players) {
      if (!entity.isDead) this.clampEntityToHex(entity);
    }
    for (const entity of this.dummies) {
      if (!entity.isDead) this.clampEntityToHex(entity);
    }
    for (const summon of this.summons) {
      if (!summon.isDead && summon.config.anchored === false) this.clampEntityToHex(summon);
    }

    for (const entity of this.players) {
      if (!entity.isDead) this.updateLavaTag(entity, dt);
    }
    for (const entity of this.dummies) {
      if (!entity.isDead) this.updateLavaTag(entity, dt);
    }
    for (const summon of this.summons) {
      if (!summon.isDead) this.updateLavaTag(summon, dt);
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
    for (const summon of this.summons) {
      if (!summon.isDead && summon.config.anchored === false) this.clampToViewport(summon);
    }
    for (const entity of this.projectiles) {
      if (!entity.isDead) this.resolveProjectileViewport(entity);
    }
  }

  private clampEntityToHex(entity: Entity): void {
    if (isInsideHex(entity.pos, this.hexCenter, this.hexRadius)) return;

    const normal = getClosestEdgeNormal(entity.pos, this.hexCenter, this.hexRadius);
    const vImpact = entity.vel.dot(normal.scale(-1));

    if (vImpact > SLAM_SPEED_THRESHOLD) {
      const velBefore = entity.vel.clone();
      const instabDelta = this.applySlamInstability(entity, vImpact);
      entity.pos = clampToHex(entity.pos, this.hexCenter, this.hexRadius);
      const vn = entity.vel.dot(normal);
      if (vn > 0) entity.vel = entity.vel.sub(normal.scale(vn));
      const bounce = entity.getEffectiveBounciness();
      if (bounce > 1) {
        entity.vel = entity.vel.scale(bounce);
      }
      this.recordSlamCollision(entity, 'HEX_BOUNDARY', vImpact, normal, velBefore, instabDelta);
      if (this.debugPhysicsEnabled) {
        this.recordDebugVector(
          makeDebugVector(entity.pos, normal, vImpact, DEBUG_VECTOR_COLORS.COLLISION, 'hex'),
        );
      }
      this.pendingWallImpacts.push(entity.pos.clone());
    }
  }

  private applyViewportBounce(entity: Entity, axis: 'x' | 'y'): void {
    const bounce = entity.getEffectiveBounciness();
    if (bounce > 1) {
      if (axis === 'x') {
        entity.vel.x = -entity.vel.x * bounce;
      } else {
        entity.vel.y = -entity.vel.y * bounce;
      }
    } else if (axis === 'x') {
      entity.vel.x = 0;
    } else {
      entity.vel.y = 0;
    }
  }

  private clampToViewport(entity: Entity): void {
    const { width, height } = this.viewportBounds;
    const r = entity.effectiveRadius;
    const minX = r;
    const maxX = Math.max(minX, width - r);
    const minY = r;
    const maxY = Math.max(minY, height - r);

    const clampedX = Math.max(minX, Math.min(maxX, entity.pos.x));
    const clampedY = Math.max(minY, Math.min(maxY, entity.pos.y));
    const hitX = clampedX !== entity.pos.x;
    const hitY = clampedY !== entity.pos.y;

    if (hitX) {
      const impactSpeed = Math.abs(entity.vel.x);
      if (impactSpeed > SLAM_SPEED_THRESHOLD) {
        const velBefore = entity.vel.clone();
        const wallNormal = new Vector2D(entity.pos.x > clampedX ? 1 : -1, 0);
        const instabDelta = this.applySlamInstability(entity, impactSpeed);
        entity.pos.x = clampedX;
        this.applyViewportBounce(entity, 'x');
        this.recordSlamCollision(entity, 'VIEWPORT', impactSpeed, wallNormal, velBefore, instabDelta);
      } else {
        entity.pos.x = clampedX;
        this.applyViewportBounce(entity, 'x');
      }
      if (this.debugPhysicsEnabled && impactSpeed > 0) {
        const wallNormal = new Vector2D(entity.pos.x > clampedX ? 1 : -1, 0);
        this.recordDebugVector(
          makeDebugVector(
            entity.pos,
            wallNormal,
            impactSpeed,
            DEBUG_VECTOR_COLORS.COLLISION,
            'wall',
          ),
        );
      }
    }
    if (hitY) {
      const impactSpeed = Math.abs(entity.vel.y);
      if (impactSpeed > SLAM_SPEED_THRESHOLD) {
        const velBefore = entity.vel.clone();
        const wallNormal = new Vector2D(0, entity.pos.y > clampedY ? 1 : -1);
        const instabDelta = this.applySlamInstability(entity, impactSpeed);
        entity.pos.y = clampedY;
        this.applyViewportBounce(entity, 'y');
        this.recordSlamCollision(entity, 'VIEWPORT', impactSpeed, wallNormal, velBefore, instabDelta);
      } else {
        entity.pos.y = clampedY;
        this.applyViewportBounce(entity, 'y');
      }
      if (this.debugPhysicsEnabled && impactSpeed > 0) {
        const wallNormal = new Vector2D(0, entity.pos.y > clampedY ? 1 : -1);
        this.recordDebugVector(
          makeDebugVector(
            entity.pos,
            wallNormal,
            impactSpeed,
            DEBUG_VECTOR_COLORS.COLLISION,
            'wall',
          ),
        );
      }
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

  /** Resolves effective surface at a point: terrain patch override, then hex containment. */
  getSurfaceTypeAt(pos: Vector2D): TerrainType {
    const override = this.getTerrainOverride(pos);
    if (override) return override;
    return isInsideHex(pos, this.hexCenter, this.hexRadius) ? 'SAFE' : 'LAVA';
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
    const entityRadius = entity.effectiveRadius;
    const minDist = entityRadius + radius;

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
    const entityRadius = entity.effectiveRadius;

    if (dist >= entityRadius) return null;

    let localNormal: Vector2D;
    let depth: number;

    if (dist > 0.0001) {
      localNormal = diff.scale(1 / dist);
      depth = entityRadius - dist;
    } else {
      const penLeft = entityRadius + (local.x + halfW);
      const penRight = entityRadius + (halfW - local.x);
      const penTop = entityRadius + (local.y + halfH);
      const penBottom = entityRadius + (halfH - local.y);
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
    for (const s of this.summons) {
      if (!s.isDead) entities.push(s);
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

        if (entity.stasisRemainingMs > 0) {
          entity.pos = entity.pos.add(penetration.normal.scale(penetration.depth));
          continue;
        }

        const vImpact = entity.vel.dot(penetration.normal.scale(-1));
        const velBefore = entity.vel.clone();
        entity.pos = entity.pos.add(penetration.normal.scale(penetration.depth));

        if (vImpact > SLAM_SPEED_THRESHOLD) {
          const instabDelta = this.applySlamInstability(entity, vImpact);
          this.reflectVelocityAlongNormal(entity, penetration.normal);
          this.recordSlamCollision(
            entity,
            'OBSTACLE',
            vImpact,
            penetration.normal,
            velBefore,
            instabDelta,
          );
        }
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
        if (isAlliedTo(projectile.sourceEntityId, target)) continue;
        if (target.isStealthed()) continue;

        const minDist = projectile.radius + target.effectiveRadius;
        const minDistSq = minDist * minDist;
        if (projectile.pos.distSq(target.pos) > minDistSq) continue;

        if (!projectile.registerHit(target.id)) continue;

        target.addInstability(BASELINE_INSTABILITY_ON_HIT, this);

        if (projectile.spellArchetype) {
          target.applyStatus(projectile.spellArchetype, 2000, 1, this);
        }

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
    for (let read = 0; read < this.summons.length; read++) {
      if (!this.summons[read].isDead) {
        this.summons[write++] = this.summons[read];
      } else {
        this.entityRegistry.delete(this.summons[read].id);
        pruned = true;
      }
    }
    if (write < this.summons.length) {
      this.summons.length = write;
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
    for (const summon of this.summons) {
      this.entityRegistry.delete(summon.id);
    }
    this.projectiles = [];
    this.zones = [];
    this.constraints = [];
    this.obstacles = [];
    this.terrainPatches = [];
    this.summons = [];
  }
}
