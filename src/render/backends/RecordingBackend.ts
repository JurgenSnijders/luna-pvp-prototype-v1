import type { CameraView } from '../../camera/Camera2D';
import { Vector2D } from '../../math/Vector2D';
import type { ImpactVfx } from '../../types/schema';
import type { ParticleBackend, SpawnPriority, VfxCounters } from './ParticleBackend';

const POOL_SIZE = 128;
const SNAPSHOT_CAP = 48;

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

export interface RecordedParticle {
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
}

export class RecordingBackend implements ParticleBackend {
  readonly name = 'recording';
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

  snapshotParticles(): RecordedParticle[] {
    const out: RecordedParticle[] = [];
    for (const p of this.pool) {
      if (!p.active) continue;
      out.push({
        x: p.pos.x,
        y: p.pos.y,
        radius: Math.max(1.5, p.size),
        color: p.color,
        alpha: p.alpha,
      });
      if (out.length >= SNAPSHOT_CAP) break;
    }
    return out;
  }

  private spawn(
    pos: Vector2D,
    vel: Vector2D,
    life: number,
    color: string,
    size: number,
    initialAlpha = 1,
  ): void {
    if (this.getLiveParticleCount() >= POOL_SIZE) return;
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
    const segments = 10;
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
    for (let i = 0; i < 6; i++) {
      const cone = -0.55 + (i / 5) * 1.1;
      this.spawn(
        pos.add(heading.scale(10)),
        Vector2D.fromAngle(baseAngle + cone, 90 + Math.random() * 80),
        0.2,
        color,
        2.5,
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
      case 'MINI_NUKE':
        this.spawnRing(pos, 40 * scale, 3, color, 0.85, 0.45, 'CORE');
        this.burstSparks(pos, 8, color);
        break;
      case 'PLASMA_BLOOM':
        this.spawnFlash(pos, 35 * scale, color, 0.9, 0.3, 'CORE');
        this.burstSparks(pos, 8, color);
        break;
      default:
        this.burstSparks(pos, 8, color);
        this.spawnFlash(pos, 20 * scale, secondaryColor, 0.7, 0.2, 'SECONDARY');
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
    this.spawn(pos, Vector2D.fromAngle(Math.random() * Math.PI * 2, 6), 0.55, color, 4, 0.9);
  }

  ember(pos: Vector2D): void {
    this.spawn(
      pos,
      new Vector2D((Math.random() - 0.5) * 30, -10 - Math.random() * 20),
      0.4,
      '#ffaa00',
      2.5,
    );
  }

  spawnAmbientEmber(): void {}

  expandingRing(pos: Vector2D, radius: number, color: string): void {
    this.spawnRing(pos, radius, 3, color, 0.8, 0.5, 'CORE');
  }

  spawnDirectionalImpactRing(pos: Vector2D, normal: Vector2D, color: string): void {
    const heading = normal.magSq() > 0 ? normal.normalize() : Vector2D.fromAngle(0);
    const baseAngle = Math.atan2(heading.y, heading.x);
    for (let i = 0; i < 10; i++) {
      const angle = baseAngle + (i / 10 - 0.5) * Math.PI * 0.85;
      const edge = pos.add(Vector2D.fromAngle(angle, 20));
      this.spawn(edge, Vector2D.fromAngle(angle, 40), 0.35, color, 3.5, 0.85);
    }
  }

  zoneVortexTick(pos: Vector2D, radius: number, color: string): void {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius * 0.9));
    this.spawnStreak(edge, pos.sub(edge).normalize().scale(50), 8, color, 0.65, 0.35, 'SECONDARY');
  }

  zoneHazardPulse(pos: Vector2D, radius: number, color: string): void {
    this.spawnRing(pos, radius * 0.9, 2, color, 0.5, 0.4, 'SECONDARY');
  }

  statusFrost(pos: Vector2D, radius: number): void {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius));
    this.spawnStreak(edge, new Vector2D(-Math.sin(angle), Math.cos(angle)).scale(70), 6, '#00e5ff', 0.75, 0.35, 'SECONDARY');
  }

  statusThermal(pos: Vector2D, radius: number, intensity: number): void {
    if (Math.random() > intensity) return;
    this.spawn(pos.add(Vector2D.fromAngle(Math.random() * Math.PI * 2, radius * 0.2)), new Vector2D(0, -25), 0.4, '#ff6600', 3);
  }

  statusVoid(pos: Vector2D, radius: number): void {
    const angle = Math.random() * Math.PI * 2;
    const edge = pos.add(Vector2D.fromAngle(angle, radius * 1.5));
    this.spawnStreak(edge, pos.sub(edge).normalize().scale(60), 8, '#bf00ff', 0.7, 0.3, 'SECONDARY');
  }

  statusKinetic(pos: Vector2D, velocity: Vector2D): void {
    if (velocity.magSq() <= 50 * 50) return;
    const back = velocity.normalize().scale(-1);
    this.spawnStreak(pos.add(back.scale(6)), back.scale(40), 10, '#e0f8ff', 0.65, 0.2, 'SECONDARY');
  }

  emitLavaSizzle(pos: Vector2D): void {
    this.spawn(pos, new Vector2D((Math.random() - 0.5) * 15, -50), 0.25, '#ffccaa', 3);
  }
}
