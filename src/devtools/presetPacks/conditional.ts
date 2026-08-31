import type { AbilitySchema } from '../../types/schema';

export const CONDITIONAL_PRESETS: Record<string, AbilitySchema> = {
  'Crowd Breaker': {
    id: 'test_crowd_breaker',
    name: 'Crowd Breaker',
    cooldownMs: 1500,
    recoilKick: 60,
    visuals: {
      color: '#ff6644',
      size: 12,
      projectileStyle: 'PULSING_ORB',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        conditions: [
          { query: 'PROXIMITY_COUNT', target: 'CASTER', radius: 120, comparison: 'GTE', value: 2 },
        ],
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 100,
              strength: 800,
              durationMs: 300,
            },
          },
        ],
        ifFalseActions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 60,
              strength: 200,
              durationMs: 200,
            },
          },
        ],
      },
    ],
  },

  'Lava Hunter': {
    id: 'test_lava_hunter',
    name: 'Lava Hunter',
    cooldownMs: 1000,
    recoilKick: 50,
    trajectory: { type: 'LINEAR', speed: 850, maxRange: 600 },
    visuals: {
      color: '#ff3300',
      size: 7,
      projectileStyle: 'BEAM',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        conditions: [
          { query: 'TAG_CHECK', target: 'TARGET', value: 'in_lava' },
        ],
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 1000,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 40, target: 'TARGET' },
        ],
        ifFalseActions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 350,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
    ],
  },

  'Instability Executioner': {
    id: 'test_instability_executioner',
    name: 'Instability Executioner',
    cooldownMs: 900,
    recoilKick: 55,
    trajectory: { type: 'LINEAR', speed: 900, maxRange: 550 },
    visuals: {
      color: '#ff00aa',
      size: 7,
      projectileStyle: 'BEAM',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        conditions: [
          {
            query: 'STAT_THRESHOLD',
            stat: 'instabilityPct',
            target: 'TARGET',
            comparison: 'GTE',
            value: 150,
          },
        ],
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 1400,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 60, target: 'TARGET' },
        ],
      },
    ],
  },

  'Branching Cascade': {
    id: 'test_branching_cascade',
    name: 'Branching Cascade',
    cooldownMs: 1400,
    recoilKick: 45,
    trajectory: { type: 'LINEAR', speed: 600, maxRange: 550 },
    visuals: {
      color: '#88aaff',
      size: 9,
      projectileStyle: 'PULSING_ORB',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          { type: 'ADD_INSTABILITY', amount: 15, target: 'TARGET' },
        ],
        children: [
          {
            trigger: 'ON_HIT',
            actions: [
              {
                type: 'SPAWN_FIELD',
                field: {
                  fieldType: 'VORTEX_TANGENT',
                  radius: 50,
                  strength: -250,
                  durationMs: 1500,
                },
              },
            ],
          },
        ],
      },
    ],
  },

  'Recursive Fractal': {
    id: 'test_recursive_fractal',
    name: 'Recursive Fractal',
    cooldownMs: 1800,
    recoilKick: 70,
    trajectory: { type: 'LINEAR', speed: 500, maxRange: 500 },
    visuals: {
      color: '#cc66ff',
      size: 11,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_EXPIRY',
        actions: [
          {
            type: 'CAST_CHILD_PAYLOAD',
            inheritVelocity: true,
            maxRecursionDepth: 2,
            payload: {
              id: 'test_recursive_fractal_child',
              name: 'Fractal Split',
              cooldownMs: 0,
              recoilKick: 0,
              visuals: {
                color: '#dd88ff',
                size: 7,
                projectileStyle: 'DISC',
                trailType: 'SMOKE',
                impactVfx: 'SPARKS',
              },
              triggers: [
                {
                  trigger: 'ON_CAST',
                  actions: [
                    {
                      type: 'SPAWN_PROJECTILE',
                      projectileTrajectory: { type: 'LINEAR', speed: 400, maxRange: 300 },
                      emitter: { count: 3, spreadDeg: 90, distribution: 'FAN' },
                      triggers: [
                        {
                          trigger: 'ON_HIT',
                          actions: [
                            { type: 'ADD_INSTABILITY', amount: 10, target: 'TARGET' },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  },
};
