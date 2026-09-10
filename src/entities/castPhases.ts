import type { CastPhaseMoveScale, InputProfile } from '../types/schema';
import type { ExecutionOverrides } from '../types/triggerContext';

export type CastPhase = 'WINDUP' | 'ACTIVE' | 'RECOVERY';

export interface CastPhaseDurations {
  windupMs: number;
  activeMs: number;
  recoveryMs: number;
}

export interface PendingCast {
  overrides: ExecutionOverrides;
  isChannelTick: boolean;
}

export interface CastPhaseState {
  slotIndex: number;
  phase: CastPhase;
  remainingMs: number;
  totalMs: number;
  durations: CastPhaseDurations;
  moveScale: CastPhaseMoveScale;
  cancelable: boolean;
  pendingCast: PendingCast | null;
  armChannelOnActive: boolean;
}

export function hasTimingPhases(profile: InputProfile): boolean {
  return (
    (profile.windupMs ?? 0) > 0 ||
    (profile.activeMs ?? 0) > 0 ||
    (profile.recoveryMs ?? 0) > 0
  );
}

export function resolvePhaseDurations(profile: InputProfile): CastPhaseDurations {
  return {
    windupMs: Math.max(0, profile.windupMs ?? 0),
    activeMs: Math.max(0, profile.activeMs ?? 0),
    recoveryMs: Math.max(0, profile.recoveryMs ?? 0),
  };
}

export function phaseMoveScale(state: CastPhaseState): number {
  switch (state.phase) {
    case 'WINDUP':
      return state.moveScale.windup ?? 1;
    case 'ACTIVE':
      return state.moveScale.active ?? 1;
    case 'RECOVERY':
      return state.moveScale.recovery ?? 1;
    default:
      return 1;
  }
}

function enterPhase(
  state: CastPhaseState,
  phase: CastPhase,
  durationMs: number,
): void {
  state.phase = phase;
  state.remainingMs = durationMs;
  state.totalMs = durationMs;
}

function nextPhaseAfter(
  state: CastPhaseState,
  completed: CastPhase,
): CastPhase | null {
  if (completed === 'WINDUP') {
    if (state.durations.activeMs > 0) return 'ACTIVE';
    if (state.durations.recoveryMs > 0) return 'RECOVERY';
    return null;
  }
  if (completed === 'ACTIVE') {
    if (state.durations.recoveryMs > 0) return 'RECOVERY';
    return null;
  }
  return null;
}

export type CastPhaseAdvanceResult =
  | { kind: 'continuing' }
  | { kind: 'dispatched'; pending: PendingCast }
  | { kind: 'completed'; armChannel: boolean }
  | { kind: 'channel_armed' };

export function advanceCastPhase(
  state: CastPhaseState,
  dtMs: number,
): CastPhaseAdvanceResult {
  state.remainingMs -= dtMs;
  if (state.remainingMs > 0) {
    return { kind: 'continuing' };
  }

  if (state.phase === 'WINDUP') {
    let dispatched: PendingCast | null = null;
    if (state.pendingCast) {
      dispatched = state.pendingCast;
      state.pendingCast = null;
    }

    const next = nextPhaseAfter(state, 'WINDUP');
    if (next === 'ACTIVE') {
      enterPhase(state, 'ACTIVE', state.durations.activeMs);
      if (dispatched) {
        return { kind: 'dispatched', pending: dispatched };
      }
      if (state.armChannelOnActive) {
        return { kind: 'channel_armed' };
      }
      return { kind: 'continuing' };
    }
    if (next === 'RECOVERY') {
      enterPhase(state, 'RECOVERY', state.durations.recoveryMs);
      if (dispatched) {
        return { kind: 'dispatched', pending: dispatched };
      }
      return { kind: 'continuing' };
    }

    if (dispatched) {
      return { kind: 'dispatched', pending: dispatched };
    }
    return {
      kind: 'completed',
      armChannel: state.armChannelOnActive,
    };
  }

  if (state.phase === 'ACTIVE') {
    const next = nextPhaseAfter(state, 'ACTIVE');
    if (next === 'RECOVERY') {
      enterPhase(state, 'RECOVERY', state.durations.recoveryMs);
      return { kind: 'continuing' };
    }
    return { kind: 'completed', armChannel: false };
  }

  return { kind: 'completed', armChannel: false };
}

export function createCastPhaseState(
  slotIndex: number,
  profile: InputProfile,
  pendingCast: PendingCast | null,
  armChannelOnActive = false,
): CastPhaseState | null {
  const durations = resolvePhaseDurations(profile);
  if (durations.windupMs + durations.activeMs + durations.recoveryMs <= 0) {
    return null;
  }

  return {
    slotIndex,
    phase: 'WINDUP',
    remainingMs: durations.windupMs,
    totalMs: durations.windupMs > 0 ? durations.windupMs : 1,
    durations,
    moveScale: profile.moveScale ?? {},
    cancelable: profile.cancelable ?? false,
    pendingCast,
    armChannelOnActive,
  };
}
