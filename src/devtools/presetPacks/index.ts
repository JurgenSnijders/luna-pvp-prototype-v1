import type { AbilitySchema } from '../../types/schema';
import { applyHitExpiryOverlapRepair } from '../../ai/budget/repair';
import { CORE_PRESETS } from './core';
import { KINETIC_RECIPES, KINETIC_RECIPE_PRESETS } from './kineticRecipes';
import { INPUT_PROFILE_PRESETS } from './inputProfiles';
import { STASIS_PRESETS } from './stasis';
import { TERRAIN_PRESETS } from './terrain';
import { METAMORPH_PRESETS } from './metamorph';
import { RESOURCE_PRESETS } from './resources';
import { ADVANCED_PRESETS } from './advanced';
import { CONDITIONAL_PRESETS } from './conditional';
import { DIAGNOSTIC_PRESETS } from './diagnostics';
import { VFX_SHOWCASE_PRESETS } from './vfxShowcase';
import { VERTICAL_RECIPE_PRESETS } from './verticalRecipes';

export interface PresetGroup {
  id: string;
  label: string;
  description: string;
  presetNames: string[];
}

export const PRESET_GROUPS: PresetGroup[] = [
  {
    id: 'tier-a',
    label: 'Tier A — Core Demo',
    description: 'Classic baseline loadout and regression reference',
    presetNames: [
      'Kinetic Railgun',
      'Graviton Boomerang',
      'Cryo Ice Trail',
      'Cluster Mortar',
      'Phase Nova',
    ],
  },
  {
    id: 'tier-b',
    label: 'Tier B — Kinetic Recipes',
    description: 'Compiler reference spells promoted to presets',
    presetNames: [
      'Blood Harpoon',
      'Void Singularity',
      'Cluster MIRV',
      'Stasis Freeze Trap',
      'Ice Barrier',
      'Coupe de Grace',
      'Charged Rail Burst',
      'Plasma Flamer',
      'Stasis Battery Combo',
      'Iron Colossus',
      'Ghost Walk',
      'Auto Turret',
      'Lava Patch',
    ],
  },
  {
    id: 'phase-7',
    label: 'Phase 7 — Input Profiles',
    description: 'Charge, channel, and combo casting modes',
    presetNames: [
      'Charged Rail Burst',
      'Charged Nova Bomb',
      'Void Channel',
      'Flame Channel Cone',
      'Triple Tap Combo',
    ],
  },
  {
    id: 'phase-8',
    label: 'Phase 8 — Stasis',
    description: 'Freeze, momentum banking, and release',
    presetNames: ['Stasis Shell', 'Momentum Release', 'Stasis Battery Combo'],
  },
  {
    id: 'phase-9',
    label: 'Phase 9 — Terrain & Obstacles',
    description: 'Dynamic geometry and terrain mutation',
    presetNames: ['Boulder Drop', 'Lava Patch', 'Safe Haven', 'Minefield Volley'],
  },
  {
    id: 'phase-10',
    label: 'Phase 10 — Metamorphism',
    description: 'Morph, stealth, turrets, and decoys',
    presetNames: [
      'Iron Colossus',
      'Quicksilver Form',
      'Ghost Walk',
      'Deep Shroud',
      'Auto Turret',
      'Ice Turret',
      'Forward Turret Drop',
      'Mirror Decoy',
    ],
  },
  {
    id: 'phase-11',
    label: 'Phase 11 — Resources',
    description: 'Heat, ammo, and health-cost paradigms',
    presetNames: [
      'Overheat Laser',
      'Plasma Flamer',
      'Burst Pistol',
      'Scattergun',
      'Blood Pact',
    ],
  },
  {
    id: 'tier-d',
    label: 'Tier D — Advanced Grammar',
    description: 'Trajectories, constraints, stats, and lifecycle triggers',
    presetNames: [
      'Seeker Missile',
      'Blink Lance',
      'Orbital Sentry',
      'Recast Detonate',
      'Tripwire Bomb',
      'Wallbreaker',
      'Rod Snare',
      'Anchor Pin',
      'Haste Surge',
      'Gravity Curse',
    ],
  },
  {
    id: 'tier-e',
    label: 'Tier E — Conditional Logic',
    description: 'Conditions, branching, and nested payloads',
    presetNames: [
      'Crowd Breaker',
      'Lava Hunter',
      'Instability Executioner',
      'Branching Cascade',
      'Recursive Fractal',
    ],
  },
  {
    id: 'vfx-showcase',
    label: 'VFX Showcase',
    description: 'New WebGL VFX grammar demonstrations',
    presetNames: ['Prism Lance', 'Void Rift Bomb', 'Rune Nova', 'Plasma Fork'],
  },
  {
    id: 'vertical-recipes',
    label: 'Vertical Recipes',
    description: 'Sky drops, mortar clusters, jump pads, and anti-air flak',
    presetNames: ['Meteor Strike', 'Cluster Mortar', 'Thermal Geyser', 'Flak Cannon'],
  },
  {
    id: 'tier-f',
    label: 'Tier F — Diagnostics',
    description: 'Stress tests and grammar edge-case probes',
    presetNames: [
      'Entity Storm',
      'Field Dedup Ticker',
      'Null Ability',
      'Hazard Probe',
      'Surface Probe',
      'Reflect Probe',
      'VFX Stress Storm',
    ],
  },
];

function mergePresets(...maps: Record<string, AbilitySchema>[]): Record<string, AbilitySchema> {
  return Object.assign({}, ...maps);
}

function bakeHitExpiryOverlap(map: Record<string, AbilitySchema>): void {
  for (const schema of Object.values(map)) {
    applyHitExpiryOverlapRepair(schema);
  }
}

export const PRESETS: Record<string, AbilitySchema> = mergePresets(
  CORE_PRESETS,
  KINETIC_RECIPE_PRESETS,
  INPUT_PROFILE_PRESETS,
  STASIS_PRESETS,
  TERRAIN_PRESETS,
  METAMORPH_PRESETS,
  RESOURCE_PRESETS,
  ADVANCED_PRESETS,
  CONDITIONAL_PRESETS,
  DIAGNOSTIC_PRESETS,
  VFX_SHOWCASE_PRESETS,
  VERTICAL_RECIPE_PRESETS,
);

bakeHitExpiryOverlap(PRESETS);
bakeHitExpiryOverlap(KINETIC_RECIPES);

export const PRESET_NAMES = Object.keys(PRESETS);

export { KINETIC_RECIPES };
export { VERTICAL_RECIPE_PRESETS, VERTICAL_RECIPES } from './verticalRecipes';
