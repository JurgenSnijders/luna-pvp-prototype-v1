import { BASELINE_INSTABILITY_ON_HIT } from '../engine/PhysicsWorld';
import { ARCHETYPE_TUNING } from './interpreter/constants';
import type {
  AbilitySchema,
  ActionPayload,
  ActionTarget,
  EmitterConfig,
  ImpulseDirectionMode,
  SpellArchetype,
  TrajectoryConfig,
} from '../types/schema';
import { walkActions } from '../types/schema';

export type DisplacementDirectionTag =
  | 'PUSH'
  | 'PULL'
  | 'LATERAL'
  | 'ALONG'
  | 'CUSTOM'
  | 'MIXED'
  | 'NONE';

type DirectionFamily = 'PUSH' | 'PULL' | 'LATERAL' | 'ALONG' | 'CUSTOM';

export const ARENA_PHYSICS_CONSTANTS = {
  STANDARD_TARGET_MASS: 50,
  STANDARD_ARENA_RADIUS: 500,
  FORCE_TO_DISTANCE_FACTOR: 0.28,
} as const;

export type RingOutTier =
  | 'LETHAL_FINISHER'
  | 'HEAVY_SHOVE'
  | 'TACTICAL_REPOSITION'
  | 'MICRO_INTERRUPT'
  | 'NONE';

export interface KineticLethalityProfile {
  baseTravelPx: number;
  maxTravelPx: number;
  arenaReachPct: number;
  tier: RingOutTier;
  label: string;
  summary: string;
}

export interface DisplacementProfile {
  peakForce: number;
  directions: readonly string[];
  primaryTag: DisplacementDirectionTag;
  hasAttractor: boolean;
  hasRadial: boolean;
  lethality: KineticLethalityProfile;
}

export type ResourceProfileType = 'COOLDOWN' | 'HEAT' | 'AMMO' | 'HEALTH_PCT';

export interface ResourceProfile {
  type: ResourceProfileType;
  cost: number;
  capacity?: number;
  rechargeRate?: number;
  lockoutMs?: number;
}

export interface DeliveryProfile {
  trajectoryType: string;
  targetingMode: 'DIRECTIONAL' | 'GROUND_POINT';
  shotCount: number;
  fanAngleDeg?: number;
  range: number;
  speed: number;
  piercing: boolean;
  bounces: number;
  lobApex?: number;
  summary: string;
}

export interface SpellCombatProfile {
  abilityId: string;
  name: string;
  archetype: string;
  role?: string;
  cooldownMs: number;
  recoilKick: number;
  displacement: DisplacementProfile;
  instabilityYield: number;
  instabilityAppliesToSelf: boolean;
  directDamage: number;
  resource: ResourceProfile;
  delivery: DeliveryProfile;
  controlDescriptions: string[];
}

export type DeltaPolarity = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface MetricDelta {
  current: number;
  baseline: number;
  delta: number;
  polarity: DeltaPolarity;
  formattedDiff: string;
}

export type MechanicDiffChipKind = 'BUFF' | 'MUTATION' | 'NEUTRAL';

export interface MechanicDiffChip {
  label: string;
  kind: MechanicDiffChipKind;
}

export interface CombatProfileDiff {
  cooldown?: MetricDelta;
  recoil?: MetricDelta;
  peakDisplacement?: MetricDelta;
  instabilityYield?: MetricDelta;
  directDamage?: MetricDelta;
  resourceCost?: MetricDelta;
  resourceCapacity?: MetricDelta;
  resourceRecharge?: MetricDelta;
  resourceLockout?: MetricDelta;
  resourceMatch: boolean;
  displacementDirectionMatch: boolean;
  mechanicChanges: string[];
  mechanicChips: MechanicDiffChip[];
}

const STATUS_CC_LABELS: Partial<Record<SpellArchetype, (dur: string) => string>> = {
  FROST: (d) => `50% Chill Slow (${d})`,
  KINETIC: (d) => `80% Drag Loss / Extreme Slip (${d})`,
  EARTH: (d) => `3× Heavy Mass Anchor (${d})`,
  GRAVITY: (d) => `0.2× Weightless Float (${d})`,
  FIRE: (d) => `Thermal Instability on Move (${d})`,
  PLASMA: () => 'Detonation at 100% Instability',
};

const CASTER_TARGETS: ReadonlySet<ActionTarget | undefined> = new Set(['CASTER', 'SELF']);

const MOBILITY_RECOIL_THRESHOLD = 200;

function formatEnumLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatDurationSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function isCasterTarget(target: ActionTarget | undefined): boolean {
  return CASTER_TARGETS.has(target);
}

interface DisplayTrajectory {
  trajectory?: TrajectoryConfig;
  emitter?: EmitterConfig;
}

function emitterHasSpread(emitter: EmitterConfig): boolean {
  return (
    emitter.count > 1 ||
    emitter.spreadDeg > 0 ||
    (emitter.aimOffsetDeg !== undefined && emitter.aimOffsetDeg !== 0)
  );
}

function resolveDisplayTrajectory(ability: AbilitySchema): DisplayTrajectory {
  let onCast: DisplayTrajectory | null = null;

  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        onCast = {
          trajectory: action.projectileTrajectory,
          emitter: action.emitter,
        };
        break;
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.trajectory) {
        return { trajectory: action.payload.trajectory };
      }
    }
    if (onCast) break;
  }

  if (onCast?.emitter && emitterHasSpread(onCast.emitter)) {
    return onCast;
  }
  if (!ability.trajectory && onCast) {
    return onCast;
  }
  if (ability.trajectory) {
    return { trajectory: ability.trajectory, emitter: onCast?.emitter };
  }
  return onCast ?? {};
}

function abilityCanHit(ability: AbilitySchema): boolean {
  if (ability.trajectory) return true;
  let hasProjectile = false;
  walkActions(ability, (v) => {
    if (v.action.type === 'SPAWN_PROJECTILE') hasProjectile = true;
  });
  return hasProjectile;
}

function classifyImpulseDirection(
  mode: ImpulseDirectionMode | undefined,
  hasCustomVector: boolean,
): DirectionFamily {
  if ((mode === 'CUSTOM' || mode === undefined) && hasCustomVector) {
    return 'CUSTOM';
  }
  switch (mode) {
    case 'TOWARDS_CASTER':
    case 'TOWARDS_ORIGIN':
      return 'PULL';
    case 'PERPENDICULAR_TRAJECTORY':
      return 'LATERAL';
    case 'ALONG_TRAJECTORY':
      return 'ALONG';
    case 'CUSTOM':
      return 'CUSTOM';
    case 'AWAY_FROM_ORIGIN':
    default:
      return 'PUSH';
  }
}

function classifyFieldDirection(
  fieldType: string,
  strength: number,
): DirectionFamily | null {
  switch (fieldType) {
    case 'RADIAL_IMPULSE':
      return strength >= 0 ? 'PUSH' : 'PULL';
    case 'MASS_ATTRACTOR':
      return strength >= 0 ? 'PULL' : 'PUSH';
    case 'VORTEX_TANGENT':
      return 'LATERAL';
    default:
      return null;
  }
}

function derivePrimaryTag(families: Set<DirectionFamily>): DisplacementDirectionTag {
  if (families.size === 0) return 'NONE';
  if (families.size > 1) return 'MIXED';
  const only = [...families][0];
  return only;
}

export function computeKineticLethality(
  peakForce: number,
  primaryTag: DisplacementDirectionTag,
): KineticLethalityProfile {
  if (peakForce <= 0 || primaryTag === 'NONE') {
    return {
      baseTravelPx: 0,
      maxTravelPx: 0,
      arenaReachPct: 0,
      tier: 'NONE',
      label: 'NO DISPLACEMENT',
      summary: '0px',
    };
  }

  const baseTravelPx = Math.round(
    peakForce * ARENA_PHYSICS_CONSTANTS.FORCE_TO_DISTANCE_FACTOR,
  );
  const maxTravelPx = Math.round(baseTravelPx * 2.0);
  const arenaReachPct = Math.min(
    100,
    Math.round(
      (maxTravelPx / ARENA_PHYSICS_CONSTANTS.STANDARD_ARENA_RADIUS) * 100,
    ),
  );

  let tier: RingOutTier = 'MICRO_INTERRUPT';
  let label = 'MICRO-INTERRUPT';

  if (maxTravelPx >= 400) {
    tier = 'LETHAL_FINISHER';
    label = primaryTag === 'PULL' ? 'LETHAL VORTEX' : 'LETHAL FINISHER';
  } else if (maxTravelPx >= 220) {
    tier = 'HEAVY_SHOVE';
    label = primaryTag === 'PULL' ? 'HEAVY DRAG' : 'HEAVY SHOVE';
  } else if (maxTravelPx >= 100) {
    tier = 'TACTICAL_REPOSITION';
    label = 'TACTICAL PEEL';
  }

  const summary = `~${baseTravelPx}–${maxTravelPx}px (${arenaReachPct}% Arena)`;
  return { baseTravelPx, maxTravelPx, arenaReachPct, tier, label, summary };
}

export function ringOutTierBadgeClass(tier: RingOutTier): string {
  switch (tier) {
    case 'LETHAL_FINISHER':
      return 'tier-lethal';
    case 'HEAVY_SHOVE':
      return 'tier-shove';
    case 'TACTICAL_REPOSITION':
      return 'tier-reposition';
    default:
      return 'tier-micro';
  }
}

function buildResourceProfile(ability: AbilitySchema): ResourceProfile {
  const rc = ability.resourceCost;
  if (!rc) {
    return { type: 'COOLDOWN', cost: ability.cooldownMs };
  }
  return {
    type: rc.type,
    cost: rc.cost,
    capacity: rc.maxCapacity,
    rechargeRate: rc.rechargeRate,
    lockoutMs: rc.lockoutDurationMs,
  };
}

function buildDeliveryProfile(ability: AbilitySchema): DeliveryProfile {
  const { trajectory, emitter } = resolveDisplayTrajectory(ability);
  const targetingMode = ability.targetingMode ?? 'DIRECTIONAL';

  if (!trajectory) {
    return {
      trajectoryType: 'INSTANT',
      targetingMode,
      shotCount: 1,
      range: 0,
      speed: 0,
      piercing: false,
      bounces: 0,
      summary: 'Instant',
    };
  }

  const shotCount = emitter?.count ?? 1;
  const fanAngleDeg = emitter && emitter.spreadDeg > 0 ? emitter.spreadDeg : undefined;
  const range = trajectory.maxRange ?? 0;
  const speed = trajectory.speed ?? 0;
  const piercing = (trajectory.piercing ?? 0) > 0;
  const bounces = trajectory.bounces ?? 0;
  const lobApex = trajectory.lobApex;

  const parts: string[] = [];
  if (emitter && emitter.count > 1) {
    const distLabel =
      emitter.distribution === 'RADIAL' ? 'RING' : formatEnumLabel(emitter.distribution);
    const spread = emitter.spreadDeg > 0 ? ` (${emitter.spreadDeg}°)` : '';
    parts.push(`${emitter.count}x ${distLabel}${spread}`);
  }
  if (range > 0) parts.push(`${range} Range`);
  if (speed > 0) parts.push(`${speed} px/s`);

  const summary =
    parts.length > 0 ? parts.join(' · ') : formatEnumLabel(trajectory.type);

  return {
    trajectoryType: trajectory.type,
    targetingMode,
    shotCount,
    fanAngleDeg,
    range,
    speed,
    piercing,
    bounces,
    lobApex,
    summary,
  };
}

function collectControlDescriptions(ability: AbilitySchema): string[] {
  const archetype = ability.archetype ?? 'KINETIC';
  const ccDescriptions: string[] = [];
  const ccSeen = new Set<string>();

  const pushCc = (desc: string): void => {
    if (ccSeen.has(desc)) return;
    ccSeen.add(desc);
    ccDescriptions.push(desc);
  };

  walkActions(ability, (v) => {
    const action = v.action;
    switch (action.type) {
      case 'APPLY_STATUS': {
        const dur = formatDurationSec(action.durationMs);
        const labelFn = STATUS_CC_LABELS[action.archetype];
        pushCc(labelFn ? labelFn(dur) : `${formatEnumLabel(action.archetype)} (${dur})`);
        break;
      }
      case 'APPLY_STASIS':
        pushCc(`Stasis lock (${formatDurationSec(action.durationMs)})`);
        break;
      default:
        break;
    }
  });

  if (abilityCanHit(ability) && archetype) {
    const labelFn = STATUS_CC_LABELS[archetype];
    if (labelFn) {
      const archetypeDesc = labelFn('2.0s');
      if (!ccSeen.has(archetypeDesc)) {
        ccDescriptions.unshift(archetypeDesc);
        ccSeen.add(archetypeDesc);
      }
    }
  }

  return ccDescriptions;
}

export function computeSpellCombatProfile(ability: AbilitySchema): SpellCombatProfile {
  const archetype = ability.archetype ?? 'KINETIC';
  const tuning = ARCHETYPE_TUNING[archetype];

  let peakForce = 0;
  const directionSet = new Set<string>();
  const familySet = new Set<DirectionFamily>();
  let hasAttractor = false;
  let hasRadial = false;

  let instabilityExplicit = 0;
  let implicitInstability = 0;
  let instabilityAppliesToSelf = false;
  let directDamage = 0;

  walkActions(ability, (v) => {
    if (!v.isPrimary) return;

    const action = v.action;
    switch (action.type) {
      case 'APPLY_IMPULSE': {
        const force = action.baseForce;
        peakForce = Math.max(peakForce, force);

        const mode = action.directionMode;
        const hasCustom = action.direction !== undefined;
        const family = classifyImpulseDirection(mode, hasCustom);
        familySet.add(family);
        directionSet.add(mode ?? (hasCustom ? 'CUSTOM' : 'AWAY_FROM_ORIGIN'));

        const implicit = force * 0.02 * tuning.impactInstabilityScale;
        implicitInstability += implicit;
        if (isCasterTarget(action.target)) {
          instabilityAppliesToSelf = true;
        }
        break;
      }
      case 'SPAWN_FIELD': {
        const { fieldType, strength } = action.field;
        const scaled = Math.abs(strength) * tuning.fieldStrengthScale;
        if (
          fieldType === 'RADIAL_IMPULSE' ||
          fieldType === 'MASS_ATTRACTOR' ||
          fieldType === 'VORTEX_TANGENT'
        ) {
          peakForce = Math.max(peakForce, scaled);
          const family = classifyFieldDirection(fieldType, strength);
          if (family) {
            familySet.add(family);
            directionSet.add(fieldType);
          }
          if (fieldType === 'MASS_ATTRACTOR') hasAttractor = true;
          if (fieldType === 'RADIAL_IMPULSE') hasRadial = true;
          if (fieldType === 'VORTEX_TANGENT') hasRadial = true;
        }
        break;
      }
      case 'ADD_INSTABILITY':
        instabilityExplicit += action.amount;
        if (isCasterTarget(action.target)) {
          instabilityAppliesToSelf = true;
        }
        break;
      case 'MODIFY_STAT':
        if (action.stat === 'health' && action.value < 0) {
          directDamage += Math.abs(action.value);
        }
        break;
      default:
        break;
    }
  });

  const baseline = abilityCanHit(ability) ? BASELINE_INSTABILITY_ON_HIT : 0;
  const instabilityYield = Math.round(
    baseline + instabilityExplicit + implicitInstability,
  );

  const directions = [...directionSet].sort();
  const roundedPeakForce = Math.round(peakForce);
  const primaryTag = derivePrimaryTag(familySet);

  return {
    abilityId: ability.id,
    name: ability.name,
    archetype,
    cooldownMs: ability.cooldownMs,
    recoilKick: ability.recoilKick ?? 0,
    displacement: {
      peakForce: roundedPeakForce,
      directions,
      primaryTag,
      hasAttractor,
      hasRadial,
      lethality: computeKineticLethality(roundedPeakForce, primaryTag),
    },
    instabilityYield,
    instabilityAppliesToSelf,
    directDamage: Math.round(directDamage),
    resource: buildResourceProfile(ability),
    delivery: buildDeliveryProfile(ability),
    controlDescriptions: collectControlDescriptions(ability),
  };
}

function makeMetricDelta(
  current: number,
  baseline: number,
  formattedDiff: string,
  polarity: DeltaPolarity,
): MetricDelta | undefined {
  const delta = current - baseline;
  if (delta === 0) return undefined;
  return { current, baseline, delta, polarity, formattedDiff };
}

function polarityFromDelta(delta: number, lowerIsBetter: boolean): DeltaPolarity {
  if (delta === 0) return 'NEUTRAL';
  if (lowerIsBetter) {
    return delta < 0 ? 'POSITIVE' : 'NEGATIVE';
  }
  return delta > 0 ? 'POSITIVE' : 'NEGATIVE';
}

export function extractMechanicDiffChips(
  current: SpellCombatProfile,
  baseline: SpellCombatProfile | null,
): MechanicDiffChip[] {
  if (!baseline) return [];

  const chips: MechanicDiffChip[] = [];

  if (baseline.delivery.targetingMode !== current.delivery.targetingMode) {
    if (current.delivery.targetingMode === 'GROUND_POINT') {
      chips.push({ label: '+ GROUND TARGET', kind: 'MUTATION' });
    } else {
      chips.push({ label: 'DIRECTIONAL', kind: 'MUTATION' });
    }
  }

  if (!baseline.delivery.piercing && current.delivery.piercing) {
    chips.push({ label: '+ PIERCING', kind: 'BUFF' });
  } else if (baseline.delivery.piercing && !current.delivery.piercing) {
    chips.push({ label: '- PIERCING', kind: 'NEUTRAL' });
  }

  if (current.delivery.bounces > baseline.delivery.bounces) {
    const delta = current.delivery.bounces - baseline.delivery.bounces;
    chips.push({
      label: `+${delta} BOUNCE${delta > 1 ? 'S' : ''}`,
      kind: 'BUFF',
    });
  }

  const baseTag = baseline.displacement.primaryTag;
  const curTag = current.displacement.primaryTag;
  if (baseTag !== curTag && baseTag !== 'NONE' && curTag !== 'NONE') {
    chips.push({
      label: `${baseTag} ➔ ${curTag}`,
      kind: 'MUTATION',
    });
  }

  if (baseline.delivery.trajectoryType !== current.delivery.trajectoryType) {
    if (current.delivery.trajectoryType === 'BALLISTIC_ARC') {
      chips.push({ label: '+ MORTAR ARC', kind: 'BUFF' });
    } else if (current.delivery.trajectoryType === 'HOMING_SLERP') {
      chips.push({ label: '+ HOMING', kind: 'BUFF' });
    }
  }

  if (current.delivery.shotCount > baseline.delivery.shotCount) {
    const delta = current.delivery.shotCount - baseline.delivery.shotCount;
    chips.push({
      label: `+${delta} SHOT${delta > 1 ? 'S' : ''}`,
      kind: 'BUFF',
    });
  }

  return chips;
}

export function compareCombatProfiles(
  current: SpellCombatProfile,
  baseline: SpellCombatProfile | null,
): CombatProfileDiff {
  const result: CombatProfileDiff = {
    resourceMatch: true,
    displacementDirectionMatch: true,
    mechanicChanges: [],
    mechanicChips: [],
  };

  if (!baseline) return result;

  result.mechanicChips = extractMechanicDiffChips(current, baseline);

  const curRes = current.resource;
  const baseRes = baseline.resource;
  result.resourceMatch = curRes.type === baseRes.type;

  if (!result.resourceMatch) {
    result.mechanicChanges.push(
      `Resource: ${baseRes.type} → ${curRes.type}`,
    );
  } else {
    const costDelta = makeMetricDelta(
      curRes.cost,
      baseRes.cost,
      `${curRes.cost - baseRes.cost >= 0 ? '+' : ''}${curRes.cost - baseRes.cost}`,
      polarityFromDelta(curRes.cost - baseRes.cost, true),
    );
    if (costDelta) result.resourceCost = costDelta;

    if (curRes.capacity !== undefined || baseRes.capacity !== undefined) {
      const curCap = curRes.capacity ?? 0;
      const baseCap = baseRes.capacity ?? 0;
      const capDelta = makeMetricDelta(
        curCap,
        baseCap,
        `${curCap - baseCap >= 0 ? '+' : ''}${curCap - baseCap}`,
        polarityFromDelta(curCap - baseCap, false),
      );
      if (capDelta) result.resourceCapacity = capDelta;
    }

    if (curRes.rechargeRate !== undefined || baseRes.rechargeRate !== undefined) {
      const curRate = curRes.rechargeRate ?? 0;
      const baseRate = baseRes.rechargeRate ?? 0;
      const rateDelta = makeMetricDelta(
        curRate,
        baseRate,
        `${curRate - baseRate >= 0 ? '+' : ''}${curRate - baseRate}`,
        polarityFromDelta(curRate - baseRate, false),
      );
      if (rateDelta) result.resourceRecharge = rateDelta;
    }

    if (curRes.lockoutMs !== undefined || baseRes.lockoutMs !== undefined) {
      const curLock = curRes.lockoutMs ?? 0;
      const baseLock = baseRes.lockoutMs ?? 0;
      const lockDelta = makeMetricDelta(
        curLock,
        baseLock,
        `${curLock - baseLock >= 0 ? '+' : ''}${curLock - baseLock}ms`,
        polarityFromDelta(curLock - baseLock, true),
      );
      if (lockDelta) result.resourceLockout = lockDelta;
    }
  }

  if (curRes.type === 'COOLDOWN' && baseRes.type === 'COOLDOWN') {
    const cdDelta = current.cooldownMs - baseline.cooldownMs;
    const formatted = `${cdDelta >= 0 ? '+' : ''}${cdDelta}ms`;
    const delta = makeMetricDelta(
      current.cooldownMs,
      baseline.cooldownMs,
      formatted,
      polarityFromDelta(cdDelta, true),
    );
    if (delta) result.cooldown = delta;
  }

  const recoilDelta = current.recoilKick - baseline.recoilKick;
  if (recoilDelta !== 0) {
    const bothMobility =
      current.recoilKick >= MOBILITY_RECOIL_THRESHOLD &&
      baseline.recoilKick >= MOBILITY_RECOIL_THRESHOLD;
    const lowerIsBetter = !bothMobility;
    result.recoil = makeMetricDelta(
      current.recoilKick,
      baseline.recoilKick,
      `${recoilDelta >= 0 ? '+' : ''}${recoilDelta}`,
      polarityFromDelta(recoilDelta, lowerIsBetter),
    )!;
  }

  const curTag = current.displacement.primaryTag;
  const baseTag = baseline.displacement.primaryTag;
  result.displacementDirectionMatch =
    curTag === baseTag && curTag !== 'MIXED' && curTag !== 'NONE';

  if (!result.displacementDirectionMatch && curTag !== baseTag) {
    result.mechanicChanges.push(
      `Displacement: ${baseTag} → ${curTag}`,
    );
  }

  if (
    result.displacementDirectionMatch &&
    curTag !== 'MIXED' &&
    curTag !== 'NONE'
  ) {
    const forceDelta = current.displacement.peakForce - baseline.displacement.peakForce;
    if (forceDelta !== 0) {
      result.peakDisplacement = makeMetricDelta(
        current.displacement.peakForce,
        baseline.displacement.peakForce,
        `${forceDelta >= 0 ? '+' : ''}${forceDelta}`,
        polarityFromDelta(forceDelta, false),
      )!;
    }
  }

  if (!current.instabilityAppliesToSelf && !baseline.instabilityAppliesToSelf) {
    const instDelta = current.instabilityYield - baseline.instabilityYield;
    if (instDelta !== 0) {
      result.instabilityYield = makeMetricDelta(
        current.instabilityYield,
        baseline.instabilityYield,
        `${instDelta >= 0 ? '+' : ''}${instDelta}`,
        polarityFromDelta(instDelta, false),
      )!;
    }
  }

  const dmgDelta = current.directDamage - baseline.directDamage;
  if (dmgDelta !== 0) {
    result.directDamage = makeMetricDelta(
      current.directDamage,
      baseline.directDamage,
      `${dmgDelta >= 0 ? '+' : ''}${dmgDelta}`,
      polarityFromDelta(dmgDelta, false),
    )!;
  }

  return result;
}

export interface StatDiffDisplay {
  text: string;
  color: string;
}

/** Formats cooldown + recoil deltas for legacy result-card stat lines. */
export function formatCombatStatDiff(
  diff: CombatProfileDiff,
): StatDiffDisplay | null {
  const parts: { label: string; formatted: string; polarity: DeltaPolarity }[] = [];

  if (diff.cooldown) {
    parts.push({
      label: 'CD',
      formatted: diff.cooldown.formattedDiff,
      polarity: diff.cooldown.polarity,
    });
  }
  if (diff.recoil) {
    parts.push({
      label: 'Recoil',
      formatted: diff.recoil.formattedDiff,
      polarity: diff.recoil.polarity,
    });
  }

  if (parts.length === 0) return null;

  const text = parts.map((p) => `${p.label} ${p.formatted}`).join(' · ');

  const hasNegative = parts.some((p) => p.polarity === 'NEGATIVE');
  const hasPositive = parts.some((p) => p.polarity === 'POSITIVE');
  let color = '#ccc';
  if (hasPositive && !hasNegative) color = '#4f8';
  else if (hasNegative && !hasPositive) color = '#f66';
  else if (hasPositive && hasNegative) color = '#fcd34d';

  return { text, color };
}

export function formatProfileCadence(profile: SpellCombatProfile): string {
  const res = profile.resource;
  if (res.type === 'COOLDOWN') {
    return profile.cooldownMs >= 1000
      ? `${(profile.cooldownMs / 1000).toFixed(1)}s CD`
      : `${profile.cooldownMs}ms CD`;
  }
  const parts = [`${res.cost} ${res.type.replace(/_/g, ' ')}`];
  if (res.capacity !== undefined) parts.push(`cap ${res.capacity}`);
  return parts.join(' · ');
}

export function buildTacticalVerbLines(
  ability: AbilitySchema,
  profile: SpellCombatProfile,
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  const push = (key: string, line: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(line);
  };

  walkActions(ability, (v) => {
    if (!v.isPrimary) return;
    const action = v.action;

    switch (action.type) {
      case 'SPAWN_ACTOR': {
        const archetype = action.actor.actorArchetype;
        const dur = (action.actor.durationMs / 1000).toFixed(1);
        push('actor', `DEPLOYMENT: Spawns ${archetype} (${dur}s)`);
        break;
      }
      case 'SPAWN_OBSTACLE': {
        const shape = action.obstacle.shape;
        push('obstacle', `BARRIER: Places ${shape} barricade`);
        break;
      }
      case 'REFLECT_PROJECTILES': {
        const arc = action.arcDeg;
        if (arc !== undefined && arc < 360) {
          push('reflect', `DEFENSE: Directional parry (${arc}°)`);
        } else {
          push('reflect', 'DEFENSE: Projectile parry');
        }
        break;
      }
      case 'TELEPORT':
        push('teleport', `MOBILITY: Blink ${action.distance}px`);
        break;
      case 'APPLY_STASIS':
        push(
          'stasis',
          `CONTROL: Stasis ${(action.durationMs / 1000).toFixed(1)}s`,
        );
        break;
      case 'MODIFY_STAT':
        if (action.stat === 'health') {
          if (action.value > 0) {
            push('heal', `HEAL: Restores ${action.value} HP`);
          } else if (action.value < 0) {
            push('damage', `DAMAGE: ${Math.abs(action.value)} HP`);
          }
        }
        break;
      default:
        break;
    }
  });

  if (profile.delivery.summary) {
    push('delivery', profile.delivery.summary);
  }

  return lines;
}

export function polarityCssClass(polarity: DeltaPolarity): string {
  switch (polarity) {
    case 'POSITIVE':
      return 'is-positive';
    case 'NEGATIVE':
      return 'is-negative';
    default:
      return 'is-neutral';
  }
}
