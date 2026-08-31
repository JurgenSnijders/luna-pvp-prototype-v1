import {
  DEFAULT_COMBATANT_RADIUS,
  MAX_COMBATANT_RADIUS,
  MIN_COMBATANT_RADIUS,
  MAX_HEX_RADIUS,
  MIN_HEX_RADIUS,
} from '../engine/PhysicsWorld';
import { Player } from '../entities/Player';

export const ARENA_HEX_RADIUS_KEY = 'LUNA_ARENA_HEX_RADIUS';
export const COMBATANT_RADIUS_KEY = 'LUNA_COMBATANT_RADIUS';
export const COOLDOWN_SCALE_KEY = 'LUNA_COOLDOWN_SCALE';
export const GLOBAL_COOLDOWN_MS_KEY = 'LUNA_GLOBAL_COOLDOWN_MS';
export const INSPECTOR_COLLAPSED_STORAGE_KEY = 'LUNA_INSPECTOR_COLLAPSED';

export const DEFAULT_ARENA_HEX_RADIUS = 340;
export const DEFAULT_COOLDOWN_SCALE = 1.5;
export const DEFAULT_GLOBAL_COOLDOWN_MS = 350;
export const MIN_COOLDOWN_SCALE = 0.5;
export const MAX_COOLDOWN_SCALE = 3.0;
export const MIN_GLOBAL_COOLDOWN_MS = 0;
export const MAX_GLOBAL_COOLDOWN_MS = 1000;

export function getStoredHexRadius(): number {
  const raw = parseFloat(localStorage.getItem(ARENA_HEX_RADIUS_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_ARENA_HEX_RADIUS;
  return Math.max(MIN_HEX_RADIUS, Math.min(MAX_HEX_RADIUS, value));
}

export function getStoredCombatantRadius(): number {
  const raw = parseFloat(localStorage.getItem(COMBATANT_RADIUS_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_COMBATANT_RADIUS;
  return Math.max(MIN_COMBATANT_RADIUS, Math.min(MAX_COMBATANT_RADIUS, value));
}

export function getStoredCooldownScale(): number {
  const raw = parseFloat(localStorage.getItem(COOLDOWN_SCALE_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_COOLDOWN_SCALE;
  return Math.max(MIN_COOLDOWN_SCALE, Math.min(MAX_COOLDOWN_SCALE, value));
}

export function getStoredGlobalCooldownMs(): number {
  const raw = parseFloat(localStorage.getItem(GLOBAL_COOLDOWN_MS_KEY) ?? '');
  const value = Number.isFinite(raw) ? raw : DEFAULT_GLOBAL_COOLDOWN_MS;
  return Math.max(MIN_GLOBAL_COOLDOWN_MS, Math.min(MAX_GLOBAL_COOLDOWN_MS, value));
}

export function applyCooldownPacingSettings(): void {
  Player.globalCooldownScale = getStoredCooldownScale();
  Player.globalCooldownDurationMs = getStoredGlobalCooldownMs();
}
