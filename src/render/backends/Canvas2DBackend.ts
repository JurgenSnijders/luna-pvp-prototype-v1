import type { CameraView } from '../../camera/Camera2D';
import { getTierLimits } from '../../devtools/graphicsSettings';
import { isInsideHex } from '../../math/HexMath';
import { Vector2D } from '../../math/Vector2D';
import type { ImpactVfx } from '../../types/schema';
import type { ParticleBackend, SpawnPriority, VfxCounters } from './ParticleBackend';

const POOL_SIZE = 2048;

interface Particle {
  pos: Vector2D;
  vel: Vector2D;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  alpha: number;
  peakAlpha: number;
  active: boolean;
}

export class Canvas2DBackend implements ParticleBackend {
  readonly name = 'canvas2d';
  private pool: Particle[] = [];
  private freeList: number[] = [];

  constructor() {
    this.freeList = new Array(POOL_SIZE);
    for (let i = 0; i < POOL_SIZE; i++) {
      this.freeList[i] = POOL_SIZE - 1 - i;
      this.pool.push({
        pos: Vector2D.create(0, 0),
        vel: Vector2D.create(0, 0),
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        size: 2,
        alpha: 1,
        peakAlpha: 1,
        active: false,
      });
    }
  }

  beginFrame(_dt: number): void {}

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.freeList.push(i);
        continue;
      }
      p.pos.addScaledMut(p.vel, dt);
      p.vel.scaleMut(0.95);
      p.alpha = p.peakAlpha * (p.life / p.maxLife);
    }
  }

  render(_width: number, _height: number, _view: CameraView): VfxCounters {
    return {
      liveParticles: this.getLiveParticleCount(),
      livePrimitives: 0,
      drawCalls: 0,
      instanceCount: 0,
      uploadBytes: 0,
    };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const budget = Math.min(POOL_SIZE, getTierLimits().particleBudget);
    let drawn = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      if (drawn >= budget) break;
      drawn++;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      const s = Math.max(2, p.size * 2);
      ctx.fillRect(p.pos.x - s * 0.5, p.pos.y - s * 0.5, s, s);
    }
    ctx.globalAlpha = 1;
  }

  resize(): void {}

  getLiveParticleCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  getLivePrimitiveCount(): number {
    return 0;
  }

  destroy(): void {}

  private spawn(
    pos: Vector2D,
    vel: Vector2D,
    life: number,
    color: string,
    size: number,
    initialAlpha = 1,
  ): void {
    if (this.getLiveParticleCount() >= Math.min(POOL_SIZE, getTierLimits().particleBudget)) return;
    if (this.freeList.length === 0) return;
    const index = this.freeList.pop()!;
    const slot = this.pool[index];
    slot.pos.copyFrom(pos);
    slot.vel.copyFrom(vel);
    slot.life = life;
    slot.maxLife = life;
    slot.color = color;
    slot.size = size;
    slot.alpha = initialAlpha;
    slot.peakAlpha = initialAlpha;
    slot.active = true;
  }

  spawnDisc(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    _additive: boolean,
    _priority: SpawnPriority,
  ): void {
    this.spawn(pos, Vector2D.zero(), 0.4, color, size, alpha);
  }

  spawnGlow(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    _additive: boolean,
    _priority: SpawnPriority,
  ): void {
    this.spawn(pos, Vector2D.zero(), 0.35, color, size * 1.2, alpha);
  }

  spawnRing(
    pos: Vector2D,
    radius: number,
    _thickness: number,
    color: string,
    alpha: number,
    life: number,
    _priority: SpawnPriority,
  ): void {
    const segments = 12;
    for (let i = 0; i < segments; i++) {
      const angle = (Math.PI * 2 * i) / segments;
      const edge = pos.add(Vector2D.fromAngle(angle, radius * 0.5));
      this.spawn(edge, Vector2D.fromAngle(angle, 30), life, color, 4, alpha);
    }
  }

  spawnStreak(
    pos: Vector2D,
    vel: Vector2D,
    _length: number,
    color: string,
    alpha: number,
    life: number,
    _priority: SpawnPriority,
  ): void {
    this.spawn(pos, vel, life, color, 3, alpha);
  }

  spawnFlash(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    life: number,
    _priority: SpawnPriority,
  ): void {
    this.spawn(pos, Vector2D.zero(), life, color, size, alpha);
  }

  burstSparks(
    pos: Vector2D,
    count: number,
    color: string,
    _priority: SpawnPriority = 'SECONDARY',
  ): void {
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

  triggerMuzzleFlash(pos: Vector2D, dir: Vector2D, color: string): void {
    const heading = dir.magSq() > 0 ? dir.normalize() : Vector2D.fromAngle(0);
    const baseAngle = Math.atan2(heading.y, heading.x);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const cone = -0.55 + t * 1.1;
      const speed = 90 + Math.random() * 140;
      this.spawn(
        pos.add(heading.scale(10)),
        Vector2D.fromAngle(baseAngle + cone, speed),
        0.18 + Math.random() * 0.2,
        color,
        2 + Math.random() * 2.5,
      );
    }
  }

  triggerImpactBurst(
    pos: Vector2D,
    color: string,
    secondaryColor: string,
    vfxType: ImpactVfx,
    scale = 1,
  ): void {
    switch (vfxType) {
      case 'SHOCKWAVE':
        this.spawnRing(pos, 50 * scale, 3, color, 0.85, 0.45, 'CORE');
        break;
      case 'ICE_BURST':
        this.spawnRing(pos, 55 * scale, 2, secondaryColor, 0.9, 0.4, 'CORE');
        this.burstSparks(pos, 12, color);
        break;
      case 'MINI_NUKE':
        this.spawnRing(pos, 50 * scale, 4, color, 0.95, 0.5, 'CORE');
        this.spawnRing(pos, 90 * scale, 2, color, 0.6, 0.65, 'CORE');
        this.spawnFlash(pos, 55 * scale, secondaryColor, 0.85, 0.25, 'CORE');
        this.burstSparks(pos, 14, color);
        this.burstSparks(pos, 6, secondaryColor);
        break;
      case 'VORTEX_SWIRL': {
        for (let i = 0; i < 12; i++) {
          const angle = (Math.PI * 2 * i) / 12;
          const radial = Vector2D.fromAngle(angle, 40);
          const tangent = new Vector2D(-radial.y, radial.x).normalize().scale(90);
          this.spawnStreak(
            pos.add(radial.scale(0.3)),
            tangent.add(radial.scale(-0.4)),
            10,
            color,
            0.75,
            0.45,
            'PRIMARY',
          );
        }
        break;
      }
      case 'PLASMA_BLOOM':
        this.spawnFlash(pos, 45 * scale, color, 0.9, 0.3, 'CORE');
        this.spawnRing(pos, 35 * scale, 5, secondaryColor, 0.7, 0.35, 'PRIMARY');
        this.burstSparks(pos, 12, color);
        break;
      case 'SHATTER':
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.2;
          this.spawnStreak(pos, Vector2D.fromAngle(a, 120 + Math.random() * 80), 16, color, 0.9, 0.4, 'PRIMARY');
        }
        break;
      case 'IMPLOSION':
        this.spawnRing(pos, 60 * scale, 2, color, 0.8, 0.5, 'CORE');
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI * 2 * i) / 8;
          this.spawnStreak(pos, Vector2D.fromAngle(a, -80), 12, secondaryColor, 0.7, 0.35, 'PRIMARY');
        }
        break;
      case 'LIGHTNING_FORK':
        for (let i = 0; i < 5; i++) {
          const a = -0.8 + Math.random() * 1.6;
          this.spawnStreak(pos, Vector2D.fromAngle(a, 150), 20, secondaryColor, 0.95, 0.15, 'CORE');
        }
        this.spawnFlash(pos, 30 * scale, color, 0.8, 0.1, 'CORE');
        break;
      case 'RUNE_FLASH':
        this.spawnFlash(pos, 50 * scale, secondaryColor, 0.85, 0.35, 'CORE');
        this.spawnRing(pos, 40 * scale, 1.5, color, 0.75, 0.4, 'PRIMARY');
        break;
      case 'SPARKS':
      default:
        this.burstSparks(pos, 10, color);
        break;
    }
  }

  trail(pos: Vector2D, color: string, trailKind: string): void {
    if (trailKind === 'MAGMA_SPARKS') {
      this.ember(pos);
      return;
    }
    this.spawn(pos, Vector2D.fromAngle(Math.random() * Math.PI * 2, 10), 0.4, color, 3);
  }

  neonRibbon(pos: Vector2D, color: string): void {
    this.spawn(pos, Vector2D.fromAngle(Math.random() * Math.PI * 2, 6), 0.55, color, 4.5, 0.95);
  }

  ember(pos: Vector2D): void {
    const colors = ['#ff5500', '#ffaa00'];
    this.spawn(
      pos,
      new Vector2D((Math.random() - 0.5) * 30, -10 - Math.random() * 20),
      0.4 + Math.random() * 0.3,
      colors[Math.floor(Math.random() * colors.length)],
      2 + Math.random(),
    );
  }

  spawnAmbientEmber(
    bounds: { minX: number; minY: number; width: number; height: number },
    safeCenter: Vector2D,
    safeRadius: number,
  ): void {
    for (let attempt = 0; attempt < 6; attempt++) {
      const pos = new Vector2D(
        bounds.minX + Math.random() * bounds.width,
        bounds.minY + Math.random() * bounds.height,
      );
      if (isInsideHex(pos, safeCenter, safeRadius)) continue;
      this.ember(pos);
      return;
    }
  }

  expandingRing(pos: Vector2D, radius: number, color: string): void {
    this.spawnRing(pos, radius, 3, color, 0.8, 0.5, 'CORE');
  }

  spawnDirectionalImpactRing(pos: Vector2D, normal: Vector2D, color: string): void {
    const heading = normal.magSq() > 0 ? normal.normalize() : Vector2D.fromAngle(0);
    const baseAngle = Math.atan2(heading.y, heading.x);
    const segments = 14;
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const angle = baseAngle + (t - 0.5) * Math.PI * 0.85;
      const stretch = 1 + Math.abs(Math.cos(angle - baseAngle)) * 0.5;
      const dist = 22 * stretch;
      const edge = pos.add(Vector2D.fromAngle(angle, dist));
      this.spawn(edge, Vector2D.fromAngle(angle, 40), 0.4, color, 4, 0.85);
    }
  }

  zoneVortexTick(pos: Vector2D, radius: number, color: string): void {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const edge = pos.add(Vector2D.fromAngle(angle, radius * 0.9));
      const inward = pos.sub(edge).normalize().scale(50);
      this.spawnStreak(edge, inward, 8, color, 0.65, 0.35, 'SECONDARY');
    }
  }

  zoneHazardPulse(pos: Vector2D, radius: number, color: string): void {
    this.spawnRing(pos, radius * 0.9, 2, color, 0.5, 0.4, 'SECONDARY');
  }

  statusFrost(pos: Vector2D, radius: number): void {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius));
    const tangent = new Vector2D(-Math.sin(angle), Math.cos(angle)).scale(70);
    this.spawnStreak(edge, tangent, 6, '#00e5ff', 0.75, 0.35, 'SECONDARY');
  }

  statusThermal(pos: Vector2D, radius: number, intensity: number): void {
    if (Math.random() > intensity) return;
    const spawn = pos.add(Vector2D.fromAngle(Math.random() * Math.PI * 2, radius * 0.2));
    this.spawn(spawn, new Vector2D((Math.random() - 0.5) * 15, -25), 0.4, '#ff6600', 3);
  }

  statusVoid(pos: Vector2D, radius: number): void {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius * 1.5));
    const inward = pos.sub(edge).normalize().scale(60);
    this.spawnStreak(edge, inward, 8, '#bf00ff', 0.7, 0.3, 'SECONDARY');
  }

  statusKinetic(pos: Vector2D, velocity: Vector2D): void {
    if (velocity.magSq() <= 50 * 50) return;
    const back = velocity.normalize().scale(-1);
    this.spawnStreak(pos.add(back.scale(6)), back.scale(40), 10, '#e0f8ff', 0.65, 0.2, 'SECONDARY');
  }
}
