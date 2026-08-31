import { KINETIC_RECIPES } from '../../../devtools/Presets';
import type {
  CardRarity,
  DraftCard,
  PassiveModifierPayload,
  SkillCategory,
} from '../../../types/cards';
import { getCategoryLabel } from '../../../types/cards';
import type { AbilitySchema } from '../../../types/schema';
import { makeActiveCard, makePassiveCard } from '../cards';

export function resolveKineticRecipe(prompt: string): AbilitySchema | null {
  const desc = prompt.toLowerCase();

  if (/\b(pull|harpoon|hook)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.harpoon);
  }
  if (/\b(cluster|split|mirv)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.cluster);
  }
  if (/\b(freeze|stasis|stop)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.stasisTrap);
  }
  if (/\b(wall|barrier|block)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.iceWall);
  }
  if (/\b(execute|coupe|finisher)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.execute);
  }
  if (/\b(vortex|black hole|singularity)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.vortex);
  }
  if (/\b(charge|charged|windup)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.chargedShot);
  }
  if (/\b(heat|overheat|laser|flamer|flame)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.heatWeapon);
  }
  if (/\b(combo|chain|sequence)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.comboChain);
  }
  if (/\b(morph|transform|colossus|giant)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.morphColossus);
  }
  if (/\b(stealth|invisible|ghost|shroud)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.ghostWalk);
  }
  if (/\b(turret|decoy|summon)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.autoTurret);
  }
  if (/\b(lava|terrain|ground)\b/.test(desc)) {
    return structuredClone(KINETIC_RECIPES.lavaPatch);
  }

  return null;
}

function buildOfflineRecipeForge(
  prompt: string,
  category: SkillCategory,
  baseRecipe: AbilitySchema,
): DraftCard[] {
  const common = structuredClone(baseRecipe);
  common.id = `${common.id}_common`;
  common.name = common.name;

  const rare = structuredClone(baseRecipe);
  rare.id = `${rare.id}_rare`;
  rare.name = `${rare.name} II`;
  if (rare.trajectory) {
    rare.trajectory.piercing = Math.min(4, (rare.trajectory.piercing ?? 0) + 1);
  }

  const epic = structuredClone(baseRecipe);
  epic.id = `${epic.id}_epic`;
  epic.name = `${epic.name} Apex`;
  if (epic.trajectory) {
    epic.trajectory.speed = Math.round((epic.trajectory.speed ?? 400) * 1.15);
    epic.trajectory.piercing = Math.min(4, (epic.trajectory.piercing ?? 0) + 2);
  }

  const descSnippet = prompt.slice(0, 40) || 'kinetic';

  return [
    makeActiveCard('card_common', common.name, 'Kinetic Recipe', `A ${descSnippet} ability`, 'COMMON', common, category),
    makeActiveCard('card_rare', rare.name, 'Advanced Variant', `Enhanced ${descSnippet}`, 'RARE', rare, category),
    makeActiveCard('card_epic', epic.name, 'Apex Variant', `Peak ${descSnippet} expression`, 'EPIC', epic, category),
  ];
}

export function generateOfflineDraft(
  prompt: string,
  category: SkillCategory = 'SECONDARY',
): DraftCard[] {
  const p = prompt.toLowerCase();
  const isChaotic = /\b(chaos|chaotic|wild|unstable)\b/.test(p);

  let commonSchema: AbilitySchema;
  let rareSchema: AbilitySchema;
  let passiveMods: PassiveModifierPayload[];

  if (/\b(boomerang|return)\b/.test(p)) {
    commonSchema = {
      id: 'off_boomerang',
      name: 'Graviton Return',
      cooldownMs: 800,
      recoilKick: 80,
      trajectory: { type: 'RETURN_TO_SOURCE', speed: 350, maxRange: 500, turnAccel: 1200, piercing: 1 },
      visuals: { color: '#aa44ff', size: 10, projectileStyle: 'SHURIKEN', trailType: 'SMOKE', impactVfx: 'VORTEX_SWIRL' },
      triggers: [{
        trigger: 'ON_RETURN',
        actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'VORTEX_TANGENT', radius: 80, strength: -400, durationMs: 2000 } }],
      }],
    };
    rareSchema = {
      id: 'off_homing',
      name: 'Seeker Bolt',
      cooldownMs: 900,
      recoilKick: 60,
      trajectory: { type: 'HOMING_SLERP', speed: 380, maxRange: 550, turnAccel: 600 },
      visuals: { color: '#66aaff', size: 8, projectileStyle: 'DISC', trailType: 'SMOKE', impactVfx: 'SPARKS' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'ADD_INSTABILITY', amount: 25 }] }],
    };
    passiveMods = [{ stat: 'KNOCKBACK_RESISTANCE', op: 'ADD', value: 0.15 }];
  } else if (/\b(ice|cold|frost)\b/.test(p)) {
    commonSchema = {
      id: 'off_cryo',
      name: 'Cryo Shard',
      cooldownMs: 600,
      recoilKick: 50,
      trajectory: { type: 'LINEAR', speed: 650, maxRange: 650 },
      visuals: { color: '#88ddff', size: 14, projectileStyle: 'PULSING_ORB', trailType: 'ICE_GLOW', impactVfx: 'ICE_BURST' },
      triggers: [{
        trigger: 'ON_TICK',
        actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'FRICTION_OVERRIDE', radius: 40, strength: 0, durationMs: 2000, frictionValue: 0.02 } }],
      }],
    };
    rareSchema = {
      id: 'off_freeze_burst',
      name: 'Frost Nova',
      cooldownMs: 1000,
      recoilKick: 30,
      visuals: { color: '#aaddff', size: 16, projectileStyle: 'PULSING_ORB', trailType: 'ICE_GLOW', impactVfx: 'ICE_BURST' },
      triggers: [{
        trigger: 'ON_CAST',
        actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'FRICTION_OVERRIDE', radius: 100, strength: 0, durationMs: 3000, frictionValue: 0.02 } }],
      }],
    };
    passiveMods = [{ stat: 'LINEAR_DRAG', op: 'MULTIPLY', value: 1.1 }];
  } else if (/\b(vortex|black hole|singularity)\b/.test(p)) {
    commonSchema = structuredClone(KINETIC_RECIPES.vortex);
    commonSchema.id = 'off_vortex_common';
    rareSchema = structuredClone(KINETIC_RECIPES.vortex);
    rareSchema.id = 'off_vortex_rare';
    rareSchema.name = 'Void Spiral';
    if (rareSchema.trajectory) {
      rareSchema.trajectory.speed = Math.round((rareSchema.trajectory.speed ?? 400) * 1.2);
    }
    passiveMods = [{ stat: 'MASS', op: 'MULTIPLY', value: 1.15 }];
  } else if (/\b(railgun|sniper|heavy|laser)\b/.test(p)) {
    commonSchema = {
      id: 'off_rail',
      name: 'Kinetic Rail',
      cooldownMs: 1000,
      recoilKick: 400,
      trajectory: { type: 'LINEAR', speed: 1400, maxRange: 900 },
      visuals: { color: '#ffaa44', size: 5, projectileStyle: 'BEAM', trailType: 'NEON_RIBBON', impactVfx: 'SHOCKWAVE' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 1200 }, { type: 'ADD_INSTABILITY', amount: 40 }] }],
    };
    rareSchema = {
      id: 'off_pierce',
      name: 'Armor Piercer',
      cooldownMs: 1200,
      recoilKick: 300,
      trajectory: { type: 'LINEAR', speed: 1100, maxRange: 800, piercing: 2 },
      visuals: { color: '#ffcc66', size: 6, projectileStyle: 'BEAM', trailType: 'NEON_RIBBON', impactVfx: 'SPARKS' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 800 }] }],
    };
    passiveMods = [{ stat: 'COOLDOWN_REDUCTION_PCT', op: 'ADD', value: 10 }];
  } else if (/\b(dash|blink|phase|teleport|nova|lightning|chaos)\b/.test(p) || category === 'MOBILITY') {
    commonSchema = {
      id: 'off_phase',
      name: 'Phase Dash',
      cooldownMs: 1200,
      recoilKick: 0,
      visuals: { color: '#44ffff', size: 10, projectileStyle: 'CHAOS_LIGHTNING', trailType: 'NEON_RIBBON', impactVfx: 'MINI_NUKE' },
      triggers: [
        { trigger: 'ON_CAST', actions: [
          { type: 'SPAWN_FIELD', field: { fieldType: 'RADIAL_IMPULSE', radius: 90, strength: 500, durationMs: 350 } },
          { type: 'TELEPORT', distance: 120 },
        ]},
      ],
    };
    rareSchema = {
      id: 'off_blink',
      name: 'Blink Strike',
      cooldownMs: 900,
      recoilKick: 40,
      trajectory: { type: 'DISCONTINUOUS_BLINK', speed: 500, maxRange: 600, blinkDistance: 80 },
      visuals: { color: '#88ffff', size: 8, projectileStyle: 'CHAOS_LIGHTNING', trailType: 'NEON_RIBBON', impactVfx: 'SHOCKWAVE' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 500 }] }],
    };
    passiveMods = [{ stat: 'MOVE_SPEED', op: 'MULTIPLY', value: 1.12 }];
  } else if (/\b(fast|speed|agility)\b/.test(p)) {
    commonSchema = {
      id: 'off_swift',
      name: 'Swift Bolt',
      cooldownMs: 500,
      recoilKick: 30,
      trajectory: { type: 'LINEAR', speed: 800, maxRange: 500 },
      visuals: { color: '#00e5ff', size: 7, projectileStyle: 'DISC', trailType: 'NEON_RIBBON', impactVfx: 'SPARKS' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'ADD_INSTABILITY', amount: 15 }] }],
    };
    rareSchema = {
      id: 'off_homing_fast',
      name: 'Tracer Round',
      cooldownMs: 700,
      recoilKick: 50,
      trajectory: { type: 'HOMING_SLERP', speed: 500, maxRange: 600, turnAccel: 900 },
      visuals: { color: '#44ffaa', size: 7, projectileStyle: 'DISC', trailType: 'SMOKE', impactVfx: 'SPARKS' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 400 }] }],
    };
    passiveMods = [
      { stat: 'MOVE_SPEED', op: 'MULTIPLY', value: 1.2 },
      { stat: 'ACCELERATION', op: 'MULTIPLY', value: 1.15 },
    ];
  } else if (/\b(shield|orbit|shuriken|blade)\b/.test(p)) {
    commonSchema = {
      id: 'off_shield_orbit',
      name: 'Guardian Orbit',
      cooldownMs: 1000,
      recoilKick: 20,
      trajectory: { type: 'ORBIT_ANCHOR', orbitRadius: 55, orbitSpeed: 5, maxRange: 800 },
      visuals: { color: '#cc88ff', size: 10, projectileStyle: 'SHURIKEN', trailType: 'SMOKE', impactVfx: 'SPARKS' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'ADD_INSTABILITY', amount: 20 }] }],
    };
    rareSchema = {
      id: 'off_repulse',
      name: 'Repulsion Field',
      cooldownMs: 1100,
      recoilKick: 50,
      visuals: { color: '#ff8844', size: 12, projectileStyle: 'PULSING_ORB', trailType: 'NONE', impactVfx: 'SHOCKWAVE' },
      triggers: [{
        trigger: 'ON_CAST',
        actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'RADIAL_IMPULSE', radius: 80, strength: 700, durationMs: 500 } }],
      }],
    };
    passiveMods = [{ stat: 'KNOCKBACK_RESISTANCE', op: 'ADD', value: 0.2 }];
  } else {
    commonSchema = {
      id: 'off_standard',
      name: 'Kinetic Bolt',
      cooldownMs: 700,
      recoilKick: 60,
      trajectory: { type: 'LINEAR', speed: 500, maxRange: 550 },
      visuals: { color: '#00e5ff', size: 8, projectileStyle: 'DISC', trailType: 'NONE', impactVfx: 'SPARKS' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 500 }] }],
    };
    rareSchema = {
      id: 'off_arc',
      name: 'Arc Weaver',
      cooldownMs: 900,
      recoilKick: 80,
      trajectory: { type: 'RETURN_TO_SOURCE', speed: 320, maxRange: 450, turnAccel: 1000 },
      visuals: { color: '#ffaa44', size: 9, projectileStyle: 'SHURIKEN', trailType: 'SMOKE', impactVfx: 'SPARKS' },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'ADD_INSTABILITY', amount: 20 }] }],
    };
    passiveMods = [{ stat: 'MOVE_SPEED', op: 'ADD', value: 30 }];
  }

  const commonRarity: CardRarity = isChaotic ? 'CHAOTIC' : 'COMMON';
  const rareRarity: CardRarity = 'RARE';
  const passiveRarity: CardRarity = 'EPIC';

  return [
    makeActiveCard('card_common', commonSchema.name, 'Standard Issue', `A ${prompt.slice(0, 40) || 'kinetic'} ability`, commonRarity, commonSchema, category),
    makeActiveCard('card_rare', rareSchema.name, 'Advanced Variant', `Enhanced ${prompt.slice(0, 30) || 'combat'} mechanic`, rareRarity, rareSchema, category),
    makePassiveCard('card_passive', 'Evolution Buff', 'Permanent Augment', `Passive upgrade from "${prompt.slice(0, 30) || 'training'}"`, passiveRarity, passiveMods),
  ];
}

export function generateOfflineForge(
  prompt: string,
  category: SkillCategory,
): DraftCard[] {
  const recipe = resolveKineticRecipe(prompt);
  if (recipe) {
    return buildOfflineRecipeForge(prompt, category, recipe);
  }

  const draft = generateOfflineDraft(prompt, category);
  const base = draft[1].abilityPayload ?? draft[0].abilityPayload!;
  const third = structuredClone(base);
  third.id = `${third.id}_forge3`;
  third.name = `${third.name} Apex`;
  if (third.trajectory) {
    third.trajectory.piercing = Math.min(4, (third.trajectory.piercing ?? 0) + 1);
  } else {
    third.triggers.push({
      trigger: 'ON_CAST',
      actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'RADIAL_IMPULSE', radius: 80, strength: 550, durationMs: 400 } }],
    });
  }

  return [
    draft[0],
    draft[1],
    makeActiveCard(
      'card_epic',
      third.name,
      'Apex Variant',
      `Category-tuned ${getCategoryLabel(category)} forge`,
      'EPIC',
      third,
      category,
    ),
  ];
}

export function generateOfflinePassives(prompt: string): DraftCard[] {
  const p = prompt.toLowerCase();
  const sets: PassiveModifierPayload[][] = [
    [{ stat: 'MOVE_SPEED', op: 'MULTIPLY', value: 1.12 }],
    [{ stat: 'KNOCKBACK_RESISTANCE', op: 'ADD', value: 0.15 }],
    [{ stat: 'COOLDOWN_REDUCTION_PCT', op: 'ADD', value: 10 }],
  ];

  if (/\b(mass|heavy)\b/.test(p)) {
    sets[0] = [{ stat: 'MASS', op: 'MULTIPLY', value: 1.15 }];
  }
  if (/\b(speed|agility|swift)\b/.test(p)) {
    sets[1] = [
      { stat: 'MOVE_SPEED', op: 'MULTIPLY', value: 1.18 },
      { stat: 'ACCELERATION', op: 'MULTIPLY', value: 1.1 },
    ];
  }
  if (/\b(cdr|cooldown|haste)\b/.test(p)) {
    sets[2] = [{ stat: 'COOLDOWN_REDUCTION_PCT', op: 'ADD', value: 15 }];
  }

  const titles = ['Kinetic Conditioning', 'Impact Plating', 'Flux Capacitor'];
  const rarities: CardRarity[] = ['COMMON', 'RARE', 'EPIC'];

  return sets.map((mods, i) =>
    makePassiveCard(
      `passive_${i}`,
      titles[i],
      'Permanent Augment',
      `Passive upgrade from "${prompt.slice(0, 30) || 'training'}"`,
      rarities[i],
      mods,
    ),
  );
}
