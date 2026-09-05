import type { AbilitySchema } from '../../types/schema';
import { VERTICAL_RECIPES } from './verticalRecipes';

export const DEFAULT_STARTER_PRESET_NAMES = [
  'Kinetic Railgun',
  'Graviton Boomerang',
  'Cryo Ice Trail',
  'Cluster Mortar',
  'Phase Nova',
] as const;

export const CORE_PRESETS: Record<string, AbilitySchema> = {
  'Kinetic Railgun': {
    id: 'kinetic_railgun',
    name: 'Kinetic Railgun',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 450,
    trajectory: {
      type: 'LINEAR',
      speed: 1400,
      maxRange: 900,
    },
    visuals: {
      color: '#ffaa44',
      size: 5,
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
            baseForce: 1200,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 40 },
        ],
      },
    ],
  },

  'Graviton Boomerang': {
    id: 'graviton_boomerang',
    name: 'Graviton Boomerang',
    archetype: 'GRAVITY',
    cooldownMs: 800,
    recoilKick: 80,
    trajectory: {
      type: 'RETURN_TO_SOURCE',
      speed: 350,
      maxRange: 500,
      turnAccel: 1200,
      piercing: 2,
    },
    visuals: {
      color: '#aa44ff',
      size: 10,
      projectileStyle: 'SHURIKEN',
      trailType: 'SMOKE',
      impactVfx: 'VORTEX_SWIRL',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 300,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
      {
        trigger: 'ON_RETURN',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'VORTEX_TANGENT',
              radius: 90,
              strength: -500,
              durationMs: 2000,
            },
          },
        ],
      },
    ],
  },

  'Cryo Ice Trail': {
    id: 'cryo_ice_trail',
    name: 'Cryo Ice Trail',
    archetype: 'FROST',
    cooldownMs: 600,
    recoilKick: 50,
    trajectory: {
      type: 'LINEAR',
      speed: 700,
      maxRange: 700,
    },
    visuals: {
      color: '#88ddff',
      size: 14,
      projectileStyle: 'PULSING_ORB',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_TICK',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'FRICTION_OVERRIDE',
              radius: 40,
              strength: 0,
              durationMs: 2000,
              frictionValue: 0.02,
            },
          },
        ],
      },
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

  'Singularity Scatter': {
    id: 'singularity_scatter',
    name: 'Singularity Scatter',
    archetype: 'GRAVITY',
    cooldownMs: 1200,
    recoilKick: 100,
    visuals: {
      color: '#ff44aa',
      size: 16,
      projectileStyle: 'PULSING_ORB',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: {
              type: 'ORBIT_ANCHOR',
              orbitRadius: 60,
              orbitSpeed: 4,
              maxRange: 800,
            },
            emitter: { count: 1, spreadDeg: 0, distribution: 'FAN', aimOffsetDeg: 0 },
            triggers: [
              {
                trigger: 'ON_EXPIRY',
                actions: [
                  {
                    type: 'SPAWN_FIELD',
                    field: {
                      fieldType: 'MASS_ATTRACTOR',
                      radius: 120,
                      strength: 8000,
                      durationMs: 3000,
                    },
                  },
                ],
              },
            ],
          },
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: {
              type: 'ORBIT_ANCHOR',
              orbitRadius: 90,
              orbitSpeed: -3,
              maxRange: 800,
            },
            emitter: { count: 1, spreadDeg: 0, distribution: 'FAN', aimOffsetDeg: 120 },
            triggers: [
              {
                trigger: 'ON_EXPIRY',
                actions: [
                  {
                    type: 'SPAWN_FIELD',
                    field: {
                      fieldType: 'MASS_ATTRACTOR',
                      radius: 120,
                      strength: 8000,
                      durationMs: 3000,
                    },
                  },
                ],
              },
            ],
          },
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: {
              type: 'ORBIT_ANCHOR',
              orbitRadius: 120,
              orbitSpeed: 2.5,
              maxRange: 800,
            },
            emitter: { count: 1, spreadDeg: 0, distribution: 'FAN', aimOffsetDeg: 240 },
            triggers: [
              {
                trigger: 'ON_EXPIRY',
                actions: [
                  {
                    type: 'SPAWN_FIELD',
                    field: {
                      fieldType: 'MASS_ATTRACTOR',
                      radius: 120,
                      strength: 8000,
                      durationMs: 3000,
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

  'Phase Nova': {
    id: 'phase_nova',
    name: 'Phase Nova',
    archetype: 'PHASE',
    cooldownMs: 1500,
    recoilKick: 0,
    visuals: {
      color: '#44ffff',
      size: 10,
      projectileStyle: 'CHAOS_LIGHTNING',
      trailType: 'NEON_RIBBON',
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
              radius: 100,
              strength: 600,
              durationMs: 400,
            },
          },
          { type: 'TELEPORT', distance: 120 },
        ],
      },
    ],
  },

  'Cluster Mortar': VERTICAL_RECIPES.clusterMortar,
};
