import { getClosestEdgeNormal, getHexVertices, getVoidRadius } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Entity } from '../entities/Entity';
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
  ): void {
    const ctx = this.ctx;
    this.ringRotation += 0.02;

    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, width, height);

    this.drawVoidBackground(ctx, world, width, height);
    this.drawHexPlatform(ctx, world);
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

  private drawVoidBackground(
    ctx: CanvasRenderingContext2D,
    world: PhysicsWorld,
    width: number,
    height: number,
  ): void {
    const voidR = getVoidRadius(world.hexRadius);
    const gradient = ctx.createRadialGradient(
      world.hexCenter.x,
      world.hexCenter.y,
      world.hexRadius,
      world.hexCenter.x,
      world.hexCenter.y,
      voidR * 1.2,
    );
    gradient.addColorStop(0, 'rgba(20, 10, 30, 0)');
    gradient.addColorStop(0.5, 'rgba(80, 20, 10, 0.4)');
    gradient.addColorStop(1, 'rgba(40, 5, 5, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  private drawHexPlatform(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
    const vertices = getHexVertices(world.hexCenter, world.hexRadius);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
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
      ctx.fillStyle = '#00ccff';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, player.radius, 0, Math.PI * 2);
      ctx.fill();

      const aimEnd = pos.add(Vector2D.fromAngle(player.facingAngle, player.radius + 14));
      ctx.strokeStyle = '#88eeff';
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
    for (const proj of world.projectiles) {
      if (proj.isDead) continue;
      const pos = this.lerpPos(proj, alpha);
      ctx.fillStyle = '#ffff44';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, proj.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 200, 50, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, proj.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
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
