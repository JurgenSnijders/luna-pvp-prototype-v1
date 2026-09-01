import { Vector2D } from '../math/Vector2D';
import type { ConstraintConfig } from '../types/schema';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { DEBUG_VECTOR_COLORS, makeDebugVector } from '../types/debug';
import type { Entity } from './Entity';
import { generateEntityId } from './Entity';

export class ConstraintJoint {
  id: string;
  config: ConstraintConfig;
  bodyA: Entity;
  bodyB?: Entity;
  anchorB?: Vector2D;
  remainingDurationMs: number;
  isDead: boolean;

  constructor(
    config: ConstraintConfig,
    bodyA: Entity,
    bodyB?: Entity,
    anchorB?: Vector2D,
  ) {
    this.id = generateEntityId('constraint');
    this.config = config;
    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.anchorB = anchorB;
    this.remainingDurationMs = config.durationMs;
    this.isDead = false;
  }

  update(dt: number, world?: PhysicsWorld): void {
    this.remainingDurationMs -= dt * 1000;
    if (this.remainingDurationMs <= 0) {
      this.isDead = true;
      return;
    }

    if (this.bodyA.isDead || (this.bodyB && this.bodyB.isDead)) {
      this.isDead = true;
      return;
    }

    if (this.config.type === 'SURFACE_PIN') {
      if (!this.anchorB) {
        this.isDead = true;
        return;
      }
      this.bodyA.pos.copyFrom(this.anchorB);
      this.bodyA.vel.set(0, 0);
      return;
    }

    const endPos = this.bodyB?.pos ?? this.anchorB;
    if (!endPos) {
      this.isDead = true;
      return;
    }

    const delta = endPos.sub(this.bodyA.pos);
    const d = delta.mag();

    if (this.config.maxBreakDistance !== undefined && d > this.config.maxBreakDistance) {
      this.isDead = true;
      return;
    }

    if (d === 0) return;

    const normal = delta.scale(1 / d);

    switch (this.config.type) {
      case 'SPRING_TETHER': {
        const stiffness = this.config.stiffness ?? 100;
        const restLength = this.config.restLength ?? 0;
        const force = stiffness * (d - restLength);
        const impulse = normal.scale(force * dt);
        this.bodyA.vel.addMut(impulse.scale(1 / this.bodyA.mass));
        if (this.bodyB) {
          this.bodyB.vel.subMut(impulse.scale(1 / this.bodyB.mass));
        }
        if (world?.debugPhysicsEnabled && impulse.magSq() > 0) {
          world.recordDebugVector(
            makeDebugVector(
              this.bodyA.pos,
              impulse,
              impulse.mag(),
              DEBUG_VECTOR_COLORS.CONSTRAINT,
              'spring',
            ),
          );
        }
        break;
      }
      case 'DISTANCE_ROD': {
        const restLength = this.config.restLength ?? 100;
        const correction = d - restLength;
        const totalMass = this.bodyA.mass + (this.bodyB?.mass ?? 0);
        if (totalMass === 0) break;

        if (this.bodyB) {
          const aRatio = this.bodyB.mass / totalMass;
          const bRatio = this.bodyA.mass / totalMass;
          this.bodyA.pos.addMut(normal.scale(correction * aRatio));
          this.bodyB.pos.subMut(normal.scale(correction * bRatio));
        } else {
          this.bodyA.pos.addMut(normal.scale(correction));
        }
        break;
      }
    }
  }
}
