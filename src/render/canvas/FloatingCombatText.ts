import type { CombatVisualEvent } from '../../engine/PhysicsWorld';
import type { SpellArchetype } from '../../types/schema';
import { canvasFont } from '../../ui/tokens';

export type FCTType =
  | 'DAMAGE'
  | 'HEAL'
  | 'INSTABILITY'
  | 'STATUS_APPLIED'
  | 'STATUS_EXPIRED'
  | 'CRIT';

export interface FloatingTextParticle {
  id: string;
  text: string;
  pos: { x: number; y: number };
  vel: { x: number; y: number };
  gravity: number;
  color: string;
  scale: number;
  baseScale: number;
  lifeMs: number;
  maxLifeMs: number;
  isLinearUpward: boolean;
}

interface QueuedCombatText {
  text: string;
  pos: { x: number; y: number };
  type: FCTType;
  colorOverride?: string;
  scale: number;
  isLinearUpward: boolean;
}

interface SpatialFctLane {
  queue: QueuedCombatText[];
  cooldownMs: number;
  alternateSign: number;
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
const SPATIAL_CELL_SIZE = 80;
const LANE_STAGGER_MS = 75;
const LANE_MIN_STAGGER_MS = 35;
const GRAVITY_PX_S2 = 420;
const SCALE_PUNCH_MS = 120;
const FADE_OUT_MS = 250;
const LINEAR_UPWARD_LIFE_MS = 1100;
const LINEAR_UPWARD_VEL_Y = -75;
let nextParticleId = 1;

const isHeadless = typeof document === 'undefined';

function getLaneKey(pos: { x: number; y: number }): string {
  return `${Math.floor(pos.x / SPATIAL_CELL_SIZE)}_${Math.floor(pos.y / SPATIAL_CELL_SIZE)}`;
}

function computeFctBaseScale(type: FCTType, text: string, value?: number): number {
  if (type === 'STATUS_APPLIED' || type === 'STATUS_EXPIRED') {
    if (text === 'DETONATION!') return 2.2;
    return 1.15;
  }

  const val = Math.max(1, value ?? 1);
  let scale = 0.85 + Math.log10(val) * 0.55;
  if (type === 'CRIT') scale *= 1.3;
  return Math.min(2.3, Math.max(0.75, scale));
}

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
  value?: number;
} {
  switch (event.type) {
    case 'DAMAGE':
      return {
        text: `-${Math.round(event.value ?? 0)}`,
        type: 'DAMAGE',
        color: FCT_COLORS.LAVA_DAMAGE,
        value: event.value,
      };
    case 'HEAL':
      return {
        text: `+${Math.round(event.value ?? 0)}`,
        type: 'HEAL',
        color: FCT_COLORS.HEAL,
        value: event.value,
      };
    case 'INSTABILITY':
      return {
        text: `${Math.round(event.value ?? 0)}`,
        type: 'INSTABILITY',
        color: FCT_COLORS.INSTABILITY,
        value: event.value,
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
  private lanes: Map<string, SpatialFctLane> = new Map();

  spawn(
    text: string,
    pos: { x: number; y: number },
    type: FCTType,
    colorOverride?: string,
    value?: number,
  ): void {
    if (isHeadless) return;

    const isLinearUpward = type === 'STATUS_APPLIED' || type === 'STATUS_EXPIRED';
    const baseScale = computeFctBaseScale(type, text, value);

    const laneKey = getLaneKey(pos);
    let lane = this.lanes.get(laneKey);
    if (!lane) {
      lane = { queue: [], cooldownMs: 0, alternateSign: 1 };
      this.lanes.set(laneKey, lane);
    }

    lane.queue.push({
      text,
      pos: { x: pos.x, y: pos.y },
      type,
      colorOverride,
      scale: baseScale,
      isLinearUpward,
    });

    if (lane.cooldownMs <= 0 && lane.queue.length === 1) {
      const item = lane.queue.shift()!;
      this.emitParticle(item, lane);
      lane.cooldownMs = LANE_STAGGER_MS;
    }
  }

  private emitParticle(item: QueuedCombatText, lane: SpatialFctLane): void {
    if (item.isLinearUpward) {
      this.particles.push({
        id: `fct_${nextParticleId++}`,
        text: item.text,
        pos: { x: item.pos.x, y: item.pos.y - SPAWN_Y_OFFSET },
        vel: { x: 0, y: LINEAR_UPWARD_VEL_Y },
        gravity: 0,
        color: item.colorOverride ?? FCT_COLORS.DEFAULT_DAMAGE,
        scale: item.scale,
        baseScale: item.scale,
        lifeMs: LINEAR_UPWARD_LIFE_MS,
        maxLifeMs: LINEAR_UPWARD_LIFE_MS,
        isLinearUpward: true,
      });
      return;
    }

    const maxLifeMs = 950 + Math.random() * 250;
    const lateralVel = lane.alternateSign * (50 + Math.random() * 35);
    lane.alternateSign *= -1;

    this.particles.push({
      id: `fct_${nextParticleId++}`,
      text: item.text,
      pos: { x: item.pos.x, y: item.pos.y - SPAWN_Y_OFFSET },
      vel: {
        x: lateralVel,
        y: -170 - Math.random() * 40,
      },
      gravity: GRAVITY_PX_S2,
      color: item.colorOverride ?? FCT_COLORS.DEFAULT_DAMAGE,
      scale: item.scale * 1.35,
      baseScale: item.scale,
      lifeMs: maxLifeMs,
      maxLifeMs,
      isLinearUpward: false,
    });
  }

  update(dt: number): void {
    if (isHeadless) return;

    const dtMs = dt * 1000;

    for (const [laneKey, lane] of this.lanes) {
      lane.cooldownMs -= dtMs;

      while (lane.cooldownMs <= 0 && lane.queue.length > 0) {
        const item = lane.queue.shift()!;
        this.emitParticle(item, lane);
        lane.cooldownMs = Math.max(
          LANE_MIN_STAGGER_MS,
          LANE_STAGGER_MS - lane.queue.length * 6,
        );
      }

      if (lane.queue.length === 0 && lane.cooldownMs <= 0) {
        this.lanes.delete(laneKey);
      }
    }

    for (const p of this.particles) {
      p.vel.y += p.gravity * dt;
      p.vel.x *= Math.pow(0.35, dt);
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;

      if (!p.isLinearUpward) {
        const elapsedMs = p.maxLifeMs - p.lifeMs;
        if (elapsedMs < SCALE_PUNCH_MS) {
          const t = elapsedMs / SCALE_PUNCH_MS;
          p.scale = p.baseScale * 1.35 + (p.baseScale - p.baseScale * 1.35) * t;
        } else {
          p.scale = p.baseScale;
        }
      }

      p.lifeMs -= dtMs;
    }

    this.particles = this.particles.filter((p) => p.lifeMs > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (isHeadless || this.particles.length === 0) return;

    const prevAlign = ctx.textAlign;
    const prevAlpha = ctx.globalAlpha;
    ctx.textAlign = 'center';

    for (const p of this.particles) {
      const alpha = Math.min(1.0, p.lifeMs / FADE_OUT_MS);
      const fontSize = Math.round(16 * p.scale);
      ctx.font = canvasFont(fontSize);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = p.color;
      ctx.strokeText(p.text, p.pos.x, p.pos.y);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, p.pos.x, p.pos.y);
      ctx.shadowBlur = 0;
    }

    ctx.shadowColor = 'transparent';
    ctx.textAlign = prevAlign;
    ctx.globalAlpha = prevAlpha;
  }
}
