import { clampToHex } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import { MAX_ENTITIES, type PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { SpatialZone } from '../entities/SpatialZone';
import type { ParticleSystem } from '../render/ParticleSystem';
import type {
  AbilitySchema,
  ActionPayload,
  TriggerNode,
  TriggerType,
} from '../types/schema';
import { updateTrajectory } from './Trajectories';

const MAX_DEPTH = 2;

export function buildTriggerMap(triggers: TriggerNode[]): Map<string, TriggerNode[]> {
  const map = new Map<string, TriggerNode[]>();
  for (const node of triggers) {
    const existing = map.get(node.trigger) ?? [];
    existing.push(node);
    map.set(node.trigger, existing);
  }
  return map;
}

export class Interpreter {
  particles: ParticleSystem | null = null;
  private returnTriggeredProjectiles: Projectile[] = [];

  setParticleSystem(particles: ParticleSystem): void {
    this.particles = particles;
  }

  executeAbility(
    schema: AbilitySchema,
    caster: Entity,
    aimDir: Vector2D,
    world: PhysicsWorld,
    depth = 0,
    spawnPos?: Vector2D,
  ): void {
    if (depth > MAX_DEPTH) return;
    if (world.getEntityCount() >= MAX_ENTITIES) return;

    const normalizedAim = aimDir.magSq() > 0 ? aimDir.normalize() : Vector2D.fromAngle(0);

    if (schema.recoilKick > 0) {
      world.applyKnockback(caster, normalizedAim.scale(-1), schema.recoilKick);
    }

    const onCastNodes = schema.triggers.filter((t) => t.trigger === 'ON_CAST');
    for (const node of onCastNodes) {
      const departurePos = caster.pos.clone();
      this.dispatchTriggerNode(node, caster, null, departurePos, normalizedAim, world, depth);
    }

    if (schema.trajectory) {
      const pos =
        spawnPos ??
        caster.pos.add(normalizedAim.scale(caster.radius + 12));
      const aimAngle = Math.atan2(normalizedAim.y, normalizedAim.x);
      const triggerMap = buildTriggerMap(
        schema.triggers.filter((t) => t.trigger !== 'ON_CAST'),
      );
      const projectile = new Projectile(
        pos,
        schema.trajectory,
        caster.id,
        aimAngle,
        triggerMap,
      );
      if (schema.trajectory.type === 'ORBIT_ANCHOR') {
        projectile.maxLifetimeMs = 3000;
      }
      world.addProjectile(projectile);
    }
  }

  dispatchActions(
    actions: ActionPayload[],
    source: Entity,
    target: Entity | null,
    hitPos: Vector2D,
    aimDir: Vector2D,
    world: PhysicsWorld,
    depth: number,
  ): void {
    for (const action of actions) {
      this.dispatchAction(action, source, target, hitPos, aimDir, world, depth);
    }
  }

  private dispatchAction(
    action: ActionPayload,
    source: Entity,
    target: Entity | null,
    hitPos: Vector2D,
    aimDir: Vector2D,
    world: PhysicsWorld,
    depth: number,
  ): void {
    switch (action.type) {
      case 'ADD_INSTABILITY': {
        const t = target ?? source;
        t.instabilityPct = Math.min(500, t.instabilityPct + action.amount);
        break;
      }
      case 'APPLY_IMPULSE': {
        const t = target ?? source;
        let dir: Vector2D;
        if (action.direction) {
          dir = new Vector2D(action.direction.x, action.direction.y);
        } else {
          dir = t.pos.sub(hitPos);
        }
        world.applyKnockback(t, dir, action.baseForce);
        this.particles?.burstSparks(hitPos, 8, '#ffaa44');
        break;
      }
      case 'SPAWN_FIELD': {
        world.addZone(new SpatialZone(hitPos, action.field, source.id));
        this.particles?.expandingRing(hitPos, action.field.radius, '#aa44ff');
        break;
      }
      case 'SPAWN_CHILD_PROJECTILE': {
        const childSchema: AbilitySchema = {
          id: `${source.id}_child`,
          name: 'Child Projectile',
          cooldownMs: 0,
          recoilKick: 0,
          trajectory: action.trajectory,
          triggers: action.triggers ?? [],
        };
        const offsetRad = (action.aimOffsetDeg ?? 0) * (Math.PI / 180);
        const baseAngle = Math.atan2(aimDir.y, aimDir.x);
        const childAim = Vector2D.fromAngle(baseAngle + offsetRad);
        this.executeAbility(childSchema, source, childAim, world, depth + 1, hitPos);
        break;
      }
      case 'TELEPORT': {
        let dir: Vector2D;
        if (action.direction) {
          dir = new Vector2D(action.direction.x, action.direction.y).normalize();
        } else {
          dir = aimDir.magSq() > 0 ? aimDir.normalize() : Vector2D.fromAngle(source instanceof Player ? source.facingAngle : 0);
        }
        const dest = source.pos.add(dir.scale(action.distance));
        source.pos = clampToHex(dest, world.hexCenter, world.hexRadius);
        this.particles?.burstSparks(source.pos, 12, '#44ffff');
        break;
      }
      case 'MODIFY_STAT':
        this.applyModifyStat(source, action.stat, action.value, action.mode);
        break;
    }
  }

  private applyModifyStat(
    entity: Entity,
    stat: 'mass' | 'linearDrag' | 'moveSpeed' | 'instabilityPct',
    value: number,
    mode: 'add' | 'set' | 'multiply',
  ): void {
    const apply = (current: number): number => {
      switch (mode) {
        case 'add':
          return current + value;
        case 'set':
          return value;
        case 'multiply':
          return current * value;
      }
    };

    switch (stat) {
      case 'mass':
        entity.mass = apply(entity.mass);
        break;
      case 'linearDrag':
        entity.linearDrag = apply(entity.linearDrag);
        entity.baseLinearDrag = entity.linearDrag;
        break;
      case 'instabilityPct':
        entity.instabilityPct = Math.min(500, Math.max(0, apply(entity.instabilityPct)));
        break;
      case 'moveSpeed':
        if (entity instanceof Player) {
          entity.moveSpeed = apply(entity.moveSpeed);
        }
        break;
    }
  }

  private dispatchTriggerNode(
    node: TriggerNode,
    source: Entity,
    target: Entity | null,
    hitPos: Vector2D,
    aimDir: Vector2D,
    world: PhysicsWorld,
    depth: number,
  ): void {
    this.dispatchActions(node.actions, source, target, hitPos, aimDir, world, depth);
    if (node.children) {
      for (const child of node.children) {
        this.dispatchTriggerNode(child, source, target, hitPos, aimDir, world, depth);
      }
    }
  }

  private dispatchProjectileTriggers(
    projectile: Projectile,
    triggerType: TriggerType,
    target: Entity | null,
    world: PhysicsWorld,
  ): void {
    const nodes = projectile.getTriggers(triggerType);
    const source = world.getEntityById(projectile.sourceEntityId);
    if (!source) return;

    const aimDir =
      projectile.vel.magSq() > 0
        ? projectile.vel.normalize()
        : Vector2D.fromAngle(projectile.aimAngle);

    for (const node of nodes) {
      this.dispatchTriggerNode(
        node,
        source,
        target,
        projectile.pos.clone(),
        aimDir,
        world,
        0,
      );
    }
  }

  processLifecycleEvents(world: PhysicsWorld): void {
    for (const hit of world.pendingHits) {
      this.dispatchProjectileTriggers(hit.projectile, 'ON_HIT', hit.target, world);
      this.particles?.burstSparks(hit.hitPos, 6, '#ff6644');
    }

    for (const projectile of this.returnTriggeredProjectiles) {
      this.dispatchProjectileTriggers(projectile, 'ON_RETURN', null, world);
      this.particles?.expandingRing(projectile.pos, 60, '#aa44ff');
    }
    this.returnTriggeredProjectiles = [];

    for (const projectile of world.pendingExpirations) {
      if (
        projectile.expiryReason === 'range' ||
        projectile.expiryReason === 'lifetime'
      ) {
        this.dispatchProjectileTriggers(projectile, 'ON_EXPIRY', null, world);
        this.particles?.expandingRing(projectile.pos, 40, '#ff4488');
      }
    }

    for (const projectile of world.projectiles) {
      if (projectile.isDead) continue;
      const tickNodes = projectile.getTriggers('ON_TICK');
      if (tickNodes.length === 0) continue;
      this.dispatchProjectileTriggers(projectile, 'ON_TICK', null, world);
      this.particles?.trail(projectile.pos, '#88ccff');
    }
  }

  updateTrajectories(world: PhysicsWorld, dt: number): void {
    for (const projectile of world.projectiles) {
      if (projectile.isDead) continue;
      updateTrajectory(projectile, dt, world);
      if (projectile.onReturnTriggered && projectile.isDead) {
        this.returnTriggeredProjectiles.push(projectile);
      }
    }
  }
}
