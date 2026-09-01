import { repairAbilitySemantics } from '../src/ai/budget/repair';
import { sanitizeAbilitySchema } from '../src/ai/budget/sanitize/ability';
import type { SkillCategory } from '../src/types/cards';
import type { AbilitySchema, SpellArchetype } from '../src/types/schema';
import {
  assertInvariant,
  runHeadlessSimulation,
  type InvariantType,
  type SimulationTelemetry,
} from './test-physics-invariants';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export interface FidelityScenario {
  id: string;
  name: string;
  tagline: string;
  description: string;
  expectedInvariant: InvariantType;
  category: SkillCategory;
  archetype: SpellArchetype;
  targetDistance?: number;
}

export const FIDELITY_SCENARIOS: FidelityScenario[] = [
  // 1-4: Gravity & Pulling
  {
    id: 'singularity_dart',
    name: 'Singularity Dart',
    tagline: 'Pulling micro bolt',
    description: 'Fires a rapid dart that micro-pulls targets inward on impact.',
    expectedInvariant: 'PULL',
    category: 'PRIMARY',
    archetype: 'VOID',
  },
  {
    id: 'vortex_trap',
    name: 'Vortex Trap',
    tagline: 'Gravitational well',
    description: 'Spawns a swirling black hole that drags nearby foes into its core.',
    expectedInvariant: 'PULL',
    category: 'UTILITY',
    archetype: 'VOID',
  },
  {
    id: 'magnetic_harpoon',
    name: 'Magnetic Harpoon',
    tagline: 'Tether pull',
    description: 'Impales target and reels them directly toward the caster.',
    expectedInvariant: 'PULL',
    category: 'SECONDARY',
    archetype: 'MAGNETIC',
  },
  {
    id: 'vacuum_implosion',
    name: 'Vacuum Implosion',
    tagline: 'Inward burst',
    description: 'Detonates a pressure drop that sucks enemies toward the center.',
    expectedInvariant: 'PULL',
    category: 'UTILITY',
    archetype: 'AERO',
  },

  // 5-8: Heavy Knockback & Burst
  {
    id: 'kinetic_railgun',
    name: 'Kinetic Railgun',
    tagline: 'Hyper-velocity slug',
    description: 'Fires a high-impact kinetic slug that flings targets backward.',
    expectedInvariant: 'PUSH',
    category: 'PRIMARY',
    archetype: 'KINETIC',
  },
  {
    id: 'concussive_blast',
    name: 'Concussive Blast',
    tagline: 'Shockwave burst',
    description: 'Unleashes a devastating shockwave blasting enemies away.',
    expectedInvariant: 'PUSH',
    category: 'SECONDARY',
    archetype: 'SONIC',
  },
  {
    id: 'repulsor_wave',
    name: 'Repulsor Wave',
    tagline: 'Kinetic sweep',
    description: 'Sweeps an arc of kinetic force knocking all enemies into lava.',
    expectedInvariant: 'PUSH',
    category: 'UTILITY',
    archetype: 'KINETIC',
  },
  {
    id: 'plasma_cannon',
    name: 'Plasma Cannon',
    tagline: 'Overcharged shot',
    description: 'Heavy plasma bolt that violently repels combatants on hit.',
    expectedInvariant: 'PUSH',
    category: 'ULTIMATE',
    archetype: 'PLASMA',
  },

  // 9-12: Hazard & Damage Over Time
  {
    id: 'napalm_arc',
    name: 'Napalm Arc',
    tagline: 'Persistent flame sweep',
    description: 'Fires a sweeping arc of lingering sticky fire across the arena.',
    expectedInvariant: 'HAZARD_DOT',
    category: 'SECONDARY',
    archetype: 'FIRE',
  },
  {
    id: 'toxic_sludge',
    name: 'Toxic Sludge',
    tagline: 'Corrosive puddle',
    description: 'Coats the ground in caustic acid that melts enemy instability.',
    expectedInvariant: 'HAZARD_DOT',
    category: 'UTILITY',
    archetype: 'TOXIC',
  },
  {
    id: 'scorch_beam',
    name: 'Scorch Beam',
    tagline: 'Channeled magma',
    description: 'Channels a continuous beam of burning heat that scorches targets.',
    expectedInvariant: 'HAZARD_DOT',
    category: 'PRIMARY',
    archetype: 'FIRE',
  },
  {
    id: 'frost_bite_zone',
    name: 'Frostbite Mire',
    tagline: 'Freezing hazard',
    description: 'Leaves a patch of deep frost that builds heavy vulnerability.',
    expectedInvariant: 'HAZARD_DOT',
    category: 'UTILITY',
    archetype: 'FROST',
  },

  // 13-16: Orbiting & Halos
  {
    id: 'orbital_halos',
    name: 'Orbital Halos',
    tagline: 'Circling rings',
    description: 'Summons kinetic rings circling around your body.',
    expectedInvariant: 'ORBIT',
    category: 'PRIMARY',
    archetype: 'KINETIC',
    targetDistance: 120,
  },
  {
    id: 'flame_orbiters',
    name: 'Flame Orbiters',
    tagline: 'Whirling fireballs',
    description: 'Conjures shields of fire orbiting the caster to block rushers.',
    expectedInvariant: 'ORBIT',
    category: 'UTILITY',
    archetype: 'FIRE',
    targetDistance: 120,
  },
  {
    id: 'plasma_satellites',
    name: 'Plasma Satellites',
    tagline: 'Revolving orbs',
    description: 'Spawns revolving plasma sparks rotating around your perimeter.',
    expectedInvariant: 'ORBIT',
    category: 'SECONDARY',
    archetype: 'PLASMA',
    targetDistance: 120,
  },
  {
    id: 'ice_halo',
    name: 'Ice Barrier Ring',
    tagline: 'Circling frost shards',
    description: 'Rotates sharp crystal shards in an orbit around the player.',
    expectedInvariant: 'ORBIT',
    category: 'MOBILITY',
    archetype: 'FROST',
    targetDistance: 120,
  },

  // 17-20: Obstacles & Barriers
  {
    id: 'ice_wall',
    name: 'Ice Wall',
    tagline: 'Solid frost barricade',
    description: 'Plants a fortified ice barrier that blocks movement and shots.',
    expectedInvariant: 'OBSTACLE',
    category: 'UTILITY',
    archetype: 'FROST',
  },
  {
    id: 'earth_bunker',
    name: 'Earth Bunker',
    tagline: 'Stone pillar',
    description: 'Raises a solid stone obstacle from the ground.',
    expectedInvariant: 'OBSTACLE',
    category: 'UTILITY',
    archetype: 'EARTH',
  },
  {
    id: 'crystal_pylon',
    name: 'Crystal Pylon',
    tagline: 'Constructed ward',
    description: 'Erects a destructible crystal obelisk in front of you.',
    expectedInvariant: 'OBSTACLE',
    category: 'UTILITY',
    archetype: 'ARCANE',
  },
  {
    id: 'barricade_drop',
    name: 'Force Barricade',
    tagline: 'Deployable cover',
    description: 'Deploys a solid barricade to absorb incoming enemy fire.',
    expectedInvariant: 'OBSTACLE',
    category: 'UTILITY',
    archetype: 'KINETIC',
  },
];

function buildRawSchema(scenario: FidelityScenario): AbilitySchema {
  return {
    id: scenario.id,
    name: scenario.name,
    tagline: scenario.tagline,
    description: scenario.description,
    archetype: scenario.archetype,
    cooldownMs: 800,
    recoilKick: 0,
    triggers: [],
  };
}

function buildScenarioText(scenario: FidelityScenario): string {
  return `${scenario.name} ${scenario.tagline} ${scenario.description}`;
}

function processScenario(scenario: FidelityScenario): AbilitySchema {
  const text = buildScenarioText(scenario);
  const repaired = repairAbilitySemantics(buildRawSchema(scenario), text);
  return sanitizeAbilitySchema(repaired, scenario.category, 0, text);
}

function formatTelemetry(t: SimulationTelemetry): string {
  return [
    `dist ${t.initialDistance.toFixed(0)}→${t.finalDistance.toFixed(0)}`,
    `peak ${t.peakTargetSpeed.toFixed(0)}`,
    `Δinstab ${t.targetInstabilityDelta.toFixed(1)}`,
    `Δhp ${t.targetHealthDelta.toFixed(1)}`,
    `fields ${t.fieldTicksApplied}`,
    `obs ${t.obstaclesSpawned}`,
    `orbit ${t.orbitBandFrameCount}`,
  ].join(' | ');
}

function run(): void {
  console.log('test:fidelity');
  let passed = 0;

  for (const scenario of FIDELITY_SCENARIOS) {
    let telemetry: SimulationTelemetry;
    try {
      const schema = processScenario(scenario);
      telemetry = runHeadlessSimulation(
        schema,
        60,
        1 / 60,
        scenario.targetDistance ?? 200,
      );
    } catch (err) {
      console.log(`${RED}[FAIL]${RESET} ${scenario.name} (${scenario.expectedInvariant})`);
      console.log(`  ${DIM}runtime error: ${err}${RESET}`);
      continue;
    }

    const result = assertInvariant(scenario.name, telemetry, scenario.expectedInvariant);
    const tag = result.pass ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;

    console.log(`${tag} ${scenario.name} (${scenario.expectedInvariant})`);
    console.log(`  ${DIM}${result.reason}${RESET}`);
    console.log(`  ${DIM}${formatTelemetry(telemetry)}${RESET}`);

    if (result.pass) passed++;
  }

  console.log('');
  console.log(`${passed}/${FIDELITY_SCENARIOS.length} passed`);

  if (passed < FIDELITY_SCENARIOS.length) {
    process.exit(1);
  }
}

run();
