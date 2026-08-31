import type { AbilitySchema } from '../../types/schema';

export const DIAGNOSTIC_PRESETS: Record<string, AbilitySchema> = {
  'Entity Storm': {
    id: 'test_entity_storm',
    name: 'Entity Storm',
    cooldownMs: 3000,
    recoilKick: 100,
    visuals: {
      color: '#ffaa88',
      size: 5,
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
            projectileTrajectory: { type: 'LINEAR', speed: 300, maxRange: 400 },
            emitter: { count: 12, spreadDeg: 360, distribution: 'RADIAL' },
            triggers: [
              {
                trigger: 'ON_HIT',
                actions: [
                  { type: 'ADD_INSTABILITY', amount: 5, target: 'TARGET' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  'Field Dedup Ticker': {
    id: 'test_field_dedup_ticker',
    name: 'Field Dedup Ticker',
    cooldownMs: 2000,
    recoilKick: 20,
    trajectory: { type: 'LINEAR', speed: 350, maxRange: 600 },
    visuals: {
      color: '#aa44cc',
      size: 10,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'VORTEX_SWIRL',
    },
    triggers: [
      {
        trigger: 'ON_TICK',
        tickIntervalMs: 50,
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'MASS_ATTRACTOR',
              radius: 70,
              strength: 4000,
              durationMs: 5000,
              attachToSource: true,
            },
          },
        ],
      },
    ],
  },

  'Null Ability': {
    id: 'test_null_ability',
    name: 'Null Ability',
    cooldownMs: 500,
    recoilKick: 150,
    visuals: {
      color: '#888888',
      size: 8,
      projectileStyle: 'DISC',
      trailType: 'NONE',
      impactVfx: 'SPARKS',
    },
    triggers: [],
  },

  'Hazard Probe': {
    id: 'test_hazard_probe',
    name: 'Hazard Probe',
    cooldownMs: 1000,
    recoilKick: 30,
    trajectory: { type: 'LINEAR', speed: 600, maxRange: 500 },
    visuals: {
      color: '#ff8800',
      size: 8,
      projectileStyle: 'PULSING_ORB',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_HAZARD_CONTACT',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 100,
              strength: 999,
              durationMs: 500,
            },
          },
        ],
      },
      {
        trigger: 'ON_HIT',
        actions: [
          { type: 'ADD_INSTABILITY', amount: 20, target: 'TARGET' },
        ],
      },
    ],
  },

  'Surface Probe': {
    id: 'test_surface_probe',
    name: 'Surface Probe',
    cooldownMs: 800,
    recoilKick: 40,
    trajectory: { type: 'LINEAR', speed: 700, maxRange: 500 },
    visuals: {
      color: '#44aa88',
      size: 7,
      projectileStyle: 'BEAM',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        conditions: [
          { query: 'SURFACE_TYPE', target: 'TARGET', value: 'LAVA' },
        ],
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 900,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
        ifFalseActions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 200,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
    ],
  },

  'Reflect Probe': {
    id: 'test_reflect_probe',
    name: 'Reflect Probe',
    cooldownMs: 1200,
    recoilKick: 30,
    trajectory: { type: 'LINEAR', speed: 500, maxRange: 600 },
    visuals: {
      color: '#88ccff',
      size: 9,
      projectileStyle: 'PULSING_ORB',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          { type: 'REFLECT_PROJECTILES', target: 'SELF' },
          { type: 'ADD_INSTABILITY', amount: 10, target: 'TARGET' },
        ],
      },
    ],
  },

  'VFX Stress Storm': {
    id: 'test_vfx_stress_storm',
    name: 'VFX Stress Storm',
    cooldownMs: 400,
    recoilKick: 40,
    visuals: {
      color: '#ff44aa',
      size: 7,
      projectileStyle: 'PULSING_ORB',
      trailType: 'NEON_RIBBON',
      impactVfx: 'MINI_NUKE',
      vfx: {
        glowIntensity: 1.6,
        trailDensity: 1.4,
        impactScale: 1.2,
        secondaryColor: '#ffffff',
        blendMode: 'ADDITIVE',
        shakeIntensity: 0.8,
      },
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: { type: 'LINEAR', speed: 420, maxRange: 700 },
            emitter: { count: 12, spreadDeg: 360, distribution: 'RADIAL' },
            visuals: {
              color: '#ff44aa',
              size: 7,
              projectileStyle: 'PULSING_ORB',
              trailType: 'NEON_RIBBON',
              impactVfx: 'MINI_NUKE',
              vfx: {
                glowIntensity: 1.6,
                trailDensity: 1.4,
                impactScale: 1.2,
                secondaryColor: '#ffffff',
                blendMode: 'ADDITIVE',
              },
            },
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
};
