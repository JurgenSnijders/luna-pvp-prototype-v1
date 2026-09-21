import { WORLD_GRAVITY } from '../engine/verticalConstants';
import type { AbilitySchema, TrajectoryConfig } from '../types/schema';
import { abilityUsesGroundReticle } from '../render/canvas/trajectoryTracer';
import { Vector2D } from './Vector2D';

export const BALLISTIC_SPEED_MIN = 150;
export const BALLISTIC_SPEED_MAX = 1600;
export const BALLISTIC_MIN_GROUND_RANGE = 20;

export interface BallisticSpeedLimits {
  min: number;
  max: number;
}

export interface BallisticSpeedSolveResult {
  speed: number;
  clamped: boolean;
  achievableRange: number;
}

/** Time from launch to ground impact for a forward lob with z0=0. */
export function ballisticTimeOfFlight(
  lobApex: number,
  gravityScale = 1,
): number {
  const g = WORLD_GRAVITY * gravityScale;
  if (g <= 0 || lobApex <= 0) return 0;
  const vz0 = Math.sqrt(2 * g * lobApex);
  return (2 * vz0) / g;
}

/** Planar ground range for a forward lob at constant horizontal speed. */
export function ballisticGroundRange(
  speed: number,
  lobApex: number,
  gravityScale = 1,
): number {
  return speed * ballisticTimeOfFlight(lobApex, gravityScale);
}

/** Solve horizontal speed so a forward lob reaches the requested ground range. */
export function solveBallisticSpeedForRange(
  groundRange: number,
  lobApex: number,
  gravityScale = 1,
  limits: BallisticSpeedLimits = {
    min: BALLISTIC_SPEED_MIN,
    max: BALLISTIC_SPEED_MAX,
  },
): BallisticSpeedSolveResult {
  const tImpact = ballisticTimeOfFlight(lobApex, gravityScale);
  if (tImpact <= 0) {
    const fallback = limits.min;
    return { speed: fallback, clamped: false, achievableRange: 0 };
  }

  const requested = Math.max(0, groundRange);
  const idealSpeed = requested / tImpact;
  const clampedSpeed = Math.max(limits.min, Math.min(limits.max, idealSpeed));
  const clamped = clampedSpeed !== idealSpeed;

  return {
    speed: clampedSpeed,
    clamped,
    achievableRange: clampedSpeed * tImpact,
  };
}

/** True when cursor distance should drive solved speed for forward mortars. */
export function shouldApplyCursorBallisticSolver(
  trajectory: TrajectoryConfig,
  ability?: Partial<AbilitySchema>,
): boolean {
  if (trajectory.type !== 'BALLISTIC_ARC') return false;
  if ((trajectory.spawnAltitude ?? 0) > 0) return false;
  if ((trajectory.lobApex ?? 0) <= 0) return false;
  if (ability?.targetingMode === 'GROUND_POINT') {
    if (ability.trajectory) {
      if ((ability.trajectory.spawnAltitude ?? 0) > 0) return false;
    } else if (ability.triggers) {
      if (abilityUsesGroundReticle(ability as AbilitySchema)) return false;
    } else {
      return false;
    }
  }
  return true;
}

function clampGroundRange(
  groundRange: number,
  maxRange: number,
  minRange = BALLISTIC_MIN_GROUND_RANGE,
): number {
  const max = Math.max(minRange, maxRange);
  return Math.max(minRange, Math.min(max, groundRange));
}

/**
 * Planar distance from muzzle to aim point along the center heading.
 * Returns 0 when aim is missing or behind the muzzle.
 */
export function resolveCursorGroundRange(
  casterPos: Vector2D,
  aimPoint: Vector2D,
  heading: Vector2D,
  muzzleOffset: number,
  maxRange: number,
): number {
  const muzzle = casterPos.add(heading.scale(muzzleOffset));
  const toAim = aimPoint.sub(muzzle);
  const planarDist = toAim.mag();
  if (planarDist <= 0.01) return BALLISTIC_MIN_GROUND_RANGE;
  return clampGroundRange(planarDist, maxRange);
}

/** Clone trajectory with speed solved from clamped cursor ground range. */
export function resolveCursorBallisticTrajectory(
  trajectory: TrajectoryConfig,
  casterPos: Vector2D,
  aimPoint: Vector2D | undefined,
  muzzleOffset: number,
  heading: Vector2D,
  ability?: Partial<AbilitySchema>,
): TrajectoryConfig {
  if (!aimPoint || !shouldApplyCursorBallisticSolver(trajectory, ability)) {
    return trajectory;
  }

  const lobApex = trajectory.lobApex ?? 80;
  const gravityScale = trajectory.gravityScale ?? 1;
  const maxRange = trajectory.maxRange ?? 500;
  const groundRange = resolveCursorGroundRange(
    casterPos,
    aimPoint,
    heading,
    muzzleOffset,
    maxRange,
  );
  const solved = solveBallisticSpeedForRange(groundRange, lobApex, gravityScale);

  return {
    ...trajectory,
    speed: solved.speed,
  };
}
