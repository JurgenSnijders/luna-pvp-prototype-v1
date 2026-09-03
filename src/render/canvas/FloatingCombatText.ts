import type { CombatVisualEvent } from '../../engine/PhysicsWorld';
import type { StreakBody } from '../../camera/Camera2D';
import { fctClusterConfig } from '../../render/fctClusterConfig';
import type { SpellArchetype } from '../../types/schema';
import { canvasFont } from '../../ui/tokens';
import { getArchetypeColor } from './SpellIconGenerator';

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
  | 'JITTER'
  | 'SCATTER'
  | 'BOUNCE'
  | 'DRIP';

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
  CHAOS: { tag: '[SCRAMBLED]', profile: 'SCATTER' },
  BLOOD: { tag: '[LEECHING]', profile: 'DRIP' },
  SONIC: { tag: '[RESONANT]', profile: 'BOUNCE' },
  LIGHTNING: { tag: '[SHOCKED]', profile: 'JITTER' },
  AERO: { tag: '[FRICTIONLESS]', profile: 'SLIDE' },
  MAGNETIC: { tag: '[MAGNETIZED]', profile: 'SLIDE' },
  VOID: { tag: '[RIFTED]', profile: 'FLOAT_UP' },
  HOLY: { tag: '[REPELLED]', profile: 'FLOAT_UP' },
  TOXIC: { tag: '[CORRODED]', profile: 'WEIGHTLESS' },
  PHASE: { tag: '[PHASED]', profile: 'WEIGHTLESS' },
  NATURE: { tag: '[TETHERED]', profile: 'FLOAT_UP' },
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
  bounceFloorY: number | null;
  hasBounced: boolean;
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

interface PendingValueCluster {
  total: number;
  pos: { x: number; y: number };
  type: FCTType;
  colorOverride?: string;
  kinematicProfile: FCTKinematicProfile;
  remainingMs: number;
}

const CLUSTERABLE_TYPES = new Set<FCTType>(['DAMAGE', 'HEAL']);

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

function getClusterKey(
  type: FCTType,
  targetId: string | undefined,
  pos: { x: number; y: number },
): string {
  const id = targetId ?? getLaneKey(pos);
  return `${type}:${id}`;
}

function formatClusterText(type: FCTType, total: number): string {
  const n = Math.round(total);
  return type === 'HEAL' ? `+${n}` : `-${n}`;
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

const FCT_ARCHETYPE_COLOR_OVERRIDES: Partial<Record<SpellArchetype, string>> = {
  FROST: FCT_COLORS.FROST,
  EARTH: FCT_COLORS.EARTH,
  HOLY: FCT_COLORS.HEAL,
};

export function archetypeFctColor(archetype: SpellArchetype): string {
  return FCT_ARCHETYPE_COLOR_OVERRIDES[archetype] ?? getArchetypeColor(archetype);
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
  private clusters: Map<string, PendingValueCluster> = new Map();

  spawn(
    text: string,
    pos: { x: number; y: number },
    type: FCTType,
    colorOverride?: string,
    value?: number,
    kinematicProfile: FCTKinematicProfile = 'FOUNTAIN',
    targetId?: string,
  ): void {
    if (isHeadless) return;

    if (CLUSTERABLE_TYPES.has(type) && value !== undefined && value > 0) {
      const clusterKey = getClusterKey(type, targetId, pos);

      if (value > fctClusterConfig.clusterPerTickMax) {
        this.flushCluster(clusterKey);
        this.enqueueSpawn(text, pos, type, colorOverride, value, kinematicProfile);
        return;
      }

      let cluster = this.clusters.get(clusterKey);
      if (!cluster) {
        cluster = {
          total: 0,
          pos: { x: pos.x, y: pos.y },
          type,
          colorOverride,
          kinematicProfile,
          remainingMs: fctClusterConfig.clusterWindowMs,
        };
        this.clusters.set(clusterKey, cluster);
      }

      cluster.total += value;
      cluster.pos = { x: pos.x, y: pos.y };
      cluster.remainingMs = fctClusterConfig.clusterWindowMs;

      if (cluster.total >= fctClusterConfig.clusterInstantFlush) {
        this.flushCluster(clusterKey);
      }
      return;
    }

    this.enqueueSpawn(text, pos, type, colorOverride, value, kinematicProfile);
  }

  private flushCluster(clusterKey: string): void {
    const cluster = this.clusters.get(clusterKey);
    if (!cluster) return;

    const total = Math.round(cluster.total);
    this.clusters.delete(clusterKey);
    if (total <= 0) return;

    this.enqueueSpawn(
      formatClusterText(cluster.type, total),
      cluster.pos,
      cluster.type,
      cluster.colorOverride,
      total,
      cluster.kinematicProfile,
    );
  }

  private enqueueSpawn(
    text: string,
    pos: { x: number; y: number },
    type: FCTType,
    colorOverride?: string,
    value?: number,
    kinematicProfile: FCTKinematicProfile = 'FOUNTAIN',
  ): void {
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

    const push = (
      vel: { x: number; y: number },
      gravity: number,
      horizontalDrag: number,
      lifeMs: number,
      scale = item.scale,
      bounceFloorY: number | null = null,
    ): void => {
      this.particles.push({
        id: `fct_${nextParticleId++}`,
        text: item.text,
        pos: spawnPos,
        vel,
        gravity,
        color,
        scale,
        baseScale: item.scale,
        lifeMs,
        maxLifeMs: lifeMs,
        kinematicProfile: profile,
        jitterOffset: 0,
        horizontalDrag,
        bounceFloorY,
        hasBounced: false,
      });
    };

    switch (profile) {
      case 'FLOAT_UP':
        push({ x: 0, y: -75 }, 0, 0.35, LINEAR_UPWARD_LIFE_MS);
        return;

      case 'SLIDE': {
        const lateralVel = lane.alternateSign * (160 + Math.random() * 40);
        lane.alternateSign *= -1;
        push({ x: lateralVel, y: -30 }, 40, 0.7, LINEAR_UPWARD_LIFE_MS);
        return;
      }

      case 'HEAVY_DROP': {
        const lateralVel = lane.alternateSign * 25;
        lane.alternateSign *= -1;
        push({ x: lateralVel, y: -60 }, 850, 0.35, LINEAR_UPWARD_LIFE_MS);
        return;
      }

      case 'WEIGHTLESS':
        push({ x: (Math.random() - 0.5) * 15, y: -35 }, 0, 0.35, LINEAR_UPWARD_LIFE_MS);
        return;

      case 'JITTER':
        push({ x: 0, y: -65 }, 0, 0.35, LINEAR_UPWARD_LIFE_MS);
        return;

      case 'SCATTER': {
        const angle = Math.random() * Math.PI * 2;
        const speed = 90 + Math.random() * 70;
        push(
          { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 40 },
          120,
          0.5,
          LINEAR_UPWARD_LIFE_MS,
        );
        return;
      }

      case 'BOUNCE': {
        const lateralVel = lane.alternateSign * (40 + Math.random() * 30);
        lane.alternateSign *= -1;
        push(
          { x: lateralVel, y: -140 - Math.random() * 30 },
          GRAVITY_PX_S2,
          0.35,
          1100 + Math.random() * 200,
          item.scale * 1.2,
          spawnPos.y + 36,
        );
        return;
      }

      case 'DRIP':
        push({ x: (Math.random() - 0.5) * 10, y: 20 }, 65, 0.4, LINEAR_UPWARD_LIFE_MS);
        return;

      case 'FOUNTAIN':
      default: {
        const maxLifeMs = 950 + Math.random() * 250;
        const lateralVel = lane.alternateSign * (50 + Math.random() * 35);
        lane.alternateSign *= -1;
        push(
          { x: lateralVel, y: -170 - Math.random() * 40 },
          GRAVITY_PX_S2,
          0.35,
          maxLifeMs,
          item.scale * 1.35,
        );
      }
    }
  }

  update(dt: number): void {
    if (isHeadless) return;

    const dtMs = dt * 1000;

    const expiredClusters: string[] = [];
    for (const [clusterKey, cluster] of this.clusters) {
      cluster.remainingMs -= dtMs;
      if (cluster.remainingMs <= 0) {
        expiredClusters.push(clusterKey);
      }
    }
    for (const clusterKey of expiredClusters) {
      this.flushCluster(clusterKey);
    }

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

      if (p.kinematicProfile === 'BOUNCE' && p.bounceFloorY !== null && !p.hasBounced) {
        if (p.pos.y >= p.bounceFloorY && p.vel.y > 0) {
          p.pos.y = p.bounceFloorY;
          p.vel.y *= -0.55;
          p.hasBounced = true;
        }
      }

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

  collectStreakBodies(bodies: StreakBody[], cap: number): void {
    for (const p of this.particles) {
      if (bodies.length >= cap) return;
      const fontSize = Math.round(16 * p.scale);
      const halfW = Math.min(80, Math.max(14, p.text.length * fontSize * 0.32 + 8));
      bodies.push({
        x: p.pos.x + p.jitterOffset,
        y: p.pos.y,
        r: halfW,
        up: fontSize,
      });
    }
  }
}
