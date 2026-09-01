import type { AbilitySchema } from '../../types/schema';

export const RESOURCE_PRESETS: Record<string, AbilitySchema> = {
  'Overheat Laser': {
    id: 'test_overheat_laser',
    name: 'Overheat Laser',
    archetype: 'PLASMA',
    cooldownMs: 0,
    recoilKick: 30,
    resourceCost: {
      type: 'HEAT',
      cost: 25,
      rechargeRate: 15,
      lockoutDurationMs: 3000,
    },
    trajectory: { type: 'LINEAR', speed: 1100, maxRange: 700 },
    visuals: {
      color: '#ff2244',
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
            baseForce: 500,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 20, target: 'TARGET' },
        ],
      },
    ],
  },

  'Plasma Flamer': {
    id: 'test_plasma_flamer',
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

  'Burst Pistol': {
    id: 'test_burst_pistol',
    name: 'Burst Pistol',
    archetype: 'KINETIC',
    cooldownMs: 0,
    recoilKick: 80,
    resourceCost: {
      type: 'AMMO',
      cost: 1,
      maxCapacity: 6,
      lockoutDurationMs: 1800,
    },
    trajectory: { type: 'LINEAR', speed: 900, maxRange: 550 },
    visuals: {
      color: '#ffcc44',
      size: 5,
      projectileStyle: 'BEAM',
      trailType: 'SMOKE',
      impactVfx: 'SPARKS',
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
        ],
      },
    ],
  },

  'Scattergun': {
    id: 'test_scattergun',
    name: 'Scattergun',
    archetype: 'KINETIC',
    cooldownMs: 0,
    recoilKick: 120,
    resourceCost: {
      type: 'AMMO',
      cost: 2,
      maxCapacity: 4,
      lockoutDurationMs: 2200,
    },
    visuals: {
      color: '#aa6633',
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
            projectileTrajectory: { type: 'LINEAR', speed: 700, maxRange: 350 },
            emitter: { count: 6, spreadDeg: 45, distribution: 'FAN' },
            triggers: [
              {
                trigger: 'ON_HIT',
                actions: [
                  {
                    type: 'APPLY_IMPULSE',
                    baseForce: 250,
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

  'Blood Pact': {
    id: 'test_blood_pact',
    name: 'Blood Pact',
    archetype: 'BLOOD',
    cooldownMs: 400,
    recoilKick: 100,
    resourceCost: { type: 'HEALTH_PCT', cost: 12 },
    trajectory: { type: 'LINEAR', speed: 1000, maxRange: 650 },
    visuals: {
      color: '#cc0022',
      size: 8,
      projectileStyle: 'BEAM',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 900,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
          { type: 'ADD_INSTABILITY', amount: 35, target: 'TARGET' },
        ],
      },
    ],
  },
};
