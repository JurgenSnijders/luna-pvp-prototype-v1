import type { AbilitySchema } from '../../types/schema';

export const KINETIC_RECIPES: Record<string, AbilitySchema> = {
  harpoon: {
    id: 'recipe_harpoon',
    name: 'Blood Harpoon',
    archetype: 'BLOOD',
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
    archetype: 'VOID',
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
    archetype: 'FIRE',
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
    archetype: 'FROST',
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
        actions: [{ type: 'REFLECT_PROJECTILES', target: 'CASTER', radius: 150 }],
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
    archetype: 'FROST',
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
    archetype: 'BLOOD',
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

  chargedShot: {
    id: 'recipe_charged_shot',
    name: 'Charged Rail Burst',
    archetype: 'KINETIC',
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

  heatWeapon: {
    id: 'recipe_heat_weapon',
    name: 'Plasma Flamer',
    archetype: 'FIRE',
    cooldownMs: 50,
    recoilKick: 5,
    inputProfile: { mode: 'CHANNELED', channelIntervalMs: 100 },
    resourceCost: {
      type: 'HEAT',
      cost: 8,
      rechargeRate: 20,
      lockoutDurationMs: 2500,
    },
    visuals: {
      color: '#ff6600',
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
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 50,
              strength: 200,
              durationMs: 150,
              attachToSource: true,
            },
          },
        ],
      },
    ],
  },

  comboChain: {
    id: 'recipe_combo_chain',
    name: 'Stasis Battery Combo',
    archetype: 'FROST',
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

  morphColossus: {
    id: 'recipe_morph_colossus',
    name: 'Iron Colossus',
    archetype: 'EARTH',
    cooldownMs: 4000,
    recoilKick: 0,
    visuals: {
      color: '#888899',
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
            type: 'MORPH_ENTITY',
            target: 'CASTER',
            morph: { radius: 32, mass: 200, speedMultiplier: 0.6, durationMs: 6000 },
          },
        ],
      },
    ],
  },

  ghostWalk: {
    id: 'recipe_ghost_walk',
    name: 'Ghost Walk',
    archetype: 'PHASE',
    cooldownMs: 3000,
    recoilKick: 0,
    visuals: {
      color: '#6688aa',
      size: 10,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'APPLY_STEALTH',
            target: 'CASTER',
            durationMs: 4000,
            revealOnCast: true,
          },
        ],
      },
    ],
  },

  autoTurret: {
    id: 'recipe_auto_turret',
    name: 'Auto Turret',
    archetype: 'KINETIC',
    cooldownMs: 2500,
    recoilKick: 20,
    visuals: {
      color: '#ffaa00',
      size: 10,
      projectileStyle: 'DISC',
      trailType: 'SMOKE',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_ACTOR',
            target: 'CASTER',
            actor: { actorArchetype: 'TURRET', health: 80, durationMs: 8000 },
          },
        ],
      },
    ],
  },

  lavaPatch: {
    id: 'recipe_lava_patch',
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
};

export const KINETIC_RECIPE_PRESETS: Record<string, AbilitySchema> = {
  'Blood Harpoon': KINETIC_RECIPES.harpoon,
  'Void Singularity': KINETIC_RECIPES.vortex,
  'Cluster MIRV': KINETIC_RECIPES.cluster,
  'Stasis Freeze Trap': KINETIC_RECIPES.stasisTrap,
  'Ice Barrier': KINETIC_RECIPES.iceWall,
  'Coupe de Grace': KINETIC_RECIPES.execute,
  'Charged Rail Burst': KINETIC_RECIPES.chargedShot,
  'Plasma Flamer': KINETIC_RECIPES.heatWeapon,
  'Stasis Battery Combo': KINETIC_RECIPES.comboChain,
  'Iron Colossus': KINETIC_RECIPES.morphColossus,
  'Ghost Walk': KINETIC_RECIPES.ghostWalk,
  'Auto Turret': KINETIC_RECIPES.autoTurret,
  'Lava Patch': KINETIC_RECIPES.lavaPatch,
};
