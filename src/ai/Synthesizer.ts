import {
  balanceAbilitySchema,
  balancePassiveModifiers,
  scoreAbilitySchema,
} from './BudgetEngine';
import type {
  CardRarity,
  DraftCard,
  PassiveModifierPayload,
  PlayerLoadout,
} from '../types/cards';
import { validateDraftCards } from '../types/cards';
import type { AbilitySchema } from '../types/schema';

export const STORAGE_KEY_API = 'LUNA_AI_API_KEY';
export const STORAGE_KEY_BASE_URL = 'LUNA_AI_BASE_URL';
export const STORAGE_KEY_MODEL = 'LUNA_AI_MODEL';

export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const LEGACY_MODELS = new Set(['gpt-4o-mini', 'gemini-2.0-flash']);
const LEGACY_BASE_URL = 'https://api.openai.com/v1';

export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getAiSettings(): AiSettings {
  const storedModel = localStorage.getItem(STORAGE_KEY_MODEL);
  const storedBaseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL);
  const normalizedBaseUrl = storedBaseUrl?.replace(/\/+$/, '') ?? '';

  const model =
    !storedModel || LEGACY_MODELS.has(storedModel)
      ? DEFAULT_MODEL
      : storedModel;

  const baseUrl =
    !storedBaseUrl || normalizedBaseUrl === LEGACY_BASE_URL
      ? DEFAULT_BASE_URL
      : storedBaseUrl;

  return {
    apiKey: localStorage.getItem(STORAGE_KEY_API) ?? '',
    baseUrl,
    model,
  };
}

export function setAiSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY_API, settings.apiKey);
  localStorage.setItem(STORAGE_KEY_BASE_URL, settings.baseUrl);
  localStorage.setItem(STORAGE_KEY_MODEL, settings.model);
}

const SYSTEM_PROMPT = `You are a 2D physics ability synthesizer for a top-down kinetic arena game.
Output ONLY valid JSON with this exact shape: { "cards": [ DraftCard, DraftCard, DraftCard ] }

Each DraftCard must have:
- id, title, tagline, description (strings)
- rarity: "COMMON" | "RARE" | "EPIC" | "CHAOTIC"
- type: "ACTIVE_ABILITY" | "PASSIVE_UPGRADE"
- budgetCost: number
- abilityPayload (for ACTIVE_ABILITY): AbilitySchema with id, name, cooldownMs, recoilKick, optional trajectory, triggers[]
- passivePayload (for PASSIVE_UPGRADE): array of { stat, op, value }

AbilitySchema trajectories: LINEAR, RETURN_TO_SOURCE, ORBIT_ANCHOR, HOMING_SLERP, DISCONTINUOUS_BLINK
Field types: RADIAL_IMPULSE, VORTEX_TANGENT, FRICTION_OVERRIDE, MASS_ATTRACTOR
Triggers: ON_CAST, ON_TICK, ON_HIT, ON_EXPIRY, ON_RETURN
Actions: ADD_INSTABILITY, APPLY_IMPULSE, SPAWN_FIELD, SPAWN_CHILD_PROJECTILE, TELEPORT, MODIFY_STAT

Passive stats: MOVE_SPEED, ACCELERATION, LINEAR_DRAG, MASS, KNOCKBACK_RESISTANCE, COOLDOWN_REDUCTION_PCT
Passive ops: ADD, MULTIPLY

Use kinetic concepts: impulses, vortices, friction patches, homing arcs, boomerangs, teleports.
Return exactly 3 cards: mix of active abilities and at least one passive upgrade.`;

function balanceCard(card: DraftCard): DraftCard {
  const balanced = { ...card };

  if (balanced.type === 'ACTIVE_ABILITY' && balanced.abilityPayload) {
    balanced.abilityPayload = balanceAbilitySchema(balanced.abilityPayload);
    balanced.budgetCost = scoreAbilitySchema(balanced.abilityPayload);
  }

  if (balanced.type === 'PASSIVE_UPGRADE' && balanced.passivePayload) {
    balanced.passivePayload = balancePassiveModifiers(balanced.passivePayload);
    balanced.budgetCost = balanced.passivePayload.length * 15;
  }

  return balanced;
}

function balanceCards(cards: DraftCard[]): DraftCard[] {
  return cards.map(balanceCard);
}

async function fetchLLMDraft(
  prompt: string,
  loadout: PlayerLoadout,
  settings: AiSettings,
): Promise<DraftCard[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const userPromptText = `Player prompt: "${prompt}"
Current loadout:
- LMB: ${loadout.abilities[0]?.name ?? 'Empty'}
- RMB: ${loadout.abilities[1]?.name ?? 'Empty'}
- Q: ${loadout.abilities[2]?.name ?? 'Empty'}
- E: ${loadout.abilities[3]?.name ?? 'Empty'}
- SPACE: ${loadout.abilities[4]?.name ?? 'Empty'}
- Passives: ${loadout.passives.length}

Generate 3 thematic draft cards based on the prompt.`;

    const cleanBaseUrl = settings.baseUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: settings.model.trim() || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPromptText },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content ?? '';
    if (typeof content !== 'string' || !content) return null;
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const parsed = JSON.parse(content);
    const validated = validateDraftCards(parsed);
    if (!validated) return null;

    return balanceCards(validated);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function makeActiveCard(
  id: string,
  title: string,
  tagline: string,
  description: string,
  rarity: CardRarity,
  schema: AbilitySchema,
): DraftCard {
  const balanced = balanceAbilitySchema(schema);
  return {
    id,
    title,
    tagline,
    description,
    rarity,
    type: 'ACTIVE_ABILITY',
    abilityPayload: balanced,
    budgetCost: scoreAbilitySchema(balanced),
  };
}

function makePassiveCard(
  id: string,
  title: string,
  tagline: string,
  description: string,
  rarity: CardRarity,
  modifiers: PassiveModifierPayload[],
): DraftCard {
  const balanced = balancePassiveModifiers(modifiers);
  return {
    id,
    title,
    tagline,
    description,
    rarity,
    type: 'PASSIVE_UPGRADE',
    passivePayload: balanced,
    budgetCost: balanced.length * 15,
  };
}

export function generateOfflineDraft(prompt: string): DraftCard[] {
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
      triggers: [{
        trigger: 'ON_CAST',
        actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'FRICTION_OVERRIDE', radius: 100, strength: 0, durationMs: 3000, frictionValue: 0.02 } }],
      }],
    };
    passiveMods = [{ stat: 'LINEAR_DRAG', op: 'MULTIPLY', value: 1.1 }];
  } else if (/\b(vortex|black hole|singularity|pull)\b/.test(p)) {
    commonSchema = {
      id: 'off_orbit',
      name: 'Orbital Shard',
      cooldownMs: 900,
      recoilKick: 70,
      trajectory: { type: 'ORBIT_ANCHOR', orbitRadius: 70, orbitSpeed: 4, maxRange: 800 },
      triggers: [{
        trigger: 'ON_EXPIRY',
        actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'MASS_ATTRACTOR', radius: 110, strength: 7000, durationMs: 2500 } }],
      }],
    };
    rareSchema = {
      id: 'off_vortex',
      name: 'Void Spiral',
      cooldownMs: 1100,
      recoilKick: 90,
      trajectory: { type: 'LINEAR', speed: 300, maxRange: 400 },
      triggers: [{
        trigger: 'ON_EXPIRY',
        actions: [{ type: 'SPAWN_FIELD', field: { fieldType: 'VORTEX_TANGENT', radius: 100, strength: -600, durationMs: 2500 } }],
      }],
    };
    passiveMods = [{ stat: 'MASS', op: 'MULTIPLY', value: 1.15 }];
  } else if (/\b(railgun|sniper|heavy)\b/.test(p)) {
    commonSchema = {
      id: 'off_rail',
      name: 'Kinetic Rail',
      cooldownMs: 1000,
      recoilKick: 400,
      trajectory: { type: 'LINEAR', speed: 1400, maxRange: 900 },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 1200 }, { type: 'ADD_INSTABILITY', amount: 40 }] }],
    };
    rareSchema = {
      id: 'off_pierce',
      name: 'Armor Piercer',
      cooldownMs: 1200,
      recoilKick: 300,
      trajectory: { type: 'LINEAR', speed: 1100, maxRange: 800, piercing: 2 },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 800 }] }],
    };
    passiveMods = [{ stat: 'COOLDOWN_REDUCTION_PCT', op: 'ADD', value: 10 }];
  } else if (/\b(dash|blink|phase|teleport|nova)\b/.test(p)) {
    commonSchema = {
      id: 'off_phase',
      name: 'Phase Dash',
      cooldownMs: 1200,
      recoilKick: 0,
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
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'ADD_INSTABILITY', amount: 15 }] }],
    };
    rareSchema = {
      id: 'off_homing_fast',
      name: 'Tracer Round',
      cooldownMs: 700,
      recoilKick: 50,
      trajectory: { type: 'HOMING_SLERP', speed: 500, maxRange: 600, turnAccel: 900 },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 400 }] }],
    };
    passiveMods = [
      { stat: 'MOVE_SPEED', op: 'MULTIPLY', value: 1.2 },
      { stat: 'ACCELERATION', op: 'MULTIPLY', value: 1.15 },
    ];
  } else if (/\b(shield|orbit)\b/.test(p)) {
    commonSchema = {
      id: 'off_shield_orbit',
      name: 'Guardian Orbit',
      cooldownMs: 1000,
      recoilKick: 20,
      trajectory: { type: 'ORBIT_ANCHOR', orbitRadius: 55, orbitSpeed: 5, maxRange: 800 },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'ADD_INSTABILITY', amount: 20 }] }],
    };
    rareSchema = {
      id: 'off_repulse',
      name: 'Repulsion Field',
      cooldownMs: 1100,
      recoilKick: 50,
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
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'APPLY_IMPULSE', baseForce: 500 }] }],
    };
    rareSchema = {
      id: 'off_arc',
      name: 'Arc Weaver',
      cooldownMs: 900,
      recoilKick: 80,
      trajectory: { type: 'RETURN_TO_SOURCE', speed: 320, maxRange: 450, turnAccel: 1000 },
      triggers: [{ trigger: 'ON_HIT', actions: [{ type: 'ADD_INSTABILITY', amount: 20 }] }],
    };
    passiveMods = [{ stat: 'MOVE_SPEED', op: 'ADD', value: 30 }];
  }

  const commonRarity: CardRarity = isChaotic ? 'CHAOTIC' : 'COMMON';
  const rareRarity: CardRarity = 'RARE';
  const passiveRarity: CardRarity = 'EPIC';

  return [
    makeActiveCard('card_common', commonSchema.name, 'Standard Issue', `A ${prompt.slice(0, 40) || 'kinetic'} ability`, commonRarity, commonSchema),
    makeActiveCard('card_rare', rareSchema.name, 'Advanced Variant', `Enhanced ${prompt.slice(0, 30) || 'combat'} mechanic`, rareRarity, rareSchema),
    makePassiveCard('card_passive', 'Evolution Buff', 'Permanent Augment', `Passive upgrade from "${prompt.slice(0, 30) || 'training'}"`, passiveRarity, passiveMods),
  ];
}

export async function synthesizeCards(
  prompt: string,
  loadout: PlayerLoadout,
): Promise<DraftCard[]> {
  const settings = getAiSettings();

  if (settings.apiKey.trim()) {
    const online = await fetchLLMDraft(prompt, loadout, settings);
    if (online) return online;
  }

  return generateOfflineDraft(prompt);
}
