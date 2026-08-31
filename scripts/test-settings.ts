import {
  DEFAULT_ARENA_HEX_RADIUS,
  DEFAULT_COOLDOWN_SCALE,
  DEFAULT_GLOBAL_COOLDOWN_MS,
  MAX_COOLDOWN_SCALE,
  MAX_GLOBAL_COOLDOWN_MS,
  MIN_COOLDOWN_SCALE,
  MIN_GLOBAL_COOLDOWN_MS,
  applyCooldownPacingSettings,
  getStoredCombatantRadius,
  getStoredCooldownScale,
  getStoredGlobalCooldownMs,
  getStoredHexRadius,
} from '../src/game/settings';
import { Player } from '../src/entities/Player';
import {
  DEFAULT_COMBATANT_RADIUS,
  MAX_COMBATANT_RADIUS,
  MAX_HEX_RADIUS,
  MIN_COMBATANT_RADIUS,
  MIN_HEX_RADIUS,
} from '../src/engine/PhysicsWorld';

interface SettingsSnapshot {
  hexRadiusDefault: number;
  hexRadiusClampedLow: number;
  hexRadiusClampedHigh: number;
  combatantRadiusDefault: number;
  combatantRadiusClampedLow: number;
  combatantRadiusClampedHigh: number;
  cooldownScaleDefault: number;
  cooldownScaleClampedLow: number;
  cooldownScaleClampedHigh: number;
  globalCooldownMsDefault: number;
  globalCooldownMsClampedLow: number;
  globalCooldownMsClampedHigh: number;
  pacingApplied: { scale: number; durationMs: number };
}

const memoryStorage = new Map<string, string>();

function installMockLocalStorage(): void {
  const store = memoryStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
    configurable: true,
  });
}

function captureSettings(): SettingsSnapshot {
  memoryStorage.clear();
  Player.globalCooldownScale = 1;
  Player.globalCooldownDurationMs = 0;

  const hexRadiusDefault = getStoredHexRadius();

  memoryStorage.set('LUNA_ARENA_HEX_RADIUS', String(MIN_HEX_RADIUS - 100));
  const hexRadiusClampedLow = getStoredHexRadius();

  memoryStorage.set('LUNA_ARENA_HEX_RADIUS', String(MAX_HEX_RADIUS + 100));
  const hexRadiusClampedHigh = getStoredHexRadius();

  memoryStorage.clear();
  const combatantRadiusDefault = getStoredCombatantRadius();

  memoryStorage.set('LUNA_COMBATANT_RADIUS', String(MIN_COMBATANT_RADIUS - 5));
  const combatantRadiusClampedLow = getStoredCombatantRadius();

  memoryStorage.set('LUNA_COMBATANT_RADIUS', String(MAX_COMBATANT_RADIUS + 5));
  const combatantRadiusClampedHigh = getStoredCombatantRadius();

  memoryStorage.clear();
  const cooldownScaleDefault = getStoredCooldownScale();

  memoryStorage.set('LUNA_COOLDOWN_SCALE', String(MIN_COOLDOWN_SCALE - 1));
  const cooldownScaleClampedLow = getStoredCooldownScale();

  memoryStorage.set('LUNA_COOLDOWN_SCALE', String(MAX_COOLDOWN_SCALE + 1));
  const cooldownScaleClampedHigh = getStoredCooldownScale();

  memoryStorage.clear();
  const globalCooldownMsDefault = getStoredGlobalCooldownMs();

  memoryStorage.set('LUNA_GLOBAL_COOLDOWN_MS', String(MIN_GLOBAL_COOLDOWN_MS - 100));
  const globalCooldownMsClampedLow = getStoredGlobalCooldownMs();

  memoryStorage.set('LUNA_GLOBAL_COOLDOWN_MS', String(MAX_GLOBAL_COOLDOWN_MS + 100));
  const globalCooldownMsClampedHigh = getStoredGlobalCooldownMs();

  memoryStorage.set('LUNA_COOLDOWN_SCALE', '2.25');
  memoryStorage.set('LUNA_GLOBAL_COOLDOWN_MS', '425');
  applyCooldownPacingSettings();
  const pacingApplied = {
    scale: Player.globalCooldownScale,
    durationMs: Player.globalCooldownDurationMs,
  };

  return {
    hexRadiusDefault,
    hexRadiusClampedLow,
    hexRadiusClampedHigh,
    combatantRadiusDefault,
    combatantRadiusClampedLow,
    combatantRadiusClampedHigh,
    cooldownScaleDefault,
    cooldownScaleClampedLow,
    cooldownScaleClampedHigh,
    globalCooldownMsDefault,
    globalCooldownMsClampedLow,
    globalCooldownMsClampedHigh,
    pacingApplied,
  };
}

function run(): void {
  installMockLocalStorage();

  const snapshot = captureSettings();
  const failures: string[] = [];

  if (snapshot.hexRadiusDefault !== DEFAULT_ARENA_HEX_RADIUS) {
    failures.push(`hexRadius default: expected ${DEFAULT_ARENA_HEX_RADIUS}, got ${snapshot.hexRadiusDefault}`);
  }
  if (snapshot.hexRadiusClampedLow !== MIN_HEX_RADIUS) {
    failures.push(`hexRadius clamp low: expected ${MIN_HEX_RADIUS}, got ${snapshot.hexRadiusClampedLow}`);
  }
  if (snapshot.hexRadiusClampedHigh !== MAX_HEX_RADIUS) {
    failures.push(`hexRadius clamp high: expected ${MAX_HEX_RADIUS}, got ${snapshot.hexRadiusClampedHigh}`);
  }

  if (snapshot.combatantRadiusDefault !== DEFAULT_COMBATANT_RADIUS) {
    failures.push(
      `combatantRadius default: expected ${DEFAULT_COMBATANT_RADIUS}, got ${snapshot.combatantRadiusDefault}`,
    );
  }
  if (snapshot.combatantRadiusClampedLow !== MIN_COMBATANT_RADIUS) {
    failures.push(
      `combatantRadius clamp low: expected ${MIN_COMBATANT_RADIUS}, got ${snapshot.combatantRadiusClampedLow}`,
    );
  }
  if (snapshot.combatantRadiusClampedHigh !== MAX_COMBATANT_RADIUS) {
    failures.push(
      `combatantRadius clamp high: expected ${MAX_COMBATANT_RADIUS}, got ${snapshot.combatantRadiusClampedHigh}`,
    );
  }

  if (snapshot.cooldownScaleDefault !== DEFAULT_COOLDOWN_SCALE) {
    failures.push(
      `cooldownScale default: expected ${DEFAULT_COOLDOWN_SCALE}, got ${snapshot.cooldownScaleDefault}`,
    );
  }
  if (snapshot.cooldownScaleClampedLow !== MIN_COOLDOWN_SCALE) {
    failures.push(
      `cooldownScale clamp low: expected ${MIN_COOLDOWN_SCALE}, got ${snapshot.cooldownScaleClampedLow}`,
    );
  }
  if (snapshot.cooldownScaleClampedHigh !== MAX_COOLDOWN_SCALE) {
    failures.push(
      `cooldownScale clamp high: expected ${MAX_COOLDOWN_SCALE}, got ${snapshot.cooldownScaleClampedHigh}`,
    );
  }

  if (snapshot.globalCooldownMsDefault !== DEFAULT_GLOBAL_COOLDOWN_MS) {
    failures.push(
      `globalCooldownMs default: expected ${DEFAULT_GLOBAL_COOLDOWN_MS}, got ${snapshot.globalCooldownMsDefault}`,
    );
  }
  if (snapshot.globalCooldownMsClampedLow !== MIN_GLOBAL_COOLDOWN_MS) {
    failures.push(
      `globalCooldownMs clamp low: expected ${MIN_GLOBAL_COOLDOWN_MS}, got ${snapshot.globalCooldownMsClampedLow}`,
    );
  }
  if (snapshot.globalCooldownMsClampedHigh !== MAX_GLOBAL_COOLDOWN_MS) {
    failures.push(
      `globalCooldownMs clamp high: expected ${MAX_GLOBAL_COOLDOWN_MS}, got ${snapshot.globalCooldownMsClampedHigh}`,
    );
  }

  if (snapshot.pacingApplied.scale !== 2.25) {
    failures.push(`pacing scale: expected 2.25, got ${snapshot.pacingApplied.scale}`);
  }
  if (snapshot.pacingApplied.durationMs !== 425) {
    failures.push(`pacing durationMs: expected 425, got ${snapshot.pacingApplied.durationMs}`);
  }

  if (failures.length > 0) {
    console.error('test:settings  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  console.log('test:settings  OK  13 settings checks passed');
}

run();
