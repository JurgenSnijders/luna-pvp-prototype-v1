import type { SpellArchetype } from '../../types/schema';

const ARCHETYPE_COLORS: Record<SpellArchetype, string> = {
  KINETIC: '#e0f8ff',
  FIRE: '#ff4400',
  FROST: '#00e5ff',
  LIGHTNING: '#ffee00',
  VOID: '#cc44ff',
  HOLY: '#fff8c0',
  TOXIC: '#66ff44',
  ARCANE: '#bb66ff',
  MAGNETIC: '#44aaff',
  SONIC: '#88ffcc',
  AERO: '#aaddff',
  GRAVITY: '#aa44ff',
  EARTH: '#d4a373',
  CHRONO: '#ffcc44',
  PLASMA: '#ff66cc',
  NATURE: '#44cc66',
  BLOOD: '#cc2244',
  PHASE: '#44ffff',
  CHAOS: '#ff007f',
};

export function getArchetypeColor(archetype?: SpellArchetype, fallback?: string): string {
  if (archetype && archetype in ARCHETYPE_COLORS) {
    return ARCHETYPE_COLORS[archetype];
  }
  return fallback ?? '#00e5ff';
}
