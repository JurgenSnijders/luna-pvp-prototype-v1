import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import { FIELD_COLORS } from './colors';
import type { CanvasRenderCtx } from './renderCtx';

export function drawZones(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  world: PhysicsWorld,
): void {
  for (const zone of world.zones) {
    if (zone.isDead) continue;
    const base = FIELD_COLORS[zone.config.fieldType] ?? 'rgba(255,255,255,0.2)';
    const pulse = 0.5 + 0.5 * Math.sin(state.ringRotation * 2);
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(zone.pos.x, zone.pos.y, zone.config.radius, 0, Math.PI * 2);
    ctx.fill();

    const rimHue =
      zone.config.fieldType === 'VORTEX_TANGENT'
        ? `rgba(170, 100, 255, ${0.35 + pulse * 0.25})`
        : zone.config.fieldType === 'MASS_ATTRACTOR'
          ? `rgba(120, 140, 255, ${0.35 + pulse * 0.25})`
          : `rgba(255, 120, 80, ${0.35 + pulse * 0.25})`;
    ctx.strokeStyle = rimHue;
    ctx.lineWidth = 2 + pulse;
    ctx.setLineDash(zone.config.fieldType === 'VORTEX_TANGENT' ? [4, 8] : [6, 4]);
    ctx.beginPath();
    ctx.arc(
      zone.pos.x,
      zone.pos.y,
      zone.config.radius * (0.92 + pulse * 0.04),
      state.ringRotation,
      state.ringRotation + Math.PI * 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function drawTerrainPatches(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
  const now = performance.now() * 0.001;

  for (const patch of world.terrainPatches) {
    const { pos, config } = patch;
    const r = config.radius;
    const edgePhase = (now + pos.x * 0.01) % 1;

    if (config.type === 'SAFE') {
      ctx.fillStyle = 'rgba(0, 229, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(180, 255, 255, ${0.25 + edgePhase * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * (0.85 + edgePhase * 0.1), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const pulse = (Math.sin(now * 3) + 1) / 2;
      ctx.fillStyle = `rgba(255, 80, 20, ${0.22 + pulse * 0.12})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 140, 60, ${0.2 + edgePhase * 0.4})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * (0.7 + edgePhase * 0.15), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  world: PhysicsWorld,
): void {
  for (const obstacle of world.obstacles) {
    if (obstacle.isDead) continue;

    const { pos, config } = obstacle;
    const spawnPulse = 0.5 + 0.5 * Math.sin(state.ringRotation * 3 + pos.x * 0.02);
    ctx.fillStyle = '#94a3b8';
    ctx.strokeStyle = `rgba(200, 220, 255, ${0.35 + spawnPulse * 0.4})`;
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

export function drawConstraints(ctx: CanvasRenderingContext2D, world: PhysicsWorld): void {
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
