import type { AbilitySchema } from '../../types/schema';

export const VERTICAL_RECIPES: Record<string, AbilitySchema> = {
  meteorStrike: {
    id: 'preset_meteor_strike',
    name: 'Meteor Strike',
    archetype: 'FIRE',
    targetingMode: 'GROUND_POINT',
    maxTargetRange: 550,
    cooldownMs: 3500,
    recoilKick: 40,
    trajectory: {
      type: 'BALLISTIC_ARC',
      speed: 0,
      spawnAltitude: 650,
      fallSpeed: 1400,
      bounces: 0,
    },
    visuals: {
      color: '#ff4400',
      size: 20,
      projectileStyle: 'PULSING_ORB',
      trailType: 'EMBER_SPIRAL',
      impactVfx: 'PLASMA_BLOOM',
      vfx: { glowIntensity: 1.4, blendMode: 'ADDITIVE' },
    },
    triggers: [
      {
        trigger: 'ON_GROUND_SLAM',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 150,
              strength: 950,
              durationMs: 400,
            },
          },
          {
            type: 'APPLY_STATUS',
            archetype: 'FIRE',
            durationMs: 3000,
            stacks: 2,
            target: 'TARGET',
          },
        ],
      },
    ],
  },

  clusterMortar: {
    id: 'preset_cluster_mortar',
    name: 'Cluster Mortar',
    archetype: 'KINETIC',
    cooldownMs: 2800,
    recoilKick: 75,
    trajectory: {
      type: 'BALLISTIC_ARC',
      speed: 320,
      maxRange: 480,
      lobApex: 150,
      bounces: 0,
      clearanceHeight: 60,
    },
    visuals: {
      color: '#ffaa00',
      size: 16,
      projectileStyle: 'DISC',
      trailType: 'MAGMA_SPARKS',
      impactVfx: 'MINI_NUKE',
      vfx: { glowIntensity: 1.0, blendMode: 'ADDITIVE' },
    },
    triggers: [
      {
        trigger: 'ON_AIR_APEX',
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            emitter: { count: 3, spreadDeg: 45, distribution: 'FAN' },
            projectileTrajectory: {
              type: 'BALLISTIC_ARC',
              speed: 180,
              maxRange: 300,
              lobApex: 60,
              bounces: 2,
              bounceRestitution: 0.65,
              groundFriction: 0.2,
            },
            visuals: {
              color: '#ffcc44',
              size: 8,
              projectileStyle: 'CRYSTAL_SHARD',
              trailType: 'DUST_PUFF',
              impactVfx: 'SPARKS',
            },
            triggers: [
              {
                trigger: 'ON_BOUNCE',
                actions: [
                  {
                    type: 'SPAWN_FIELD',
                    field: {
                      fieldType: 'RADIAL_IMPULSE',
                      radius: 65,
                      strength: 350,
                      durationMs: 200,
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

  jumpPad: {
    id: 'preset_jump_pad',
    name: 'Thermal Geyser',
    archetype: 'AERO',
    targetingMode: 'GROUND_POINT',
    maxTargetRange: 500,
    cooldownMs: 4000,
    recoilKick: 20,
    visuals: {
      color: '#00ffcc',
      size: 14,
      projectileStyle: 'PULSING_ORB',
      trailType: 'NEON_RIBBON',
      impactVfx: 'VORTEX_SWIRL',
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
              strength: 150,
              verticalForce: 2400,
              zBase: 0,
              zHeight: 24,
              durationMs: 6000,
            },
          },
        ],
      },
    ],
  },

  flakJuggle: {
    id: 'preset_flak_juggle',
    name: 'Flak Cannon',
    archetype: 'SONIC',
    cooldownMs: 1400,
    recoilKick: 55,
    trajectory: {
      type: 'BALLISTIC_ARC',
      speed: 550,
      maxRange: 450,
      lobApex: 40,
      clearanceHeight: 20,
      bounces: 0,
    },
    visuals: {
      color: '#00e5ff',
      size: 12,
      projectileStyle: 'SHURIKEN',
      trailType: 'PLASMA_ARC',
      impactVfx: 'SHOCKWAVE',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        conditions: [
          {
            query: 'ELEVATION',
            target: 'TARGET',
            comparison: 'GT',
            value: 15,
          },
        ],
        actions: [
          {
            type: 'LAUNCH_VERTICAL',
            verticalImpulse: 450,
            target: 'TARGET',
          },
          {
            type: 'APPLY_IMPULSE',
            baseForce: 400,
            directionMode: 'AWAY_FROM_ORIGIN',
            target: 'TARGET',
          },
        ],
      },
      {
        trigger: 'ON_HIT',
        conditions: [
          {
            query: 'ELEVATION',
            target: 'TARGET',
            comparison: 'LTE',
            value: 15,
          },
        ],
        actions: [
          {
            type: 'LAUNCH_VERTICAL',
            verticalImpulse: 280,
            target: 'TARGET',
          },
          {
            type: 'APPLY_IMPULSE',
            baseForce: 250,
            directionMode: 'AWAY_FROM_ORIGIN',
            target: 'TARGET',
          },
        ],
      },
    ],
  },
};

export const VERTICAL_RECIPE_PRESETS: Record<string, AbilitySchema> = {
  'Meteor Strike': VERTICAL_RECIPES.meteorStrike,
  'Cluster Mortar': VERTICAL_RECIPES.clusterMortar,
  'Thermal Geyser': VERTICAL_RECIPES.jumpPad,
  'Flak Cannon': VERTICAL_RECIPES.flakJuggle,
};
