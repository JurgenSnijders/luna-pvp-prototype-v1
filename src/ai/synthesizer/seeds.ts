import type { SkillCategory } from '../../types/cards';

const CATEGORY_SEEDS: Record<SkillCategory, [string, string, string]> = {
  PRIMARY: [
    'Focus on a rapid-fire kinetic skillshot with low cooldown pacing.',
    'Focus on a heavy, piercing payload with high single-target impact.',
    'Focus on an erratic or bouncing trajectory with unpredictable angles.',
  ],
  SECONDARY: [
    'Focus on a charged shot or wind-up skillshot with combo potential.',
    'Focus on a medium-range combo chain or sequential casts.',
    'Focus on medium area pressure or a wide skillshot salvo.',
  ],
  UTILITY: [
    'Focus on a lingering terrain hazard or proximity trap.',
    'Focus on a gravitational pull, vortex, or crowd-control field.',
    'Focus on a physical obstacle, wall, or terrain mutation.',
  ],
  ULTIMATE: [
    'Focus on a screen-wide field or high-impact zone presence.',
    'Focus on a morph, summon, turret, or decoy with long duration.',
    'Focus on a long-cooldown burst with massive displacement payoff.',
  ],
  MOBILITY: [
    'Focus on a dash, blink, or short-range teleport escape.',
    'Focus on stealth, phasing, or repositioning without direct damage.',
    'Focus on a displacement leap that also knocks enemies aside.',
  ],
};

const EVOLUTION_SEEDS: [string, string, string] = [
  'Mutation angle: cluster or multi-payload — split, MIRV, or child projectiles on expiry.',
  'Mutation angle: spatial field or trap — zones, obstacles, or lingering hazards.',
  'Mutation angle: kinematic or motion augment — trajectory, dash, tether, or impulse change.',
];

export function getCategorySeeds(category: SkillCategory): [string, string, string] {
  return CATEGORY_SEEDS[category];
}

export function getEvolutionSeeds(): [string, string, string] {
  return EVOLUTION_SEEDS;
}
