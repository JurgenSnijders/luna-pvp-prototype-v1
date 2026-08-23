import { Vector2D } from '../math/Vector2D';

const POOL_SIZE = 512;

interface Particle {
  pos: Vector2D;
  vel: Vector2D;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  alpha: number;
  active: boolean;
}

export class ParticleSystem {
  private pool: Particle[] = [];

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push({
        pos: Vector2D.zero(),
        vel: Vector2D.zero(),
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        size: 2,
        alpha: 1,
        active: false,
      });
    }
  }

  private spawn(
    pos: Vector2D,
    vel: Vector2D,
    life: number,
    color: string,
    size: number,
  ): void {
    const slot = this.pool.find((p) => !p.active);
    if (!slot) return;
    slot.pos = pos.clone();
    slot.vel = vel.clone();
    slot.life = life;
    slot.maxLife = life;
    slot.color = color;
    slot.size = size;
    slot.alpha = 1;
    slot.active = true;
  }

  burstSparks(pos: Vector2D, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 80 + Math.random() * 120;
      this.spawn(
        pos,
        Vector2D.fromAngle(angle, speed),
        0.3 + Math.random() * 0.3,
        color,
        2 + Math.random() * 2,
      );
    }
  }

  trail(pos: Vector2D, color: string): void {
    this.spawn(
      pos,
      Vector2D.fromAngle(Math.random() * Math.PI * 2, 10),
      0.4,
      color,
      3,
    );
  }

  expandingRing(pos: Vector2D, radius: number, color: string): void {
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const angle = (Math.PI * 2 * i) / segments;
      const edge = pos.add(Vector2D.fromAngle(angle, radius * 0.5));
      this.spawn(
        edge,
        Vector2D.fromAngle(angle, 30),
        0.5,
        color,
        4,
      );
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.pos = p.pos.add(p.vel.scale(dt));
      p.vel = p.vel.scale(0.95);
      p.alpha = p.life / p.maxLife;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
