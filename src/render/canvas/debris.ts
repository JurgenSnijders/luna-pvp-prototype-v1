import { WORLD_GRAVITY, Z_TO_SCREEN } from '../../engine/verticalConstants';
import { Vector2D } from '../../math/Vector2D';
import { decalManager } from './decals';
import { drawEntityContactShadow } from './entities';

export const DEBRIS_MAX_SHARDS = 64;
const BOUNCE_VZ = 50;
const SETTLE_HOLD_MS = 2500;

export interface DebrisShard {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotation: number;
  vRot: number;
  bouncesRemaining: number;
  initialBounces: number;
  restitution: number;
  friction: number;
  radius: number;
  points: { x: number; y: number }[];
  color: string;
  settled: boolean;
  settledAt: number;
  fleckStamped: boolean;
  alpha: number;
}

export class DebrisManager {
  private static instance: DebrisManager;
  private shards: DebrisShard[] = [];
  private nextId = 1;

  public static getInstance(): DebrisManager {
    if (!DebrisManager.instance) {
      DebrisManager.instance = new DebrisManager();
    }
    return DebrisManager.instance;
  }

  public spawnShatterCluster(
    pos: Vector2D,
    count = 8,
    baseColor = '#8899aa',
    explosionForce = 320,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.shards.length >= DEBRIS_MAX_SHARDS) {
        this.shards.shift();
      }

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const planarSpeed = explosionForce * (0.5 + Math.random() * 0.8);
      const vz = 240 + Math.random() * 260;
      const radius = 3 + Math.random() * 4;

      const numVerts = 3 + Math.floor(Math.random() * 3);
      const points: { x: number; y: number }[] = [];
      for (let v = 0; v < numVerts; v++) {
        const a = (Math.PI * 2 * v) / numVerts + (Math.random() - 0.5) * 0.4;
        const r = radius * (0.7 + Math.random() * 0.6);
        points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }

      const bouncesRemaining = 2 + (Math.random() > 0.5 ? 1 : 0);
      this.shards.push({
        id: this.nextId++,
        x: pos.x,
        y: pos.y,
        z: 4 + Math.random() * 8,
        vx: Math.cos(angle) * planarSpeed,
        vy: Math.sin(angle) * planarSpeed,
        vz,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 14,
        bouncesRemaining,
        initialBounces: bouncesRemaining,
        restitution: 0.45 + Math.random() * 0.15,
        friction: 0.7,
        radius,
        points,
        color: baseColor,
        settled: false,
        settledAt: 0,
        fleckStamped: false,
        alpha: 1,
      });
    }
  }

  public update(dt: number, nowMs = performance.now()): void {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];

      if (s.settled) {
        const age = nowMs - s.settledAt;
        if (age > SETTLE_HOLD_MS) {
          s.alpha -= dt * 1.5;
          if (s.alpha <= 0) {
            this.shards.splice(i, 1);
          }
        }
        continue;
      }

      s.vz -= WORLD_GRAVITY * dt;
      s.z += s.vz * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rotation += s.vRot * dt;

      if (s.z <= 0) {
        s.z = 0;
        if (s.bouncesRemaining > 0 && Math.abs(s.vz) > BOUNCE_VZ) {
          s.vz = -s.vz * s.restitution;
          s.vx *= s.friction;
          s.vy *= s.friction;
          s.vRot *= s.friction;
          s.bouncesRemaining--;
        } else {
          s.vz = 0;
          s.vx = 0;
          s.vy = 0;
          s.vRot = 0;
          s.settled = true;
          s.settledAt = nowMs;
          if (!s.fleckStamped) {
            s.fleckStamped = true;
            decalManager.addDecal(s.x, s.y, s.radius * 0.6, 'SCORCH', s.color, 3000);
          }
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    for (const s of this.shards) {
      ctx.save();
      ctx.globalAlpha = s.alpha;

      if (s.z >= 0) {
        drawEntityContactShadow(ctx, s.x, s.y, s.radius, s.z);
      }

      const screenY = s.y - s.z * Z_TO_SCREEN;
      ctx.translate(s.x, screenY);
      ctx.rotate(s.rotation);

      ctx.fillStyle = s.color;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 0.8;

      ctx.beginPath();
      for (let v = 0; v < s.points.length; v++) {
        const pt = s.points[v];
        if (v === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  public getActiveShardCount(): number {
    return this.shards.length;
  }

  public getShardsReadonly(): readonly DebrisShard[] {
    return this.shards;
  }

  public clear(): void {
    this.shards = [];
  }
}
