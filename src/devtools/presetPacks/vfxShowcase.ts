import type { AbilitySchema } from '../../types/schema';

export const VFX_SHOWCASE_PRESETS: Record<string, AbilitySchema> = {
  'Prism Lance': {
    id: 'vfx_prism_lance',
    name: 'Prism Lance',
    archetype: 'ARCANE',
    cooldownMs: 900,
    recoilKick: 60,
    trajectory: { type: 'LINEAR', speed: 700, maxRange: 600 },
    visuals: {
      color: '#88eeff',
      size: 9,
      projectileStyle: 'PRISM',
      trailType: 'FROST_CRYSTALS',
      impactVfx: 'SHATTER',
      vfx: { secondaryColor: '#ffffff', glowIntensity: 1.2, impactScale: 1.1 },
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 500,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 15, target: 'TARGET' },
        ],
      },
    ],
  },
  'Void Rift Bomb': {
    id: 'vfx_void_rift',
    name: 'Void Rift Bomb',
    archetype: 'VOID',
    cooldownMs: 1400,
    recoilKick: 80,
    trajectory: { type: 'LINEAR', speed: 380, maxRange: 550 },
    visuals: {
      color: '#220044',
      size: 12,
      projectileStyle: 'VOID_RIFT',
      trailType: 'VOID_TENDRIL',
      impactVfx: 'IMPLOSION',
      vfx: { secondaryColor: '#cc66ff', glowIntensity: 1.5, blendMode: 'ADDITIVE' },
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 400,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 25, target: 'TARGET' },
        ],
      },
    ],
  },
  'Rune Nova': {
    id: 'vfx_rune_nova',
    name: 'Rune Nova',
    archetype: 'HOLY',
    cooldownMs: 2000,
    recoilKick: 120,
    trajectory: { type: 'LINEAR', speed: 300, maxRange: 400 },
    visuals: {
      color: '#ffdd88',
      size: 14,
      projectileStyle: 'RUNE_SIGIL',
      trailType: 'NEON_RIBBON',
      impactVfx: 'RUNE_FLASH',
      vfx: { secondaryColor: '#fff8e0', glowIntensity: 1.8, shakeIntensity: 1.2 },
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: { fieldType: 'RADIAL_IMPULSE', radius: 90, strength: 800, durationMs: 500 },
          },
        ],
      },
    ],
  },
  'Plasma Fork': {
    id: 'vfx_plasma_fork',
    name: 'Plasma Fork',
    archetype: 'PLASMA',
    cooldownMs: 700,
    recoilKick: 40,
    trajectory: { type: 'HOMING_SLERP', speed: 450, maxRange: 500, turnAccel: 4 },
    visuals: {
      color: '#44ffaa',
      size: 8,
      projectileStyle: 'PLASMA_TENDRIL',
      trailType: 'PLASMA_ARC',
      impactVfx: 'LIGHTNING_FORK',
      vfx: { secondaryColor: '#aaffcc', trailDensity: 1.3 },
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 500,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 12, target: 'TARGET' },
        ],
      },
    ],
  },
};
