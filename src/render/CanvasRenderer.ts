import { getClosestEdgeNormal, getHexVertices, getOuterWallRadius } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
import type { Projectile } from '../entities/Projectile';
import type { ProjectileStyle } from '../types/schema';
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

export class CanvasRenderer {
  private ringRotation = 0;

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
    this.drawLavaHeatWaves(ctx, world, width, height);
    this.drawOuterBarrier(ctx, world);
    this.drawHexPlatform(ctx, world, shrinkProgress, isShrinking);
    this.drawZones(ctx, world);
    particles.draw(ctx);
    this.drawCombatants(ctx, world, alpha);
    this.drawProjectiles(ctx, world, alpha);
    this.drawInstabilityBadges(ctx, world, alpha);

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
    const gradRadius = Math.hypot(width, height) * 0.55;

    const gradient = ctx.createRadialGradient(
      center.x,
      center.y,
      0,
      center.x,
      center.y,
      gradRadius,
    );
    gradient.addColorStop(0, 'rgba(210, 50, 0, 1.0)');
    gradient.addColorStop(0.45, 'rgba(130, 20, 0, 1.0)');
    gradient.addColorStop(1, 'rgba(40, 5, 0, 1.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
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

  private drawOuterBarrier(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
  ): void {
    const outerR = getOuterWallRadius(world.hexRadius);
    const { hexCenter: center } = world;
    const now = performance.now() * 0.001;
    const pulse = 0.45 + 0.25 * Math.sin(now * 3);

    ctx.fillStyle = 'rgba(255, 120, 0, 0.06)';
    ctx.beginPath();
    ctx.arc(center.x, center.y, outerR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 170, 0, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(center.x, center.y, outerR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.setLineDash([12, 18]);
    ctx.lineDashOffset = -now * 20;
    ctx.strokeStyle = `rgba(255, 200, 80, ${0.25 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, outerR - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i);
      const node = center.add(Vector2D.fromAngle(angle, outerR));
      ctx.fillStyle = '#ffcc00';
      ctx.shadowColor = 'rgba(255, 200, 0, 0.8)';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private drawHexPlatform(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    shrinkProgress: number,
    isShrinking: boolean,
  ): void {
    const vertices = getHexVertices(world.hexCenter, world.hexRadius);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = '#12121e';
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (isShrinking) {
      const pulse = 0.4 + 0.4 * Math.sin(performance.now() * 0.006);
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255, 40, 40, ${pulse})`;
      ctx.lineWidth = 3 + 3 * shrinkProgress;
      ctx.shadowColor = 'rgba(255, 40, 40, 0.8)';
      ctx.shadowBlur = 8 + 12 * shrinkProgress;
      ctx.stroke();
      ctx.shadowBlur = 0;
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
    }

    for (const dummy of world.dummies) {
      if (dummy.isDead) continue;
      const pos = this.lerpPos(dummy, alpha);
      ctx.fillStyle = '#ff8844';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, dummy.radius, 0, Math.PI * 2);
      ctx.fill();
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
      const heading =
        proj.vel.magSq() > 0
          ? proj.vel.normalize()
          : Vector2D.fromAngle(proj.aimAngle);

      ctx.shadowBlur = 12;
      ctx.shadowColor = color;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      switch (style) {
        case 'BEAM':
          this.drawBeamProjectile(ctx, pos, heading, radius, color);
          break;
        case 'PULSING_ORB':
          this.drawPulsingOrbProjectile(ctx, pos, radius, color, now);
          break;
        case 'SHURIKEN':
          this.drawShurikenProjectile(ctx, pos, radius, color, now);
          break;
        case 'CHAOS_LIGHTNING':
          this.drawChaosLightningProjectile(ctx, proj, pos, radius, color, alpha);
          break;
        case 'DISC':
        default:
          this.drawDiscProjectile(ctx, pos, radius, color);
          break;
      }

      ctx.shadowBlur = 0;
    }
  }

  private drawDiscProjectile(
    ctx: CanvasRenderingContext2D,
    pos: Vector2D,
    radius: number,
    color: string,
  ): void {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawPulsingOrbProjectile(
    ctx: CanvasRenderingContext2D,
    pos: Vector2D,
    radius: number,
    color: string,
    now: number,
  ): void {
    const pulse = Math.sin(now * 0.01) * 3;
    const outer = radius + pulse;

    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, outer + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, outer, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, outer, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawBeamProjectile(
    ctx: CanvasRenderingContext2D,
    pos: Vector2D,
    heading: Vector2D,
    radius: number,
    color: string,
  ): void {
    const halfLen = (radius * 3) / 2;
    const start = pos.sub(heading.scale(halfLen));
    const end = pos.add(heading.scale(halfLen));

    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = radius;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.shadowBlur = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, radius * 0.35);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  private drawShurikenProjectile(
    ctx: CanvasRenderingContext2D,
    pos: Vector2D,
    radius: number,
    color: string,
    now: number,
  ): void {
    const points = 4;
    const outer = radius;
    const inner = radius * 0.35;
    const rotation = now * 0.02;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawChaosLightningProjectile(
    ctx: CanvasRenderingContext2D,
    proj: Projectile,
    pos: Vector2D,
    radius: number,
    color: string,
    alpha: number,
  ): void {
    const prev = proj.prevPos.lerp(proj.pos, alpha);
    const bolts = 3;

    for (let b = 0; b < bolts; b++) {
      const segments = 5;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const base = prev.lerp(pos, t);
        const jitter = (Math.random() - 0.5) * radius * 2.2;
        const perp = new Vector2D(-(pos.y - prev.y), pos.x - prev.x);
        const offset =
          perp.magSq() > 0
            ? perp.normalize().scale(jitter)
            : Vector2D.fromAngle(Math.random() * Math.PI * 2, jitter);
        const p = base.add(offset);
        ctx.lineTo(p.x, p.y);
      }
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = b === 0 ? '#ffffff' : color;
      ctx.lineWidth = b === 0 ? Math.max(1.5, radius * 0.35) : Math.max(1, radius * 0.55);
      ctx.globalAlpha = b === 0 ? 0.95 : 0.7 - b * 0.15;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.max(2, radius * 0.35), 0, Math.PI * 2);
    ctx.fill();
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

  private drawInstabilityBadges(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    alpha: number,
  ): void {
    const entities = [...world.players, ...world.dummies].filter((e) => !e.isDead);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';

    for (const entity of entities) {
      const pos = this.lerpPos(entity, alpha);
      const label = `${Math.round(entity.instabilityPct)}%`;
      ctx.fillStyle = this.instabilityColor(entity.instabilityPct);
      ctx.fillText(label, pos.x, pos.y - entity.radius - 8);
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
      const outerR = getOuterWallRadius(world.hexRadius);
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(world.hexCenter.x, world.hexCenter.y, outerR, 0, Math.PI * 2);
      ctx.stroke();
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
