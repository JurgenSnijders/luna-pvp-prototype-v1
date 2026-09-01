import type { CombatVisualEvent } from '../../engine/PhysicsWorld';
import type { SpellArchetype } from '../../types/schema';

export type FCTType =
  | 'DAMAGE'
  | 'INSTABILITY'
  | 'STATUS_APPLIED'
  | 'STATUS_EXPIRED'
  | 'CRIT';

export interface FloatingTextParticle {
  id: string;
  text: string;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  color: string;
  scale: number;
  lifeMs: number;
  maxLifeMs: number;
}

const FCT_COLORS = {
  FROST: '#88ddff',
  FIRE: '#ff4400',
  EARTH: '#ccaa77',
  LIGHTNING: '#ffee00',
  VOID: '#cc44ff',
  PLASMA: '#ff0088',
  HEAL: '#44ff88',
  BUFF: '#44ff88',
  DEFAULT_DAMAGE: '#ffffff',
  INSTABILITY: '#ffaa00',
  STATUS_EXPIRED: '#888888',
  LAVA_DAMAGE: '#cc0022',
} as const;

const SPAWN_Y_OFFSET = 24;
let nextParticleId = 1;

const isHeadless = typeof document === 'undefined';

export function archetypeFctColor(archetype: SpellArchetype): string {
  switch (archetype) {
    case 'FROST':
      return FCT_COLORS.FROST;
    case 'FIRE':
      return FCT_COLORS.FIRE;
    case 'EARTH':
      return FCT_COLORS.EARTH;
    case 'LIGHTNING':
      return FCT_COLORS.LIGHTNING;
    case 'VOID':
      return FCT_COLORS.VOID;
    case 'PLASMA':
      return FCT_COLORS.PLASMA;
    case 'HOLY':
      return FCT_COLORS.HEAL;
    default:
      return '#cccccc';
  }
}

export function combatEventToFct(event: CombatVisualEvent): {
  text: string;
  type: FCTType;
  color: string;
} {
  switch (event.type) {
    case 'DAMAGE':
      return {
        text: `-${Math.round(event.value ?? 0)}`,
        type: 'DAMAGE',
        color: FCT_COLORS.LAVA_DAMAGE,
      };
    case 'INSTABILITY':
      return {
        text: `+${Math.round(event.value ?? 0)}%`,
        type: 'INSTABILITY',
        color: FCT_COLORS.INSTABILITY,
      };
    case 'STATUS_APPLIED':
      if (event.label) {
        return {
          text: event.label,
          type: 'STATUS_APPLIED',
          color: event.archetype
            ? archetypeFctColor(event.archetype)
            : FCT_COLORS.PLASMA,
        };
      }
      return {
        text: `+${event.archetype ?? ''}`,
        type: 'STATUS_APPLIED',
        color: event.archetype
          ? archetypeFctColor(event.archetype)
          : FCT_COLORS.DEFAULT_DAMAGE,
      };
    case 'STATUS_EXPIRED':
      return {
        text: `-${event.archetype ?? ''}`,
        type: 'STATUS_EXPIRED',
        color: FCT_COLORS.STATUS_EXPIRED,
      };
  }
}

export class FloatingCombatTextManager {
  private particles: FloatingTextParticle[] = [];

  spawn(
    text: string,
    pos: { x: number; y: number },
    type: FCTType,
    colorOverride?: string,
  ): void {
    if (isHeadless) return;

    const maxLifeMs = 800 + Math.random() * 400;
    let scale = 1.0;
    if (type === 'CRIT') scale = 1.35;
    if (text === 'DETONATION!') scale = 1.4;

    this.particles.push({
      id: `fct_${nextParticleId++}`,
      text,
      pos: { x: pos.x, y: pos.y - SPAWN_Y_OFFSET },
      vel: {
        x: (Math.random() - 0.5) * 40,
        y: -60,
      },
      color: colorOverride ?? FCT_COLORS.DEFAULT_DAMAGE,
      scale,
      lifeMs: maxLifeMs,
      maxLifeMs,
    });
  }

  update(dt: number): void {
    if (isHeadless) return;

    const damp = Math.exp(-3 * dt);
    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.vel.x *= damp;
      p.vel.y *= damp;
      p.lifeMs -= dt * 1000;
    }
    this.particles = this.particles.filter((p) => p.lifeMs > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (isHeadless || this.particles.length === 0) return;

    const prevAlign = ctx.textAlign;
    const prevAlpha = ctx.globalAlpha;
    ctx.textAlign = 'center';

    for (const p of this.particles) {
      const alpha = Math.max(0, p.lifeMs / p.maxLifeMs);
      const fontSize = Math.round(14 * p.scale);
      ctx.font = `${fontSize}px "FixedSys", "Courier New", monospace`;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = p.color;
      ctx.strokeText(p.text, p.pos.x, p.pos.y);
      ctx.fillText(p.text, p.pos.x, p.pos.y);
    }

    ctx.textAlign = prevAlign;
    ctx.globalAlpha = prevAlpha;
  }
}
