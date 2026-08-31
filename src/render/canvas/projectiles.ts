import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Projectile } from '../../entities/Projectile';
import { Vector2D } from '../../math/Vector2D';
import type { ProjectileStyle } from '../../types/schema';
import { lerpPos } from './helpers';
import type { CanvasRenderCtx } from './renderCtx';

export function drawProjectiles(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
  world: PhysicsWorld,
  alpha: number,
): void {
  const now = performance.now();
  for (const proj of world.projectiles) {
    if (proj.isDead) continue;
    const pos = lerpPos(proj, alpha);
    const color = proj.visuals?.color ?? '#00e5ff';
    const style: ProjectileStyle = proj.visuals?.projectileStyle ?? 'DISC';
    const radius = Math.max(4, Math.min(32, proj.radius));

    switch (style) {
      case 'BEAM': {
        const angle =
          proj.vel.magSq() > 0
            ? Math.atan2(proj.vel.y, proj.vel.x)
            : proj.aimAngle;
        const sprite = state.spriteCache.getSprite('BEAM', color, radius);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
        ctx.restore();
        break;
      }
      case 'PULSING_ORB': {
        const sprite = state.spriteCache.getSprite('ORB', color, radius);
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
        const sprite = state.spriteCache.getSprite('SHURIKEN', color, radius);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(heading + now * 0.02);
        ctx.drawImage(sprite.canvas, -sprite.w / 2, -sprite.h / 2, sprite.w, sprite.h);
        ctx.restore();
        break;
      }
      case 'CHAOS_LIGHTNING':
        drawChaosLightningProjectile(ctx, state, proj, pos, radius, color, alpha);
        break;
      case 'DISC':
      default: {
        const sprite = state.spriteCache.getSprite('DISC', color, radius);
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
 * Lightning stays procedural (random per frame), but glow now comes from a
 * wide translucent understroke plus a baked head sprite instead of shadowBlur.
 */
function drawChaosLightningProjectile(
  ctx: CanvasRenderingContext2D,
  state: CanvasRenderCtx,
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

  const dot = state.spriteCache.getSprite('DOT', color, Math.max(2, Math.round(radius * 0.35)));
  ctx.drawImage(dot.canvas, pos.x - dot.w / 2, pos.y - dot.h / 2, dot.w, dot.h);
}
