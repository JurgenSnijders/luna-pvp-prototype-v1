import { isInsideHex } from '../../math/HexMath';
import { Vector2D } from '../../math/Vector2D';
import type { ImpactVfx } from '../../types/schema';
import { getTierLimits } from '../../devtools/graphicsSettings';
import { ShapeId, FLOATS_PER_INSTANCE } from '../gl/shaders';
import type { GLContext } from '../gl/GLContext';
import { InstancedQuadRenderer } from '../gl/InstancedQuadRenderer';
import { PostFX } from '../gl/PostFX';
import { PrimitiveLayer } from '../PrimitiveLayer';
import {
  parseColor,
  type ParticleBackend,
  type SpawnPriority,
  type VfxCounters,
} from './ParticleBackend';

const PRIORITY_COST: Record<SpawnPriority, number> = {
  CORE: 0,
  PRIMARY: 1,
  SECONDARY: 2,
  AMBIENT: 3,
};

interface SimParticle {
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  angVel: number;
  drag: number;
  gravity: number;
  shapeId: number;
  r: number;
  g: number;
  b: number;
  peakAlpha: number;
  additive: boolean;
  params: [number, number, number, number];
}

const EMPTY_COUNTERS: VfxCounters = {
  liveParticles: 0,
  livePrimitives: 0,
  drawCalls: 0,
  instanceCount: 0,
  uploadBytes: 0,
};

export class WebGLBackend implements ParticleBackend {
  readonly name = 'webgl';
  private particles: SimParticle[] = [];
  private renderer: InstancedQuadRenderer;
  private postFx: PostFX;
  private primitives: PrimitiveLayer;

  constructor(
    private glCtx: GLContext,
    gl: WebGL2RenderingContext,
  ) {
    this.renderer = new InstancedQuadRenderer(gl);
    this.postFx = new PostFX(gl);
    this.primitives = new PrimitiveLayer();
  }

  rebuild(): void {
    const gl = this.glCtx.gl;
    if (!gl) return;
    this.renderer.rebuild();
    this.postFx.rebuild();
  }

  beginFrame(dt: number): void {
    this.renderer.beginFrame(dt);
    this.primitives.beginFrame();
  }

  update(dt: number): void {
    const alive: SimParticle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.velX *= Math.pow(p.drag, dt * 60);
      p.velY *= Math.pow(p.drag, dt * 60);
      p.velY += p.gravity * dt;
      p.posX += p.velX * dt;
      p.posY += p.velY * dt;
      p.rot += p.angVel * dt;
      alive.push(p);
    }
    this.particles = alive;
    this.primitives.update(dt);

    const data = this.renderer.getInstanceData();

    for (const prim of this.primitives.getActive()) {
      if (prim.additive) continue;
      this.packPrimitive(data, prim);
    }
    for (const p of this.particles) {
      const alpha = p.peakAlpha * (p.life / p.maxLife);
      if (alpha < 0.02 || p.additive) continue;
      this.packParticle(data, p, alpha);
    }
    for (const prim of this.primitives.getActive()) {
      if (!prim.additive) continue;
      this.packPrimitive(data, prim);
    }
    for (const p of this.particles) {
      const alpha = p.peakAlpha * (p.life / p.maxLife);
      if (alpha < 0.02 || !p.additive) continue;
      this.packParticle(data, p, alpha);
    }
  }

  private packPrimitive(
    data: Float32Array,
    prim: {
      posX: number;
      posY: number;
      size: number;
      rot: number;
      shapeId: number;
      r: number;
      g: number;
      b: number;
      alpha: number;
      life: number;
      maxLife: number;
      params: [number, number, number, number];
      additive: boolean;
    },
  ): void {
    const idx = this.renderer.allocInstance(prim.additive);
    if (idx < 0) return;
    this.writeInstance(data, idx, {
      posX: prim.posX,
      posY: prim.posY,
      sizeX: prim.size,
      sizeY: prim.size,
      rot: prim.rot,
      shapeId: prim.shapeId,
      r: prim.r,
      g: prim.g,
      b: prim.b,
      alpha: prim.alpha * (prim.life / prim.maxLife),
      params: prim.params,
    });
  }

  private packParticle(data: Float32Array, p: SimParticle, alpha: number): void {
    const idx = this.renderer.allocInstance(p.additive);
    if (idx < 0) return;
    this.writeInstance(data, idx, {
      posX: p.posX,
      posY: p.posY,
      sizeX: p.size,
      sizeY: p.size,
      rot: p.rot,
      shapeId: p.shapeId,
      r: p.r,
      g: p.g,
      b: p.b,
      alpha,
      params: p.params,
    });
  }

  private writeInstance(
    data: Float32Array,
    idx: number,
    inst: {
      posX: number;
      posY: number;
      sizeX: number;
      sizeY: number;
      rot: number;
      shapeId: number;
      r: number;
      g: number;
      b: number;
      alpha: number;
      params: [number, number, number, number];
    },
  ): void {
    const off = idx * FLOATS_PER_INSTANCE;
    data[off] = inst.posX;
    data[off + 1] = inst.posY;
    data[off + 2] = inst.sizeX;
    data[off + 3] = inst.sizeY;
    data[off + 4] = inst.rot;
    data[off + 5] = inst.r;
    data[off + 6] = inst.g;
    data[off + 7] = inst.b;
    data[off + 8] = inst.alpha;
    data[off + 9] = inst.shapeId;
    data[off + 10] = inst.params[0];
    data[off + 11] = inst.params[1];
    data[off + 12] = inst.params[2];
    data[off + 13] = inst.params[3];
  }

  render(width: number, height: number): VfxCounters {
    const gl = this.glCtx.gl;
    if (!gl || this.glCtx.isLost()) return EMPTY_COUNTERS;

    const bufferW = gl.drawingBufferWidth;
    const bufferH = gl.drawingBufferHeight;
    const limits = getTierLimits();
    this.postFx.resize(bufferW, bufferH, limits.bloomResolution);
    this.postFx.beginScene();

    gl.enable(gl.BLEND);
    const stats = this.renderer.drawSorted(width, height);

    const chroma = limits.bloomPasses >= 2 && limits.refraction ? 0.002 : 0;
    this.postFx.endSceneAndComposite(limits.bloomPasses, 0.8, chroma, bufferW, bufferH);

    return {
      liveParticles: this.particles.length,
      livePrimitives: this.primitives.getActive().length,
      drawCalls: stats.drawCalls + (limits.bloomPasses > 0 ? 3 : 0),
      instanceCount: stats.instanceCount,
      uploadBytes: stats.uploadBytes,
    };
  }

  resize(width: number, height: number): void {
    this.glCtx.resize(width, height);
  }

  getLiveParticleCount(): number {
    return this.particles.length;
  }

  getLivePrimitiveCount(): number {
    return this.primitives.getActive().length;
  }

  destroy(): void {
    this.particles = [];
  }

  private canSpawn(priority: SpawnPriority): boolean {
    const limits = getTierLimits();
    if (this.particles.length >= limits.particleBudget) {
      return PRIORITY_COST[priority] < PRIORITY_COST.SECONDARY;
    }
    return true;
  }

  private spawnParticle(p: SimParticle, priority: SpawnPriority): void {
    if (!this.canSpawn(priority)) return;
    this.particles.push(p);
  }

  private makeParticle(
    partial: Omit<SimParticle, 'maxLife' | 'params'> & { params?: [number, number, number, number] },
  ): SimParticle {
    return {
      params: partial.params ?? [0, 0, 0, 0],
      maxLife: partial.life,
      ...partial,
    };
  }

  spawnDisc(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    additive: boolean,
    priority: SpawnPriority,
  ): void {
    const [r, g, b] = parseColor(color);
    this.spawnParticle(
      this.makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: 0,
        velY: 0,
        life: 0.4,
        size,
        rot: 0,
        angVel: 0,
        drag: 0.95,
        gravity: 0,
        shapeId: ShapeId.DISC,
        r,
        g,
        b,
        peakAlpha: alpha,
        additive,
      }),
      priority,
    );
  }

  spawnGlow(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    additive: boolean,
    priority: SpawnPriority,
  ): void {
    const [r, g, b] = parseColor(color);
    this.spawnParticle(
      this.makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: 0,
        velY: 0,
        life: 0.35,
        size,
        rot: 0,
        angVel: 0,
        drag: 0.92,
        gravity: 0,
        shapeId: ShapeId.GLOW,
        r,
        g,
        b,
        peakAlpha: alpha,
        additive,
      }),
      priority,
    );
  }

  spawnRing(
    pos: Vector2D,
    radius: number,
    thickness: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void {
    if (!this.canSpawn(priority)) return;
    const [r, g, b] = parseColor(color);
    this.primitives.spawnRing(pos.x, pos.y, radius, thickness, r, g, b, alpha, life, true);
  }

  spawnStreak(
    pos: Vector2D,
    vel: Vector2D,
    length: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void {
    const [r, g, b] = parseColor(color);
    const rot = Math.atan2(vel.y, vel.x);
    this.spawnParticle(
      this.makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: vel.x,
        velY: vel.y,
        life,
        size: length,
        rot,
        angVel: 0,
        drag: 0.9,
        gravity: 0,
        shapeId: ShapeId.STREAK,
        r,
        g,
        b,
        peakAlpha: alpha,
        additive: true,
      }),
      priority,
    );
  }

  spawnFlash(
    pos: Vector2D,
    size: number,
    color: string,
    alpha: number,
    life: number,
    priority: SpawnPriority,
  ): void {
    if (!this.canSpawn(priority)) return;
    const [r, g, b] = parseColor(color);
    this.primitives.spawnFlash(pos.x, pos.y, size, r, g, b, alpha, life);
  }

  burstSparks(
    pos: Vector2D,
    count: number,
    color: string,
    priority: SpawnPriority = 'SECONDARY',
  ): void {
    const [r, g, b] = parseColor(color);
    for (let i = 0; i < count; i++) {
      if (!this.canSpawn(priority)) break;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 80 + Math.random() * 120;
      this.particles.push(
        this.makeParticle({
          posX: pos.x,
          posY: pos.y,
          velX: Math.cos(angle) * speed,
          velY: Math.sin(angle) * speed,
          life: 0.3 + Math.random() * 0.3,
          size: 2 + Math.random() * 3,
          rot: angle,
          angVel: 0,
          drag: 0.95,
          gravity: 0,
          shapeId: ShapeId.STREAK,
          r,
          g,
          b,
          peakAlpha: 1,
          additive: true,
        }),
      );
    }
  }

  triggerMuzzleFlash(pos: Vector2D, dir: Vector2D, color: string): void {
    const heading = dir.magSq() > 0 ? dir.normalize() : Vector2D.fromAngle(0);
    const baseAngle = Math.atan2(heading.y, heading.x);
    const flashPos = pos.add(heading.scale(10));
    this.spawnFlash(flashPos, 28, color, 0.9, 0.12, 'CORE');
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const cone = -0.55 + t * 1.1;
      const speed = 90 + Math.random() * 140;
      this.spawnStreak(
        flashPos,
        Vector2D.fromAngle(baseAngle + cone, speed),
        12 + Math.random() * 8,
        color,
        0.85,
        0.18 + Math.random() * 0.15,
        'PRIMARY',
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
        this.spawnRing(pos, 55 * scale, 2.5, secondaryColor, 0.9, 0.4, 'CORE');
        this.spawnFlash(pos, 40 * scale, secondaryColor, 0.7, 0.2, 'CORE');
        this.burstSparks(pos, 10, color, 'PRIMARY');
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6;
          this.spawnStreak(pos, Vector2D.fromAngle(a, 100), 14, secondaryColor, 0.8, 0.35, 'SECONDARY');
        }
        break;
      case 'MINI_NUKE':
        this.spawnRing(pos, 50 * scale, 4, color, 0.95, 0.5, 'CORE');
        this.spawnRing(pos, 90 * scale, 2, color, 0.6, 0.65, 'CORE');
        this.spawnFlash(pos, 55 * scale, secondaryColor, 0.85, 0.25, 'CORE');
        this.burstSparks(pos, 14, color, 'PRIMARY');
        this.burstSparks(pos, 6, secondaryColor, 'SECONDARY');
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
        this.burstSparks(pos, 12, color, 'SECONDARY');
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
        this.burstSparks(pos, 10, color, 'PRIMARY');
        break;
    }
  }

  trail(pos: Vector2D, color: string, trailKind: string): void {
    const [r, g, b] = parseColor(color);
    if (trailKind === 'SMOKE') {
      this.spawnParticle(
        this.makeParticle({
          posX: pos.x,
          posY: pos.y,
          velX: (Math.random() - 0.5) * 20,
          velY: (Math.random() - 0.5) * 20,
          life: 0.7,
          size: 8 + Math.random() * 4,
          rot: 0,
          angVel: 0,
          drag: 0.98,
          gravity: -5,
          shapeId: ShapeId.SMOKE,
          r,
          g,
          b,
          peakAlpha: 0.5,
          additive: false,
        }),
        'SECONDARY',
      );
      return;
    }
    if (trailKind === 'ICE_GLOW' || trailKind === 'FROST_CRYSTALS') {
      const a = Math.random() * Math.PI * 2;
      this.spawnParticle(
        this.makeParticle({
          posX: pos.x,
          posY: pos.y,
          velX: Math.cos(a) * 15,
          velY: Math.sin(a) * 15,
          life: 0.5,
          size: 5,
          rot: a,
          angVel: 2,
          drag: 0.99,
          gravity: 0,
          shapeId: ShapeId.SHARD,
          r,
          g,
          b,
          peakAlpha: 0.8,
          additive: true,
        }),
        'SECONDARY',
      );
      return;
    }
    if (trailKind === 'MAGMA_SPARKS' || trailKind === 'EMBER_SPIRAL') {
      this.ember(pos);
      return;
    }
    if (trailKind === 'NEON_RIBBON' || trailKind === 'VOID_TENDRIL' || trailKind === 'PLASMA_ARC') {
      this.neonRibbon(pos, color);
      return;
    }
    if (trailKind === 'DUST_PUFF') {
      this.spawnParticle(
        this.makeParticle({
          posX: pos.x,
          posY: pos.y,
          velX: (Math.random() - 0.5) * 8,
          velY: (Math.random() - 0.5) * 8,
          life: 0.9,
          size: 10,
          rot: 0,
          angVel: 0,
          drag: 0.99,
          gravity: -2,
          shapeId: ShapeId.SMOKE,
          r,
          g,
          b,
          peakAlpha: 0.35,
          additive: false,
        }),
        'SECONDARY',
      );
      return;
    }
    this.spawnParticle(
      this.makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: (Math.random() - 0.5) * 10,
        velY: (Math.random() - 0.5) * 10,
        life: 0.4,
        size: 3,
        rot: 0,
        angVel: 0,
        drag: 0.95,
        gravity: 0,
        shapeId: ShapeId.DISC,
        r,
        g,
        b,
        peakAlpha: 0.7,
        additive: false,
      }),
      'SECONDARY',
    );
  }

  neonRibbon(pos: Vector2D, color: string): void {
    const [r, g, b] = parseColor(color);
    this.spawnParticle(
      this.makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: (Math.random() - 0.5) * 6,
        velY: (Math.random() - 0.5) * 6,
        life: 0.55,
        size: 9,
        rot: 0,
        angVel: 0,
        drag: 0.96,
        gravity: 0,
        shapeId: ShapeId.GLOW,
        r,
        g,
        b,
        peakAlpha: 0.95,
        additive: true,
      }),
      'SECONDARY',
    );
  }

  ember(pos: Vector2D): void {
    const colors = ['#ff5500', '#ffaa00'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const [r, g, b] = parseColor(color);
    this.spawnParticle(
      this.makeParticle({
        posX: pos.x,
        posY: pos.y,
        velX: (Math.random() - 0.5) * 30,
        velY: -10 - Math.random() * 20,
        life: 0.5,
        size: 3,
        rot: 0,
        angVel: 0,
        drag: 0.96,
        gravity: -15,
        shapeId: ShapeId.GLOW,
        r,
        g,
        b,
        peakAlpha: 0.9,
        additive: true,
      }),
      'AMBIENT',
    );
  }

  spawnAmbientEmber(
    bounds: { width: number; height: number },
    safeCenter: Vector2D,
    safeRadius: number,
  ): void {
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = Math.random() * bounds.width;
      const y = Math.random() * bounds.height;
      const pos = new Vector2D(x, y);
      if (isInsideHex(pos, safeCenter, safeRadius)) continue;
      this.ember(pos);
      return;
    }
  }

  expandingRing(pos: Vector2D, radius: number, color: string): void {
    this.spawnRing(pos, radius, 3, color, 0.8, 0.5, 'CORE');
  }
}
