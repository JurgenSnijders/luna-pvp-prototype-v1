import type { AbilitySchema } from '../../types/schema';

export const KINETIC_RECIPES: Record<string, AbilitySchema> = {
  harpoon: {
    id: 'recipe_harpoon',
    name: 'Blood Harpoon',
    cooldownMs: 900,
    recoilKick: 70,
    trajectory: { type: 'LINEAR', speed: 900, maxRange: 650, piercing: 1 },
    visuals: {
      color: '#cc2244',
      size: 9,
      projectileStyle: 'BEAM',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 600,
            target: 'TARGET',
            directionMode: 'TOWARDS_CASTER',
          },
          {
            type: 'SPAWN_CONSTRAINT',
            constraint: { type: 'SPRING_TETHER', stiffness: 0.4, restLength: 40, durationMs: 2000 },
            source: 'CASTER',
            target: 'TARGET',
          },
        ],
      },
    ],
  },

  vortex: {
    id: 'recipe_vortex',
    name: 'Void Singularity',
    cooldownMs: 1200,
    recoilKick: 40,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
    visuals: {
      color: '#aa44ff',
      size: 14,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'VORTEX_SWIRL',
    },
    triggers: [
      {
        trigger: 'ON_TICK',
        tickIntervalMs: 100,
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'MASS_ATTRACTOR',
              radius: 90,
              strength: 5000,
              durationMs: 3000,
              attachToSource: true,
            },
          },
        ],
      },
    ],
  },

  cluster: {
    id: 'recipe_cluster',
    name: 'Cluster MIRV',
    cooldownMs: 1100,
    recoilKick: 90,
    trajectory: { type: 'LINEAR', speed: 520, maxRange: 600 },
    visuals: {
      color: '#ff8844',
      size: 12,
      projectileStyle: 'PULSING_ORB',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_EXPIRY',
        actions: [
          {
            type: 'CAST_CHILD_PAYLOAD',
            inheritVelocity: true,
            maxRecursionDepth: 1,
            payload: {
              id: 'recipe_cluster_child',
              name: 'Cluster Fragments',
              cooldownMs: 0,
              recoilKick: 0,
              visuals: {
                color: '#ffaa66',
                size: 6,
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
                      projectileTrajectory: { type: 'LINEAR', speed: 450, maxRange: 400 },
                      emitter: { count: 5, spreadDeg: 120, distribution: 'FAN' },
                      triggers: [
                        {
                          trigger: 'ON_HIT',
                          actions: [
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
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  },

  stasisTrap: {
    id: 'recipe_stasis_trap',
    name: 'Stasis Freeze Trap',
    cooldownMs: 1000,
    recoilKick: 50,
    trajectory: { type: 'LINEAR', speed: 700, maxRange: 550 },
    visuals: {
      color: '#88ccff',
      size: 10,
      projectileStyle: 'PULSING_ORB',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [{ type: 'REFLECT_PROJECTILES', target: 'CASTER' }],
      },
      {
        trigger: 'ON_HIT',
        actions: [
          { type: 'APPLY_STASIS', durationMs: 3000, target: 'TARGET' },
        ],
      },
    ],
  },

  iceWall: {
    id: 'recipe_ice_wall',
    name: 'Ice Barrier',
    cooldownMs: 1500,
    recoilKick: 20,
    visuals: {
      color: '#aaddff',
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
            type: 'SPAWN_OBSTACLE',
            target: 'CASTER',
            obstacle: {
              shape: 'BOX',
              width: 80,
              height: 24,
              isDestructible: true,
              maxHealth: 150,
              durationMs: 5000,
            },
          },
        ],
      },
    ],
  },

  execute: {
    id: 'recipe_execute',
    name: 'Coupe de Grace',
    cooldownMs: 800,
    recoilKick: 60,
    trajectory: { type: 'LINEAR', speed: 800, maxRange: 500 },
    visuals: {
      color: '#ff4466',
      size: 8,
      projectileStyle: 'BEAM',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        conditions: [
          { query: 'STAT_THRESHOLD', stat: 'health', comparison: 'LT', value: 30 },
        ],
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 1200,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 50, target: 'TARGET' },
        ],
      },
    ],
  },
};

export const KINETIC_RECIPE_PRESETS: Record<string, AbilitySchema> = {
  'Blood Harpoon': KINETIC_RECIPES.harpoon,
  'Void Singularity': KINETIC_RECIPES.vortex,
  'Cluster MIRV': KINETIC_RECIPES.cluster,
  'Stasis Freeze Trap': KINETIC_RECIPES.stasisTrap,
  'Ice Barrier': KINETIC_RECIPES.iceWall,
  'Coupe de Grace': KINETIC_RECIPES.execute,
};
