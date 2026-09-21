import { analyzeLoadoutKit } from '../src/game/kitBalance';
import { sortVaultSpells } from '../src/game/spellRoles';
import { ACTION_SLOT_KEYS, type ActionSlotKey } from '../src/types/cards';
import {
  compareCombatProfiles,
  computeKineticLethality,
  computeSpellCombatProfile,
  extractMechanicDiffChips,
} from '../src/primitives/combatProfile';
import type { AbilitySchema } from '../src/types/schema';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`${GREEN}✓${RESET} ${message}`);
  } else {
    failed++;
    console.error(`${RED}✗${RESET} ${message}`);
  }
}

function kineticImpulseAbility(
  force: number,
  directionMode?: 'AWAY_FROM_ORIGIN' | 'TOWARDS_CASTER',
): AbilitySchema {
  return {
    id: 'test_impulse',
    name: 'Test Impulse',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: force,
            target: 'TARGET',
            directionMode: directionMode ?? 'AWAY_FROM_ORIGIN',
          },
        ],
      },
    ],
  };
}

function mixedDirectionAbility(): AbilitySchema {
  return {
    id: 'test_mixed',
    name: 'Mixed',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
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
      {
        trigger: 'ON_EXPIRY',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 300,
            target: 'TARGET',
            directionMode: 'TOWARDS_CASTER',
          },
        ],
      },
    ],
  };
}

function voidAttractorAbility(): AbilitySchema {
  return {
    id: 'test_void',
    name: 'Void Well',
    archetype: 'VOID',
    cooldownMs: 2000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'MASS_ATTRACTOR',
              radius: 120,
              strength: 5000,
              durationMs: 3000,
            },
          },
        ],
      },
    ],
  };
}

function negativeRadialAbility(): AbilitySchema {
  return {
    id: 'test_pull_radial',
    name: 'Implosion',
    archetype: 'KINETIC',
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
              radius: 80,
              strength: -800,
              durationMs: 500,
            },
          },
        ],
      },
    ],
  };
}

function vortexAbility(): AbilitySchema {
  return {
    id: 'test_vortex',
    name: 'Vortex',
    archetype: 'AERO',
    cooldownMs: 1500,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'VORTEX_TANGENT',
              radius: 100,
              strength: 4000,
              durationMs: 2500,
            },
          },
        ],
      },
    ],
  };
}

function nestedProjectileAbility(): AbilitySchema {
  return {
    id: 'test_nested',
    name: 'Nested',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            projectileTrajectory: { type: 'LINEAR', speed: 300, maxRange: 400 },
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
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function childPayloadAbility(): AbilitySchema {
  return {
    id: 'test_child',
    name: 'Child',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'CAST_CHILD_PAYLOAD',
            payload: {
              id: 'child',
              name: 'Child',
              cooldownMs: 0,
              recoilKick: 0,
              triggers: [
                {
                  trigger: 'ON_CAST',
                  actions: [
                    {
                      type: 'APPLY_IMPULSE',
                      baseForce: 700,
                      target: 'TARGET',
                      directionMode: 'AWAY_FROM_ORIGIN',
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function actorImpulseAbility(): AbilitySchema {
  return {
    id: 'test_actor',
    name: 'Turret',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_ACTOR',
            actor: {
              actorArchetype: 'TURRET',
              health: 50,
              durationMs: 5000,
              triggers: [
                {
                  trigger: 'ON_TICK',
                  tickIntervalMs: 1000,
                  actions: [
                    {
                      type: 'APPLY_IMPULSE',
                      baseForce: 550,
                      target: 'TARGET',
                      directionMode: 'AWAY_FROM_ORIGIN',
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function ifFalseBranchAbility(): AbilitySchema {
  return {
    id: 'test_iffalse',
    name: 'IfFalse',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 200,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
        ifFalseActions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 9999,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
    ],
  };
}

function selfInstabilityAbility(): AbilitySchema {
  return {
    id: 'test_self_instab',
    name: 'Self Buff',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'ADD_INSTABILITY',
            amount: 25,
            target: 'CASTER',
          },
        ],
      },
    ],
  };
}

function heatResourceAbility(capacity: number): AbilitySchema {
  return {
    id: 'test_heat',
    name: 'Heat Gun',
    archetype: 'FIRE',
    cooldownMs: 0,
    recoilKick: 0,
    resourceCost: {
      type: 'HEAT',
      cost: 10,
      maxCapacity: capacity,
      rechargeRate: 5,
      lockoutDurationMs: 1500,
    },
    trajectory: { type: 'LINEAR', speed: 500, maxRange: 400 },
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
    ],
  };
}

function deliveryStructAbility(): AbilitySchema {
  return {
    id: 'test_delivery',
    name: 'Mortar',
    archetype: 'KINETIC',
    cooldownMs: 1200,
    recoilKick: 50,
    targetingMode: 'GROUND_POINT',
    trajectory: {
      type: 'BALLISTIC_ARC',
      speed: 280,
      maxRange: 500,
      piercing: 2,
      bounces: 3,
      lobApex: 150,
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 200,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
    ],
  };
}

function deliveryFanAbility(): AbilitySchema {
  return {
    id: 'test_delivery_fan',
    name: 'Fan Shot',
    archetype: 'KINETIC',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'SPAWN_PROJECTILE',
            emitter: { count: 3, spreadDeg: 40, distribution: 'FAN' },
            projectileTrajectory: { type: 'LINEAR', speed: 300, maxRange: 400 },
          },
        ],
      },
    ],
  };
}

// --- instability yield: 10 base + 600*0.02*1.5 = 10 + 18 = 28
const kineticPush = computeSpellCombatProfile(kineticImpulseAbility(600));
assert(kineticPush.instabilityYield === 28, 'kinetic impulse 600 yields instability 28');
assert(kineticPush.displacement.primaryTag === 'PUSH', 'AWAY_FROM_ORIGIN impulse is PUSH');

const kineticPull = computeSpellCombatProfile(
  kineticImpulseAbility(600, 'TOWARDS_CASTER'),
);
assert(kineticPull.displacement.primaryTag === 'PULL', 'TOWARDS_CASTER impulse is PULL');

const mixed = computeSpellCombatProfile(mixedDirectionAbility());
assert(mixed.displacement.primaryTag === 'MIXED', 'push + pull on one spell is MIXED');

const voidWell = computeSpellCombatProfile(voidAttractorAbility());
assert(voidWell.displacement.peakForce === 12500, 'Void attractor 5000 peaks at 12500 scaled');
assert(voidWell.displacement.primaryTag === 'PULL', 'positive attractor is PULL');
assert(voidWell.displacement.hasAttractor === true, 'attractor flag set');

const pullRadial = computeSpellCombatProfile(negativeRadialAbility());
assert(pullRadial.displacement.primaryTag === 'PULL', 'negative radial is PULL');

const vortex = computeSpellCombatProfile(vortexAbility());
assert(vortex.displacement.primaryTag === 'LATERAL', 'vortex is LATERAL');
assert(vortex.displacement.peakForce === 8000, 'AERO vortex 4000 peaks at 8000 (2.0 scale)');

const nested = computeSpellCombatProfile(nestedProjectileAbility());
assert(nested.displacement.peakForce === 900, 'nested projectile impulse counts');

const child = computeSpellCombatProfile(childPayloadAbility());
assert(child.displacement.peakForce === 700, 'child payload impulse counts');

const actor = computeSpellCombatProfile(actorImpulseAbility());
assert(actor.displacement.peakForce === 550, 'actor trigger impulse counts');

const ifFalse = computeSpellCombatProfile(ifFalseBranchAbility());
assert(ifFalse.displacement.peakForce === 200, 'ifFalseActions impulse excluded from peak');

const selfInstab = computeSpellCombatProfile(selfInstabilityAbility());
assert(selfInstab.instabilityAppliesToSelf === true, 'caster-targeted instability flagged');

// --- compare: cooldown
const fastCd = computeSpellCombatProfile({
  ...kineticImpulseAbility(400),
  id: 'fast',
  cooldownMs: 800,
});
const slowCd = computeSpellCombatProfile({
  ...kineticImpulseAbility(400),
  id: 'slow',
  cooldownMs: 1200,
});
const cdDiff = compareCombatProfiles(fastCd, slowCd);
assert(cdDiff.cooldown?.polarity === 'POSITIVE', 'lower cooldown is POSITIVE');
assert(cdDiff.cooldown?.delta === -400, 'cooldown delta -400ms');

const cdDiffReverse = compareCombatProfiles(slowCd, fastCd);
assert(cdDiffReverse.cooldown?.polarity === 'NEGATIVE', 'higher cooldown is NEGATIVE');

// heat vs cooldown omits cooldown delta
const heat = computeSpellCombatProfile(heatResourceAbility(30));
const cooldownSpell = computeSpellCombatProfile(kineticImpulseAbility(300));
const heatVsCd = compareCombatProfiles(heat, cooldownSpell);
assert(heatVsCd.cooldown === undefined, 'heat vs cooldown omits cooldown delta');
assert(heatVsCd.resourceMatch === false, 'heat vs cooldown resource mismatch');

// ammo capacity
const ammoLow = computeSpellCombatProfile({
  ...heatResourceAbility(20),
  resourceCost: { type: 'AMMO', cost: 1, maxCapacity: 6 },
});
const ammoHigh = computeSpellCombatProfile({
  ...heatResourceAbility(20),
  resourceCost: { type: 'AMMO', cost: 1, maxCapacity: 12 },
});
const ammoDiff = compareCombatProfiles(ammoHigh, ammoLow);
assert(ammoDiff.resourceCapacity?.polarity === 'POSITIVE', 'higher ammo capacity is POSITIVE');

// mobility recoil flip
const lowRecoil = computeSpellCombatProfile({
  ...kineticImpulseAbility(200),
  recoilKick: 220,
});
const highRecoilMobility = computeSpellCombatProfile({
  ...kineticImpulseAbility(200),
  recoilKick: 300,
});
const recoilDiff = compareCombatProfiles(highRecoilMobility, lowRecoil);
assert(recoilDiff.recoil?.polarity === 'POSITIVE', 'higher recoil when both mobility is POSITIVE');

const recoilDiffNormal = compareCombatProfiles(
  { ...lowRecoil, recoilKick: 80 },
  { ...lowRecoil, recoilKick: 40 },
);
assert(recoilDiffNormal.recoil?.polarity === 'NEGATIVE', 'higher recoil below mobility threshold is NEGATIVE');

// push vs pull omits peak force delta
const pushProfile = computeSpellCombatProfile(kineticImpulseAbility(800));
const pullProfile = computeSpellCombatProfile(kineticImpulseAbility(800, 'TOWARDS_CASTER'));
const pushPullDiff = compareCombatProfiles(pushProfile, pullProfile);
assert(pushPullDiff.peakDisplacement === undefined, 'push vs pull omits peak force delta');
assert(pushPullDiff.displacementDirectionMatch === false, 'push vs pull direction mismatch');

// null baseline
const nullDiff = compareCombatProfiles(kineticPush, null);
assert(nullDiff.cooldown === undefined, 'null baseline returns no cooldown delta');
assert(nullDiff.mechanicChanges.length === 0, 'null baseline has no mechanic changes');
assert(nullDiff.mechanicChips.length === 0, 'null baseline has no mechanic chips');

// delivery struct
const delivery = computeSpellCombatProfile(deliveryStructAbility());
assert(delivery.delivery.targetingMode === 'GROUND_POINT', 'delivery keeps GROUND_POINT');
assert(delivery.delivery.piercing === true, 'delivery keeps piercing flag');
assert(delivery.delivery.bounces === 3, 'delivery keeps bounces');

const deliveryFan = computeSpellCombatProfile(deliveryFanAbility());
assert(deliveryFan.delivery.shotCount === 3, 'delivery emitter count from ON_CAST projectile');
assert(
  deliveryFan.delivery.summary.includes('3x FAN'),
  'delivery summary includes fan spread sentence',
);

const linearBoltProfile = computeSpellCombatProfile({
  id: 'linear_bolt',
  name: 'Linear Bolt',
  archetype: 'KINETIC',
  cooldownMs: 1000,
  recoilKick: 0,
  targetingMode: 'DIRECTIONAL',
  trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
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
      ],
    },
  ],
});

const mortarProfile = computeSpellCombatProfile({
  id: 'mortar',
  name: 'Mortar',
  archetype: 'KINETIC',
  cooldownMs: 1200,
  recoilKick: 0,
  targetingMode: 'GROUND_POINT',
  trajectory: {
    type: 'BALLISTIC_ARC',
    speed: 280,
    maxRange: 500,
    piercing: 2,
    lobApex: 150,
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
      ],
    },
  ],
});

const mortarChips = extractMechanicDiffChips(mortarProfile, linearBoltProfile);
const mortarLabels = mortarChips.map((c) => c.label);
assert(mortarLabels.includes('+ GROUND TARGET'), 'mortar vs bolt has + GROUND TARGET chip');
assert(mortarLabels.includes('+ MORTAR ARC'), 'mortar vs bolt has + MORTAR ARC chip');
assert(mortarLabels.includes('+ PIERCING'), 'mortar vs bolt has + PIERCING chip');

const pushPullChips = extractMechanicDiffChips(pullProfile, pushProfile);
assert(
  pushPullChips.some((c) => c.label === 'PUSH ➔ PULL'),
  'push vs pull yields PUSH ➔ PULL chip',
);

const compareDiff = compareCombatProfiles(mortarProfile, linearBoltProfile);
assert(compareDiff.mechanicChips.length >= 3, 'compareCombatProfiles includes mechanic chips');

const sortSpells: AbilitySchema[] = [
  {
    id: 'low_force',
    name: 'Low',
    cooldownMs: 2000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
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
  {
    id: 'high_force',
    name: 'High',
    cooldownMs: 500,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'APPLY_IMPULSE',
            baseForce: 1200,
            target: 'TARGET',
            directionMode: 'AWAY_FROM_ORIGIN',
          },
        ],
      },
    ],
  },
  kineticImpulseAbility(600),
];

const insertionIndex = (id: string): number =>
  ({ low_force: 0, high_force: 1, test_impulse: 2 })[id] ?? 0;

const byForce = sortVaultSpells(sortSpells, 'PEAK_FORCE', insertionIndex);
assert(byForce[0].id === 'high_force', 'PEAK_FORCE sort puts highest force first');

const byCooldown = sortVaultSpells(sortSpells, 'COOLDOWN', insertionIndex);
assert(byCooldown[0].id === 'high_force', 'COOLDOWN sort puts fastest first');

const byInstability = sortVaultSpells(sortSpells, 'INSTABILITY', insertionIndex);
assert(
  computeSpellCombatProfile(byInstability[0]).instabilityYield >=
    computeSpellCombatProfile(byInstability[1]).instabilityYield,
  'INSTABILITY sort orders by yield descending',
);

const lethal1500 = computeKineticLethality(1500, 'PUSH');
assert(lethal1500.baseTravelPx === 420, '1500 PUSH baseTravelPx is 420');
assert(lethal1500.maxTravelPx === 840, '1500 PUSH maxTravelPx is 840');
assert(lethal1500.tier === 'LETHAL_FINISHER', '1500 PUSH is LETHAL_FINISHER');

const lethal800 = computeKineticLethality(800, 'PUSH');
assert(lethal800.baseTravelPx === 224, '800 PUSH baseTravelPx is 224');
assert(lethal800.maxTravelPx === 448, '800 PUSH maxTravelPx is 448');
assert(lethal800.tier === 'LETHAL_FINISHER', '800 PUSH is LETHAL_FINISHER');

const heavyPull = computeKineticLethality(500, 'PULL');
assert(heavyPull.baseTravelPx === 140, '500 PULL baseTravelPx is 140');
assert(heavyPull.maxTravelPx === 280, '500 PULL maxTravelPx is 280');
assert(heavyPull.tier === 'HEAVY_SHOVE', '500 PULL is HEAVY_SHOVE');
assert(heavyPull.label === 'HEAVY DRAG', '500 PULL label is HEAVY DRAG');

const tactical250 = computeKineticLethality(250, 'PUSH');
assert(tactical250.baseTravelPx === 70, '250 PUSH baseTravelPx is 70');
assert(tactical250.maxTravelPx === 140, '250 PUSH maxTravelPx is 140');
assert(
  tactical250.tier === 'TACTICAL_REPOSITION',
  '250 PUSH is TACTICAL_REPOSITION',
);

const noneForce = computeKineticLethality(0, 'PUSH');
assert(noneForce.tier === 'NONE', '0 force tier is NONE');

const integrated800 = computeSpellCombatProfile(kineticImpulseAbility(800));
assert(
  integrated800.displacement.lethality.maxTravelPx === 448,
  'integrated profile populates lethality for 800 force',
);
assert(
  integrated800.displacement.lethality.tier === 'LETHAL_FINISHER',
  'integrated 800 force is LETHAL_FINISHER',
);

function kitEquipped(
  spells: Partial<Record<ActionSlotKey, AbilitySchema | null>>,
): Record<ActionSlotKey, AbilitySchema | null> {
  const equipped = Object.fromEntries(
    ACTION_SLOT_KEYS.map((key) => [key, null]),
  ) as Record<ActionSlotKey, AbilitySchema | null>;
  for (const key of ACTION_SLOT_KEYS) {
    if (key in spells) {
      equipped[key] = spells[key] ?? null;
    }
  }
  return equipped;
}

function enemyInstabilityAbility(amount: number): AbilitySchema {
  return {
    id: 'test_enemy_instab',
    name: 'Corrupt',
    archetype: 'VOID',
    cooldownMs: 1000,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'ADD_INSTABILITY',
            amount,
            target: 'TARGET',
          },
        ],
      },
    ],
  };
}

function parryAbility(): AbilitySchema {
  return {
    id: 'test_parry',
    name: 'Parry',
    archetype: 'KINETIC',
    cooldownMs: 800,
    recoilKick: 0,
    triggers: [
      {
        trigger: 'ON_CAST',
        actions: [
          {
            type: 'REFLECT_PROJECTILES',
            target: 'SELF',
          },
        ],
      },
    ],
  };
}

const finisher800 = kineticImpulseAbility(800);
const finisherKit = analyzeLoadoutKit(kitEquipped({ LMB: finisher800 }));
assert(
  finisherKit.slots[0]?.tags.includes('FINISHER'),
  'force 800 PUSH is a finisher',
);
assert(
  !finisherKit.slots[0]?.tags.includes('UTILITY'),
  'force 800 PUSH is not utility',
);

const primerKit = analyzeLoadoutKit(
  kitEquipped({ Q: enemyInstabilityAbility(25) }),
);
assert(
  primerKit.slots[0]?.tags.includes('PRIMER'),
  'enemy ADD_INSTABILITY above baseline is a primer',
);

const parryKit = analyzeLoadoutKit(kitEquipped({ E: parryAbility() }));
assert(
  parryKit.slots[0]?.tags.includes('UTILITY'),
  'REFLECT_PROJECTILES is utility',
);
assert(
  parryKit.warnings.includes('No ring-out finisher'),
  'parry-only kit warns no ring-out finisher',
);
assert(
  parryKit.warnings.includes('No mobility tools'),
  'parry-only kit warns no mobility tools',
);

const tripleFinisher = analyzeLoadoutKit(
  kitEquipped({
    LMB: kineticImpulseAbility(800),
    RMB: { ...kineticImpulseAbility(900), id: 'finisher_rmb' },
    Q: { ...kineticImpulseAbility(1000), id: 'finisher_q' },
  }),
);
assert(
  tripleFinisher.warnings.includes('Redundant primary role'),
  'three finisher slots warn redundant primary role',
);

const primerPlasmaKit = analyzeLoadoutKit(
  kitEquipped({
    LMB: enemyInstabilityAbility(25),
    RMB: {
      id: 'plasma_det',
      name: 'Plasma Burst',
      archetype: 'PLASMA',
      cooldownMs: 1200,
      recoilKick: 0,
      trajectory: { type: 'LINEAR', speed: 500, maxRange: 400 },
      triggers: [
        {
          trigger: 'ON_HIT',
          actions: [
            {
              type: 'MODIFY_STAT',
              stat: 'health',
              value: -40,
              target: 'TARGET',
            },
          ],
        },
      ],
    },
  }),
);
assert(
  primerPlasmaKit.synergy === 'LMB primes instability → RMB detonates',
  'primer plus PLASMA slot emits detonation synergy',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
