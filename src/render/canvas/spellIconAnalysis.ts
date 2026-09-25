import { resolveSpellRarity } from '../../draft/workshopStyles';
import type { CardRarity } from '../../types/cards';
import type {
  AbilitySchema,
  ActionPayload,
  ActorArchetype,
  FieldType,
  ObstacleShape,
  ProjectileStyle,
  TrajectoryConfig,
  TrajectoryType,
  TriggerNode,
} from '../../types/schema';
import { hexToRgb, mixTowardWhite, rgbToHex } from './glowDisc';
import { getArchetypeColor } from './archetypeColors';
import { resolveZoneVfxFamily, type ZoneVfxFamily } from '../zoneVfx';
import {
  collectAllCastProjectiles,
  type CollectedCastProjectile,
} from './trajectoryTracer';

export type IconRng = () => number;

export type SubstratePatternFamily =
  | 'BALLISTIC_GRID'
  | 'POLAR_SONAR'
  | 'ISOTHERM_CONTOURS'
  | 'CIRCUIT_BUS'
  | 'HEX_MATRIX';

export type IconUtility = 'STASIS' | 'STEALTH' | 'MORPH' | 'STAT';

export type IconMark =
  | { kind: 'OBSTACLE'; shape: ObstacleShape; aspect: number }
  | { kind: 'ACTOR'; actor: ActorArchetype }
  | { kind: 'PARRY'; arcDeg: number }
  | { kind: 'BLINK' }
  | { kind: 'ORBIT' }
  | { kind: 'PROJECTILE'; style: ProjectileStyle }
  | { kind: 'FIELD'; fieldType: FieldType; arcDeg: number }
  | { kind: 'TERRAIN' }
  | { kind: 'UTILITY'; utility: IconUtility };

export interface SpellIconModifiers {
  count: number;
  pierce: boolean;
  bounce: boolean;
  child: boolean;
}

export interface SpellIconColors {
  primary: string;
  secondary: string;
}

export interface SpellIconSpec {
  primary: IconMark;
  secondary?: IconMark;
  path?: TrajectoryType;
  castShots: CollectedCastProjectile[];
  modifiers: SpellIconModifiers;
  colors: SpellIconColors;
  style: ProjectileStyle;
  family: ZoneVfxFamily;
  patternFamily: SubstratePatternFamily;
  seed: number;
  rarity: CardRarity;
}

const MARK_RANK: Record<IconMark['kind'], number> = {
  OBSTACLE: 0,
  ACTOR: 1,
  PARRY: 2,
  BLINK: 3,
  ORBIT: 4,
  PROJECTILE: 5,
  FIELD: 6,
  TERRAIN: 7,
  UTILITY: 8,
};

function walkTriggers(
  nodes: TriggerNode[],
  visit: (node: TriggerNode, action: ActionPayload) => void,
): void {
  for (const node of nodes) {
    for (const action of node.actions) {
      visit(node, action);
      if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
        walkTriggers(action.triggers, visit);
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.triggers) {
        walkTriggers(action.payload.triggers, visit);
      }
    }
    if (node.children) walkTriggers(node.children, visit);
  }
}

function resolveIconTrajectory(ability: AbilitySchema): TrajectoryConfig | undefined {
  if (ability.trajectory) return ability.trajectory;
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        return action.projectileTrajectory;
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.trajectory) {
        return action.payload.trajectory;
      }
    }
  }
  return undefined;
}

function markFromAction(action: ActionPayload, style: ProjectileStyle): IconMark | null {
  switch (action.type) {
    case 'SPAWN_OBSTACLE': {
      const { shape, width, height } = action.obstacle;
      const aspect = height > 0 ? width / height : 1;
      return { kind: 'OBSTACLE', shape, aspect };
    }
    case 'SPAWN_ACTOR':
      return { kind: 'ACTOR', actor: action.actor.actorArchetype };
    case 'REFLECT_PROJECTILES':
      return { kind: 'PARRY', arcDeg: action.arcDeg ?? 360 };
    case 'TELEPORT':
      return { kind: 'BLINK' };
    case 'SPAWN_PROJECTILE':
      return { kind: 'PROJECTILE', style: action.visuals?.projectileStyle ?? style };
    case 'SPAWN_FIELD':
      return {
        kind: 'FIELD',
        fieldType: action.field.fieldType,
        arcDeg: action.field.arcDeg ?? 360,
      };
    case 'MUTATE_TERRAIN':
      return { kind: 'TERRAIN' };
    case 'APPLY_STASIS':
      return { kind: 'UTILITY', utility: 'STASIS' };
    case 'APPLY_STEALTH':
      return { kind: 'UTILITY', utility: 'STEALTH' };
    case 'MORPH_ENTITY':
      return { kind: 'UTILITY', utility: 'MORPH' };
    case 'MODIFY_STAT':
    case 'APPLY_IMPULSE':
    case 'ADD_INSTABILITY':
      return { kind: 'UTILITY', utility: 'STAT' };
    default:
      return null;
  }
}

function markFromTrajectory(trajectory: TrajectoryConfig, style: ProjectileStyle): IconMark {
  if (trajectory.type === 'DISCONTINUOUS_BLINK') return { kind: 'BLINK' };
  if (trajectory.type === 'ORBIT_ANCHOR') return { kind: 'ORBIT' };
  return { kind: 'PROJECTILE', style };
}

function sameMark(a: IconMark, b: IconMark): boolean {
  return a.kind === b.kind;
}

export function resolveSubstratePatternFamily(archetype?: string): SubstratePatternFamily {
  switch (archetype) {
    case 'KINETIC':
    case 'EARTH':
      return 'BALLISTIC_GRID';
    case 'AERO':
    case 'GRAVITY':
    case 'VOID':
    case 'CHRONO':
    case 'PHASE':
      return 'POLAR_SONAR';
    case 'FIRE':
    case 'BLOOD':
    case 'CHAOS':
      return 'ISOTHERM_CONTOURS';
    case 'PLASMA':
    case 'LIGHTNING':
    case 'MAGNETIC':
    case 'SONIC':
      return 'CIRCUIT_BUS';
    case 'HOLY':
    case 'ARCANE':
    case 'NATURE':
    case 'TOXIC':
    default:
      return 'HEX_MATRIX';
  }
}

/** FNV-1a. Same spell id always yields the same icon variation. */
export function hashIconSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createIconRng(seed: number): IconRng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function analyzeSpellIcon(ability: AbilitySchema): SpellIconSpec {
  const archetype = ability.archetype ?? 'KINETIC';
  const style = ability.visuals?.projectileStyle ?? 'DISC';
  const castShots = collectAllCastProjectiles(ability);
  const trajectory = resolveIconTrajectory(ability);
  const marks: IconMark[] = [];

  for (const node of ability.triggers ?? []) {
    if (node.trigger !== 'ON_CAST') continue;
    for (const action of node.actions ?? []) {
      const mark = markFromAction(action, style);
      if (mark && !marks.some((existing) => sameMark(existing, mark))) {
        marks.push(mark);
      }
    }
  }

  if (trajectory) {
    const fromPath = markFromTrajectory(trajectory, style);
    if (!marks.some((existing) => sameMark(existing, fromPath))) {
      marks.push(fromPath);
    }
  }

  marks.sort((a, b) => MARK_RANK[a.kind] - MARK_RANK[b.kind]);

  const primary: IconMark = marks[0] ?? { kind: 'UTILITY', utility: 'STAT' };
  const secondary = marks.find((mark) => mark.kind !== primary.kind);

  const pathHidden =
    castShots.length > 0 ||
    primary.kind === 'BLINK' ||
    primary.kind === 'ORBIT';
  const path = trajectory && !pathHidden ? trajectory.type : undefined;

  const count = castShots.reduce((sum, shot) => sum + shot.emitter.count, 0);
  let child = false;
  walkTriggers(ability.triggers ?? [], (node, action) => {
    if (action.type === 'CAST_CHILD_PAYLOAD') child = true;
    if (
      (node.trigger === 'ON_HIT' || node.trigger === 'ON_EXPIRY') &&
      (action.type === 'SPAWN_PROJECTILE' ||
        action.type === 'SPAWN_FIELD' ||
        action.type === 'SPAWN_OBSTACLE' ||
        action.type === 'SPAWN_ACTOR')
    ) {
      child = true;
    }
  });

  const primaryHex = ability.visuals?.color ?? getArchetypeColor(archetype);
  const authoredSecondary = ability.visuals?.vfx?.secondaryColor;
  const secondaryHex =
    authoredSecondary ?? rgbToHex(mixTowardWhite(hexToRgb(primaryHex), 0.45));

  const pierceTrajectory = castShots[0]?.trajectory ?? trajectory;

  return {
    primary,
    secondary,
    path,
    castShots,
    modifiers: {
      count: Math.max(1, count),
      pierce: (pierceTrajectory?.piercing ?? 0) > 0,
      bounce: (pierceTrajectory?.bounces ?? 0) > 0,
      child,
    },
    colors: { primary: primaryHex, secondary: secondaryHex },
    style,
    family: resolveZoneVfxFamily(archetype),
    patternFamily: resolveSubstratePatternFamily(archetype),
    seed: hashIconSeed(ability.id),
    rarity: resolveSpellRarity(ability),
  };
}
