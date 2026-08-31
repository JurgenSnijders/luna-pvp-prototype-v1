import {
  balanceAbilitySchema,
  balancePassiveModifiers,
  CATEGORY_BUDGETS,
  repairAbilitySemantics,
  sanitizeAbilitySchema,
  scoreAbilitySchema,
} from './BudgetEngine';
import { KINETIC_RECIPES } from '../devtools/Presets';
import type {
  CardRarity,
  DraftCard,
  EvolutionContext,
  PassiveModifierPayload,
  PlayerLoadout,
  SkillCategory,
} from '../types/cards';
import { CATEGORY_SLOT_MAP, getCategoryLabel, validateDraftCards } from '../types/cards';
import type {
  AbilitySchema,
  TrajectoryConfig,
  TriggerNode,
} from '../types/schema';
import { ACTION_TYPES, TRIGGER_TYPES, validateAbilitySchema } from '../types/schema';

export const STORAGE_KEY_API = 'LUNA_AI_API_KEY';
export const STORAGE_KEY_BASE_URL = 'LUNA_AI_BASE_URL';
export const STORAGE_KEY_MODEL = 'LUNA_AI_MODEL';

export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const LEGACY_MODELS = new Set(['gpt-4o-mini', 'gemini-2.0-flash']);
// Old OpenAI-compatible endpoints — migrated to the native Gemini endpoint below.
const LEGACY_BASE_URLS = new Set([
  'https://api.openai.com/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai',
]);

export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

let lastApiError: string | null = null;
let lastCallSucceeded = false;
let lastSynthesisSource: 'api' | 'heuristic' = 'heuristic';
let lastSynthesisError: string | null = null;

export function getApiConnectionStatus(): {
  online: boolean;
  model: string;
  lastError: string | null;
} {
  const settings = getAiSettings();
  return {
    online: settings.apiKey.trim().length > 0 && lastCallSucceeded,
    model: settings.model.trim() || DEFAULT_MODEL,
    lastError: lastApiError,
  };
}

export function getLastSynthesisMeta(): {
  source: 'api' | 'heuristic';
  error: string | null;
} {
  return { source: lastSynthesisSource, error: lastSynthesisError };
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
    !storedBaseUrl || LEGACY_BASE_URLS.has(normalizedBaseUrl)
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

const FORGE_SYSTEM_PROMPT = `You are a concept ideation engine for a 2D physics kinetic arena game.
You generate lightweight METADATA ONLY for 3 ability concepts — never physics, triggers, or schema data (that is generated in a later stage).
Output ONLY valid JSON with this exact shape: { "cards": [ Card, Card, Card ] }

Each Card must contain ONLY these fields:
- id (string, short slug)
- name (string, ability name)
- tagline (short string, 2-4 words)
- description (concise string, 1 sentence, under 80 characters)
- category (string, the requested SkillCategory)

Do NOT include abilityPayload, triggers, trajectory, visuals, rarity, budgetCost, or any other field.

Category design flavor:
- PRIMARY: rapid-fire skillshots, low payload, short cooldown pacing, ammo magazines
- SECONDARY: medium area/skillshot pressure, charged shots, combo chains
- UTILITY: crowd control, zones, friction patches, vortices, terrain mutation, obstacles, stasis traps
- ULTIMATE: high-impact screen presence, large fields, morphs, turrets/decoys, long cooldown pacing
- MOBILITY: displacement, teleports, dashes, stealth, escapes — prioritize movement over damage

Use kinetic concepts: impulses, vortices, friction patches, homing arcs, boomerangs, teleports, morphs, stealth, turrets/decoys, terrain mutation, obstacles, stasis, charged/channel/combo casting, heat/ammo/health-cost economies.
Return exactly 3 distinct ability concepts tuned for the requested category.`;

const EVOLUTION_SYSTEM_PROMPT = `You are a concept ideation engine evolving an existing ability for a 2D physics kinetic arena game.
You receive a base ability name and a player mutation request.
You generate lightweight METADATA ONLY for 3 evolved concepts — never physics, triggers, or schema data (that is generated in a later stage).
Output ONLY valid JSON with this exact shape: { "cards": [ Card, Card, Card ] }

Each Card must contain ONLY these fields:
- id (string, short slug)
- name (string, evolved ability name — preserve the base name's stem/identity)
- tagline (short string, 2-4 words)
- description (concise string, 1 sentence, under 80 characters, describing the mutation)
- category (string, the provided SkillCategory)

Do NOT include abilityPayload, evolutionDiff, triggers, trajectory, rarity, budgetCost, or any other field.

Rules:
- Preserve the core identity of the base spell (name stem) across all 3 variants
- Layer the requested mutation distinctly across the 3 variants (e.g. cluster/multi-payload, spatial field/trap, kinematic/motion augment, morph/stealth, terrain/obstacle, stasis, charged/channel/combo input, heat/ammo resource)
Return exactly 3 distinct evolved ability concepts.`;

const PASSIVE_SYSTEM_PROMPT = `You are a passive upgrade synthesizer for a 2D physics kinetic arena game.
Output ONLY valid JSON with this exact shape: { "cards": [ DraftCard, DraftCard, DraftCard ] }

Each DraftCard must have:
- id, title, tagline, description (strings)
- rarity: "COMMON" | "RARE" | "EPIC" | "CHAOTIC"
- type: "PASSIVE_UPGRADE"
- budgetCost: number
- passivePayload: array of { stat, op, value }

Keep description fields concise (1 sentence, under 80 characters). Prioritize valid JSON schema over prose.

Passive stats: MOVE_SPEED, ACCELERATION, LINEAR_DRAG, MASS, KNOCKBACK_RESISTANCE, COOLDOWN_REDUCTION_PCT
Passive ops: ADD, MULTIPLY

Return exactly 3 distinct PASSIVE_UPGRADE cards.`;

// Phase 2 (lazy compilation): single-ability physics compiler. Unlike FORGE/EVOLUTION,
// this targets exactly one already-chosen concept and returns the full AbilitySchema.
const COMPILER_SYSTEM_PROMPT = `You are a kinetic physics compiler for a 2D top-down arena game.
Output ONE AbilitySchema JSON object only — no array, no wrapper keys.

AbilitySchema: { id, name, cooldownMs, recoilKick, trajectory?, triggers[], visuals, inputProfile?, resourceCost? }
inputProfile: { mode: INSTANT|CHARGE_AND_RELEASE|CHANNELED|COMBO_CHAIN, minChargeMs?, maxChargeMs?, channelIntervalMs?, comboWindowMs? }
  CHARGE_AND_RELEASE: minChargeMs+maxChargeMs — power scales with hold time
  CHANNELED: channelIntervalMs — re-fires ON_CAST every interval while held
  COMBO_CHAIN: comboWindowMs — pair with COMBO_STEP conditions to branch per press
resourceCost: { type: COOLDOWN|HEAT|AMMO|HEALTH_PCT, cost, maxCapacity?, rechargeRate?, lockoutDurationMs? }
  HEAT: cost per shot, rechargeRate/sec, lockoutDurationMs on overheat — set cooldownMs 0
  AMMO: cost per shot, maxCapacity magazine, lockoutDurationMs reload time
  HEALTH_PCT: cost is percent of max health
trajectory: { type: LINEAR|RETURN_TO_SOURCE|ORBIT_ANCHOR|HOMING_SLERP|DISCONTINUOUS_BLINK, speed, maxRange, piercing?, turnAccel?, orbitRadius?, orbitSpeed?, blinkDistance? }
visuals: { color: hex, size: 4-32, projectileStyle, trailType, impactVfx, vfx?: { glowIntensity?:0-2, trailDensity?:0-2, trailLengthMs?, impactScale?:0.5-2, secondaryColor?:hex, blendMode?:NORMAL|ADDITIVE, shakeIntensity?:0-2, distortion?:0-1 } }
projectileStyle: DISC|BEAM|PULSING_ORB|SHURIKEN|CHAOS_LIGHTNING|PRISM|RUNE_SIGIL|PLASMA_TENDRIL|VOID_RIFT|CRYSTAL_SHARD
trailType: NONE|SMOKE|ICE_GLOW|MAGMA_SPARKS|NEON_RIBBON|EMBER_SPIRAL|FROST_CRYSTALS|VOID_TENDRIL|PLASMA_ARC|DUST_PUFF
impactVfx: SPARKS|SHOCKWAVE|ICE_BURST|VORTEX_SWIRL|MINI_NUKE|PLASMA_BLOOM|SHATTER|IMPLOSION|LIGHTNING_FORK|RUNE_FLASH
secondaryColor should contrast with color. glowIntensity tracks power (0.6 subtle, 1.2 strong, 1.8 ultimate).

TARGETING: ActionTarget = TARGET | CASTER | SELF — set explicitly on actions that accept target.
IMPULSE VECTORS: ImpulseDirectionMode = AWAY_FROM_ORIGIN | TOWARDS_CASTER | TOWARDS_ORIGIN | ALONG_TRAJECTORY | PERPENDICULAR_TRAJECTORY | CUSTOM
APPLY_IMPULSE: { baseForce, target?, directionMode?, direction? }
NEVER default to bare outward knockback for pull/tether/freeze intents. Always set target + directionMode on APPLY_IMPULSE.

TRIGGERS: ON_CAST | ON_TICK | ON_HIT | ON_EXPIRY | ON_RETURN | ON_RECAST | ON_HIT_WALL | ON_DISTANCE_TRAVELED | ON_HAZARD_CONTACT (projectile-only — requires root trajectory or SPAWN_PROJECTILE)
TriggerNode: { trigger, tickIntervalMs?, triggerDistance?, fireOnHitDeath?, conditions?, actions[], ifFalseActions?, children? }
  triggerDistance: required on ON_DISTANCE_TRAVELED (distance in world units before firing)
  fireOnHitDeath: optional boolean — fire trigger when projectile kills its target on hit
CONDITIONS:
  STAT_THRESHOLD { stat: health|instabilityPct, comparison: LT|GT|EQ|LTE|GTE, value, target? }
  TAG_CHECK { value: string, target? } — runtime entity tag, e.g. "in_lava"
  PROXIMITY_COUNT { radius, comparison, value, target? } — nearby entity count
  COMBO_STEP { comparison, value } — zero-indexed press in a COMBO_CHAIN
  SURFACE_TYPE { value: LAVA|SAFE, target? } — terrain type under the target position
SURFACE_TYPE queries terrain at a position; TAG_CHECK value:"in_lava" reads the entity tag set when standing in lava.

ACTIONS (use relational vectors, not generic knockback):
ADD_INSTABILITY { amount, target? }
APPLY_IMPULSE { baseForce, target?, directionMode? }
SPAWN_FIELD { field: { fieldType: RADIAL_IMPULSE|VORTEX_TANGENT|FRICTION_OVERRIDE|MASS_ATTRACTOR, radius, strength, durationMs, attachToSource?, frictionValue? } }
SPAWN_PROJECTILE { projectileTrajectory, emitter?: { count: 1-12, spreadDeg, distribution: FAN|RADIAL|RANDOM_CONE|PARALLEL }, triggers? }
SPAWN_CONSTRAINT { constraint: { type: SPRING_TETHER|DISTANCE_ROD|SURFACE_PIN, stiffness?, restLength?, durationMs }, source?, target? }
CAST_CHILD_PAYLOAD { payload: AbilitySchema, inheritVelocity?, inheritInstability?, maxRecursionDepth? }
MODIFY_STAT { stat, value, mode: add|set|multiply, target? }
TELEPORT { distance, target?, direction? }
APPLY_STASIS { durationMs, target?, forceAccumulatorScale? }
RELEASE_STASIS { target? }
REFLECT_PROJECTILES { target?, radius? }
SPAWN_OBSTACLE { obstacle: { shape: CIRCLE|BOX, width, height, durationMs, isDestructible?, maxHealth? }, target? }
MUTATE_TERRAIN { mutation: { type: SAFE|LAVA, radius, durationMs }, target? }
MORPH_ENTITY { morph: { radius?, mass?, speedMultiplier?, durationMs }, target? }
SPAWN_ACTOR { actor: { archetype: TURRET|DECOY, health, durationMs }, target? }
APPLY_STEALTH { durationMs, revealOnCast?, target? }

SPAWN PATH (required): root trajectory OR ON_CAST spawn (SPAWN_PROJECTILE/SPAWN_FIELD/TELEPORT/SPAWN_OBSTACLE). Do NOT put the only projectile solely on ON_HIT without a root trajectory.

SEMANTIC RECIPE BOOK (map user verbs to these patterns):
Harpoon/Pull: ON_HIT -> APPLY_IMPULSE { baseForce:600, target:"TARGET", directionMode:"TOWARDS_CASTER" } + SPAWN_CONSTRAINT { type:"SPRING_TETHER", source:"CASTER", target:"TARGET", durationMs:2000 }
Vortex/Black Hole: ON_TICK -> SPAWN_FIELD { fieldType:"MASS_ATTRACTOR", attachToSource:true, strength:5000, radius:90, durationMs:3000 }
Cluster/MIRV: ON_EXPIRY -> CAST_CHILD_PAYLOAD { inheritVelocity:true, maxRecursionDepth:1, payload:{ ON_CAST SPAWN_PROJECTILE fan } }
Stasis Trap: ON_HIT -> APPLY_STASIS { durationMs:3000, target:"TARGET" }
Ice Wall: ON_CAST -> SPAWN_OBSTACLE { shape:"BOX", isDestructible:true, target:"CASTER", width:80, height:24, durationMs:5000 }
Execute: ON_HIT conditions:[{ query:"STAT_THRESHOLD", stat:"health", comparison:"LT", value:30 }] -> APPLY_IMPULSE { baseForce:1200, target:"TARGET", directionMode:"AWAY_FROM_ORIGIN" }
Charged Shot: inputProfile:{ mode:"CHARGE_AND_RELEASE", minChargeMs:200, maxChargeMs:1200 } + trajectory LINEAR + ON_HIT APPLY_IMPULSE
Heat Flamer: inputProfile:{ mode:"CHANNELED", channelIntervalMs:100 } + resourceCost:{ type:"HEAT", cost:8, rechargeRate:20, lockoutDurationMs:2500 } + cooldownMs:0 + ON_CAST SPAWN_FIELD radial burst
Stasis Combo: inputProfile:{ mode:"COMBO_CHAIN", comboWindowMs:3000 } + two ON_CAST nodes with conditions COMBO_STEP EQ 0 (APPLY_STASIS CASTER) and EQ 1 (RELEASE_STASIS CASTER)
Crowd Breaker: ON_CAST conditions:[{ query:"PROXIMITY_COUNT", target:"CASTER", radius:120, comparison:"GTE", value:2 }] strong field + ifFalseActions weaker field
Iron Colossus: ON_CAST -> MORPH_ENTITY { target:"CASTER", morph:{ radius:32, mass:200, speedMultiplier:0.6, durationMs:6000 } }
Tripwire Bomb: trajectory LINEAR + ON_DISTANCE_TRAVELED triggerDistance:300 -> SPAWN_FIELD radial impulse

Set inputProfile and/or resourceCost whenever the concept implies charging, channeling, combos, overheating, magazines, or health cost.

VISUAL RECIPE BOOK (pair archetype to visuals):
Frost: color #88ddff, secondaryColor #ffffff, projectileStyle CRYSTAL_SHARD, trailType FROST_CRYSTALS, impactVfx ICE_BURST, vfx.glowIntensity 1.0
Fire: color #ff6622, secondaryColor #ffcc44, trailType EMBER_SPIRAL or MAGMA_SPARKS, impactVfx PLASMA_BLOOM, blendMode ADDITIVE
Void: color #220044, secondaryColor #cc66ff, projectileStyle VOID_RIFT, trailType VOID_TENDRIL, impactVfx IMPLOSION, glowIntensity 1.4
Lightning: color #aaffcc, secondaryColor #ffffff, projectileStyle CHAOS_LIGHTNING, trailType PLASMA_ARC, impactVfx LIGHTNING_FORK
Holy: color #ffdd88, secondaryColor #fff8e0, projectileStyle RUNE_SIGIL, impactVfx RUNE_FLASH, shakeIntensity 0.8
Toxic: color #66ff44, secondaryColor #ccff99, trailType DUST_PUFF, impactVfx SHATTER
Kinetic: color #00e5ff, secondaryColor #88eeff, projectileStyle DISC or BEAM, trailType NONE, impactVfx SPARKS
Arcane: color #aa44ff, secondaryColor #ff88ff, projectileStyle PRISM, trailType NEON_RIBBON, impactVfx VORTEX_SWIRL

Match visuals to concept. Prefer constraints, fields, stasis, child payloads, and relational impulses over plain ADD_INSTABILITY spam.`;

function balanceCard(card: DraftCard, category: SkillCategory = 'SECONDARY'): DraftCard {
  const balanced = { ...card };
  balanced.category = balanced.category ?? category;

  if (balanced.type === 'ACTIVE_ABILITY' && balanced.abilityPayload) {
    balanced.abilityPayload = balanceAbilitySchema(
      sanitizeAbilitySchema(balanced.abilityPayload, balanced.category ?? category),
      balanced.category ?? category,
    );
    balanced.budgetCost = scoreAbilitySchema(balanced.abilityPayload);
  }

  if (balanced.type === 'PASSIVE_UPGRADE' && balanced.passivePayload) {
    balanced.passivePayload = balancePassiveModifiers(balanced.passivePayload);
    balanced.budgetCost = balanced.passivePayload.length * 15;
  }

  return balanced;
}

function balanceCards(cards: DraftCard[], category: SkillCategory = 'SECONDARY'): DraftCard[] {
  return cards.map((c) => balanceCard(c, category));
}

function loadoutSummary(loadout: PlayerLoadout): string {
  return `Current loadout:
- LMB: ${loadout.abilities[0]?.name ?? 'Empty'}
- RMB: ${loadout.abilities[1]?.name ?? 'Empty'}
- Q: ${loadout.abilities[2]?.name ?? 'Empty'}
- E: ${loadout.abilities[3]?.name ?? 'Empty'}
- SPACE: ${loadout.abilities[4]?.name ?? 'Empty'}
- Passives: ${loadout.passives.length}`;
}

function diagnoseDraftCardsValidation(val: unknown): string[] {
  const reasons: string[] = [];

  if (val === null || typeof val !== 'object') {
    reasons.push('root:not_object');
    return reasons;
  }

  let cards: unknown[] | null = null;
  if (Array.isArray(val)) {
    cards = val;
    reasons.push(`root:top_level_array length=${val.length}`);
  } else {
    const root = val as Record<string, unknown>;
    reasons.push(`root:keys=${Object.keys(root).join(',') || '(none)'}`);
    if (Array.isArray(root.cards)) {
      cards = root.cards;
      reasons.push(`root:cards_array length=${root.cards.length}`);
    } else {
      reasons.push('root:missing_cards_array');
      return reasons;
    }
  }

  if (!cards) return reasons;
  if (cards.length !== 3) reasons.push(`cards:expected_3 got_${cards.length}`);

  const rarities = new Set(['COMMON', 'RARE', 'EPIC', 'CHAOTIC']);
  const cardTypes = new Set(['ACTIVE_ABILITY', 'PASSIVE_UPGRADE']);

  cards.forEach((raw, i) => {
    if (raw === null || typeof raw !== 'object') {
      reasons.push(`card[${i}]:not_object`);
      return;
    }
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string') reasons.push(`card[${i}]:missing_id`);
    // Stage 1 metadata cards use "name" instead of "title" — either satisfies the check.
    if (typeof c.title !== 'string' && typeof c.name !== 'string') {
      reasons.push(`card[${i}]:missing_title`);
    }
    if (typeof c.tagline !== 'string') reasons.push(`card[${i}]:missing_tagline`);
    if (typeof c.description !== 'string') reasons.push(`card[${i}]:missing_description`);
    // rarity/type/budgetCost are optional now (defaulted by validateDraftCard) — only
    // flag them when present-but-invalid, not merely absent.
    if (c.rarity !== undefined && (typeof c.rarity !== 'string' || !rarities.has(c.rarity))) {
      reasons.push(`card[${i}]:invalid_rarity=${String(c.rarity)}`);
    }
    if (c.type !== undefined && (typeof c.type !== 'string' || !cardTypes.has(c.type))) {
      reasons.push(`card[${i}]:invalid_type=${String(c.type)}`);
    }
    if (
      c.budgetCost !== undefined &&
      (typeof c.budgetCost !== 'number' || !Number.isFinite(c.budgetCost))
    ) {
      reasons.push(`card[${i}]:invalid_budgetCost=${String(c.budgetCost)}`);
    }

    // abilityPayload is optional for metadata-only forge/evolve cards — only diagnose
    // it when present but malformed, not merely absent.
    if (c.type === 'ACTIVE_ABILITY' && c.abilityPayload !== undefined) {
      if (!validateAbilitySchema(c.abilityPayload)) {
        const payload = c.abilityPayload as Record<string, unknown>;
        reasons.push(
          `card[${i}]:abilityPayload_invalid keys=${Object.keys(payload ?? {}).join(',')}`,
        );
        if (typeof payload?.id !== 'string') reasons.push(`card[${i}]:ability_missing_id`);
        if (typeof payload?.name !== 'string') reasons.push(`card[${i}]:ability_missing_name`);
        if (!Array.isArray(payload?.triggers)) reasons.push(`card[${i}]:ability_missing_triggers`);
        if (payload?.trajectory !== undefined) {
          const traj = payload.trajectory as Record<string, unknown>;
          reasons.push(`card[${i}]:trajectory_type=${String(traj?.type)}`);
        }
        reasons.push(...diagnoseAbilityPayload(c.abilityPayload, i));
        reasons.push(...diagnoseAbilitySchemaSteps(c.abilityPayload, i));
      }
    }

    if (c.type === 'PASSIVE_UPGRADE' && !Array.isArray(c.passivePayload)) {
      reasons.push(`card[${i}]:missing_passivePayload`);
    }
  });

  return reasons;
}

function diagnoseAbilityPayload(payload: unknown, cardIndex: number): string[] {
  const reasons: string[] = [];
  if (payload === null || typeof payload !== 'object') {
    reasons.push(`card[${cardIndex}]:ability_not_object`);
    return reasons;
  }

  const p = payload as Record<string, unknown>;
  if (typeof p.cooldownMs === 'string') {
    reasons.push(`card[${cardIndex}]:cooldownMs_is_string`);
  } else if (typeof p.cooldownMs !== 'number') {
    reasons.push(`card[${cardIndex}]:cooldownMs_type=${typeof p.cooldownMs}`);
  }
  if (typeof p.recoilKick === 'string') {
    reasons.push(`card[${cardIndex}]:recoilKick_is_string`);
  } else if (typeof p.recoilKick !== 'number') {
    reasons.push(`card[${cardIndex}]:recoilKick_type=${typeof p.recoilKick}`);
  }

  if (
    p.metadata !== undefined &&
    (p.metadata === null || typeof p.metadata !== 'object' || Array.isArray(p.metadata))
  ) {
    reasons.push(`card[${cardIndex}]:metadata_invalid_type=${typeof p.metadata}`);
  }

  if (p.trajectory !== undefined && typeof p.trajectory === 'object' && p.trajectory !== null) {
    const traj = p.trajectory as Record<string, unknown>;
    for (const key of ['speed', 'maxRange', 'piercing', 'turnAccel']) {
      if (typeof traj[key] === 'string') {
        reasons.push(`card[${cardIndex}]:trajectory_${key}_is_string`);
      }
    }
  }

  if (!Array.isArray(p.triggers)) {
    reasons.push(`card[${cardIndex}]:triggers_not_array`);
    return reasons;
  }

  const validTriggers = TRIGGER_TYPES;
  const validActions = ACTION_TYPES;

  p.triggers.forEach((raw, ti) => {
    if (raw === null || typeof raw !== 'object') {
      reasons.push(`card[${cardIndex}]:trigger[${ti}]:not_object`);
      return;
    }
    const trig = raw as Record<string, unknown>;
    const triggerVal = trig.trigger ?? trig.on;
    if (typeof triggerVal !== 'string' || !validTriggers.has(triggerVal)) {
      reasons.push(`card[${cardIndex}]:trigger[${ti}]:invalid=${String(triggerVal)}`);
      if (trig.on !== undefined && trig.trigger === undefined) {
        reasons.push(`card[${cardIndex}]:trigger[${ti}]:uses_on_key`);
      }
    }
    if (!Array.isArray(trig.actions)) {
      reasons.push(`card[${cardIndex}]:trigger[${ti}]:missing_actions`);
      return;
    }
    trig.actions.forEach((rawAction, ai) => {
      if (rawAction === null || typeof rawAction !== 'object') {
        reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:not_object`);
        return;
      }
      const action = rawAction as Record<string, unknown>;
      if (typeof action.type !== 'string' || !validActions.has(action.type)) {
        reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:invalid_type=${String(action.type)}`);
      }
      if (action.type === 'SPAWN_FIELD' && action.field && typeof action.field === 'object') {
        const field = action.field as Record<string, unknown>;
        if (typeof field.fieldType === 'string' && !['RADIAL_IMPULSE', 'VORTEX_TANGENT', 'FRICTION_OVERRIDE', 'MASS_ATTRACTOR'].includes(field.fieldType)) {
          reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:invalid_fieldType=${field.fieldType}`);
        }
        for (const key of ['radius', 'strength', 'durationMs']) {
          if (typeof field[key] === 'string') {
            reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:field_${key}_is_string`);
          }
        }
      }
      for (const key of ['amount', 'baseForce', 'distance', 'value']) {
        if (typeof action[key] === 'string') {
          reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:${key}_is_string`);
        }
      }
    });
  });

  return reasons;
}

function diagnoseAbilitySchemaSteps(payload: unknown, cardIndex: number): string[] {
  const reasons: string[] = [];
  if (payload === null || typeof payload !== 'object') {
    reasons.push(`card[${cardIndex}]:schema:not_object`);
    return reasons;
  }

  const p = payload as Record<string, unknown>;
  if (typeof p.cooldownMs !== 'number' || !Number.isFinite(p.cooldownMs)) {
    reasons.push(`card[${cardIndex}]:schema:cooldownMs=${String(p.cooldownMs)}`);
  }
  if (typeof p.recoilKick !== 'number' || !Number.isFinite(p.recoilKick)) {
    reasons.push(`card[${cardIndex}]:schema:recoilKick=${String(p.recoilKick)}`);
  }

  if (!Array.isArray(p.triggers)) {
    reasons.push(`card[${cardIndex}]:schema:triggers_type=${typeof p.triggers}`);
    return reasons;
  }

  p.triggers.forEach((raw, ti) => {
    if (raw === null || typeof raw !== 'object') {
      reasons.push(`card[${cardIndex}]:schema:trigger[${ti}]:not_object`);
      return;
    }
    const trig = raw as Record<string, unknown>;
    if (!Array.isArray(trig.actions)) {
      reasons.push(
        `card[${cardIndex}]:schema:trigger[${ti}]:actions_type=${typeof trig.actions}`,
      );
      return;
    }
    const triggerProbe = {
      id: 'probe_trigger',
      name: 'probe',
      cooldownMs: 100,
      recoilKick: 0,
      triggers: [trig],
    };
    if (!validateAbilitySchema(triggerProbe)) {
      reasons.push(`card[${cardIndex}]:schema:trigger[${ti}]_invalid`);
    }
  });

  if (p.trajectory !== undefined) {
    const trajectoryProbe = {
      id: 'probe_trajectory',
      name: 'probe',
      cooldownMs: 100,
      recoilKick: 0,
      triggers: [],
      trajectory: p.trajectory,
    };
    if (!validateAbilitySchema(trajectoryProbe)) {
      reasons.push(`card[${cardIndex}]:schema:trajectory_block_invalid`);
    }
    const traj = p.trajectory as Record<string, unknown>;
    for (const key of ['speed', 'maxRange', 'piercing', 'turnAccel', 'orbitRadius', 'orbitSpeed']) {
      const val = traj[key];
      if (val !== undefined && (typeof val !== 'number' || !Number.isFinite(val))) {
        reasons.push(`card[${cardIndex}]:schema:trajectory.${key}=${String(val)}`);
      }
    }
  }

  if (!validateAbilitySchema(payload)) {
    reasons.push(`card[${cardIndex}]:schema:validate_failed`);
  }

  return reasons;
}

const TRIGGER_ALIASES: Record<string, TriggerNode['trigger']> = {
  ON_IMPACT: 'ON_HIT',
  ON_COLLISION: 'ON_HIT',
  ON_CONTACT: 'ON_HIT',
  ON_DESTROY: 'ON_EXPIRY',
  ON_DEATH: 'ON_EXPIRY',
  ON_SPAWN: 'ON_CAST',
  ON_DETONATE: 'ON_RECAST',
  ON_WALL_HIT: 'ON_HIT_WALL',
};

const ACTION_ALIASES: Record<string, string> = {
  SPAWN_CHILD_PROJECTILE: 'SPAWN_PROJECTILE',
  SPAWN_PROJECTILE: 'SPAWN_PROJECTILE',
  CREATE_PROJECTILE: 'SPAWN_PROJECTILE',
  SPAWN_FIELD_ZONE: 'SPAWN_FIELD',
  IMPULSE: 'APPLY_IMPULSE',
  INSTABILITY: 'ADD_INSTABILITY',
};

const FIELD_ALIASES: Record<string, string> = {
  VORTEX: 'VORTEX_TANGENT',
  IMPULSE: 'RADIAL_IMPULSE',
  RADIAL: 'RADIAL_IMPULSE',
  ATTRACTOR: 'MASS_ATTRACTOR',
  GRAVITY: 'MASS_ATTRACTOR',
  BLACK_HOLE: 'MASS_ATTRACTOR',
  SINGULARITY: 'MASS_ATTRACTOR',
  FRICTION: 'FRICTION_OVERRIDE',
  ICE: 'FRICTION_OVERRIDE',
};

const TRAJECTORY_ALIASES: Record<string, string> = {
  HOMING: 'HOMING_SLERP',
  SEEKER: 'HOMING_SLERP',
  BOOMERANG: 'RETURN_TO_SOURCE',
  ORBIT: 'ORBIT_ANCHOR',
  BLINK: 'DISCONTINUOUS_BLINK',
  LASER: 'LINEAR',
  BEAM: 'LINEAR',
  PROJECTILE: 'LINEAR',
  BOLT: 'LINEAR',
  SHOT: 'LINEAR',
  RAIL: 'LINEAR',
  RAILGUN: 'LINEAR',
};

const VALID_TRAJECTORY_TYPES = new Set([
  'LINEAR',
  'RETURN_TO_SOURCE',
  'ORBIT_ANCHOR',
  'HOMING_SLERP',
  'DISCONTINUOUS_BLINK',
]);

const VALID_TRAIL_TYPES = new Set([
  'NONE', 'SMOKE', 'ICE_GLOW', 'MAGMA_SPARKS', 'NEON_RIBBON',
  'EMBER_SPIRAL', 'FROST_CRYSTALS', 'VOID_TENDRIL', 'PLASMA_ARC', 'DUST_PUFF',
]);
const VALID_IMPACT_VFX = new Set([
  'SPARKS', 'SHOCKWAVE', 'ICE_BURST', 'VORTEX_SWIRL', 'MINI_NUKE',
  'PLASMA_BLOOM', 'SHATTER', 'IMPLOSION', 'LIGHTNING_FORK', 'RUNE_FLASH',
]);
const VALID_PROJECTILE_STYLES = new Set([
  'DISC', 'BEAM', 'PULSING_ORB', 'SHURIKEN', 'CHAOS_LIGHTNING',
  'PRISM', 'RUNE_SIGIL', 'PLASMA_TENDRIL', 'VOID_RIFT', 'CRYSTAL_SHARD',
]);

const PROJECTILE_STYLE_ALIASES: Record<string, string> = {
  LASER: 'BEAM',
  RAIL: 'BEAM',
  RAILGUN: 'BEAM',
  BOLT: 'DISC',
  ORB: 'PULSING_ORB',
  BOMB: 'PULSING_ORB',
  BLADE: 'SHURIKEN',
  STAR: 'SHURIKEN',
  SPINNING: 'SHURIKEN',
  LIGHTNING: 'CHAOS_LIGHTNING',
  ELECTRIC: 'CHAOS_LIGHTNING',
  CHAOS: 'CHAOS_LIGHTNING',
  ARC: 'CHAOS_LIGHTNING',
  CRYSTAL: 'CRYSTAL_SHARD',
  SHARD: 'CRYSTAL_SHARD',
  PRISMATIC: 'PRISM',
  FACET: 'PRISM',
  RUNE: 'RUNE_SIGIL',
  SIGIL: 'RUNE_SIGIL',
  GLYPH: 'RUNE_SIGIL',
  PLASMA: 'PLASMA_TENDRIL',
  TENDRIL: 'PLASMA_TENDRIL',
  VOID: 'VOID_RIFT',
  RIFT: 'VOID_RIFT',
  DARK: 'VOID_RIFT',
};

function normalizeEnumToken(value: string, aliases: Record<string, string>): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return aliases[compact] ?? compact;
}

function normalizeTriggerAlias(trigger: string): string {
  return normalizeEnumToken(trigger, TRIGGER_ALIASES as Record<string, string>);
}

function normalizeActionAlias(actionType: string): string {
  return normalizeEnumToken(actionType, ACTION_ALIASES);
}

function normalizeFieldTypeAlias(fieldType: string): string {
  return normalizeEnumToken(fieldType, FIELD_ALIASES);
}

function coerceNumericFields(obj: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      obj[key] = Number(v);
    }
  }
}

function filterValidActions(actions: unknown[]): unknown[] {
  return actions
    .map(repairActionPayload)
    .filter((action) => {
      if (action === null || typeof action !== 'object') return false;
      const type = (action as Record<string, unknown>).type;
      return typeof type === 'string' && type.length > 0;
    });
}

function repairModifyStatAction(obj: Record<string, unknown>): void {
  if (obj.type !== 'MODIFY_STAT') return;
  if (typeof obj.stat === 'string') {
    const raw = obj.stat.trim();
    const lower = raw.toLowerCase();
    const statMap: Record<string, string> = {
      mass: 'mass',
      linear_drag: 'linearDrag',
      lineardrag: 'linearDrag',
      move_speed: 'moveSpeed',
      movespeed: 'moveSpeed',
      instability: 'instabilityPct',
      instabilitypct: 'instabilityPct',
    };
    obj.stat = statMap[lower] ?? statMap[lower.replace(/_/g, '')] ?? lower;
  }
  if (typeof obj.mode === 'string') {
    obj.mode = obj.mode.toLowerCase();
  }
  coerceNumericFields(obj, ['value']);
}

function stripNullFields(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      delete obj[key];
    }
  }
}

function ensureFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function repairVisualDescriptor(raw: unknown): Record<string, unknown> {
  const obj =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  stripNullFields(obj);
  coerceNumericFields(obj, ['size']);
  const trail =
    typeof obj.trailType === 'string' ? obj.trailType.toUpperCase() : 'NONE';
  const impact =
    typeof obj.impactVfx === 'string' ? obj.impactVfx.toUpperCase() : 'SPARKS';
  const styleRaw =
    typeof obj.projectileStyle === 'string'
      ? normalizeEnumToken(obj.projectileStyle, PROJECTILE_STYLE_ALIASES)
      : 'DISC';
  const result: Record<string, unknown> = {
    color: typeof obj.color === 'string' && obj.color.trim() ? obj.color : '#00e5ff',
    size: Math.max(4, Math.min(32, ensureFiniteNumber(obj.size, 8))),
    projectileStyle: VALID_PROJECTILE_STYLES.has(styleRaw) ? styleRaw : 'DISC',
    trailType: VALID_TRAIL_TYPES.has(trail) ? trail : 'NONE',
    impactVfx: VALID_IMPACT_VFX.has(impact) ? impact : 'SPARKS',
  };
  if (obj.vfx !== null && typeof obj.vfx === 'object') {
    result.vfx = obj.vfx;
  }
  return result;
}

function repairTrajectoryConfig(traj: unknown): unknown {
  if (traj === null || typeof traj !== 'object') {
    return { type: 'LINEAR', speed: 400, maxRange: 500 };
  }
  const t = { ...(traj as Record<string, unknown>) };
  stripNullFields(t);
  if (typeof t.type === 'string') {
    t.type = normalizeEnumToken(t.type, TRAJECTORY_ALIASES);
  }
  if (typeof t.type !== 'string' || !VALID_TRAJECTORY_TYPES.has(t.type)) {
    t.type = 'LINEAR';
  }
  coerceNumericFields(t, [
    'speed',
    'maxRange',
    'piercing',
    'turnAccel',
    'orbitRadius',
    'orbitSpeed',
    'blinkDistance',
  ]);
  return t;
}

function repairFieldConfig(field: unknown): unknown {
  if (field === null || typeof field !== 'object') return field;
  const f = { ...(field as Record<string, unknown>) };
  stripNullFields(f);
  if (typeof f.fieldType === 'string') {
    f.fieldType = normalizeFieldTypeAlias(f.fieldType);
  }
  if (f.durationMs === undefined && f.duration !== undefined) {
    f.durationMs = f.duration;
    delete f.duration;
  }
  if (typeof f.fieldType === 'string') {
    f.radius = ensureFiniteNumber(f.radius, 80);
    f.strength = ensureFiniteNumber(f.strength, 500);
    f.durationMs = ensureFiniteNumber(f.durationMs, 2000);
  }
  return f;
}

function repairActionPayload(action: unknown): unknown {
  if (action === null || typeof action !== 'object') return action;
  const obj = { ...(action as Record<string, unknown>) };
  stripNullFields(obj);

  if (obj.baseForce === undefined && obj.force !== undefined) {
    obj.baseForce = obj.force;
    delete obj.force;
  }
  if (obj.amount === undefined && obj.instability !== undefined) {
    obj.amount = obj.instability;
    delete obj.instability;
  }
  if (typeof obj.type === 'string') {
    obj.type = normalizeActionAlias(obj.type);
  }
  repairModifyStatAction(obj);
  coerceNumericFields(obj, ['amount', 'baseForce', 'distance', 'value', 'aimOffsetDeg']);
  if (obj.type === 'APPLY_IMPULSE') {
    obj.baseForce = ensureFiniteNumber(obj.baseForce, 400);
  }
  if (obj.type === 'ADD_INSTABILITY') {
    obj.amount = ensureFiniteNumber(obj.amount, 20);
  }
  if (obj.type === 'TELEPORT') {
    obj.distance = ensureFiniteNumber(obj.distance, 100);
  }
  if (obj.field !== undefined) {
    obj.field = repairFieldConfig(obj.field);
  }
  if (obj.type === 'SPAWN_PROJECTILE') {
    if (obj.projectileTrajectory === undefined && obj.trajectory !== undefined) {
      obj.projectileTrajectory = obj.trajectory;
      delete obj.trajectory;
    }
    obj.projectileTrajectory = repairTrajectoryConfig(obj.projectileTrajectory);
    if (obj.visuals !== undefined) {
      obj.visuals = repairVisualDescriptor(obj.visuals);
    }
    if (obj.emitter === undefined || typeof obj.emitter !== 'object') {
      obj.emitter = {
        count: 1,
        spreadDeg: 0,
        distribution: 'FAN',
        ...(obj.aimOffsetDeg !== undefined
          ? { aimOffsetDeg: ensureFiniteNumber(obj.aimOffsetDeg, 0) }
          : {}),
      };
    } else {
      const emitter = { ...(obj.emitter as Record<string, unknown>) };
      coerceNumericFields(emitter, ['count', 'spreadDeg', 'aimOffsetDeg', 'inheritVelocityRatio']);
      if (typeof emitter.distribution !== 'string') emitter.distribution = 'FAN';
      if (emitter.count === undefined) emitter.count = 1;
      if (emitter.spreadDeg === undefined) {
        emitter.spreadDeg = ensureFiniteNumber(emitter.count, 1) > 1 ? 30 : 0;
      }
      if (obj.aimOffsetDeg !== undefined && emitter.aimOffsetDeg === undefined) {
        emitter.aimOffsetDeg = ensureFiniteNumber(obj.aimOffsetDeg, 0);
      }
      obj.emitter = emitter;
    }
    delete obj.aimOffsetDeg;
  } else if (obj.trajectory !== undefined) {
    obj.trajectory = repairTrajectoryConfig(obj.trajectory);
  }
  if (Array.isArray(obj.triggers)) {
    obj.triggers = obj.triggers.map(repairTriggerNode);
  }
  if (obj.type === 'CAST_CHILD_PAYLOAD' && obj.payload !== undefined) {
    obj.payload = repairAbilityPayload(obj.payload);
  }

  return obj;
}

function repairTriggerNode(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  const obj = { ...(node as Record<string, unknown>) };
  stripNullFields(obj);

  if (obj.trigger === undefined && typeof obj.on === 'string') {
    obj.trigger = obj.on;
    delete obj.on;
  }
  if (!Array.isArray(obj.actions) && Array.isArray(obj.effects)) {
    obj.actions = obj.effects;
    delete obj.effects;
  }
  if (!Array.isArray(obj.actions) && obj.actions && typeof obj.actions === 'object') {
    obj.actions = [obj.actions];
  }
  if (!Array.isArray(obj.actions)) {
    obj.actions = [];
  }
  if (typeof obj.trigger === 'string') {
    obj.trigger = normalizeTriggerAlias(obj.trigger);
  }
  obj.actions = filterValidActions(obj.actions as unknown[]);
  if (Array.isArray(obj.ifFalseActions)) {
    obj.ifFalseActions = filterValidActions(obj.ifFalseActions as unknown[]);
  }
  if (Array.isArray(obj.children)) {
    obj.children = obj.children.map(repairTriggerNode);
  }

  return obj;
}

function repairTriggersField(triggers: unknown): unknown[] {
  if (Array.isArray(triggers)) {
    return triggers.map(repairTriggerNode) as unknown[];
  }
  if (triggers !== null && typeof triggers === 'object') {
    return Object.entries(triggers as Record<string, unknown>).map(([key, val]) => {
      if (val && typeof val === 'object' && !Array.isArray(val) && 'type' in val) {
        return repairTriggerNode({ trigger: key, actions: [val] });
      }
      if (val && typeof val === 'object' && !Array.isArray(val) && 'actions' in val) {
        return repairTriggerNode({ trigger: key, ...(val as Record<string, unknown>) });
      }
      return repairTriggerNode({ trigger: key, actions: val });
    }) as unknown[];
  }
  return [];
}

function repairAbilityPayload(payload: unknown, description?: string): unknown {
  if (payload === null || typeof payload !== 'object') return payload;
  const obj = { ...(payload as Record<string, unknown>) };
  stripNullFields(obj);

  obj.cooldownMs = ensureFiniteNumber(obj.cooldownMs, 800);
  obj.recoilKick = ensureFiniteNumber(obj.recoilKick, 50);

  if (obj.trajectory !== undefined) {
    obj.trajectory = repairTrajectoryConfig(obj.trajectory);
  }
  if (obj.visuals !== undefined) {
    obj.visuals = repairVisualDescriptor(obj.visuals);
  }
  obj.triggers = repairTriggersField(obj.triggers);
  if (
    obj.metadata !== undefined &&
    (obj.metadata === null || typeof obj.metadata !== 'object' || Array.isArray(obj.metadata))
  ) {
    delete obj.metadata;
  }

  if (description) {
    const category = 'SECONDARY' as SkillCategory;
    const sanitized = sanitizeAbilitySchema(obj, category);
    const semantic = repairAbilitySemantics(sanitized, description);
    return semantic;
  }

  return obj;
}

const METADATA_RARITY_CYCLE: CardRarity[] = ['COMMON', 'RARE', 'EPIC'];
const VALID_CARD_RARITIES = new Set(['COMMON', 'RARE', 'EPIC', 'CHAOTIC']);

function repairDraftCard(card: unknown, index = 0): unknown {
  if (card === null || typeof card !== 'object') return card;
  const obj = { ...(card as Record<string, unknown>) };
  if (typeof obj.type === 'string') {
    obj.type = obj.type.toUpperCase();
  }
  if (typeof obj.rarity === 'string') {
    obj.rarity = obj.rarity.toUpperCase();
  }
  if (typeof obj.rarity !== 'string' || !VALID_CARD_RARITIES.has(obj.rarity)) {
    // Metadata-only cards from the token-diet prompts omit rarity — cycle for visual variety
    // instead of collapsing all 3 drafts to the same default.
    obj.rarity = METADATA_RARITY_CYCLE[index % METADATA_RARITY_CYCLE.length];
  }
  if (typeof obj.budgetCost !== 'number' || !Number.isFinite(obj.budgetCost)) {
    // No physics payload yet to score — 0 signals "unscored" rather than implying a real budget.
    obj.budgetCost = ensureFiniteNumber(obj.budgetCost, 0);
  }
  if (obj.abilityPayload !== undefined) {
    const cardTitle = typeof obj.title === 'string' ? obj.title : typeof obj.name === 'string' ? obj.name : '';
    const cardDesc = typeof obj.description === 'string' ? obj.description : '';
    const description = `${cardTitle} ${cardDesc}`.trim();
    const repaired = repairAbilityPayload(obj.abilityPayload, description || undefined);
    const category =
      typeof obj.category === 'string' ? (obj.category as SkillCategory) : 'SECONDARY';
    obj.abilityPayload = sanitizeAbilitySchema(repaired, category);
  }
  return obj;
}

function summarizeValidationFailure(diagnosis: string[], normalizedDiagnosis: string[]): string {
  const all = [...diagnosis, ...normalizedDiagnosis];
  const detailed = all.filter(
    (r) =>
      r.includes('schema:') ||
      r.includes('trigger[') ||
      r.includes('_is_string') ||
      r.includes('_type=') ||
      r.includes('invalid_type') ||
      r.includes('invalid_fieldType') ||
      r.includes('invalid=') ||
      r.includes('uses_on_key') ||
      r.includes('metadata_invalid') ||
      r.includes('missing_actions'),
  );
  const nonGeneric = detailed.length > 0
    ? detailed
    : all.filter((r) => !r.includes('abilityPayload_invalid'));
  const summary = (nonGeneric.length > 0 ? nonGeneric : all).slice(0, 8);
  return summary.join('; ');
}

function deepNormalizeLLMValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepNormalizeLLMValue);
  }

  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'trigger' && typeof v === 'string') {
        out[k] = normalizeTriggerAlias(v);
      } else if (k === 'fieldType' && typeof v === 'string') {
        out[k] = normalizeFieldTypeAlias(v);
      } else if (k === 'metadata') {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          out[k] = deepNormalizeLLMValue(v);
        }
      } else {
        out[k] = deepNormalizeLLMValue(v);
      }
    }
    return out;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
  }

  return value;
}

function normalizeLLMResponse(parsed: unknown): unknown {
  const coerced = deepNormalizeLLMValue(parsed);

  if (coerced === null || typeof coerced !== 'object') return coerced;
  const root = coerced as Record<string, unknown>;

  if (Array.isArray(root.cards)) {
    root.cards = root.cards.map((c, i) => repairDraftCard(c, i));
    return root;
  }
  if (Array.isArray(coerced)) {
    return coerced.map((c, i) => repairDraftCard(c, i));
  }

  return coerced;
}

function coerceMessageContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

function jsonErrorContext(content: string, errorMsg: string): string {
  const posMatch = errorMsg.match(/position (\d+)/i);
  if (!posMatch) return '';
  const pos = Number(posMatch[1]);
  const start = Math.max(0, pos - 50);
  const end = Math.min(content.length, pos + 50);
  return ` near "...${content.slice(start, pos)}>>${content.slice(pos, end)}..."`;
}

function tryCloseTruncatedJson(text: string): string {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  let repaired = text;
  while (brackets > 0) {
    repaired += ']';
    brackets--;
  }
  while (braces > 0) {
    repaired += '}';
    braces--;
  }
  return repaired;
}

function buildJsonRepairCandidates(text: string): string[] {
  const variants = new Set<string>();
  const add = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed) variants.add(trimmed);
  };

  add(text);
  add(text.replace(/,\s*([}\]])/g, '$1'));
  add(text.replace(/,\s*,/g, ','));

  const noBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const noComments = noBlockComments.replace(/^\s*\/\/.*$/gm, '');
  add(noComments);
  add(noComments.replace(/,\s*([}\]])/g, '$1'));

  const unquotedKeys = noComments.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    '$1"$2":',
  );
  add(unquotedKeys);
  add(unquotedKeys.replace(/,\s*([}\]])/g, '$1'));

  const nullishFixed = noComments
    .replace(/\bundefined\b/g, 'null')
    .replace(/\bNaN\b/g, '0')
    .replace(/\b-Infinity\b/g, '-999999')
    .replace(/\bInfinity\b/g, '999999');
  add(nullishFixed);
  add(nullishFixed.replace(/,\s*([}\]])/g, '$1'));

  const singleQuoted = nullishFixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
  add(singleQuoted);
  add(singleQuoted.replace(/,\s*([}\]])/g, '$1'));

  add(tryCloseTruncatedJson(nullishFixed));
  add(tryCloseTruncatedJson(nullishFixed).replace(/,\s*([}\]])/g, '$1'));

  return [...variants];
}

function tryParseLLMJson(content: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const baseCandidates: string[] = [];
  const trimmed = content.trim();
  baseCandidates.push(trimmed);

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) baseCandidates.push(fenceMatch[1].trim());

  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    baseCandidates.push(trimmed.slice(braceStart, braceEnd + 1));
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    baseCandidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  const allCandidates = new Set<string>();
  for (const base of baseCandidates) {
    for (const repaired of buildJsonRepairCandidates(base)) {
      allCandidates.add(repaired);
    }
  }

  let lastError = 'unknown parse error';
  let lastCandidate = trimmed;
  for (const candidate of allCandidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'parse error';
      lastCandidate = candidate;
    }
  }

  return { ok: false, error: `${lastError}${jsonErrorContext(lastCandidate, lastError)}` };
}

interface NativeGeminiResult {
  ok: boolean;
  text: string;
  error: string | null;
}

/**
 * Shared native-Gemini `generateContent` transport used by both the 3-card draft path
 * (`callLLM`) and the single-card compiler (`compileAbilityPayload`). Callers own their own
 * JSON parsing/validation — this only handles the fetch, timeout, and raw text extraction.
 */
async function postNativeGemini(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  options: {
    timeoutMs: number;
    maxOutputTokens: number;
    logTag: string;
    signal?: AbortSignal;
  },
): Promise<NativeGeminiResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  // Compose the caller's signal (e.g. modal-close teardown) with the internal
  // timeout controller — either one aborts the underlying fetch.
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }

  try {
    // Native Gemini host is a hard architectural constraint — settings.baseUrl is
    // intentionally ignored here (it only drives legacy/inspector display concerns).
    const model = settings.model.trim() || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const apiStartTime = performance.now();
    console.log(`[Synthesizer] ${options.logTag} Initiating Gemini API request...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': settings.apiKey.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: options.maxOutputTokens,
        },
      }),
      signal: controller.signal,
    });

    const ttfb = performance.now() - apiStartTime;
    console.log(`[Synthesizer] ${options.logTag} Time To First Byte (TTFB): ${ttfb.toFixed(1)}ms`);

    if (!response.ok) {
      const body = (await response.text()).slice(0, 180);
      return { ok: false, text: '', error: `HTTP ${response.status}: ${body || response.statusText}` };
    }

    const data = await response.json();

    const totalTime = performance.now() - apiStartTime;
    console.log(`[Synthesizer] ${options.logTag} Total API Latency: ${totalTime.toFixed(1)}ms`);

    let content = coerceMessageContent(data.candidates?.[0]?.content?.parts);
    if (!content) {
      return { ok: false, text: '', error: 'Invalid LLM response: empty content' };
    }
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return { ok: true, text: content, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (timedOut) {
        return { ok: false, text: '', error: `Request timed out (${options.timeoutMs}ms)` };
      }
      return { ok: false, text: '', error: 'Request aborted' };
    }
    if (err instanceof Error) {
      return { ok: false, text: '', error: err.message };
    }
    return { ok: false, text: '', error: 'Unknown API error' };
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  category: SkillCategory,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  lastCallSucceeded = false;
  lastApiError = null;

  const result = await postNativeGemini(systemPrompt, userPrompt, settings, {
    timeoutMs: 8000,
    maxOutputTokens: 1024,
    logTag: '[draft]',
    signal,
  });

  if (!result.ok) {
    lastApiError = result.error;
    return null;
  }

  const parseResult = tryParseLLMJson(result.text);
  if (!parseResult.ok) {
    lastApiError = `Invalid LLM response: JSON parse failed (${parseResult.error})`;
    return null;
  }
  const parsed = parseResult.value;

  const normalized = normalizeLLMResponse(parsed);
  const validated = validateDraftCards(normalized);
  if (!validated) {
    const diagnosis = diagnoseDraftCardsValidation(parsed);
    const normalizedDiagnosis = diagnoseDraftCardsValidation(normalized);
    const failureSummary = summarizeValidationFailure(diagnosis, normalizedDiagnosis);
    lastApiError = `Invalid LLM response: card validation failed (${failureSummary})`;
    return null;
  }

  lastCallSucceeded = true;
  lastApiError = null;
  return balanceCards(validated, category);
}

async function fetchLLMForge(
  prompt: string,
  category: SkillCategory,
  loadout: PlayerLoadout,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  const slot = CATEGORY_SLOT_MAP[category];
  const userPrompt = `Player prompt: "${prompt}"
Target category: ${category} (${getCategoryLabel(category)}) → slot ${slot}
${loadoutSummary(loadout)}

Generate 3 thematic ability concepts for this category.`;

  return callLLM(FORGE_SYSTEM_PROMPT, userPrompt, settings, category, signal);
}

async function fetchLLMEvolution(
  prompt: string,
  context: EvolutionContext,
  loadout: PlayerLoadout,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  const userPrompt = `Base Ability Name: "${context.baseAbility.name}"

User Mutation Request: ${prompt}

Category: ${context.category} (${getCategoryLabel(context.category)}) → slot ${context.slotKey}
${loadoutSummary(loadout)}

Generate 3 distinct evolved ability concepts that preserve the base name's identity while applying the mutation.`;

  return callLLM(EVOLUTION_SYSTEM_PROMPT, userPrompt, settings, context.category, signal);
}

async function fetchLLMPassive(
  prompt: string,
  loadout: PlayerLoadout,
  settings: AiSettings,
  signal?: AbortSignal,
): Promise<DraftCard[] | null> {
  const userPrompt = `Player prompt: "${prompt}"
${loadoutSummary(loadout)}

Generate 3 thematic PASSIVE_UPGRADE draft cards.`;

  return callLLM(PASSIVE_SYSTEM_PROMPT, userPrompt, settings, 'SECONDARY', signal);
}

function makeActiveCard(
  id: string,
  title: string,
  tagline: string,
  description: string,
  rarity: CardRarity,
  schema: AbilitySchema,
  category: SkillCategory = 'SECONDARY',
  evolutionDiff?: string[],
): DraftCard {
  const balanced = balanceAbilitySchema(schema, category);
  return {
    id,
    title,
    tagline,
    description,
    rarity,
    type: 'ACTIVE_ABILITY',
    abilityPayload: balanced,
    budgetCost: scoreAbilitySchema(balanced),
    category,
    evolutionDiff,
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

function ensureTrigger(schema: AbilitySchema, trigger: TriggerNode['trigger']): TriggerNode {
  let node = schema.triggers.find((t) => t.trigger === trigger);
  if (!node) {
    node = { trigger, actions: [] };
    schema.triggers.push(node);
  }
  return node;
}

type EvolutionTheme = 'scatter' | 'explosive' | 'orbit' | 'bounce' | 'generic';

interface EvolutionVariant {
  schema: AbilitySchema;
  diff: string[];
  tagline: string;
  id: string;
}

function parseEvolutionQuantity(prompt: string): number {
  const match = prompt.match(/(?:split into|explode into|spawn|create)?\s*(\d+)/i);
  if (match) {
    return Math.max(2, Math.min(6, parseInt(match[1], 10)));
  }
  if (/\b(split|cluster|scatter|multi|fork)\b/i.test(prompt)) {
    return 3;
  }
  return 3;
}

function detectEvolutionTheme(prompt: string): EvolutionTheme {
  const p = prompt.toLowerCase();
  if (/\b(split|beam|multi|scatter|fork)\b/.test(p)) return 'scatter';
  if (/\b(explode|cluster|bomb|detonate|shrapnel)\b/.test(p)) return 'explosive';
  if (/\b(orbit|shield|barrier|satellite)\b/.test(p)) return 'orbit';
  if (/\b(bounce|ricochet|return|boomerang)\b/.test(p)) return 'bounce';
  return 'generic';
}

function deriveVariantName(baseName: string, prompt: string, label: string): string {
  const qtyMatch = prompt.match(/(\d+)/);
  const qty = qtyMatch ? qtyMatch[1] : null;
  if (qty) return `${baseName} · ${qty}-${label}`;
  return `${baseName} · ${label}`;
}

function defaultLinearTraj(overrides: Partial<TrajectoryConfig> = {}): TrajectoryConfig {
  return {
    type: 'LINEAR',
    speed: 400,
    maxRange: 280,
    piercing: 0,
    ...overrides,
  };
}

function spawnFanChildren(
  node: TriggerNode,
  baseTraj: TrajectoryConfig,
  count: number,
  spreadDegPerCount = 15,
): void {
  const spreadDeg = spreadDegPerCount * count * 2;
  node.actions.push({
    type: 'SPAWN_PROJECTILE',
    projectileTrajectory: { ...baseTraj },
    emitter: {
      count,
      spreadDeg,
      distribution: 'FAN',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [{ type: 'APPLY_IMPULSE', baseForce: 300 }],
      },
    ],
  });
}

function spawnFragmentBurst(
  node: TriggerNode,
  count: number,
  speed = 380,
): void {
  node.actions.push({
    type: 'SPAWN_PROJECTILE',
    projectileTrajectory: defaultLinearTraj({ speed, maxRange: 260 }),
    emitter: {
      count,
      spreadDeg: 15 * count * 2,
      distribution: 'FAN',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [{ type: 'APPLY_IMPULSE', baseForce: 280 }],
      },
    ],
  });
}

function addRadialDetonation(node: TriggerNode, strength = 700): void {
  node.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'RADIAL_IMPULSE',
      radius: 95,
      strength,
      durationMs: 400,
    },
  });
}

function addSingularity(node: TriggerNode): void {
  node.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'MASS_ATTRACTOR',
      radius: 110,
      strength: 7500,
      durationMs: 2400,
    },
  });
}

function addChainBomblet(node: TriggerNode, count: number): void {
  node.actions.push({
    type: 'SPAWN_PROJECTILE',
    projectileTrajectory: defaultLinearTraj({ speed: 180, maxRange: 160 }),
    emitter: {
      count,
      spreadDeg: 40,
      distribution: 'FAN',
    },
    triggers: [
      {
        trigger: 'ON_EXPIRY',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 70,
              strength: 550,
              durationMs: 350,
            },
          },
        ],
      },
    ],
  });
}

function baseChildTraj(base: AbilitySchema): TrajectoryConfig {
  if (base.trajectory) {
    return {
      ...structuredClone(base.trajectory),
      type: 'LINEAR',
      speed: Math.min(600, base.trajectory.speed ?? 400),
      maxRange: Math.min(400, base.trajectory.maxRange ?? 300),
      piercing: 0,
    };
  }
  return defaultLinearTraj();
}

function buildScatterVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const childTraj = baseChildTraj(base);
  const halfFan = 15 * n;

  // Variant 1: Fork/Scatter — ON_CAST fan, drop parent trajectory
  const fork = structuredClone(base);
  delete fork.trajectory;
  const castNode = ensureTrigger(fork, 'ON_CAST');
  spawnFanChildren(castNode, childTraj, n, 15);
  fork.id = `${base.id}_fork`;
  fork.name = deriveVariantName(base.name, prompt, 'Fork');

  // Variant 2: Death Split — ON_EXPIRY fragments
  const death = structuredClone(base);
  if (!death.trajectory) {
    death.trajectory = defaultLinearTraj({ speed: 450, maxRange: 500 });
  }
  const expiryNode = ensureTrigger(death, 'ON_EXPIRY');
  spawnFragmentBurst(expiryNode, n);
  death.id = `${base.id}_death_split`;
  death.name = deriveVariantName(base.name, prompt, 'Death Split');

  // Variant 3: Piercing Beam
  const beam = structuredClone(base);
  beam.trajectory = {
    type: 'LINEAR',
    speed: 1200,
    maxRange: beam.trajectory?.maxRange ?? 900,
    piercing: n,
  };
  const tickNode = ensureTrigger(beam, 'ON_TICK');
  tickNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'FRICTION_OVERRIDE',
      radius: 28,
      strength: 0,
      durationMs: 400,
      frictionValue: 0.04,
    },
  });
  beam.id = `${base.id}_beam`;
  beam.name = deriveVariantName(base.name, prompt, 'Beam');

  return [
    {
      schema: fork,
      diff: [`+ ${n}-way scatter (±${halfFan}°)`],
      tagline: 'Fork Scatter',
      id: 'evo_fork',
    },
    {
      schema: death,
      diff: [`+ Death split ×${n} on ON_EXPIRY`],
      tagline: 'Death Split',
      id: 'evo_death_split',
    },
    {
      schema: beam,
      diff: [`Trajectory → LINEAR beam`, `piercing ${n}`, '+ Beam trail ON_TICK'],
      tagline: 'Piercing Beam',
      id: 'evo_beam',
    },
  ];
}

function buildExplosiveVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  // Variant 1: Radial Bomb Burst
  const bomb = structuredClone(base);
  if (!bomb.trajectory) {
    bomb.trajectory = defaultLinearTraj({ speed: 480, maxRange: 520 });
  }
  const hitNode = ensureTrigger(bomb, 'ON_HIT');
  addRadialDetonation(hitNode, 750);
  spawnFragmentBurst(hitNode, n, 420);
  bomb.id = `${base.id}_bomb`;
  bomb.name = deriveVariantName(base.name, prompt, 'Bomb Burst');

  // Variant 2: Vortex Detonation
  const vortex = structuredClone(base);
  if (!vortex.trajectory) {
    vortex.trajectory = defaultLinearTraj({ speed: 360, maxRange: 480 });
  }
  const expiryNode = ensureTrigger(vortex, 'ON_EXPIRY');
  addSingularity(expiryNode);
  vortex.id = `${base.id}_singularity`;
  vortex.name = deriveVariantName(base.name, prompt, 'Singularity');

  // Variant 3: Chain Reaction
  const chain = structuredClone(base);
  if (!chain.trajectory) {
    chain.trajectory = defaultLinearTraj({ speed: 400, maxRange: 450 });
  }
  const chainHit = ensureTrigger(chain, 'ON_HIT');
  addChainBomblet(chainHit, n);
  chain.id = `${base.id}_chain`;
  chain.name = deriveVariantName(base.name, prompt, 'Chain');

  return [
    {
      schema: bomb,
      diff: [`+ RADIAL_IMPULSE on ON_HIT`, `+ ${n} shrapnel fragments`],
      tagline: 'Radial Bomb Burst',
      id: 'evo_bomb',
    },
    {
      schema: vortex,
      diff: ['+ MASS_ATTRACTOR singularity on ON_EXPIRY'],
      tagline: 'Vortex Detonation',
      id: 'evo_vortex',
    },
    {
      schema: chain,
      diff: [`+ ${n} delayed chain bomblets on ON_HIT`],
      tagline: 'Chain Reaction',
      id: 'evo_chain',
    },
  ];
}

function buildOrbitVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const orbitSpeeds = [4, -3, 2.5, 5, -2, 3.5];

  // Variant 1: Satellite Ring
  const ring = structuredClone(base);
  delete ring.trajectory;
  const castNode = ensureTrigger(ring, 'ON_CAST');
  for (let i = 0; i < n; i++) {
    castNode.actions.push({
      type: 'SPAWN_PROJECTILE',
      projectileTrajectory: {
        type: 'ORBIT_ANCHOR',
        orbitRadius: 55 + i * 25,
        orbitSpeed: orbitSpeeds[i % orbitSpeeds.length],
        maxRange: 800,
      },
      emitter: {
        count: 1,
        spreadDeg: 0,
        distribution: 'FAN',
        aimOffsetDeg: (360 / Math.max(1, n)) * i,
      },
      triggers: [
        {
          trigger: 'ON_HIT',
          actions: [{ type: 'ADD_INSTABILITY', amount: 18 }],
        },
      ],
    });
  }
  ring.id = `${base.id}_satellites`;
  ring.name = deriveVariantName(base.name, prompt, 'Satellites');

  // Variant 2: Shield Barrier
  const shield = structuredClone(base);
  shield.trajectory = {
    type: 'ORBIT_ANCHOR',
    orbitRadius: 60,
    orbitSpeed: 5,
    maxRange: 800,
  };
  const tickNode = ensureTrigger(shield, 'ON_TICK');
  tickNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'RADIAL_IMPULSE',
      radius: 50,
      strength: 200,
      durationMs: 200,
    },
  });
  shield.id = `${base.id}_barrier`;
  shield.name = deriveVariantName(base.name, prompt, 'Barrier');

  // Variant 3: Expiring Nova
  const nova = structuredClone(base);
  delete nova.trajectory;
  const novaCast = ensureTrigger(nova, 'ON_CAST');
  for (let i = 0; i < n; i++) {
    novaCast.actions.push({
      type: 'SPAWN_PROJECTILE',
      projectileTrajectory: {
        type: 'ORBIT_ANCHOR',
        orbitRadius: 50 + i * 20,
        orbitSpeed: orbitSpeeds[i % orbitSpeeds.length],
        maxRange: 800,
      },
      emitter: {
        count: 1,
        spreadDeg: 0,
        distribution: 'FAN',
        aimOffsetDeg: (360 / Math.max(1, n)) * i,
      },
      triggers: [
        {
          trigger: 'ON_EXPIRY',
          actions: [
            {
              type: 'SPAWN_FIELD',
              field: {
                fieldType: 'MASS_ATTRACTOR',
                radius: 90,
                strength: 6000,
                durationMs: 1800,
              },
            },
          ],
        },
      ],
    });
  }
  nova.id = `${base.id}_nova`;
  nova.name = deriveVariantName(base.name, prompt, 'Nova');

  return [
    {
      schema: ring,
      diff: [`+ ${n} ORBIT_ANCHOR satellites on ON_CAST`],
      tagline: 'Satellite Ring',
      id: 'evo_satellites',
    },
    {
      schema: shield,
      diff: ['Trajectory → ORBIT_ANCHOR', '+ Pulse barrier ON_TICK'],
      tagline: 'Shield Barrier',
      id: 'evo_barrier',
    },
    {
      schema: nova,
      diff: [`+ ${n} orbiting attractor bombs`],
      tagline: 'Expiring Nova',
      id: 'evo_nova',
    },
  ];
}

function buildBounceVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  // Variant 1: Boomerang
  const boom = structuredClone(base);
  boom.trajectory = {
    ...(boom.trajectory ?? defaultLinearTraj({ speed: 350, maxRange: 500 })),
    type: 'RETURN_TO_SOURCE',
    turnAccel: boom.trajectory?.turnAccel ?? 1100,
  };
  boom.id = `${base.id}_boomerang`;
  boom.name = deriveVariantName(base.name, prompt, 'Boomerang');

  // Variant 2: Ricochet Pierce
  const rico = structuredClone(base);
  rico.trajectory = {
    ...(rico.trajectory ?? defaultLinearTraj({ speed: 380, maxRange: 550 })),
    type: 'RETURN_TO_SOURCE',
    piercing: n,
    turnAccel: rico.trajectory?.turnAccel ?? 1000,
  };
  rico.id = `${base.id}_ricochet`;
  rico.name = deriveVariantName(base.name, prompt, 'Ricochet');

  // Variant 3: Return Trap
  const trap = structuredClone(base);
  trap.trajectory = {
    ...(trap.trajectory ?? defaultLinearTraj({ speed: 340, maxRange: 480 })),
    type: 'RETURN_TO_SOURCE',
    turnAccel: trap.trajectory?.turnAccel ?? 1200,
  };
  const returnNode = ensureTrigger(trap, 'ON_RETURN');
  returnNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'VORTEX_TANGENT',
      radius: 90,
      strength: -550,
      durationMs: 2200,
    },
  });
  trap.id = `${base.id}_return_trap`;
  trap.name = deriveVariantName(base.name, prompt, 'Return Trap');

  return [
    {
      schema: boom,
      diff: ['Trajectory → RETURN_TO_SOURCE'],
      tagline: 'Boomerang',
      id: 'evo_boomerang',
    },
    {
      schema: rico,
      diff: ['Trajectory → RETURN_TO_SOURCE', `+ Piercing ${n}`],
      tagline: 'Ricochet Pierce',
      id: 'evo_ricochet',
    },
    {
      schema: trap,
      diff: ['Trajectory → RETURN_TO_SOURCE', '+ VORTEX on ON_RETURN'],
      tagline: 'Return Trap',
      id: 'evo_return_trap',
    },
  ];
}

function buildGenericVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const p = prompt.toLowerCase();

  // Cluster fragments
  const cluster = structuredClone(base);
  if (cluster.trajectory) {
    cluster.trajectory.piercing = Math.min(4, (cluster.trajectory.piercing ?? 0) + 1);
  }
  const clusterTarget = /\b(expiry|expire)\b/.test(p) ? 'ON_EXPIRY' : 'ON_HIT';
  const clusterNode = ensureTrigger(cluster, clusterTarget);
  spawnFragmentBurst(clusterNode, n);
  cluster.id = `${base.id}_cluster`;
  cluster.name = deriveVariantName(base.name, prompt, 'Cluster');

  // Spatial field
  const field = structuredClone(base);
  let fieldType: 'VORTEX_TANGENT' | 'RADIAL_IMPULSE' | 'FRICTION_OVERRIDE' = 'VORTEX_TANGENT';
  let strength = -500;
  let frictionValue: number | undefined;
  if (/\b(ice|cold|frost|slipstream|friction)\b/.test(p)) {
    fieldType = 'FRICTION_OVERRIDE';
    strength = 0;
    frictionValue = 0.02;
  } else if (/\b(blast|impulse|push|knock)\b/.test(p)) {
    fieldType = 'RADIAL_IMPULSE';
    strength = 700;
  } else if (/\b(black hole|singularity|pull|attract)\b/.test(p)) {
    fieldType = 'VORTEX_TANGENT';
    strength = -650;
  }
  const fieldTarget = /\b(expiry|expire)\b/.test(p) ? 'ON_EXPIRY' : 'ON_HIT';
  const fieldNode = ensureTrigger(field, fieldTarget);
  fieldNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType,
      radius: 90,
      strength,
      durationMs: 2200,
      ...(frictionValue !== undefined ? { frictionValue } : {}),
    },
  });
  field.id = `${base.id}_field`;
  field.name = deriveVariantName(base.name, prompt, 'Trap');

  // Kinematic
  const motion = structuredClone(base);
  const motionDiff: string[] = [];
  if (/\b(dash|blink|teleport|phase)\b/.test(p) || !motion.trajectory) {
    const node = ensureTrigger(motion, 'ON_CAST');
    if (/\b(blink|teleport|phase)\b/.test(p) || !motion.trajectory) {
      node.actions.push({ type: 'TELEPORT', distance: 110 });
      motionDiff.push('+ TELEPORT on ON_CAST');
    } else {
      node.actions.push({ type: 'APPLY_IMPULSE', baseForce: 600 });
      motionDiff.push('+ Recoil dash impulse on ON_CAST');
    }
  }
  if (motion.trajectory) {
    if (/\b(homing|seek|track)\b/.test(p) || motionDiff.length === 0) {
      motion.trajectory = {
        ...motion.trajectory,
        type: 'HOMING_SLERP',
        turnAccel: motion.trajectory.turnAccel ?? 700,
      };
      motionDiff.push('Trajectory → HOMING_SLERP');
    }
  } else if (motionDiff.length === 0) {
    motion.trajectory = {
      type: 'HOMING_SLERP',
      speed: 380,
      maxRange: 520,
      turnAccel: 650,
    };
    motionDiff.push('+ Trajectory HOMING_SLERP');
  }
  motion.id = `${base.id}_motion`;
  motion.name = deriveVariantName(base.name, prompt, 'Arc');

  return [
    {
      schema: cluster,
      diff: [
        ...(cluster.trajectory ? [`+ Piercing ${cluster.trajectory.piercing}`] : []),
        `+ ${n} fragments on ${clusterTarget}`,
      ],
      tagline: 'Cluster Payload',
      id: 'evo_cluster',
    },
    {
      schema: field,
      diff: [`+ SPAWN_FIELD ${fieldType} on ${fieldTarget}`],
      tagline: 'Spatial Trap',
      id: 'evo_field',
    },
    {
      schema: motion,
      diff: motionDiff,
      tagline: 'Motion Augment',
      id: 'evo_motion',
    },
  ];
}

function buildThemeVariants(
  theme: EvolutionTheme,
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  switch (theme) {
    case 'scatter':
      return buildScatterVariants(base, prompt, n);
    case 'explosive':
      return buildExplosiveVariants(base, prompt, n);
    case 'orbit':
      return buildOrbitVariants(base, prompt, n);
    case 'bounce':
      return buildBounceVariants(base, prompt, n);
    default:
      return buildGenericVariants(base, prompt, n);
  }
}

export function generateOfflineEvolution(
  prompt: string,
  context: EvolutionContext,
): DraftCard[] {
  const n = parseEvolutionQuantity(prompt);
  const theme = detectEvolutionTheme(prompt);
  const basePower = scoreAbilitySchema(context.baseAbility);
  const variants = buildThemeVariants(theme, context.baseAbility, prompt, n);
  const rarities: CardRarity[] = ['COMMON', 'RARE', 'EPIC'];

  return variants.map((v, i) => {
    let schema = v.schema;
    let balanced = balanceAbilitySchema(schema, context.category);

    if (scoreAbilitySchema(balanced) < basePower * 0.95) {
      schema = structuredClone(v.schema);
      balanced = balanceAbilitySchema(schema, context.category);
    }

    return makeActiveCard(
      v.id,
      balanced.name,
      v.tagline,
      `Evolved from ${context.baseAbility.name}: ${prompt.slice(0, 48) || 'mutation'}`,
      rarities[i],
      balanced,
      context.category,
      v.diff,
    );
  });
}

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

  // Intermission / legacy path: mixed active + passive for bot draft compatibility
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
  // Replace passive with a third active for forge mode
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

export async function synthesizeAbility(
  prompt: string,
  category: SkillCategory,
  loadout: PlayerLoadout,
  evolution?: EvolutionContext,
  passiveOnly = false,
  options?: { signal?: AbortSignal },
): Promise<DraftCard[]> {
  const settings = getAiSettings();
  const signal = options?.signal;

  if (settings.apiKey.trim()) {
    let online: DraftCard[] | null = null;

    if (passiveOnly) {
      online = await fetchLLMPassive(prompt, loadout, settings, signal);
    } else if (evolution) {
      online = await fetchLLMEvolution(prompt, evolution, loadout, settings, signal);
    } else {
      online = await fetchLLMForge(prompt, category, loadout, settings, signal);
    }

    if (online) {
      lastSynthesisSource = 'api';
      lastSynthesisError = null;
      return online;
    }
  }

  lastSynthesisSource = 'heuristic';
  lastSynthesisError = settings.apiKey.trim()
    ? lastApiError
    : 'No API key configured';

  if (passiveOnly) return generateOfflinePassives(prompt);
  if (evolution) return generateOfflineEvolution(prompt, evolution);
  return generateOfflineForge(prompt, category);
}

export async function synthesizeCards(
  prompt: string,
  loadout: PlayerLoadout,
): Promise<DraftCard[]> {
  return synthesizeAbility(prompt, 'SECONDARY', loadout);
}

const CATEGORY_COMPILE_HINTS: Record<SkillCategory, string> = {
  PRIMARY: 'rapid-fire skillshots, low payload, short cooldown pacing, ammo magazines',
  SECONDARY: 'medium area/skillshot pressure, charged shots, combo chains',
  UTILITY: 'crowd control, zones, terrain mutation, obstacles, stasis traps',
  ULTIMATE: 'high-impact screen presence, morphs, turrets/decoys, large fields',
  MOBILITY: 'displacement, teleports, dashes, stealth — movement over damage',
};

function buildCompileUserPrompt(
  card: DraftCard,
  baseAbility: AbilitySchema | undefined,
  category: SkillCategory,
): string {
  const budget = CATEGORY_BUDGETS[category];
  const lines = [
    'Ability Concept:',
    `- name: "${card.title}"`,
    `- tagline: "${card.tagline}"`,
    `- description: "${card.description}"`,
    `- category: ${category}`,
    `- category design: ${CATEGORY_COMPILE_HINTS[category]}`,
    `- target power budget: ~${budget.targetPower}`,
  ];
  if (baseAbility) {
    lines.push(`- evolving from base ability named: "${baseAbility.name}"`);
    if (baseAbility.visuals) {
      lines.push(`- parent visuals: ${JSON.stringify(baseAbility.visuals)}`);
      lines.push('- mutate parent palette (shift hue/size) rather than rerolling colors');
    }
  }
  lines.push('', 'Output the single AbilitySchema JSON object for this concept.');
  return lines.join('\n');
}

/**
 * Offline heuristic used when no API key is configured, the compile request fails/times
 * out, or the parsed response fails validation. Reuses the existing forge/evolution
 * generators (never a bare default) so a lazily-compiled slot is never left unplayable —
 * only the id/name are overwritten to match the chosen card.
 */
function fallbackCompiledSchema(
  card: DraftCard,
  baseAbility: AbilitySchema | undefined,
  category: SkillCategory,
): AbilitySchema {
  let source: AbilitySchema | undefined;

  const promptText = `${card.title} ${card.tagline} ${card.description}`;
  const recipe = resolveKineticRecipe(promptText);
  if (recipe) {
    source = structuredClone(recipe);
  } else if (baseAbility) {
    const evolved = generateOfflineEvolution(card.description || card.tagline || 'mutation', {
      baseAbility,
      slotKey: CATEGORY_SLOT_MAP[category],
      category,
    });
    source = evolved[0]?.abilityPayload;
  } else {
    const forged = generateOfflineForge(
      `${card.title} ${card.tagline} ${card.description}`,
      category,
    );
    source = forged[0]?.abilityPayload ?? forged[1]?.abilityPayload;
  }

  const compiled = source ? structuredClone(source) : sanitizeAbilitySchema({}, category);
  compiled.id = card.id || compiled.id;
  compiled.name = card.title || compiled.name;
  return sanitizeAbilitySchema(compiled, category);
}

/**
 * Phase 2 lazy compilation: compiles the full physics `AbilitySchema` for exactly ONE
 * already-chosen card. Deliberately does NOT route through `callLLM` (which always expects
 * and validates 3 `DraftCard`s) — this is a separate native-Gemini call with its own prompt,
 * a tighter 5s timeout, and a smaller/targeted parse+repair path for a single schema object.
 * Always fulfills with a playable schema; network/parse/validation failures fall back to an
 * offline heuristic so the calling slot can never stay stuck "compiling" forever.
 */
export async function compileAbilityPayload(
  card: DraftCard,
  baseAbility?: AbilitySchema,
): Promise<AbilitySchema> {
  const category = card.category ?? 'SECONDARY';

  // Offline heuristic / pre-compiled cards already carry a full payload — skip the network.
  if (card.abilityPayload) {
    return structuredClone(card.abilityPayload);
  }

  const settings = getAiSettings();
  if (!settings.apiKey.trim()) {
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  const userPrompt = buildCompileUserPrompt(card, baseAbility, category);
  const result = await postNativeGemini(COMPILER_SYSTEM_PROMPT, userPrompt, settings, {
    timeoutMs: 5000,
    maxOutputTokens: 3072,
    logTag: '[compile]',
  });

  if (!result.ok) {
    console.warn(`[Synthesizer] compileAbilityPayload fallback (${result.error})`);
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  const parseResult = tryParseLLMJson(result.text);
  if (!parseResult.ok) {
    console.warn(`[Synthesizer] compileAbilityPayload parse failed (${parseResult.error})`);
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  const normalized = deepNormalizeLLMValue(parseResult.value);
  const compileDescription = `${card.title} ${card.tagline} ${card.description}`;
  const repaired = repairAbilityPayload(normalized, compileDescription);
  const sanitized = sanitizeAbilitySchema(repaired, category);

  if (!validateAbilitySchema(sanitized)) {
    console.warn('[Synthesizer] compileAbilityPayload validation failed, using fallback');
    return fallbackCompiledSchema(card, baseAbility, category);
  }

  return sanitized;
}
