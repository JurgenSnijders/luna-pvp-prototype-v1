import type { Projectile } from '../entities/Projectile';
import { Vector2D } from '../math/Vector2D';
import type { TrajectoryMotion, TrajectoryType } from '../types/schema';

const PATH_OR_ORBIT = new Set<TrajectoryType>(['DRAWN_PATH', 'ORBIT_ANCHOR']);

function fnv1aUpdate(h: number, value: number): number {
  return Math.imul(h ^ value, 0x01000193) >>> 0;
}

function hashString(h: number, s: string): number {
  let state = h;
  for (let i = 0; i < s.length; i++) {
    state = fnv1aUpdate(state, s.charCodeAt(i));
  }
  return state;
}

/** Stable uint32 seed from spawn kinematics — never hash projectile.id (process counter). */
export function computeMotionSeed(
  sourceEntityId: string,
  aimAngle: number,
  x: number,
  y: number,
  depth: number,
  emitterIndex = 0,
): number {
  let h = 0x811c9dc5;
  h = hashString(h, sourceEntityId);
  h = fnv1aUpdate(h, Math.round(aimAngle * 10000));
  h = fnv1aUpdate(h, Math.round(x * 100));
  h = fnv1aUpdate(h, Math.round(y * 100));
  h = fnv1aUpdate(h, depth);
  h = fnv1aUpdate(h, emitterIndex);
  return h;
}

/** Deterministic noise in [0, 1) from seed + lifetimeMs. Never uses Math.random. */
export function motionNoise01(seed: number, lifetimeMs: number): number {
  let t = (seed ^ Math.floor(lifetimeMs)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function perpendicular(heading: number): Vector2D {
  return Vector2D.fromAngle(heading + Math.PI / 2, 1);
}

function computeSpeedScale(
  lifetimeMs: number,
  speedCurve?: TrajectoryMotion['speedCurve'],
): number {
  if (!speedCurve) return 1;
  const frac = Math.min(1, lifetimeMs / speedCurve.rampMs);
  return speedCurve.startScale + (1 - speedCurve.startScale) * frac;
}

function hasMotion(motion?: TrajectoryMotion): boolean {
  if (!motion) return false;
  return !!(
    motion.wobble ||
    motion.jitter ||
    motion.drift ||
    motion.spiral ||
    motion.speedCurve
  );
}

/**
 * Post-pass after the trajectory switch. Perturbs heading/velocity/position deterministically.
 */
export function applyMotionModifiers(
  proj: Projectile,
  dt: number,
  distBeforeSwitch: number,
): void {
  const motion = proj.config.motion;
  if (!hasMotion(motion)) return;

  const tSec = proj.lifetimeMs / 1000;
  const speed = proj.config.speed ?? 400;
  const type = proj.config.type;
  const isPathType = PATH_OR_ORBIT.has(type);

  const baseHeading =
    proj.vel.magSq() > 1e-6 ? Math.atan2(proj.vel.y, proj.vel.x) : proj.aimAngle;
  let heading = baseHeading;
  let lateralPx = 0;

  if (motion!.wobble) {
    const { amplitudeDeg, frequencyHz, decay = 0 } = motion!.wobble;
    const phase = 2 * Math.PI * frequencyHz * tSec;
    const envelope = Math.exp(-decay * tSec);
    const wobbleDeg = amplitudeDeg * Math.sin(phase) * envelope;
    if (isPathType) {
      lateralPx += wobbleDeg;
    } else {
      heading += (wobbleDeg * Math.PI) / 180;
    }
  }

  if (motion!.jitter) {
    const noise = motionNoise01(proj.motionSeed, proj.lifetimeMs);
    const jitterDeg = (noise - 0.5) * 2 * motion!.jitter.magnitude;
    if (isPathType) {
      lateralPx += (noise - 0.5) * motion!.jitter.magnitude;
    } else {
      heading += (jitterDeg * Math.PI) / 180;
    }
  }

  const speedScale = computeSpeedScale(proj.lifetimeMs, motion!.speedCurve);
  const scaledSpeed = speed * speedScale;
  const perp = perpendicular(baseHeading);

  if (isPathType) {
    if (motion!.spiral) {
      const { radius, frequencyHz } = motion!.spiral;
      lateralPx += radius * Math.sin(2 * Math.PI * frequencyHz * tSec);
    }
    if (lateralPx !== 0) {
      proj.pos = proj.pos.add(perp.scale(lateralPx));
    }
    if (speedScale !== 1 && proj.vel.magSq() > 0) {
      proj.vel = proj.vel.normalize().scale(scaledSpeed);
    }
    return;
  }

  let vel = Vector2D.fromAngle(heading, scaledSpeed);

  if (motion!.drift) {
    const latSpeed = motion!.drift.lateralAccel * tSec;
    vel = vel.add(perp.scale(latSpeed));
  }

  proj.vel = vel;
  let pos = proj.prevPos.add(vel.scale(dt));

  if (motion!.spiral) {
    const { radius, frequencyHz } = motion!.spiral;
    const spiralOff = radius * Math.sin(2 * Math.PI * frequencyHz * tSec);
    pos = pos.add(perp.scale(spiralOff));
  }

  proj.pos = pos;
  proj.distanceTraveled = distBeforeSwitch + vel.mag() * dt;
}
