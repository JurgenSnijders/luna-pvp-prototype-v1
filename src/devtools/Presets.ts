import type { AbilitySchema } from '../types/schema';

export const PRESETS: Record<string, AbilitySchema> = {
  'Graviton Boomerang': {
    id: 'graviton_boomerang',
    name: 'Graviton Boomerang',
    cooldownMs: 800,
    recoilKick: 80,
    trajectory: {
      type: 'RETURN_TO_SOURCE',
      speed: 350,
      maxRange: 500,
      turnAccel: 1200,
      piercing: 2,
    },
    triggers: [
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

  'Singularity Scatter': {
    id: 'singularity_scatter',
    name: 'Singularity Scatter',
    cooldownMs: 1200,
    recoilKick: 100,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_CHILD_PROJECTILE',
            trajectory: {
              type: 'ORBIT_ANCHOR',
              orbitRadius: 60,
              orbitSpeed: 4,
              maxRange: 800,
            },
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
            type: 'SPAWN_CHILD_PROJECTILE',
            trajectory: {
              type: 'ORBIT_ANCHOR',
              orbitRadius: 90,
              orbitSpeed: -3,
              maxRange: 800,
            },
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
            type: 'SPAWN_CHILD_PROJECTILE',
            trajectory: {
              type: 'ORBIT_ANCHOR',
              orbitRadius: 120,
              orbitSpeed: 2.5,
              maxRange: 800,
            },
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
    cooldownMs: 1500,
    recoilKick: 0,
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
          {
            type: 'TELEPORT',
            distance: 120,
          },
        ],
      },
    ],
  },

  'Cryo Ice Trail': {
    id: 'cryo_ice_trail',
    name: 'Cryo Ice Trail',
    cooldownMs: 600,
    recoilKick: 50,
    trajectory: {
      type: 'LINEAR',
      speed: 700,
      maxRange: 700,
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
    ],
  },

  'Kinetic Railgun': {
    id: 'kinetic_railgun',
    name: 'Kinetic Railgun',
    cooldownMs: 1000,
    recoilKick: 450,
    trajectory: {
      type: 'LINEAR',
      speed: 1400,
      maxRange: 900,
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 1200,
          },
          {
            type: 'ADD_INSTABILITY',
            amount: 40,
          },
        ],
      },
    ],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
