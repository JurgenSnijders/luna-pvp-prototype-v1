import {
  balanceAbilitySchema,
  balancePassiveModifiers,
  scoreAbilitySchema,
} from './BudgetEngine';
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
import { validateAbilitySchema } from '../types/schema';

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

const SCHEMA_REFERENCE = `AbilitySchema trajectories: LINEAR, RETURN_TO_SOURCE, ORBIT_ANCHOR, HOMING_SLERP, DISCONTINUOUS_BLINK
Field types: RADIAL_IMPULSE, VORTEX_TANGENT, FRICTION_OVERRIDE, MASS_ATTRACTOR
Triggers: ON_CAST, ON_TICK, ON_HIT, ON_EXPIRY, ON_RETURN
Actions: ADD_INSTABILITY, APPLY_IMPULSE, SPAWN_FIELD, SPAWN_CHILD_PROJECTILE (optional aimOffsetDeg), TELEPORT, MODIFY_STAT

Passive stats: MOVE_SPEED, ACCELERATION, LINEAR_DRAG, MASS, KNOCKBACK_RESISTANCE, COOLDOWN_REDUCTION_PCT
Passive ops: ADD, MULTIPLY`;

const FORGE_SYSTEM_PROMPT = `You are a 2D physics ability synthesizer for a top-down kinetic arena game.
Output ONLY valid JSON with this exact shape: { "cards": [ DraftCard, DraftCard, DraftCard ] }

Each DraftCard must have:
- id, title, tagline, description (strings)
- rarity: "COMMON" | "RARE" | "EPIC" | "CHAOTIC"
- type: "ACTIVE_ABILITY" (all 3 cards must be ACTIVE_ABILITY for forge mode)
- category: the requested SkillCategory
- budgetCost: number
- abilityPayload: AbilitySchema with id, name, cooldownMs, recoilKick, optional trajectory, triggers[]

${SCHEMA_REFERENCE}

Category design constraints:
- PRIMARY: rapid-fire skillshots, low payload, short cooldown pacing
- SECONDARY: medium area/skillshot pressure
- UTILITY: crowd control, zones, friction patches, vortices
- ULTIMATE: high-impact screen presence, large fields, long cooldown pacing
- MOBILITY: displacement, teleports, dashes, escapes — prioritize movement over damage

Use kinetic concepts: impulses, vortices, friction patches, homing arcs, boomerangs, teleports.
Return exactly 3 distinct ACTIVE_ABILITY cards tuned for the requested category.`;

const EVOLUTION_SYSTEM_PROMPT = `You are an ability evolver for a 2D physics kinetic arena game.
You receive a base AbilitySchema JSON and a player mutation prompt.
Output ONLY valid JSON with this exact shape: { "cards": [ DraftCard, DraftCard, DraftCard ] }

Each DraftCard must have:
- id, title, tagline, description (strings)
- rarity: "COMMON" | "RARE" | "EPIC" | "CHAOTIC"
- type: "ACTIVE_ABILITY"
- category: the provided SkillCategory
- evolutionDiff: string[] summarizing mutations (e.g. "+ SPAWN_CHILD_PROJECTILE", "Trajectory → HOMING_SLERP")
- budgetCost: number
- abilityPayload: mutated AbilitySchema

${SCHEMA_REFERENCE}

Rules:
- Preserve the core identity of the base spell (name stem, primary trajectory when possible)
- Layer on the requested mutations distinctly across the 3 variants
- Variant A: cluster / multi-payload (SPAWN_CHILD_PROJECTILE or pierce)
- Variant B: spatial field / trap (SPAWN_FIELD on ON_HIT or ON_EXPIRY)
- Variant C: kinematic / motion augment (RETURN_TO_SOURCE, HOMING_SLERP, TELEPORT, or recoil dash)
- Do NOT invent invalid action or trajectory types
- Return exactly 3 ACTIVE_ABILITY evolution variants`;

const PASSIVE_SYSTEM_PROMPT = `You are a passive upgrade synthesizer for a 2D physics kinetic arena game.
Output ONLY valid JSON with this exact shape: { "cards": [ DraftCard, DraftCard, DraftCard ] }

Each DraftCard must have:
- id, title, tagline, description (strings)
- rarity: "COMMON" | "RARE" | "EPIC" | "CHAOTIC"
- type: "PASSIVE_UPGRADE"
- budgetCost: number
- passivePayload: array of { stat, op, value }

Passive stats: MOVE_SPEED, ACCELERATION, LINEAR_DRAG, MASS, KNOCKBACK_RESISTANCE, COOLDOWN_REDUCTION_PCT
Passive ops: ADD, MULTIPLY

Return exactly 3 distinct PASSIVE_UPGRADE cards.`;

function balanceCard(card: DraftCard, category: SkillCategory = 'SECONDARY'): DraftCard {
  const balanced = { ...card };
  balanced.category = balanced.category ?? category;

  if (balanced.type === 'ACTIVE_ABILITY' && balanced.abilityPayload) {
    balanced.abilityPayload = balanceAbilitySchema(
      balanced.abilityPayload,
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

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  settings: AiSettings,
  category: SkillCategory,
): Promise<DraftCard[] | null> {
  lastCallSucceeded = false;
  lastApiError = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 180);
      lastApiError = `HTTP ${response.status}: ${body || response.statusText}`;
      return null;
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content ?? '';
    if (typeof content !== 'string' || !content) {
      lastApiError = 'Invalid LLM response: empty content';
      return null;
    }
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      lastApiError = 'Invalid LLM response: JSON parse failed';
      return null;
    }

    const validated = validateDraftCards(parsed);
    if (!validated) {
      lastApiError = 'Invalid LLM response: card validation failed';
      return null;
    }

    lastCallSucceeded = true;
    lastApiError = null;
    return balanceCards(validated, category);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      lastApiError = 'Request timed out (8s)';
    } else if (err instanceof Error) {
      lastApiError = err.message;
    } else {
      lastApiError = 'Unknown API error';
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeAbilityForLLM(schema: AbilitySchema): AbilitySchema {
  const raw: AbilitySchema = {
    id: schema.id,
    name: schema.name,
    cooldownMs: schema.cooldownMs,
    recoilKick: schema.recoilKick,
    triggers: structuredClone(schema.triggers),
  };
  if (schema.trajectory) {
    raw.trajectory = structuredClone(schema.trajectory);
  }

  const validated = validateAbilitySchema(raw);
  if (validated) return validated;

  return {
    id: schema.id,
    name: schema.name,
    cooldownMs: schema.cooldownMs,
    recoilKick: schema.recoilKick,
    triggers: [],
  };
}

async function fetchLLMForge(
  prompt: string,
  category: SkillCategory,
  loadout: PlayerLoadout,
  settings: AiSettings,
): Promise<DraftCard[] | null> {
  const slot = CATEGORY_SLOT_MAP[category];
  const userPrompt = `Player prompt: "${prompt}"
Target category: ${category} (${getCategoryLabel(category)}) → slot ${slot}
${loadoutSummary(loadout)}

Generate 3 thematic ACTIVE_ABILITY draft cards for this category.`;

  return callLLM(FORGE_SYSTEM_PROMPT, userPrompt, settings, category);
}

async function fetchLLMEvolution(
  prompt: string,
  context: EvolutionContext,
  loadout: PlayerLoadout,
  settings: AiSettings,
): Promise<DraftCard[] | null> {
  const sanitized = sanitizeAbilityForLLM(context.baseAbility);
  const userPrompt = `Base Ability:
${JSON.stringify(sanitized, null, 2)}

User Mutation Request: ${prompt}

Category: ${context.category} (${getCategoryLabel(context.category)}) → slot ${context.slotKey}
${loadoutSummary(loadout)}

Generate 3 distinct evolved ACTIVE_ABILITY variants that preserve core identity while applying the mutation.`;

  return callLLM(EVOLUTION_SYSTEM_PROMPT, userPrompt, settings, context.category);
}

async function fetchLLMPassive(
  prompt: string,
  loadout: PlayerLoadout,
  settings: AiSettings,
): Promise<DraftCard[] | null> {
  const userPrompt = `Player prompt: "${prompt}"
${loadoutSummary(loadout)}

Generate 3 thematic PASSIVE_UPGRADE draft cards.`;

  return callLLM(PASSIVE_SYSTEM_PROMPT, userPrompt, settings, 'SECONDARY');
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
  const halfFan = spreadDegPerCount * count;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const aimOffsetDeg = -halfFan + t * (2 * halfFan);
    node.actions.push({
      type: 'SPAWN_CHILD_PROJECTILE',
      trajectory: { ...baseTraj },
      aimOffsetDeg,
      triggers: [
        {
          trigger: 'ON_HIT',
          actions: [{ type: 'APPLY_IMPULSE', baseForce: 300 }],
        },
      ],
    });
  }
}

function spawnFragmentBurst(
  node: TriggerNode,
  count: number,
  speed = 380,
): void {
  const halfFan = 15 * count;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const aimOffsetDeg = -halfFan + t * (2 * halfFan);
    node.actions.push({
      type: 'SPAWN_CHILD_PROJECTILE',
      trajectory: defaultLinearTraj({ speed, maxRange: 260 }),
      aimOffsetDeg,
      triggers: [
        {
          trigger: 'ON_HIT',
          actions: [{ type: 'APPLY_IMPULSE', baseForce: 280 }],
        },
      ],
    });
  }
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
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const aimOffsetDeg = -20 + t * 40;
    node.actions.push({
      type: 'SPAWN_CHILD_PROJECTILE',
      trajectory: defaultLinearTraj({ speed: 180, maxRange: 160 }),
      aimOffsetDeg,
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
      type: 'SPAWN_CHILD_PROJECTILE',
      trajectory: {
        type: 'ORBIT_ANCHOR',
        orbitRadius: 55 + i * 25,
        orbitSpeed: orbitSpeeds[i % orbitSpeeds.length],
        maxRange: 800,
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
      type: 'SPAWN_CHILD_PROJECTILE',
      trajectory: {
        type: 'ORBIT_ANCHOR',
        orbitRadius: 50 + i * 20,
        orbitSpeed: orbitSpeeds[i % orbitSpeeds.length],
        maxRange: 800,
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
  } else if (/\b(dash|blink|phase|teleport|nova)\b/.test(p) || category === 'MOBILITY') {
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
): Promise<DraftCard[]> {
  const settings = getAiSettings();

  if (settings.apiKey.trim()) {
    let online: DraftCard[] | null = null;

    if (passiveOnly) {
      online = await fetchLLMPassive(prompt, loadout, settings);
    } else if (evolution) {
      online = await fetchLLMEvolution(prompt, evolution, loadout, settings);
    } else {
      online = await fetchLLMForge(prompt, category, loadout, settings);
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
