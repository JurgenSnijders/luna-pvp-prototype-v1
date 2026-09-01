import type { AbilitySchema } from '../../types/schema';

export const TERRAIN_PRESETS: Record<string, AbilitySchema> = {
  'Boulder Drop': {
    id: 'test_boulder_drop',
    name: 'Boulder Drop',
    archetype: 'EARTH',
    cooldownMs: 2000,
    recoilKick: 30,
    visuals: {
      color: '#887766',
      size: 14,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_OBSTACLE',
            target: 'CASTER',
            obstacle: {
              shape: 'CIRCLE',
              width: 50,
              height: 50,
              isDestructible: false,
              durationMs: 8000,
            },
          },
        ],
      },
    ],
  },

  'Lava Patch': {
    id: 'test_lava_patch',
    name: 'Lava Patch',
    archetype: 'FIRE',
    cooldownMs: 1500,
    recoilKick: 40,
    trajectory: { type: 'LINEAR', speed: 600, maxRange: 500 },
    visuals: {
      color: '#ff4400',
      size: 10,
      projectileStyle: 'PULSING_ORB',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 450,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          {
            type: 'MUTATE_TERRAIN',
            target: 'TARGET',
            mutation: { type: 'LAVA', radius: 70, durationMs: 6000 },
          },
        ],
      },
    ],
  },

  'Safe Haven': {
    id: 'test_safe_haven',
    name: 'Safe Haven',
    archetype: 'HOLY',
    cooldownMs: 2500,
    recoilKick: 0,
    visuals: {
      color: '#44ff88',
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
            type: 'MUTATE_TERRAIN',
            target: 'CASTER',
            mutation: { type: 'SAFE', radius: 90, durationMs: 8000 },
          },
        ],
      },
    ],
  },

  'Minefield Volley': {
    id: 'test_minefield_volley',
    name: 'Minefield Volley',
    archetype: 'EARTH',
    cooldownMs: 1800,
    recoilKick: 60,
    visuals: {
      color: '#aa8844',
      size: 8,
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
            projectileTrajectory: { type: 'LINEAR', speed: 400, maxRange: 450 },
            emitter: { count: 4, spreadDeg: 60, distribution: 'FAN' },
            triggers: [
              {
                trigger: 'ON_EXPIRY',
                actions: [
                  {
                    type: 'SPAWN_OBSTACLE',
                    obstacle: {
                      shape: 'CIRCLE',
                      width: 28,
                      height: 28,
                      isDestructible: true,
                      maxHealth: 40,
                      durationMs: 10000,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};
