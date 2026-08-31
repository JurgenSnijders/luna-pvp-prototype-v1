import { getClosestEdgeNormal, getHexVertices } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
import type { Projectile } from '../entities/Projectile';
import type { ProjectileStyle } from '../types/schema';
import { getGraphicsSettings } from '../devtools/graphicsSettings';
import type { ParticleSystem } from './ParticleSystem';

export interface DebugOptions {
  showVectors: boolean;
  showRadii: boolean;
  showIds: boolean;
}

const FIELD_COLORS: Record<string, string> = {
  RADIAL_IMPULSE: 'rgba(255, 68, 68, 0.25)',
  VORTEX_TANGENT: 'rgba(170, 68, 255, 0.25)',
  FRICTION_OVERRIDE: 'rgba(68, 170, 255, 0.25)',
  MASS_ATTRACTOR: 'rgba(128, 128, 255, 0.3)',
};

/** Padding around baked sprites so the glow halo is not clipped. */
const GLOW_PAD = 20;
const SPRITE_CACHE_MAX = 300;

type SpriteKind = 'DISC' | 'ORB' | 'SHURIKEN' | 'BEAM' | 'DOT';

interface SpriteEntry {
  canvas: HTMLCanvasElement;
  /** Destination size in CSS pixels (canvas backing store may be scaled by DPR). */
  w: number;
  h: number;
}

export class CanvasRenderer {
  private ringRotation = 0;
  private bgCacheCanvas: HTMLCanvasElement | null = null;
  private bgCacheKey = '';
  private spriteCache = new Map<string, SpriteEntry>();
  private cachedHexRadius = -1;
  private cachedHexCenterX = NaN;
  private cachedHexCenterY = NaN;
  private cachedHexVertices: Vector2D[] = [];

  constructor(private ctx: CanvasRenderingContext2D) {}

  render(
    world: PhysicsWorld,
    particles: ParticleSystem,
    alpha: number,
    debug: DebugOptions,
    width: number,
    height: number,
    shrinkProgress = 0,
    isShrinking = false,
  ): void {
    const ctx = this.ctx;
    this.ringRotation += 0.02;

    this.drawLavaSea(ctx, world, width, height);
    if (getGraphicsSettings().lavaHeatWaves) {
      this.drawLavaHeatWaves(ctx, world, width, height);
    }
    this.drawHexPlatform(ctx, world, shrinkProgress, isShrinking);
    this.drawTerrainPatches(ctx, world);
    this.drawZones(ctx, world);
    this.drawObstacles(ctx, world);
    particles.draw(ctx);
    this.drawCombatants(ctx, world, alpha);
    this.drawConstraints(ctx, world);
    this.drawProjectiles(ctx, world, alpha);
    this.drawOverheadHUD(ctx, world, alpha);

    if (debug.showVectors || debug.showRadii || debug.showIds) {
      this.drawDebugOverlay(ctx, world, alpha, debug);
    }
  }

  private lerpPos(entity: Entity, alpha: number): Vector2D {
    return entity.prevPos.lerp(entity.pos, alpha);
  }

  private drawLavaSea(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    width: number,
    height: number,
  ): void {
    const { hexCenter: center } = world;
    const key = `${width}|${height}|${Math.round(center.x)}|${Math.round(center.y)}`;

    if (!this.bgCacheCanvas || this.bgCacheKey !== key) {
      this.buildBackgroundCache(width, height, center.x, center.y);
      this.bgCacheKey = key;
    }

    ctx.drawImage(this.bgCacheCanvas!, 0, 0);
  }

  /** Bakes the full-screen lava gradient once; rebuilt only on resize or center change. */
  private buildBackgroundCache(
    width: number,
    height: number,
    centerX: number,
    centerY: number,
  ): void {
    if (!this.bgCacheCanvas) {
      this.bgCacheCanvas = document.createElement('canvas');
    }
    const canvas = this.bgCacheCanvas;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const bctx = canvas.getContext('2d')!;

    const gradRadius = Math.hypot(width, height) * 0.55;
    const gradient = bctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      gradRadius,
    );
    gradient.addColorStop(0, 'rgba(210, 50, 0, 1.0)');
    gradient.addColorStop(0.45, 'rgba(130, 20, 0, 1.0)');
    gradient.addColorStop(1, 'rgba(40, 5, 0, 1.0)');

    bctx.fillStyle = gradient;
    bctx.fillRect(0, 0, width, height);
  }

  private drawLavaHeatWaves(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    width: number,
    height: number,
  ): void {
    const { hexCenter: center, hexRadius } = world;
    const now = performance.now() * 0.0015;
    const maxR = Math.hypot(width, height) * 0.6;

    for (let i = 0; i < 8; i++) {
      const rippleR =
        hexRadius * (0.5 + i * 0.15) +
        Math.sin(now + i * 0.8) * 20 +
        (i / 8) * (maxR - hexRadius);
      const alpha = 0.04 + 0.08 * (0.5 + 0.5 * Math.sin(now + i * 0.8));
      ctx.strokeStyle = `rgba(255, 100, 30, ${alpha})`;
      ctx.lineWidth = 1.5 + (i % 3);
      ctx.beginPath();
      ctx.ellipse(
        center.x,
        center.y,
        rippleR * 1.05,
        rippleR * 0.92,
        now * 0.1 + i * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    for (let i = 0; i < 4; i++) {
      const phase = now + i * 1.7;
      const startX = (width * (0.1 + i * 0.2) + Math.sin(phase) * 40) % width;
      const startY = (height * (0.2 + i * 0.15) + Math.cos(phase * 0.7) * 30) % height;
      ctx.strokeStyle = 'rgba(255, 90, 20, 0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(
        startX + 120 + Math.sin(phase) * 50,
        startY - 80 + Math.cos(phase) * 40,
        startX + 240 + Math.cos(phase * 1.2) * 60,
        startY + 60 + Math.sin(phase * 0.9) * 50,
        startX + 360,
        startY + 20,
      );
      ctx.stroke();
    }

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6 + now * 0.4;
      const spotR = hexRadius * (1.02 + 0.04 * Math.sin(now * 2 + i));
      const spot = center.add(Vector2D.fromAngle(angle, spotR));
      const spotAlpha = 0.15 + 0.1 * Math.sin(now * 2 + i);
      ctx.fillStyle = `rgba(255, 140, 40, ${spotAlpha})`;
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 6 + Math.sin(now + i) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawHexPlatform(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    shrinkProgress: number,
    isShrinking: boolean,
  ): void {
    if (
      world.hexRadius !== this.cachedHexRadius ||
      world.hexCenter.x !== this.cachedHexCenterX ||
      world.hexCenter.y !== this.cachedHexCenterY
    ) {
      this.cachedHexVertices = getHexVertices(world.hexCenter, world.hexRadius);
      this.cachedHexRadius = world.hexRadius;
      this.cachedHexCenterX = world.hexCenter.x;
      this.cachedHexCenterY = world.hexCenter.y;
    }
    const vertices = this.cachedHexVertices;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = '#12121e';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    if (isShrinking) {
      const pulse = 0.4 + 0.4 * Math.sin(performance.now() * 0.006);
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      ctx.closePath();
      const width = 3 + 3 * shrinkProgress;
      ctx.strokeStyle = `rgba(255, 40, 40, ${0.35 * pulse})`;
      ctx.lineWidth = width * 3;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 40, 40, ${pulse})`;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  private drawZones(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
    for (const zone of world.zones) {
      if (zone.isDead) continue;
      const color = FIELD_COLORS[zone.config.fieldType] ?? 'rgba(255,255,255,0.2)';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(zone.pos.x, zone.pos.y, zone.config.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color.replace('0.25', '0.8').replace('0.3', '0.8');
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(
        zone.pos.x,
        zone.pos.y,
        zone.config.radius,
        this.ringRotation,
        this.ringRotation + Math.PI * 2,
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawTerrainPatches(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
    const now = performance.now() * 0.001;

    for (const patch of world.terrainPatches) {
      const { pos, config } = patch;
      const r = config.radius;

      if (config.type === 'SAFE') {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const pulse = (Math.sin(now * 3) + 1) / 2;
        ctx.fillStyle = `rgba(255, 80, 20, ${0.25 + pulse * 0.15})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 120, 40, ${0.15 + pulse * 0.2})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawObstacles(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
    for (const obstacle of world.obstacles) {
      if (obstacle.isDead) continue;

      const { pos, config } = obstacle;
      ctx.fillStyle = '#94a3b8';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;

      if (config.shape === 'CIRCLE') {
        const radius = config.width / 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const angle = config.angle ?? 0;
        const halfW = config.width / 2;
        const halfH = config.height / 2;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        ctx.fillRect(-halfW, -halfH, config.width, config.height);
        ctx.strokeRect(-halfW, -halfH, config.width, config.height);
        ctx.restore();
      }
    }
  }

  private drawConstraints(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
    for (const c of world.getConstraints()) {
      if (c.isDead) continue;

      const p1 = c.bodyA.pos;
      const p2 = c.bodyB?.pos ?? c.anchorB;
      if (!p2) continue;

      switch (c.config.type) {
        case 'SPRING_TETHER':
          ctx.strokeStyle = 'rgba(0, 255, 150, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          ctx.setLineDash([]);
          break;

        case 'DISTANCE_ROD':
          ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          break;

        case 'SURFACE_PIN': {
          ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          const size = 8;
          ctx.beginPath();
          ctx.moveTo(p2.x - size, p2.y - size);
          ctx.lineTo(p2.x + size, p2.y + size);
          ctx.moveTo(p2.x + size, p2.y - size);
          ctx.lineTo(p2.x - size, p2.y + size);
          ctx.stroke();
          break;
        }
      }
    }
    ctx.setLineDash([]);
  }

  private drawCombatants(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    alpha: number,
  ): void {
    for (const player of world.players) {
      if (player.isDead) continue;
      const pos = this.lerpPos(player, alpha);
      const isBot = player.tags.has('bot');
      ctx.fillStyle = isBot ? '#ff8844' : '#00ccff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, player.radius, 0, Math.PI * 2);
      ctx.fill();

      const aimEnd = pos.add(Vector2D.fromAngle(player.facingAngle, player.radius + 14));
      ctx.strokeStyle = isBot ? '#ffbb88' : '#88eeff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(aimEnd.x, aimEnd.y);
      ctx.stroke();

      this.drawStasisOverlay(ctx, player, pos);
    }

    for (const dummy of world.dummies) {
      if (dummy.isDead) continue;
      const pos = this.lerpPos(dummy, alpha);
      ctx.fillStyle = '#ff8844';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, dummy.radius, 0, Math.PI * 2);
      ctx.fill();

      this.drawStasisOverlay(ctx, dummy, pos);
    }
  }

  private drawStasisOverlay(
    ctx: CanvasRenderingContext2D,
    entity: Entity,
    pos: Vector2D,
  ): void {
    if (entity.stasisRemainingMs > 0) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, entity.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (entity.stashedMomentum.magSq() > 0) {
      const dir = entity.stashedMomentum.normalize();
      const length = Math.min(entity.radius * 2.5, entity.stashedMomentum.mag() * 0.15);
      const tip = pos.add(dir.scale(length));
      ctx.strokeStyle = '#ff2222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();

      const headLen = 6;
      const angle = Math.atan2(dir.y, dir.x);
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(
        tip.x - headLen * Math.cos(angle - Math.PI / 6),
        tip.y - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(
        tip.x - headLen * Math.cos(angle + Math.PI / 6),
        tip.y - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    }
  }

  private drawProjectiles(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    alpha: number,
  ): void {
    const now = performance.now();
    for (const proj of world.projectiles) {
      if (proj.isDead) continue;
      const pos = this.lerpPos(proj, alpha);
      const color = proj.visuals?.color ?? '#00e5ff';
      const style: ProjectileStyle = proj.visuals?.projectileStyle ?? 'DISC';
      const radius = Math.max(4, Math.min(32, proj.radius));

      switch (style) {
        case 'BEAM': {
          const angle =
            proj.vel.magSq() > 0
              ? Math.atan2(proj.vel.y, proj.vel.x)
              : proj.aimAngle;
          const sprite = this.getSprite('BEAM', color, radius);
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(angle);
          ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
          ctx.restore();
          break;
        }
        case 'PULSING_ORB': {
          const sprite = this.getSprite('ORB', color, radius);
          const scale = (radius + Math.sin(now * 0.01) * 3) / radius;
          const w = sprite.w * scale;
          const h = sprite.h * scale;
          ctx.drawImage(sprite.canvas, pos.x - w / 2, pos.y - h / 2, w, h);
          break;
        }
        case 'SHURIKEN': {
          const heading =
            proj.vel.magSq() > 0
              ? Math.atan2(proj.vel.y, proj.vel.x)
              : proj.aimAngle;
          const sprite = this.getSprite('SHURIKEN', color, radius);
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(heading + now * 0.02);
          ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
          ctx.restore();
          break;
        }
        case 'CHAOS_LIGHTNING':
          this.drawChaosLightningProjectile(ctx, proj, pos, radius, color, alpha);
          break;
        case 'DISC':
        default: {
          const sprite = this.getSprite('DISC', color, radius);
          ctx.drawImage(
            sprite.canvas,
            pos.x - sprite.w / 2,
            pos.y - sprite.h / 2,
            sprite.w,
            sprite.h,
          );
          break;
        }
      }
    }
  }

  /**
   * Returns a cached glow sprite for the given style/color/size, baking it on
   * first use. shadowBlur cost is paid once here instead of per frame.
   */
  private getSprite(kind: SpriteKind, color: string, radius: number): SpriteEntry {
    const r = Math.max(1, Math.round(radius));
    const dpr = window.devicePixelRatio || 1;
    const key = `${kind}|${color}|${r}|${dpr}`;

    let entry = this.spriteCache.get(key);
    if (!entry) {
      if (this.spriteCache.size >= SPRITE_CACHE_MAX) {
        this.spriteCache.clear();
      }
      entry = this.bakeSprite(kind, color, r, dpr);
      this.spriteCache.set(key, entry);
    }
    return entry;
  }

  private createSpriteCanvas(
    w: number,
    h: number,
    dpr: number,
  ): { canvas: HTMLCanvasElement; bctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * dpr));
    canvas.height = Math.max(1, Math.ceil(h * dpr));
    const bctx = canvas.getContext('2d')!;
    bctx.scale(dpr, dpr);
    bctx.translate(w / 2, h / 2);
    return { canvas, bctx };
  }

  private bakeSprite(
    kind: SpriteKind,
    color: string,
    radius: number,
    dpr: number,
  ): SpriteEntry {
    switch (kind) {
      case 'BEAM':
        return this.bakeBeamSprite(color, radius, dpr);
      case 'ORB':
        return this.bakeOrbSprite(color, radius, dpr);
      case 'SHURIKEN':
        return this.bakeShurikenSprite(color, radius, dpr);
      case 'DOT':
        return this.bakeDotSprite(color, radius, dpr);
      case 'DISC':
      default:
        return this.bakeDiscSprite(color, radius, dpr);
    }
  }

  private bakeDiscSprite(color: string, radius: number, dpr: number): SpriteEntry {
    const size = (radius + 4 + GLOW_PAD) * 2;
    const { canvas, bctx } = this.createSpriteCanvas(size, size, dpr);

    bctx.shadowBlur = 12;
    bctx.shadowColor = color;
    bctx.fillStyle = color;
    bctx.beginPath();
    bctx.arc(0, 0, radius, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = '#ffffff';
    bctx.globalAlpha = 0.85;
    bctx.beginPath();
    bctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
    bctx.fill();
    bctx.globalAlpha = 1;
    bctx.strokeStyle = color;
    bctx.lineWidth = 1.5;
    bctx.beginPath();
    bctx.arc(0, 0, radius + 2, 0, Math.PI * 2);
    bctx.stroke();

    return { canvas, w: size, h: size };
  }

  private bakeOrbSprite(color: string, radius: number, dpr: number): SpriteEntry {
    const size = (radius + 6 + GLOW_PAD) * 2;
    const { canvas, bctx } = this.createSpriteCanvas(size, size, dpr);

    bctx.shadowBlur = 12;
    bctx.shadowColor = color;
    bctx.fillStyle = color;
    bctx.globalAlpha = 0.35;
    bctx.beginPath();
    bctx.arc(0, 0, radius + 4, 0, Math.PI * 2);
    bctx.fill();
    bctx.globalAlpha = 0.55;
    bctx.beginPath();
    bctx.arc(0, 0, radius, 0, Math.PI * 2);
    bctx.fill();
    bctx.globalAlpha = 1;
    bctx.beginPath();
    bctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
    bctx.fill();
    bctx.fillStyle = '#ffffff';
    bctx.globalAlpha = 0.7;
    bctx.beginPath();
    bctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    bctx.fill();
    bctx.globalAlpha = 1;
    bctx.strokeStyle = color;
    bctx.lineWidth = 2;
    bctx.beginPath();
    bctx.arc(0, 0, radius, 0, Math.PI * 2);
    bctx.stroke();

    return { canvas, w: size, h: size };
  }

  /** Beam capsule baked along the +X axis; rotated to the velocity at draw time. */
  private bakeBeamSprite(color: string, radius: number, dpr: number): SpriteEntry {
    const halfLen = (radius * 3) / 2;
    const w = radius * 4 + GLOW_PAD * 2;
    const h = radius + GLOW_PAD * 2;
    const { canvas, bctx } = this.createSpriteCanvas(w, h, dpr);

    bctx.lineCap = 'round';
    bctx.shadowBlur = 12;
    bctx.shadowColor = color;
    bctx.strokeStyle = color;
    bctx.lineWidth = radius;
    bctx.beginPath();
    bctx.moveTo(-halfLen, 0);
    bctx.lineTo(halfLen, 0);
    bctx.stroke();

    bctx.shadowBlur = 6;
    bctx.strokeStyle = '#ffffff';
    bctx.lineWidth = Math.max(1.5, radius * 0.35);
    bctx.beginPath();
    bctx.moveTo(-halfLen, 0);
    bctx.lineTo(halfLen, 0);
    bctx.stroke();

    return { canvas, w, h };
  }

  /** Star baked unrotated; spun at draw time. */
  private bakeShurikenSprite(color: string, radius: number, dpr: number): SpriteEntry {
    const size = (radius + 2 + GLOW_PAD) * 2;
    const { canvas, bctx } = this.createSpriteCanvas(size, size, dpr);
    const points = 4;
    const inner = radius * 0.35;

    bctx.shadowBlur = 12;
    bctx.shadowColor = color;
    bctx.fillStyle = color;
    bctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? radius : inner;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) bctx.moveTo(x, y);
      else bctx.lineTo(x, y);
    }
    bctx.closePath();
    bctx.fill();
    bctx.fillStyle = '#ffffff';
    bctx.globalAlpha = 0.8;
    bctx.beginPath();
    bctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    bctx.fill();
    bctx.globalAlpha = 1;
    bctx.strokeStyle = color;
    bctx.lineWidth = 1.5;
    bctx.beginPath();
    bctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    bctx.stroke();

    return { canvas, w: size, h: size };
  }

  /** Small glow dot used as the lightning head. */
  private bakeDotSprite(color: string, radius: number, dpr: number): SpriteEntry {
    const size = (radius + GLOW_PAD) * 2;
    const { canvas, bctx } = this.createSpriteCanvas(size, size, dpr);

    bctx.shadowBlur = 12;
    bctx.shadowColor = color;
    bctx.fillStyle = color;
    bctx.beginPath();
    bctx.arc(0, 0, radius, 0, Math.PI * 2);
    bctx.fill();

    return { canvas, w: size, h: size };
  }

  /**
   * Lightning stays procedural (random per frame), but glow now comes from a
   * wide translucent understroke plus a baked head sprite instead of shadowBlur.
   */
  private drawChaosLightningProjectile(
    ctx: CanvasRenderingContext2D,
    proj: Projectile,
    pos: Vector2D,
    radius: number,
    color: string,
    alpha: number,
  ): void {
    const prev = proj.prevPos.lerp(proj.pos, alpha);
    const dx = pos.x - prev.x;
    const dy = pos.y - prev.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq > 0.0001) {
      const invLen = 1 / Math.sqrt(lenSq);
      const perpX = -dy * invLen;
      const perpY = dx * invLen;

      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = radius * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.lineCap = 'butt';

      const bolts = 3;
      const segments = 5;
      for (let b = 0; b < bolts; b++) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        for (let i = 1; i < segments; i++) {
          const t = i / segments;
          const jitter = (Math.random() - 0.5) * radius * 2.2;
          ctx.lineTo(
            prev.x + dx * t + perpX * jitter,
            prev.y + dy * t + perpY * jitter,
          );
        }
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = b === 0 ? '#ffffff' : color;
        ctx.lineWidth = b === 0 ? Math.max(1.5, radius * 0.35) : Math.max(1, radius * 0.55);
        ctx.globalAlpha = b === 0 ? 0.95 : 0.7 - b * 0.15;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const dot = this.getSprite('DOT', color, Math.max(2, Math.round(radius * 0.35)));
    ctx.drawImage(dot.canvas, pos.x - dot.w / 2, pos.y - dot.h / 2, dot.w, dot.h);
  }

  private instabilityColor(pct: number): string {
    if (pct >= 250) return '#ff3333';
    if (pct >= 100) {
      const t = Math.min(1, (pct - 100) / 150);
      const r = Math.round(255);
      const g = Math.round(255 * (1 - t));
      return `rgb(${r},${g},0)`;
    }
    const t = pct / 100;
    const g = Math.round(255);
    const b = Math.round(255 * (1 - t));
    return `rgb(255,${g},${b})`;
  }

  private healthBarColor(ratio: number): string {
    if (ratio > 0.5) return '#22c55e';
    if (ratio > 0.25) return '#eab308';
    return '#ef4444';
  }

  /** Draws the overhead health pill and instability readout for every live combatant. */
  private drawOverheadHUD(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    alpha: number,
  ): void {
    const entities = [...world.players, ...world.dummies].filter((e) => !e.isDead);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';

    const barWidth = 40;
    const barHeight = 5;
    const fillMaxWidth = barWidth - 2;

    for (const entity of entities) {
      const pos = this.lerpPos(entity, alpha);
      const barX = pos.x - barWidth / 2;
      const barY = pos.y - entity.radius - 14;

      ctx.beginPath();
      ctx.roundRect(barX, barY, barWidth, barHeight, 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const healthRatio = entity.health / entity.maxHealth;
      const fillWidth = fillMaxWidth * Math.min(1, Math.max(0, healthRatio));
      if (fillWidth > 0) {
        ctx.beginPath();
        ctx.roundRect(barX + 1, barY + 1, fillWidth, barHeight - 2, 1);
        ctx.fillStyle = this.healthBarColor(healthRatio);
        ctx.fill();
      }

      const pct = entity.instabilityPct;
      ctx.fillStyle = this.instabilityColor(pct);
      ctx.globalAlpha = pct >= 200 ? 0.7 + 0.3 * Math.sin(performance.now() / 200) : 1;
      ctx.fillText(`${Math.round(pct)}%`, pos.x, pos.y - entity.radius - 4);
      ctx.globalAlpha = 1;
    }
  }

  private drawDebugOverlay(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    alpha: number,
    debug: DebugOptions,
  ): void {
    const all: Entity[] = [
      ...world.players,
      ...world.dummies,
      ...world.projectiles,
    ].filter((e) => !e.isDead);

    if (debug.showRadii) {
      const { width: vw, height: vh } = world.viewportBounds;
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(0, 0, vw, vh);
      ctx.setLineDash([]);

      const hexVerts = getHexVertices(world.hexCenter, world.hexRadius);
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(hexVerts[0].x, hexVerts[0].y);
      for (let i = 1; i < hexVerts.length; i++) {
        ctx.lineTo(hexVerts[i].x, hexVerts[i].y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    for (const entity of all) {
      const pos = this.lerpPos(entity, alpha);

      if (debug.showRadii) {
        ctx.strokeStyle = 'rgba(0, 255, 128, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, entity.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (debug.showVectors && entity.vel.magSq() > 1) {
        const velEnd = pos.add(entity.vel.scale(0.1));
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(velEnd.x, velEnd.y);
        ctx.stroke();
      }

      if (debug.showIds) {
        ctx.fillStyle = '#aaa';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(entity.id, pos.x + entity.radius + 2, pos.y);
      }
    }

    if (debug.showVectors && world.players.length > 0) {
      const player = world.players[0];
      const pos = this.lerpPos(player, alpha);
      const normal = getClosestEdgeNormal(pos, world.hexCenter, world.hexRadius);
      const normalEnd = pos.add(normal.scale(40));
      ctx.strokeStyle = '#ff00ff';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(normalEnd.x, normalEnd.y);
      ctx.stroke();
    }
  }
}
