import type { AbilitySchema } from '../../types/schema';

export const STASIS_PRESETS: Record<string, AbilitySchema> = {
  'Stasis Shell': {
    id: 'test_stasis_shell',
    name: 'Stasis Shell',
    cooldownMs: 3000,
    recoilKick: 0,
    visuals: {
      color: '#ffdd44',
      size: 12,
      projectileStyle: 'PULSING_ORB',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'APPLY_STASIS',
            durationMs: 4000,
            target: 'CASTER',
            forceAccumulatorScale: 1.5,
          },
        ],
      },
    ],
  },

  'Momentum Release': {
    id: 'test_momentum_release',
    name: 'Momentum Release',
    cooldownMs: 500,
    recoilKick: 0,
    visuals: {
      color: '#ff8844',
      size: 10,
      projectileStyle: 'CHAOS_LIGHTNING',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [{ type: 'RELEASE_STASIS', target: 'CASTER' }],
      },
    ],
  },

  'Stasis Battery Combo': {
    id: 'test_stasis_battery_combo',
    name: 'Stasis Battery Combo',
    cooldownMs: 800,
    recoilKick: 0,
    inputProfile: { mode: 'COMBO_CHAIN', comboWindowMs: 3000 },
    visuals: {
      color: '#aaccff',
      size: 11,
      projectileStyle: 'PULSING_ORB',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        conditions: [{ query: 'COMBO_STEP', comparison: 'EQ', value: 0 }],
        actions: [
          {
            type: 'APPLY_STASIS',
            durationMs: 5000,
            target: 'CASTER',
            forceAccumulatorScale: 2.0,
          },
        ],
      },
      {
        trigger: 'ON_CAST',
        conditions: [{ query: 'COMBO_STEP', comparison: 'EQ', value: 1 }],
        actions: [{ type: 'RELEASE_STASIS', target: 'CASTER' }],
      },
    ],
  },
};
