export const MOVEMENT_PROFILE_KEY = 'LUNA_MOVEMENT_PROFILE';

export interface MovementProfile {
  moveSpeed: number;
  maxSpeed: number;
  accel: number;
  brakeAccel: number;
  turnAccel: number;
  friction: number;
  linearDrag: number;
  quadraticDrag: number;
  mass: number;
  knockbackResistance: number;
  restitution: number;
  stopThreshold: number;
  inputSmoothingMs: number;
}

export type MovementPresetName =
  | 'Arena'
  | 'Ice'
  | 'Vacuum'
  | 'Mud'
  | 'Underwater'
  | 'Twitch'
  | 'Pinball'
  | 'Tank';

export const DEFAULT_MOVEMENT_PROFILE: MovementProfile = {
  moveSpeed: 280,
  maxSpeed: 600,
  accel: 1200,
  brakeAccel: 1200,
  turnAccel: 1200,
  friction: 8,
  linearDrag: 3,
  quadraticDrag: 0,
  mass: 1,
  knockbackResistance: 0,
  restitution: 0.3,
  stopThreshold: 5,
  inputSmoothingMs: 0,
};

const MOVEMENT_PRESETS: Record<MovementPresetName, MovementProfile> = {
  Arena: { ...DEFAULT_MOVEMENT_PROFILE },
  Ice: {
    moveSpeed: 280,
    maxSpeed: 600,
    accel: 400,
    brakeAccel: 200,
    turnAccel: 250,
    friction: 0.4,
    linearDrag: 0.3,
    quadraticDrag: 0,
    mass: 1,
    knockbackResistance: 0,
    restitution: 0.5,
    stopThreshold: 2,
    inputSmoothingMs: 0,
  },
  Vacuum: {
    moveSpeed: 280,
    maxSpeed: 1200,
    accel: 350,
    brakeAccel: 350,
    turnAccel: 350,
    friction: 0,
    linearDrag: 0,
    quadraticDrag: 0,
    mass: 1,
    knockbackResistance: 0,
    restitution: 0.95,
    stopThreshold: 0,
    inputSmoothingMs: 0,
  },
  Mud: {
    moveSpeed: 150,
    maxSpeed: 200,
    accel: 700,
    brakeAccel: 2000,
    turnAccel: 900,
    friction: 14,
    linearDrag: 9,
    quadraticDrag: 0,
    mass: 1.2,
    knockbackResistance: 0,
    restitution: 0,
    stopThreshold: 8,
    inputSmoothingMs: 0,
  },
  Underwater: {
    moveSpeed: 220,
    maxSpeed: 320,
    accel: 800,
    brakeAccel: 600,
    turnAccel: 500,
    friction: 3,
    linearDrag: 4,
    quadraticDrag: 0.02,
    mass: 1,
    knockbackResistance: 0,
    restitution: 0.15,
    stopThreshold: 4,
    inputSmoothingMs: 120,
  },
  Twitch: {
    moveSpeed: 280,
    maxSpeed: 600,
    accel: 6000,
    brakeAccel: 6000,
    turnAccel: 6000,
    friction: 30,
    linearDrag: 0,
    quadraticDrag: 0,
    mass: 1,
    knockbackResistance: 0,
    restitution: 0.3,
    stopThreshold: 10,
    inputSmoothingMs: 0,
  },
  Pinball: {
    moveSpeed: 280,
    maxSpeed: 900,
    accel: 600,
    brakeAccel: 400,
    turnAccel: 400,
    friction: 1,
    linearDrag: 0.5,
    quadraticDrag: 0,
    mass: 1,
    knockbackResistance: 0,
    restitution: 1.05,
    stopThreshold: 2,
    inputSmoothingMs: 0,
  },
  Tank: {
    moveSpeed: 200,
    maxSpeed: 280,
    accel: 500,
    brakeAccel: 800,
    turnAccel: 200,
    friction: 10,
    linearDrag: 4,
    quadraticDrag: 0,
    mass: 3,
    knockbackResistance: 0.6,
    restitution: 0.2,
    stopThreshold: 6,
    inputSmoothingMs: 0,
  },
};

let cache: MovementProfile | null = null;

function loadFromStorage(): MovementProfile {
  try {
    const raw = localStorage.getItem(MOVEMENT_PROFILE_KEY);
    if (!raw) return { ...DEFAULT_MOVEMENT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<MovementProfile>;
    return {
      moveSpeed: parsed.moveSpeed ?? DEFAULT_MOVEMENT_PROFILE.moveSpeed,
      maxSpeed: parsed.maxSpeed ?? DEFAULT_MOVEMENT_PROFILE.maxSpeed,
      accel: parsed.accel ?? DEFAULT_MOVEMENT_PROFILE.accel,
      brakeAccel: parsed.brakeAccel ?? DEFAULT_MOVEMENT_PROFILE.brakeAccel,
      turnAccel: parsed.turnAccel ?? DEFAULT_MOVEMENT_PROFILE.turnAccel,
      friction: parsed.friction ?? DEFAULT_MOVEMENT_PROFILE.friction,
      linearDrag: parsed.linearDrag ?? DEFAULT_MOVEMENT_PROFILE.linearDrag,
      quadraticDrag: parsed.quadraticDrag ?? DEFAULT_MOVEMENT_PROFILE.quadraticDrag,
      mass: parsed.mass ?? DEFAULT_MOVEMENT_PROFILE.mass,
      knockbackResistance:
        parsed.knockbackResistance ?? DEFAULT_MOVEMENT_PROFILE.knockbackResistance,
      restitution: parsed.restitution ?? DEFAULT_MOVEMENT_PROFILE.restitution,
      stopThreshold: parsed.stopThreshold ?? DEFAULT_MOVEMENT_PROFILE.stopThreshold,
      inputSmoothingMs: parsed.inputSmoothingMs ?? DEFAULT_MOVEMENT_PROFILE.inputSmoothingMs,
    };
  } catch {
    return { ...DEFAULT_MOVEMENT_PROFILE };
  }
}

export function getMovementProfile(): MovementProfile {
  if (!cache) {
    cache = loadFromStorage();
  }
  return cache;
}

export function saveMovementProfile(profile: MovementProfile): void {
  cache = { ...profile };
  localStorage.setItem(MOVEMENT_PROFILE_KEY, JSON.stringify(cache));
}

export function applyMovementPreset(name: MovementPresetName): MovementProfile {
  const preset = { ...MOVEMENT_PRESETS[name] };
  saveMovementProfile(preset);
  return preset;
}

export function getMovementPresetNames(): MovementPresetName[] {
  return Object.keys(MOVEMENT_PRESETS) as MovementPresetName[];
}
