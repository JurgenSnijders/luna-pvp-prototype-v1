import { Vector2D } from '../math/Vector2D';

let nextEntityId = 1;

export function generateEntityId(prefix = 'entity'): string {
  return `${prefix}_${nextEntityId++}`;
}

export class Entity {
  id: string;
  pos: Vector2D;
  prevPos: Vector2D;
  vel: Vector2D;
  accel: Vector2D;
  mass: number;
  radius: number;
  linearDrag: number;
  baseLinearDrag: number;
  isDead: boolean;
  instabilityPct: number;
  knockbackResistance: number;
  tags: Set<string>;

  constructor(
    id: string,
    pos: Vector2D,
    options: {
      mass?: number;
      radius?: number;
      linearDrag?: number;
      instabilityPct?: number;
      tags?: string[];
    } = {},
  ) {
    this.id = id;
    this.pos = pos;
    this.prevPos = pos.clone();
    this.vel = Vector2D.zero();
    this.accel = Vector2D.zero();
    this.mass = options.mass ?? 1;
    this.radius = options.radius ?? 16;
    this.linearDrag = options.linearDrag ?? 2;
    this.baseLinearDrag = this.linearDrag;
    this.isDead = false;
    this.instabilityPct = options.instabilityPct ?? 0;
    this.knockbackResistance = 0;
    this.tags = new Set(options.tags ?? []);
  }

  integrate(dt: number): void {
    this.prevPos = this.pos.clone();
    this.vel = this.vel.add(this.accel.scale(dt));
    const dragFactor = Math.max(0, 1 - this.linearDrag * dt);
    this.vel = this.vel.scale(dragFactor);
    this.pos = this.pos.add(this.vel.scale(dt));
    this.accel = Vector2D.zero();
  }

  update(_dt: number): void {
    // Subclasses override for per-tick logic
  }
}
