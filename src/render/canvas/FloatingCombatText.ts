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

export type FCTKinematicProfile =
  | 'FOUNTAIN'
  | 'FLOAT_UP'
  | 'HEAVY_DROP'
  | 'WEIGHTLESS'
  | 'SLIDE'
  | 'JITTER';

const ARCHETYPE_ACTION_TAGS: Partial<
  Record<SpellArchetype, { tag: string; profile: FCTKinematicProfile }>
> = {
  KINETIC: { tag: '[SLIP]', profile: 'SLIDE' },
  FROST: { tag: '[CHILLED]', profile: 'FLOAT_UP' },
  EARTH: { tag: '[HEAVY]', profile: 'HEAVY_DROP' },
  GRAVITY: { tag: '[FLOAT]', profile: 'WEIGHTLESS' },
  FIRE: { tag: '[OVERHEAT]', profile: 'JITTER' },
  PLASMA: { tag: '[VOLATILE]', profile: 'FOUNTAIN' },
  CHRONO: { tag: '[TIME LOCKED]', profile: 'FLOAT_UP' },
  ARCANE: { tag: '[ABSORB]', profile: 'FLOAT_UP' },
};

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
  kinematicProfile: FCTKinematicProfile;
  jitterOffset: number;
  horizontalDrag: number;
}

interface QueuedCombatText {
  text: string;
  pos: { x: number; y: number };
  type: FCTType;
  colorOverride?: string;
  scale: number;
  kinematicProfile: FCTKinematicProfile;
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
let nextParticleId = 1;

const isHeadless = typeof document === 'undefined';

function getLaneKey(pos: { x: number; y: number }): string {
  return `${Math.floor(pos.x / SPATIAL_CELL_SIZE)}_${Math.floor(pos.y / SPATIAL_CELL_SIZE)}`;
}

function computeFctBaseScale(type: FCTType, text: string, value?: number): number {
  if (type === 'STATUS_APPLIED' || type === 'STATUS_EXPIRED') {
    if (text === 'DETONATION!') return 2.2;
    let scale = 1.15;
    if (text.length > 14) {
      scale *= 0.88;
    }
    return scale;
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
  kinematicProfile: FCTKinematicProfile;
} {
  switch (event.type) {
    case 'DAMAGE':
      return {
        text: `-${Math.round(event.value ?? 0)}`,
        type: 'DAMAGE',
        color: FCT_COLORS.LAVA_DAMAGE,
        value: event.value,
        kinematicProfile: 'FOUNTAIN',
      };
    case 'HEAL':
      return {
        text: `+${Math.round(event.value ?? 0)}`,
        type: 'HEAL',
        color: FCT_COLORS.HEAL,
        value: event.value,
        kinematicProfile: 'FOUNTAIN',
      };
    case 'INSTABILITY':
      return {
        text: `${Math.round(event.value ?? 0)}`,
        type: 'INSTABILITY',
        color: FCT_COLORS.INSTABILITY,
        value: event.value,
        kinematicProfile: 'FOUNTAIN',
      };
    case 'STATUS_APPLIED':
      if (event.label) {
        return {
          text: event.label,
          type: 'STATUS_APPLIED',
          color: event.archetype
            ? archetypeFctColor(event.archetype)
            : FCT_COLORS.PLASMA,
          kinematicProfile: 'FOUNTAIN',
        };
      }
      if (event.archetype) {
        const mapping = ARCHETYPE_ACTION_TAGS[event.archetype];
        if (mapping) {
          return {
            text: `+${event.archetype}${mapping.tag}`,
            type: 'STATUS_APPLIED',
            color: archetypeFctColor(event.archetype),
            kinematicProfile: mapping.profile,
          };
        }
      }
      return {
        text: `+${event.archetype ?? ''}`,
        type: 'STATUS_APPLIED',
        color: event.archetype
          ? archetypeFctColor(event.archetype)
          : FCT_COLORS.DEFAULT_DAMAGE,
        kinematicProfile: 'FLOAT_UP',
      };
    case 'STATUS_EXPIRED':
      return {
        text: `-${event.archetype ?? ''}`,
        type: 'STATUS_EXPIRED',
        color: FCT_COLORS.STATUS_EXPIRED,
        kinematicProfile: 'FLOAT_UP',
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
    kinematicProfile: FCTKinematicProfile = 'FOUNTAIN',
  ): void {
    if (isHeadless) return;

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
      kinematicProfile,
    });

    if (lane.cooldownMs <= 0 && lane.queue.length === 1) {
      const item = lane.queue.shift()!;
      this.emitParticle(item, lane);
      lane.cooldownMs = LANE_STAGGER_MS;
    }
  }

  private emitParticle(item: QueuedCombatText, lane: SpatialFctLane): void {
    const profile = item.kinematicProfile;
    const spawnPos = { x: item.pos.x, y: item.pos.y - SPAWN_Y_OFFSET };
    const color = item.colorOverride ?? FCT_COLORS.DEFAULT_DAMAGE;

    switch (profile) {
      case 'FLOAT_UP':
        this.particles.push({
          id: `fct_${nextParticleId++}`,
          text: item.text,
          pos: spawnPos,
          vel: { x: 0, y: -75 },
          gravity: 0,
          color,
          scale: item.scale,
          baseScale: item.scale,
          lifeMs: LINEAR_UPWARD_LIFE_MS,
          maxLifeMs: LINEAR_UPWARD_LIFE_MS,
          kinematicProfile: profile,
          jitterOffset: 0,
          horizontalDrag: 0.35,
        });
        return;

      case 'SLIDE': {
        const lateralVel = lane.alternateSign * (160 + Math.random() * 40);
        lane.alternateSign *= -1;
        this.particles.push({
          id: `fct_${nextParticleId++}`,
          text: item.text,
          pos: spawnPos,
          vel: { x: lateralVel, y: -30 },
          gravity: 40,
          color,
          scale: item.scale,
          baseScale: item.scale,
          lifeMs: LINEAR_UPWARD_LIFE_MS,
          maxLifeMs: LINEAR_UPWARD_LIFE_MS,
          kinematicProfile: profile,
          jitterOffset: 0,
          horizontalDrag: 0.7,
        });
        return;
      }

      case 'HEAVY_DROP': {
        const lateralVel = lane.alternateSign * 25;
        lane.alternateSign *= -1;
        this.particles.push({
          id: `fct_${nextParticleId++}`,
          text: item.text,
          pos: spawnPos,
          vel: { x: lateralVel, y: -60 },
          gravity: 850,
          color,
          scale: item.scale,
          baseScale: item.scale,
          lifeMs: LINEAR_UPWARD_LIFE_MS,
          maxLifeMs: LINEAR_UPWARD_LIFE_MS,
          kinematicProfile: profile,
          jitterOffset: 0,
          horizontalDrag: 0.35,
        });
        return;
      }

      case 'WEIGHTLESS':
        this.particles.push({
          id: `fct_${nextParticleId++}`,
          text: item.text,
          pos: spawnPos,
          vel: { x: (Math.random() - 0.5) * 15, y: -35 },
          gravity: 0,
          color,
          scale: item.scale,
          baseScale: item.scale,
          lifeMs: LINEAR_UPWARD_LIFE_MS,
          maxLifeMs: LINEAR_UPWARD_LIFE_MS,
          kinematicProfile: profile,
          jitterOffset: 0,
          horizontalDrag: 0.35,
        });
        return;

      case 'JITTER':
        this.particles.push({
          id: `fct_${nextParticleId++}`,
          text: item.text,
          pos: spawnPos,
          vel: { x: 0, y: -65 },
          gravity: 0,
          color,
          scale: item.scale,
          baseScale: item.scale,
          lifeMs: LINEAR_UPWARD_LIFE_MS,
          maxLifeMs: LINEAR_UPWARD_LIFE_MS,
          kinematicProfile: profile,
          jitterOffset: 0,
          horizontalDrag: 0.35,
        });
        return;

      case 'FOUNTAIN':
      default: {
        const maxLifeMs = 950 + Math.random() * 250;
        const lateralVel = lane.alternateSign * (50 + Math.random() * 35);
        lane.alternateSign *= -1;
        this.particles.push({
          id: `fct_${nextParticleId++}`,
          text: item.text,
          pos: spawnPos,
          vel: {
            x: lateralVel,
            y: -170 - Math.random() * 40,
          },
          gravity: GRAVITY_PX_S2,
          color,
          scale: item.scale * 1.35,
          baseScale: item.scale,
          lifeMs: maxLifeMs,
          maxLifeMs,
          kinematicProfile: 'FOUNTAIN',
          jitterOffset: 0,
          horizontalDrag: 0.35,
        });
      }
    }
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
      p.vel.x *= Math.pow(p.horizontalDrag, dt);
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;

      if (p.kinematicProfile === 'JITTER') {
        p.jitterOffset = Math.sin(p.lifeMs * 0.05) * 1.5;
      }

      if (p.kinematicProfile === 'FOUNTAIN') {
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
      const drawX = p.pos.x + p.jitterOffset;
      ctx.font = canvasFont(fontSize);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = p.color;
      ctx.strokeText(p.text, drawX, p.pos.y);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, drawX, p.pos.y);
      ctx.shadowBlur = 0;
    }

    ctx.shadowColor = 'transparent';
    ctx.textAlign = prevAlign;
    ctx.globalAlpha = prevAlpha;
  }
}
