import type { AbilitySchema } from '../../types/schema';

export const ADVANCED_PRESETS: Record<string, AbilitySchema> = {
  'Seeker Missile': {
    id: 'test_seeker_missile',
    name: 'Seeker Missile',
    cooldownMs: 1400,
    recoilKick: 60,
    trajectory: { type: 'HOMING_SLERP', speed: 350, maxRange: 700, turnAccel: 800 },
    visuals: {
      color: '#44ff44',
      size: 8,
      projectileStyle: 'SHURIKEN',
      trailType: 'NEON_RIBBON',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 600,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
    ],
  },

  'Blink Lance': {
    id: 'test_blink_lance',
    name: 'Blink Lance',
    cooldownMs: 1100,
    recoilKick: 40,
    trajectory: {
      type: 'DISCONTINUOUS_BLINK',
      speed: 600,
      maxRange: 650,
      blinkDistance: 80,
    },
    visuals: {
      color: '#44ffff',
      size: 7,
      projectileStyle: 'BEAM',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          { type: 'ADD_INSTABILITY', amount: 25, target: 'TARGET' },
        ],
      },
    ],
  },

  'Orbital Sentry': {
    id: 'test_orbital_sentry',
    name: 'Orbital Sentry',
    cooldownMs: 2000,
    recoilKick: 30,
    visuals: {
      color: '#aa88ff',
      size: 10,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'VORTEX_SWIRL',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: {
              type: 'ORBIT_ANCHOR',
              orbitRadius: 80,
              orbitSpeed: 3,
              maxRange: 1200,
            },
            emitter: { count: 1, spreadDeg: 0, distribution: 'FAN' },
            triggers: [
              {
                trigger: 'ON_TICK',
                tickIntervalMs: 200,
                actions: [
                  {
                    type: 'SPAWN_FIELD',
                    field: {
                      fieldType: 'VORTEX_TANGENT',
                      radius: 50,
                      strength: -300,
                      durationMs: 400,
                      attachToSource: true,
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

  'Recast Detonate': {
    id: 'test_recast_detonate',
    name: 'Recast Detonate',
    cooldownMs: 1500,
    recoilKick: 50,
    trajectory: { type: 'LINEAR', speed: 450, maxRange: 800 },
    visuals: {
      color: '#ff4488',
      size: 12,
      projectileStyle: 'PULSING_ORB',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_RECAST',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 90,
              strength: 700,
              durationMs: 300,
            },
          },
        ],
      },
    ],
  },

  'Tripwire Bomb': {
    id: 'test_tripwire_bomb',
    name: 'Tripwire Bomb',
    cooldownMs: 1200,
    recoilKick: 40,
    trajectory: { type: 'LINEAR', speed: 500, maxRange: 700 },
    visuals: {
      color: '#ffaa00',
      size: 9,
      projectileStyle: 'DISC',
      trailType: 'SMOKE',
      impactVfx: 'MINI_NUKE',
    },
    triggers: [
      {
        trigger: 'ON_DISTANCE_TRAVELED',
        triggerDistance: 300,
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 80,
              strength: 550,
              durationMs: 250,
            },
          },
        ],
      },
    ],
  },

  'Wallbreaker': {
    id: 'test_wallbreaker',
    name: 'Wallbreaker',
    cooldownMs: 1300,
    recoilKick: 70,
    trajectory: { type: 'LINEAR', speed: 650, maxRange: 600 },
    visuals: {
      color: '#cc8844',
      size: 10,
      projectileStyle: 'DISC',
      trailType: 'SMOKE',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT_WALL',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 70,
              strength: 450,
              durationMs: 200,
            },
          },
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: { type: 'LINEAR', speed: 350, maxRange: 250 },
            emitter: { count: 4, spreadDeg: 90, distribution: 'FAN' },
          },
        ],
      },
    ],
  },

  'Rod Snare': {
    id: 'test_rod_snare',
    name: 'Rod Snare',
    cooldownMs: 1600,
    recoilKick: 50,
    trajectory: { type: 'LINEAR', speed: 750, maxRange: 500 },
    visuals: {
      color: '#8888cc',
      size: 8,
      projectileStyle: 'BEAM',
      trailType: 'SMOKE',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'SPAWN_CONSTRAINT',
            constraint: {
              type: 'DISTANCE_ROD',
              restLength: 60,
              maxBreakDistance: 200,
              durationMs: 3000,
            },
            source: 'CASTER',
            target: 'TARGET',
          },
        ],
      },
    ],
  },

  'Anchor Pin': {
    id: 'test_anchor_pin',
    name: 'Anchor Pin',
    cooldownMs: 1400,
    recoilKick: 40,
    trajectory: { type: 'LINEAR', speed: 800, maxRange: 450 },
    visuals: {
      color: '#6666aa',
      size: 7,
      projectileStyle: 'SHURIKEN',
      trailType: 'ICE_GLOW',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'SPAWN_CONSTRAINT',
            constraint: { type: 'SURFACE_PIN', durationMs: 2500 },
            target: 'TARGET',
          },
        ],
      },
    ],
  },

  'Haste Surge': {
    id: 'test_haste_surge',
    name: 'Haste Surge',
    cooldownMs: 2500,
    recoilKick: 0,
    visuals: {
      color: '#ffff44',
      size: 10,
      projectileStyle: 'CHAOS_LIGHTNING',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'MODIFY_STAT',
            stat: 'moveSpeed',
            value: 1.5,
            mode: 'multiply',
            target: 'CASTER',
          },
        ],
      },
    ],
  },

  'Gravity Curse': {
    id: 'test_gravity_curse',
    name: 'Gravity Curse',
    cooldownMs: 1200,
    recoilKick: 30,
    trajectory: { type: 'LINEAR', speed: 700, maxRange: 500 },
    visuals: {
      color: '#664488',
      size: 9,
      projectileStyle: 'PULSING_ORB',
      trailType: 'SMOKE',
      impactVfx: 'VORTEX_SWIRL',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'MODIFY_STAT',
            stat: 'mass',
            value: 2.0,
            mode: 'multiply',
            target: 'TARGET',
          },
          {
            type: 'MODIFY_STAT',
            stat: 'linearDrag',
            value: 3.0,
            mode: 'multiply',
            target: 'TARGET',
          },
        ],
      },
    ],
  },
};
