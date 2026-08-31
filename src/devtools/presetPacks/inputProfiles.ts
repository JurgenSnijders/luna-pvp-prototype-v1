import type { AbilitySchema } from '../../types/schema';

export const INPUT_PROFILE_PRESETS: Record<string, AbilitySchema> = {
  'Charged Rail Burst': {
    id: 'test_charged_rail_burst',
    name: 'Charged Rail Burst',
    cooldownMs: 1200,
    recoilKick: 200,
    inputProfile: { mode: 'CHARGE_AND_RELEASE', minChargeMs: 200, maxChargeMs: 1200 },
    trajectory: { type: 'LINEAR', speed: 1200, maxRange: 800 },
    visuals: {
      color: '#00ccff',
      size: 6,
      projectileStyle: 'BEAM',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 800,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 25, target: 'TARGET' },
        ],
      },
    ],
  },

  'Charged Nova Bomb': {
    id: 'test_charged_nova_bomb',
    name: 'Charged Nova Bomb',
    cooldownMs: 2000,
    recoilKick: 80,
    inputProfile: { mode: 'CHARGE_AND_RELEASE', minChargeMs: 300, maxChargeMs: 1500 },
    visuals: {
      color: '#ff66aa',
      size: 14,
      projectileStyle: 'PULSING_ORB',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 80,
              strength: 400,
              durationMs: 300,
            },
          },
        ],
      },
    ],
  },

  'Void Channel': {
    id: 'test_void_channel',
    name: 'Void Channel',
    cooldownMs: 100,
    recoilKick: 0,
    inputProfile: { mode: 'CHANNELED', channelIntervalMs: 150 },
    visuals: {
      color: '#8844ff',
      size: 8,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'VORTEX_SWIRL',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'MASS_ATTRACTOR',
              radius: 60,
              strength: 3000,
              durationMs: 200,
              attachToSource: true,
            },
          },
        ],
      },
    ],
  },

  'Flame Channel Cone': {
    id: 'test_flame_channel_cone',
    name: 'Flame Channel Cone',
    cooldownMs: 80,
    recoilKick: 10,
    inputProfile: { mode: 'CHANNELED', channelIntervalMs: 120 },
    visuals: {
      color: '#ff4422',
      size: 6,
      projectileStyle: 'DISC',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: { type: 'LINEAR', speed: 500, maxRange: 350 },
            emitter: { count: 3, spreadDeg: 30, distribution: 'RANDOM_CONE' },
            triggers: [
              {
                trigger: 'ON_HIT',
                actions: [
                  { type: 'ADD_INSTABILITY', amount: 8, target: 'TARGET' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  'Triple Tap Combo': {
    id: 'test_triple_tap_combo',
    name: 'Triple Tap Combo',
    cooldownMs: 600,
    recoilKick: 40,
    inputProfile: { mode: 'COMBO_CHAIN', comboWindowMs: 1500 },
    visuals: {
      color: '#ffcc00',
      size: 7,
      projectileStyle: 'BEAM',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        conditions: [{ query: 'COMBO_STEP', comparison: 'EQ', value: 0 }],
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: { type: 'LINEAR', speed: 700, maxRange: 400 },
            emitter: { count: 1, spreadDeg: 0, distribution: 'FAN' },
            triggers: [
              {
                trigger: 'ON_HIT',
                actions: [
                  { type: 'APPLY_IMPULSE', baseForce: 300, target: 'TARGET' },
                ],
              },
            ],
          },
        ],
      },
      {
        trigger: 'ON_CAST',
        conditions: [{ query: 'COMBO_STEP', comparison: 'EQ', value: 1 }],
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: { type: 'LINEAR', speed: 750, maxRange: 450 },
            emitter: { count: 2, spreadDeg: 20, distribution: 'FAN' },
            triggers: [
              {
                trigger: 'ON_HIT',
                actions: [
                  { type: 'APPLY_IMPULSE', baseForce: 450, target: 'TARGET' },
                ],
              },
            ],
          },
        ],
      },
      {
        trigger: 'ON_CAST',
        conditions: [{ query: 'COMBO_STEP', comparison: 'EQ', value: 2 }],
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 70,
              strength: 500,
              durationMs: 250,
            },
          },
          { type: 'ADD_INSTABILITY', amount: 30, target: 'TARGET' },
        ],
        ifFalseActions: [
          { type: 'ADD_INSTABILITY', amount: 5, target: 'CASTER' },
        ],
      },
    ],
  },
};
