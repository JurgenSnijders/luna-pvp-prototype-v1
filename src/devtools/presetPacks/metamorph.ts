import type { AbilitySchema } from '../../types/schema';

export const METAMORPH_PRESETS: Record<string, AbilitySchema> = {
  'Iron Colossus': {
    id: 'test_iron_colossus',
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

  'Quicksilver Form': {
    id: 'test_quicksilver_form',
    name: 'Quicksilver Form',
    archetype: 'AERO',
    cooldownMs: 3500,
    recoilKick: 0,
    visuals: {
      color: '#ccccdd',
      size: 8,
      projectileStyle: 'CHAOS_LIGHTNING',
      trailType: 'NEON_RIBBON',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'MORPH_ENTITY',
            target: 'CASTER',
            morph: { radius: 12, mass: 40, speedMultiplier: 1.6, durationMs: 5000 },
          },
        ],
      },
    ],
  },

  'Ghost Walk': {
    id: 'test_ghost_walk',
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

  'Deep Shroud': {
    id: 'test_deep_shroud',
    name: 'Deep Shroud',
    archetype: 'VOID',
    cooldownMs: 4000,
    recoilKick: 0,
    visuals: {
      color: '#334455',
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
            durationMs: 5000,
            revealOnCast: false,
          },
        ],
      },
    ],
  },

  'Auto Turret': {
    id: 'test_auto_turret',
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
            actor: { archetype: 'TURRET', health: 80, durationMs: 8000 },
          },
        ],
      },
    ],
  },

  'Ice Turret': {
    id: 'schema_turret_test',
    name: 'Ice Turret',
    archetype: 'FROST',
    cooldownMs: 2800,
    recoilKick: 15,
    visuals: {
      color: '#88ddff',
      size: 10,
      projectileStyle: 'CRYSTAL_SHARD',
      trailType: 'FROST_CRYSTALS',
      impactVfx: 'ICE_BURST',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_ACTOR',
            target: 'CASTER',
            actor: {
              archetype: 'TURRET',
              health: 80,
              durationMs: 8000,
              targetingRange: 400,
              triggers: [
                {
                  trigger: 'ON_TICK',
                  tickIntervalMs: 900,
                  actions: [
                    {
                      type: 'SPAWN_PROJECTILE',
                      projectileTrajectory: {
                        type: 'HOMING_SLERP',
                        speed: 420,
                        maxRange: 400,
                        turnAccel: 400,
                      },
                      triggers: [
                        {
                          trigger: 'ON_HIT',
                          actions: [
                            {
                              type: 'MODIFY_STAT',
                              stat: 'moveSpeed',
                              value: 0.6,
                              mode: 'multiply',
                              target: 'TARGET',
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

  'Forward Turret Drop': {
    id: 'test_forward_turret_drop',
    name: 'Forward Turret Drop',
    archetype: 'KINETIC',
    cooldownMs: 2000,
    recoilKick: 50,
    trajectory: { type: 'LINEAR', speed: 500, maxRange: 400 },
    visuals: {
      color: '#ff8800',
      size: 9,
      projectileStyle: 'DISC',
      trailType: 'SMOKE',
      impactVfx: 'SPARKS',
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
          {
            type: 'SPAWN_ACTOR',
            target: 'TARGET',
            actor: { archetype: 'TURRET', health: 60, durationMs: 6000 },
          },
        ],
      },
    ],
  },

  'Mirror Decoy': {
    id: 'test_mirror_decoy',
    name: 'Mirror Decoy',
    archetype: 'ARCANE',
    cooldownMs: 2200,
    recoilKick: 0,
    visuals: {
      color: '#aaaacc',
      size: 12,
      projectileStyle: 'PULSING_ORB',
      trailType: 'ICE_GLOW',
      impactVfx: 'SPARKS',
    },
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_ACTOR',
            target: 'CASTER',
            actor: { archetype: 'DECOY', health: 100, durationMs: 7000 },
          },
        ],
      },
    ],
  },
};
