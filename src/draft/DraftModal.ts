import {
  DEFAULT_MODEL,
  compileAbilityPayload,
  getAiSettings,
  getApiConnectionStatus,
  getLastSynthesisMeta,
  synthesizeAbility,
} from '../ai/Synthesizer';
import type {
  ActionSlotKey,
  CardRarity,
  DraftCard,
  DraftSelection,
  EvolutionContext,
  PlayerLoadout,
  SkillCategory,
} from '../types/cards';
import {
  ACTION_SLOT_KEYS,
  CATEGORY_SLOT_MAP,
  getCategoryLabel,
  SLOT_CATEGORY_MAP,
} from '../types/cards';
import type {
  AbilitySchema,
  ActionPayload,
  EmitterConfig,
  ProjectileStyle,
  SpellArchetype,
  TrajectoryConfig,
  TriggerNode,
} from '../types/schema';
import { walkActions } from '../types/schema';
import { BASELINE_INSTABILITY_ON_HIT } from '../engine/PhysicsWorld';
import { ARCHETYPE_TUNING } from '../primitives/interpreter/constants';
import {
  extractMechanicBadges,
  renderBadge,
  renderStreamBadges,
} from './mechanicBadges';
import { STREAM_BADGE_KINDS } from '../ai/synthesizer/partialJson';
import type { PartialCardStream } from '../ai/synthesizer/partialJson';
import {
  buildCurrentPrefetchKey,
  formatDuration,
  invalidatePrefetch,
  startPrefetch,
  type PrefetchCacheEntry,
  type WorkshopMode,
} from './synthesisPrefetch';
import {
  RARITY_COLORS,
  SUGGEST_CHIPS,
  btnStyle,
  btnStyleRarity,
  chipStyle,
  hexToRgba,
  injectStyles,
  renderPowerBar,
  showQuickEquipMenu,
} from './workshopStyles';
import { SpellInventoryManager } from '../game/SpellInventory';
import {
  getSpellRoleLabel,
  getVaultSortLabel,
  SPELL_ROLES,
  sortVaultSpells,
  spellMatchesMetaFilter,
  spellMatchesRoleFilter,
  VAULT_SORT_ORDERS,
  type SpellRole,
  type VaultMetaFilter,
  type VaultSortOrder,
} from '../game/spellRoles';
import {
  attachDockSlotDrag,
  attachForgeCardDrag,
  attachInventoryDropZone,
  attachVaultCardDrag,
  parseForgeCardDragPayload,
} from '../game/spellDragDrop';
import { generateSpellIcon, getArchetypeColor } from '../render/canvas/SpellIconGenerator';
import { resolveIconTrajectoryPaths } from '../render/canvas/trajectoryTracer';
import { ActionBarHUD } from '../render/ActionBarHUD';
import { FONTS, RETRO_COLORS, retroPanelStyle } from '../ui/tokens';

type WorkshopTab = 'VAULT' | 'FORGE';

interface DisplayTrajectory {
  trajectory?: TrajectoryConfig;
  emitter?: EmitterConfig;
}

const ARCHETYPE_DESCRIPTIONS: Partial<Record<SpellArchetype, string>> = {
  KINETIC: 'Reduces target linear drag by 80%. Hits cause extreme sliding across arena and lava.',
  FROST: 'Chills target movement. Reduces active running acceleration and maximum speed by 50%.',
  EARTH: 'Triples target mass and increases friction. Harder to launch, anchors firmly.',
  GRAVITY: 'Reduces target mass to 20%. Target becomes weightless and highly susceptible to knockback.',
  FIRE: 'Applies thermal instability. Targets moving at high speed rapidly build additional instability.',
  PLASMA: 'Volatile energy. Reaching 100% instability triggers an immediate violent detonation.',
  VOID: 'Gravitational singularity. Scales vortex pull strength and field disruption.',
  CHAOS: 'Erratic physics trajectories with random velocity vectors and impulse redirects.',
};

const ARCHETYPE_FALLBACK = 'Elemental physics modifier active on hit.';

const STATUS_CC_LABELS: Partial<Record<SpellArchetype, (dur: string) => string>> = {
  FROST: (d) => `50% Chill Slow (${d})`,
  KINETIC: (d) => `80% Drag Loss / Extreme Slip (${d})`,
  EARTH: (d) => `3× Heavy Mass Anchor (${d})`,
  GRAVITY: (d) => `0.2× Weightless Float (${d})`,
  FIRE: (d) => `Thermal Instability on Move (${d})`,
  PLASMA: () => 'Detonation at 100% Instability',
};

export interface SpellTelemetry {
  cooldownSec: string;
  recoilKick: number;
  repulseForce: number;
  instabilityYield: number;
  directDamage: number;
  ccDescriptions: string[];
  deliveryText: string;
}

export interface CombatImpactProfile {
  launchPct: number;
  instabilityPct: number;
  controlPct: number;
  dominantRole: string;
}

export function calculateCombatProfile(telemetry: SpellTelemetry): CombatImpactProfile {
  const launchWeight = Math.min(100, (telemetry.repulseForce / 1500) * 100);
  const instabilityWeight = Math.min(100, telemetry.instabilityYield * 1.2);
  const controlWeight = telemetry.ccDescriptions.length > 0 ? 60 : 15;
  const total = launchWeight + instabilityWeight + controlWeight;

  const launchPct = total > 0 ? Math.round((launchWeight / total) * 100) : 33;
  const instabilityPct = total > 0 ? Math.round((instabilityWeight / total) * 100) : 33;
  const controlPct = total > 0 ? 100 - launchPct - instabilityPct : 34;

  let dominantRole = 'BALANCED ASSAULT';
  if (launchPct >= 50) dominantRole = 'HEAVY LAUNCH';
  else if (instabilityPct >= 50) dominantRole = 'VULNERABILITY SPIKE';
  else if (controlPct >= 40) dominantRole = 'CROWD CONTROL';

  return { launchPct, instabilityPct, controlPct, dominantRole };
}

const FORGE_TIER_ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

const SLOT_KEY_MAPPINGS: { slot: ActionSlotKey; keyNum: string }[] = [
  { slot: 'LMB', keyNum: '1' },
  { slot: 'RMB', keyNum: '2' },
  { slot: 'Q', keyNum: '3' },
  { slot: 'E', keyNum: '4' },
  { slot: 'SPACE', keyNum: '5' },
];

export function normalizeForgeTierRarity(rarity: string): string {
  const upper = (rarity || 'COMMON').toUpperCase();
  if (upper === 'LEGENDARY') return 'CHAOTIC';
  if (upper === 'COMMON' || upper === 'RARE' || upper === 'EPIC' || upper === 'CHAOTIC') return upper;
  return 'COMMON';
}

export function getTierCrest(rarity: string): string {
  switch (normalizeForgeTierRarity(rarity)) {
    case 'COMMON':
      return '◈ COMMON';
    case 'RARE':
      return '◈◈ RARE';
    case 'EPIC':
      return '✦✦ EPIC ✦✦';
    case 'CHAOTIC':
      return '★ CHAOTIC ★';
    default:
      return rarity.toUpperCase();
  }
}

export function stampDraftCardMetadataOntoAbility(
  ability: AbilitySchema,
  card: DraftCard,
): void {
  ability.metadata = {
    ...(ability.metadata ?? {}),
    rarity: card.rarity,
    ...(card.evolutionDiff?.length ? { evolutionDiff: [...card.evolutionDiff] } : {}),
  };
}

export function resolveSpellRarity(spell: AbilitySchema): CardRarity {
  const meta = spell.metadata?.rarity;
  if (typeof meta === 'string') return normalizeForgeTierRarity(meta) as CardRarity;
  return 'COMMON';
}

export function resolveSpellEvolutionDiff(spell: AbilitySchema): string[] {
  const diff = spell.metadata?.evolutionDiff;
  if (!Array.isArray(diff)) return [];
  return diff.filter((d): d is string => typeof d === 'string');
}

export function resolveMutationPerk(card: DraftCard, telemetry: SpellTelemetry): string | null {
  if (card.evolutionDiff && card.evolutionDiff.length > 0) {
    return card.evolutionDiff[0];
  }

  if (telemetry.repulseForce >= 1000) {
    return `⚡ HIGH KINETIC IMPACT (${telemetry.repulseForce} FORCE)`;
  }
  if (telemetry.instabilityYield >= 60) {
    return `⚡ CRITICAL INSTABILITY (+${telemetry.instabilityYield}%)`;
  }
  if (telemetry.deliveryText.includes('FAN')) {
    return `⚡ MULTI-VECTOR SPREAD (${telemetry.deliveryText.split('·')[0].trim()})`;
  }
  if (parseFloat(telemetry.cooldownSec) <= 0.8) {
    return `⚡ RAPID CYCLING (${telemetry.cooldownSec} CD)`;
  }
  if (normalizeForgeTierRarity(card.rarity) === 'COMMON') {
    return 'STANDARD BLUEPRINT';
  }
  return null;
}

export function resolveForgeCardTitle(
  card: DraftCard,
  cardIndex: number,
  allCards: DraftCard[],
): string {
  const base = card.title || card.abilityPayload?.name || 'Untitled';
  const titleCounts = new Map<string, number>();
  for (const c of allCards) {
    const t = c.title || c.abilityPayload?.name || 'Untitled';
    titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
  }
  if ((titleCounts.get(base) ?? 0) <= 1) return base;

  const duplicateIndices = allCards
    .map((c, i) => ({ title: c.title || c.abilityPayload?.name || 'Untitled', index: i }))
    .filter((entry) => entry.title === base)
    .map((entry) => entry.index);
  const positionAmongDuplicates = duplicateIndices.indexOf(cardIndex);
  const roman = FORGE_TIER_ROMAN[positionAmongDuplicates] ?? String(positionAmongDuplicates + 1);
  return `${base} [${roman}]`;
}

export function resolveSuperchargedMetricKey(
  telemetry: SpellTelemetry,
  tier: string,
): 'repulse' | 'instability' | 'cooldown' | null {
  if (tier !== 'EPIC' && tier !== 'CHAOTIC') return null;

  const cooldownSec = parseFloat(telemetry.cooldownSec) || 1;
  const candidates: { key: 'repulse' | 'instability' | 'cooldown'; score: number }[] = [
    { key: 'repulse', score: Math.min(100, (telemetry.repulseForce / 1500) * 100) },
    { key: 'instability', score: Math.min(100, telemetry.instabilityYield * 1.2) },
    { key: 'cooldown', score: Math.min(100, (1 / cooldownSec) * 40) },
  ];

  let best = candidates[0];
  for (const c of candidates) {
    if (c.score > best.score) best = c;
  }
  return best.score > 0 ? best.key : null;
}

const SCOPE_SIZE = 112;
const SCOPE_PULSE_PERIOD_MS = 1200;

export interface ScopeHudData {
  channels: string;
  velocity: string;
  spread: string;
  collision: string;
}

export function extractScopeHudData(spell: AbilitySchema): ScopeHudData {
  const { trajectory, emitter } = resolveDisplayTrajectory(spell);
  const count = emitter?.count ?? 1;
  const speed = Math.round(trajectory?.speed ?? 400);
  const spread =
    emitter?.distribution === 'PARALLEL'
      ? 'RAD: PARALLEL'
      : `RAD: ${emitter?.spreadDeg ?? 0}°`;
  const collision = (trajectory?.piercing ?? 0) > 0 ? 'MODE: PIERCE' : 'MODE: IMPACT';

  return {
    channels: `CH: ${count.toString().padStart(2, '0')}`,
    velocity: `VEL: ${speed}`,
    spread,
    collision,
  };
}

function buildScopeCornerHud(text: string, position: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `scope-corner-hud ${position}`;
  el.textContent = text;
  return el;
}

function samplePathAtProgress(
  points: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];

  const segments: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segments.push(len);
    total += len;
  }
  if (total === 0) return points[0];

  let target = t * total;
  for (let i = 1; i < points.length; i++) {
    const segLen = segments[i - 1];
    if (target <= segLen) {
      const frac = segLen > 0 ? target / segLen : 0;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * frac,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * frac,
      };
    }
    target -= segLen;
  }
  return points[points.length - 1];
}

function formatEnumLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

export interface SemanticActionDef {
  label: string;
  category: 'OFFENSE' | 'CONTROL' | 'UTILITY' | 'DEFENSE';
  accentColor: string;
  getDescription: (action: ActionPayload) => string;
}

const SEMANTIC_ACTION_REGISTRY: Record<string, SemanticActionDef> = {
  APPLY_IMPULSE: {
    label: '💥 KNOCKBACK',
    category: 'OFFENSE',
    accentColor: '#ffaa00',
    getDescription: (a) =>
      a.type === 'APPLY_IMPULSE'
        ? `Delivers ${a.baseForce ?? 400} physical impulse force on impact, pushing targets backward.`
        : 'Delivers physical impulse force on impact, pushing targets backward.',
  },
  RADIAL_IMPULSE: {
    label: '💥 RADIAL SHOCKWAVE',
    category: 'OFFENSE',
    accentColor: '#ffaa00',
    getDescription: (a) =>
      a.type === 'SPAWN_FIELD'
        ? `Emits a 360° explosive shockwave (${Math.abs(a.field.strength ?? 500)} force) launching all nearby entities outward.`
        : 'Emits a 360° explosive shockwave launching all nearby entities outward.',
  },
  ADD_INSTABILITY: {
    label: '⚡ VULNERABILITY',
    category: 'CONTROL',
    accentColor: '#ff4400',
    getDescription: (a) =>
      a.type === 'ADD_INSTABILITY'
        ? `Inflicts +${a.amount ?? 15}% instability, drastically magnifying future launch distance.`
        : 'Inflicts instability, magnifying future launch distance.',
  },
  SPAWN_PROJECTILE: {
    label: '🎯 BALLISTIC',
    category: 'OFFENSE',
    accentColor: '#00e5ff',
    getDescription: () =>
      'Launches a traveling kinetic projectile payload along the aimed trajectory.',
  },
  SPAWN_FIELD: {
    label: '🌐 HAZARD ZONE',
    category: 'CONTROL',
    accentColor: '#bf00ff',
    getDescription: (a) =>
      a.type === 'SPAWN_FIELD'
        ? `Deploys a persistent ${a.field.radius ?? 60}px area-of-effect zone applying force or damage over time.`
        : 'Deploys a persistent area-of-effect zone applying force or damage over time.',
  },
  SPAWN_OBSTACLE: {
    label: '🧱 BARRICADE',
    category: 'DEFENSE',
    accentColor: '#d4a373',
    getDescription: (a) =>
      a.type === 'SPAWN_OBSTACLE'
        ? `Erects destructible physical terrain (${a.obstacle.maxHealth ?? 40} HP) that blocks shots and paths.`
        : 'Erects destructible physical terrain that blocks shots and paths.',
  },
  SPAWN_ACTOR: {
    label: '🤖 DEPLOYABLE',
    category: 'UTILITY',
    accentColor: '#00ff88',
    getDescription: () =>
      'Summons an autonomous turret or combat drone entity to fight alongside the caster.',
  },
  SPAWN_CONSTRAINT: {
    label: '🪢 TETHER PULL',
    category: 'CONTROL',
    accentColor: '#00e5ff',
    getDescription: () =>
      'Binds the target with an elastic energetic tether, pulling them toward the anchor point.',
  },
  TELEPORT: {
    label: '🌀 WARP / PHASE',
    category: 'UTILITY',
    accentColor: '#00e5ff',
    getDescription: () =>
      'Instantly translates player position across space, ignoring obstacles and hazard zones.',
  },
  MODIFY_STAT: {
    label: '💔 DIRECT DAMAGE',
    category: 'OFFENSE',
    accentColor: '#ff0055',
    getDescription: (a) =>
      a.type === 'MODIFY_STAT'
        ? `Directly alters target vitals (${a.value ?? -10} HP).`
        : 'Directly alters target vitals.',
  },
};

function semanticActionKey(action: ActionPayload): string {
  if (action.type === 'SPAWN_FIELD' && action.field.fieldType === 'RADIAL_IMPULSE') {
    return 'RADIAL_IMPULSE';
  }
  return action.type;
}

export function resolveSemanticAction(action: ActionPayload): SemanticActionDef {
  const key = semanticActionKey(action);
  const def = SEMANTIC_ACTION_REGISTRY[key];
  if (def) return def;
  return {
    label: formatEnumLabel(action.type),
    category: 'UTILITY',
    accentColor: '#00e5ff',
    getDescription: () => `Executes ${formatEnumLabel(action.type)} during spell resolution.`,
  };
}

function collectUniqueSemanticActions(ability: AbilitySchema): ActionPayload[] {
  const seen = new Set<string>();
  const actions: ActionPayload[] = [];
  walkActions(ability, (v) => {
    const key = semanticActionKey(v.action);
    if (seen.has(key)) return;
    seen.add(key);
    actions.push(v.action);
  });
  return actions;
}

function formatDurationSec(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function abilityCanHit(ability: AbilitySchema): boolean {
  if (ability.trajectory) return true;
  let hasProjectile = false;
  walkActions(ability, (v) => {
    if (v.action.type === 'SPAWN_PROJECTILE') hasProjectile = true;
  });
  return hasProjectile;
}

export function extractSpellTelemetry(ability: AbilitySchema): SpellTelemetry {
  const archetype = ability.archetype ?? 'KINETIC';
  const tuning = ARCHETYPE_TUNING[archetype];

  let repulseForce = 0;
  let instabilityExplicit = 0;
  let implicitInstability = 0;
  let directDamage = 0;
  const ccDescriptions: string[] = [];
  const ccSeen = new Set<string>();

  const pushCc = (desc: string): void => {
    if (ccSeen.has(desc)) return;
    ccSeen.add(desc);
    ccDescriptions.push(desc);
  };

  walkActions(ability, (v) => {
    const action = v.action;
    switch (action.type) {
      case 'APPLY_IMPULSE':
        repulseForce = Math.max(repulseForce, action.baseForce);
        implicitInstability += action.baseForce * 0.02 * tuning.impactInstabilityScale;
        break;
      case 'SPAWN_FIELD':
        if (action.field.fieldType === 'RADIAL_IMPULSE') {
          repulseForce = Math.max(repulseForce, Math.abs(action.field.strength));
        }
        break;
      case 'ADD_INSTABILITY':
        instabilityExplicit += action.amount;
        break;
      case 'MODIFY_STAT':
        if (action.stat === 'health' && action.value < 0) {
          directDamage += Math.abs(action.value);
        }
        break;
      case 'APPLY_STATUS': {
        const dur = formatDurationSec(action.durationMs);
        const labelFn = STATUS_CC_LABELS[action.archetype];
        pushCc(labelFn ? labelFn(dur) : `${formatEnumLabel(action.archetype)} (${dur})`);
        break;
      }
      case 'APPLY_STASIS':
        pushCc(`Stasis lock (${formatDurationSec(action.durationMs)})`);
        break;
      default:
        break;
    }
  });

  if (abilityCanHit(ability) && archetype) {
    const labelFn = STATUS_CC_LABELS[archetype];
    if (labelFn) {
      const archetypeDesc = labelFn('2.0s');
      if (!ccSeen.has(archetypeDesc)) {
        ccDescriptions.unshift(archetypeDesc);
        ccSeen.add(archetypeDesc);
      }
    }
  }

  const baseline = abilityCanHit(ability) ? BASELINE_INSTABILITY_ON_HIT : 0;
  const instabilityYield = Math.round(baseline + instabilityExplicit + implicitInstability);

  const { trajectory, emitter } = resolveDisplayTrajectory(ability);
  let deliveryText = 'Instant';
  if (trajectory) {
    const parts: string[] = [];
    if (emitter && emitter.count > 1) {
      const distLabel =
        emitter.distribution === 'RADIAL' ? 'RING' : formatEnumLabel(emitter.distribution);
      const spread =
        emitter.spreadDeg > 0 ? ` (${emitter.spreadDeg}°)` : '';
      parts.push(`${emitter.count}x ${distLabel}${spread}`);
    }
    const range = trajectory.maxRange ?? 0;
    const speed = trajectory.speed ?? 0;
    if (range > 0) parts.push(`${range} Range`);
    if (speed > 0) parts.push(`${speed} px/s`);
    deliveryText = parts.length > 0 ? parts.join(' · ') : formatEnumLabel(trajectory.type);
  }

  return {
    cooldownSec: formatDurationSec(ability.cooldownMs),
    recoilKick: ability.recoilKick ?? 0,
    repulseForce: Math.round(repulseForce),
    instabilityYield,
    directDamage: Math.round(directDamage),
    ccDescriptions,
    deliveryText,
  };
}

function walkTriggers(
  nodes: TriggerNode[],
  visit: (node: TriggerNode, action: ActionPayload) => void,
): void {
  for (const node of nodes) {
    for (const action of node.actions) {
      visit(node, action);
      if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
        walkTriggers(action.triggers, visit);
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.triggers) {
        walkTriggers(action.payload.triggers, visit);
      }
    }
    if (node.children) walkTriggers(node.children, visit);
  }
}

function emitterHasSpread(emitter: EmitterConfig): boolean {
  return (
    emitter.count > 1 ||
    emitter.spreadDeg > 0 ||
    (emitter.aimOffsetDeg !== undefined && emitter.aimOffsetDeg !== 0)
  );
}

function resolveDisplayTrajectory(ability: AbilitySchema): DisplayTrajectory {
  let onCast: DisplayTrajectory | null = null;

  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        onCast = {
          trajectory: action.projectileTrajectory,
          emitter: action.emitter,
        };
        break;
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.trajectory) {
        return { trajectory: action.payload.trajectory };
      }
    }
    if (onCast) break;
  }

  if (onCast?.emitter && emitterHasSpread(onCast.emitter)) {
    return onCast;
  }
  if (!ability.trajectory && onCast) {
    return onCast;
  }
  if (ability.trajectory) {
    return { trajectory: ability.trajectory, emitter: onCast?.emitter };
  }
  return onCast ?? {};
}

function formatCooldown(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export interface DraftModalCallbacks {
  getLoadout: () => PlayerLoadout;
  onEquip: (selection: DraftSelection) => void;
  onStoreSpell: (ability: AbilitySchema) => AbilitySchema;
  onOpenChange: (open: boolean) => void;
}

export class DraftModal {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private workshopContainer!: HTMLElement;
  private workspaceSplit!: HTMLElement;
  private workspaceMain!: HTMLElement;
  private inspectorPane!: HTMLElement;
  private bottomLoadoutBay!: HTMLElement;
  private workspaceContent!: HTMLElement;
  private vaultRoot!: HTMLElement;
  private forgeRoot!: HTMLElement;
  private vaultTabBtn!: HTMLButtonElement;
  private forgeTabBtn!: HTMLButtonElement;
  private vaultSearchInput!: HTMLInputElement;
  private vaultSortSelect!: HTMLSelectElement;
  private vaultRoleFilterRow!: HTMLElement;
  private vaultMetaFilterRow!: HTMLElement;
  private spellGrid!: HTMLElement;
  private modeRow: HTMLElement;
  private categoryRow: HTMLElement;
  private evolutionBanner: HTMLElement;
  private apiStatusPill: HTMLElement;
  private apiWarningBanner: HTMLElement;
  private promptInput: HTMLInputElement;
  private chipsRow: HTMLElement;
  private cardsContainer: HTMLElement;
  private loadingEl: HTMLElement;
  private synthesizeBtn!: HTMLButtonElement;
  private latencyBadgeEl!: HTMLElement;
  private open_ = false;
  private cards: DraftCard[] = [];
  private intermissionMode = false;

  private synthesisStartTime = 0;
  private timerIntervalId: number | null = null;
  private lastDurationMs: number | null = null;

  private prefetchCache: PrefetchCacheEntry | null = null;

  private streamingSlots: Array<{
    root: HTMLElement;
    rarityBadge: HTMLElement;
    title: HTMLElement;
    tagline: HTMLElement;
    desc: HTMLElement;
    badges: HTMLElement;
    power: HTMLElement;
    equipBtn: HTMLButtonElement;
    card: DraftCard | null;
    finalized: boolean;
  }> | null = null;

  private mode: WorkshopMode = 'FORGE_NEW';
  private selectedCategory: SkillCategory = 'SECONDARY';
  private evolutionContext: EvolutionContext | null = null;
  private evolvingBaseSpellId: string | null = null;
  private activeTab: WorkshopTab = 'VAULT';
  private vaultSearchQuery = '';
  private vaultSortOrder: VaultSortOrder = 'NEWEST';
  private vaultRoleFilters = new Set<SpellRole>();
  private vaultMetaFilters = new Set<VaultMetaFilter>();
  private vaultBuilt = false;
  private forgeVaultPickerActive = false;
  private vaultSavedCardIndex: number | null = null;
  private selectedSpellId: string | null = null;
  private hoveredSpellId: string | null = null;
  private heroScopeAnimId: number | null = null;
  private tooltipEl: HTMLElement | null = null;
  private readonly onInventoryUpdated = (): void => {
    if (this.open_ && this.activeTab === 'VAULT') {
      this.renderVaultGrid();
    }
  };
  private readonly onLoadoutChanged = (): void => {
    if (!this.open_) return;
    this.renderBottomLoadoutBay();
    if (this.activeTab === 'VAULT') {
      this.renderVaultGrid();
      this.renderTacticalInspector();
    }
  };
  private readonly onQuickEquipKeyDown = (e: KeyboardEvent): void => {
    if (!this.open_) return;

    const activeTag = document.activeElement?.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

    const activeSpellId = this.hoveredSpellId ?? this.selectedSpellId;
    if (!activeSpellId) return;

    const targetMapping = SLOT_KEY_MAPPINGS.find((m) => m.keyNum === e.key);
    if (!targetMapping) return;

    e.preventDefault();
    e.stopPropagation();
    this.executeQuickEquip(targetMapping.slot, activeSpellId);
  };

  constructor(private callbacks: DraftModalCallbacks) {
    injectStyles();

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: none; align-items: center; justify-content: center;
      background: rgba(4,6,14,0.72); backdrop-filter: blur(12px);
      opacity: 0; transition: opacity 0.2s ease;
      pointer-events: auto; padding: 16px;
    `;

    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      width: min(1180px, 100%); height: min(92vh, 880px); overflow: hidden;
      display: flex; flex-direction: column;
      padding: 16px 20px 18px; border-radius: 4px;
      ${retroPanelStyle('cyan')}
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      transform: scale(0.97); transition: transform 0.2s ease;
      color: ${RETRO_COLORS.textPrimary}; font-family: ${FONTS.mono};
    `;
    this.panel.dataset.panel = 'true';

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;gap:10px;';
    const title = document.createElement('h2');
    title.textContent = 'Synthesizer Workshop';
    title.style.cssText = `margin:0;font-size:${FONTS.size.title};letter-spacing:0.02em;flex-shrink:0;`;

    this.vaultTabBtn = document.createElement('button');
    this.vaultTabBtn.type = 'button';
    this.vaultTabBtn.className = 'workspace-tab active';
    this.vaultTabBtn.textContent = 'SPELL VAULT';
    this.vaultTabBtn.onclick = () => this.setActiveTab('VAULT');

    this.forgeTabBtn = document.createElement('button');
    this.forgeTabBtn.type = 'button';
    this.forgeTabBtn.className = 'workspace-tab';
    this.forgeTabBtn.textContent = 'FORGE';
    this.forgeTabBtn.onclick = () => this.setActiveTab('FORGE');

    const tabGroup = document.createElement('div');
    tabGroup.className = 'workspace-tabs';
    tabGroup.style.cssText = 'margin-bottom:0;border-bottom:none;padding-bottom:0;flex-shrink:0;';
    tabGroup.appendChild(this.vaultTabBtn);
    tabGroup.appendChild(this.forgeTabBtn);

    this.apiStatusPill = document.createElement('div');
    this.apiStatusPill.style.cssText = `
      margin-left:auto;margin-right:8px;padding:4px 10px;border-radius:999px;font-size:${FONTS.size.sm};
      border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);color:#aaa;
      white-space:nowrap;flex-shrink:1;overflow:hidden;text-overflow:ellipsis;max-width:280px;
    `;

    this.latencyBadgeEl = document.createElement('span');
    this.latencyBadgeEl.style.cssText = `
      font-size:${FONTS.size.sm};font-family:${FONTS.mono};color:${RETRO_COLORS.textMuted};background:rgba(255,255,255,0.05);
      padding:2px 8px;border-radius:4px;border:1px solid ${RETRO_COLORS.borderSubtle};
      display:none;flex-shrink:0;margin-right:8px;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = btnStyle();
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(tabGroup);
    header.appendChild(this.apiStatusPill);
    header.appendChild(this.latencyBadgeEl);
    header.appendChild(closeBtn);

    this.apiWarningBanner = document.createElement('div');
    this.apiWarningBanner.style.cssText = `
      display:none;margin-bottom:8px;padding:8px 12px;border-radius:8px;flex-shrink:0;
      background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);
      color:#fcd34d;font-size:${FONTS.size.body};line-height:1.35;
    `;

    this.modeRow = document.createElement('div');
    this.modeRow.style.cssText =
      'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0;';

    this.categoryRow = document.createElement('div');
    this.categoryRow.style.cssText =
      'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0;';

    this.evolutionBanner = document.createElement('div');
    this.evolutionBanner.style.cssText = `
      display:none;margin-bottom:8px;padding:8px 12px;border-radius:8px;flex-shrink:0;
      background:rgba(0,200,255,0.08);border:1px solid rgba(0,200,255,0.25);
    `;

    const promptRow = document.createElement('div');
    promptRow.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;flex-shrink:0;';
    this.promptInput = document.createElement('input');
    this.promptInput.type = 'text';
    this.promptInput.placeholder = 'Describe your ability... (e.g. "ice vortex boomerang")';
    this.promptInput.style.cssText = `
      flex:1;padding:8px 12px;border-radius:4px;border:1px solid ${RETRO_COLORS.borderSubtle};
      background:${RETRO_COLORS.panelBgOpaque};color:${RETRO_COLORS.textPrimary};font-size:${FONTS.size.body};
      font-family:${FONTS.mono};
    `;
    this.promptInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.synthesize();
    });
    this.promptInput.addEventListener('input', () => {
      this.invalidatePrefetch();
    });

    this.synthesizeBtn = document.createElement('button');
    this.synthesizeBtn.textContent = 'Synthesize';
    this.synthesizeBtn.style.cssText = btnStyle(true);
    this.synthesizeBtn.onclick = () => void this.synthesize();

    promptRow.appendChild(this.promptInput);
    promptRow.appendChild(this.synthesizeBtn);

    this.chipsRow = document.createElement('div');
    this.chipsRow.style.cssText =
      'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0;';
    for (const chip of SUGGEST_CHIPS) {
      const btn = document.createElement('button');
      btn.textContent = chip;
      btn.style.cssText = chipStyle();
      btn.onclick = () => {
        this.invalidatePrefetch();
        const cur = this.promptInput.value.trim();
        this.promptInput.value = cur
          ? `${cur} ${chip.replace(/^\+\s*/, '')}`
          : chip.replace(/^\+\s*/, '');
        this.promptInput.focus();
      };
      this.chipsRow.appendChild(btn);
    }

    this.loadingEl = document.createElement('div');
    this.loadingEl.textContent = 'Synthesizing...';
    this.loadingEl.style.cssText =
      `display:none;text-align:center;color:#888;margin-bottom:6px;flex-shrink:0;font-size:${FONTS.size.body};`;

    this.cardsContainer = document.createElement('div');
    this.cardsContainer.className = 'forge-cards';

    this.forgeRoot = document.createElement('div');
    this.forgeRoot.className = 'forge-root';
    this.forgeRoot.style.display = 'none';
    this.forgeRoot.appendChild(this.modeRow);
    this.forgeRoot.appendChild(this.categoryRow);
    this.forgeRoot.appendChild(this.evolutionBanner);
    this.forgeRoot.appendChild(promptRow);
    this.forgeRoot.appendChild(this.chipsRow);
    this.forgeRoot.appendChild(this.loadingEl);
    this.forgeRoot.appendChild(this.cardsContainer);

    this.vaultRoot = document.createElement('div');
    this.vaultRoot.className = 'vault-root';

    this.workspaceContent = document.createElement('div');
    this.workspaceContent.className = 'workspace-content';
    this.workspaceContent.appendChild(this.vaultRoot);
    this.workspaceContent.appendChild(this.forgeRoot);

    this.workspaceMain = document.createElement('div');
    this.workspaceMain.className = 'workspace-main';
    this.workspaceMain.appendChild(this.workspaceContent);

    this.inspectorPane = document.createElement('div');
    this.inspectorPane.className = 'workspace-inspector-pane';

    this.workspaceSplit = document.createElement('div');
    this.workspaceSplit.className = 'workspace-split';
    this.workspaceSplit.appendChild(this.workspaceMain);
    this.workspaceSplit.appendChild(this.inspectorPane);

    this.bottomLoadoutBay = document.createElement('div');
    this.bottomLoadoutBay.className = 'bottom-loadout-bay';

    this.workshopContainer = document.createElement('div');
    this.workshopContainer.className = 'workshop-container';
    this.workshopContainer.appendChild(this.workspaceSplit);
    this.workshopContainer.appendChild(this.bottomLoadoutBay);

    this.panel.appendChild(header);
    this.panel.appendChild(this.apiWarningBanner);
    this.panel.appendChild(this.workshopContainer);
    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);

    window.addEventListener('inventoryupdated', this.onInventoryUpdated);
    window.addEventListener('loadoutchanged', this.onLoadoutChanged);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open_) this.close();
    });
  }

  isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.intermissionMode = false;
    this.mode = 'FORGE_NEW';
    this.evolutionContext = null;
    this.evolvingBaseSpellId = null;
    this.cards = [];
    this.forgeVaultPickerActive = false;
    this.vaultSavedCardIndex = null;
    this.clearSynthesisWarning();
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    ActionBarHUD.suppress();
    window.addEventListener('keydown', this.onQuickEquipKeyDown);
    this.setActiveTab('VAULT');
    this.startPrefetch();
  }

  close(): void {
    this.stopHeroScopeAnimation();
    this.destroyCombatTooltip();
    this.invalidatePrefetch();
    this.clearSynthesisTimer();
    this.forgeVaultPickerActive = false;
    this.vaultSavedCardIndex = null;
    window.removeEventListener('keydown', this.onQuickEquipKeyDown);
    this.open_ = false;
    this.overlay.style.opacity = '0';
    this.panel.style.transform = 'scale(0.97)';
    setTimeout(() => {
      if (!this.open_) this.overlay.style.display = 'none';
    }, 200);
    this.callbacks.onOpenChange(false);
    ActionBarHUD.restore();
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  openIntermission(cards: DraftCard[]): void {
    this.intermissionMode = true;
    this.mode = 'FORGE_NEW';
    this.evolutionContext = null;
    this.evolvingBaseSpellId = null;
    this.cards = cards;
    this.clearSynthesisWarning();
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    ActionBarHUD.suppress();
    window.addEventListener('keydown', this.onQuickEquipKeyDown);
    this.setActiveTab('FORGE');
  }

  private setMode(mode: WorkshopMode): void {
    this.invalidatePrefetch();
    this.mode = mode;
    if (mode === 'FORGE_NEW' || mode === 'PASSIVE_UPGRADES') {
      this.evolutionContext = null;
      this.evolvingBaseSpellId = null;
    }
    this.refreshUI();
    this.startPrefetch();
  }

  private startEvolution(spellId: string): void {
    const baseSpell = SpellInventoryManager.getSpell(spellId);
    if (!baseSpell) return;

    this.invalidatePrefetch();
    this.evolvingBaseSpellId = spellId;

    const loadout = SpellInventoryManager.getLoadout();
    let slotKey: ActionSlotKey = 'RMB';
    let category: SkillCategory = 'SECONDARY';
    for (const key of ACTION_SLOT_KEYS) {
      if (loadout[key] === spellId) {
        slotKey = key;
        category = SLOT_CATEGORY_MAP[key];
        break;
      }
    }

    this.evolutionContext = {
      baseAbility: structuredClone(baseSpell),
      slotKey,
      category,
    };
    this.mode = 'EVOLVE_EXISTING';
    this.selectedCategory = category;
    this.setActiveTab('FORGE');
    this.startPrefetch();
  }

  private cancelEvolution(): void {
    this.invalidatePrefetch();
    this.evolvingBaseSpellId = null;
    this.evolutionContext = null;
    this.mode = 'FORGE_NEW';
    this.refreshUI();
    this.startPrefetch();
  }

  private refreshUI(): void {
    this.syncTabChrome();
    this.renderApiStatusPill();
    this.renderBottomLoadoutBay();
    this.renderWorkspace();
  }

  private syncTabChrome(): void {
    this.vaultTabBtn.classList.toggle('active', this.activeTab === 'VAULT');
    this.forgeTabBtn.classList.toggle('active', this.activeTab === 'FORGE');
    this.vaultRoot.style.display = this.activeTab === 'VAULT' ? 'block' : 'none';
    this.forgeRoot.style.display = this.activeTab === 'FORGE' ? 'flex' : 'none';
  }

  private setActiveTab(tab: WorkshopTab): void {
    this.stopHeroScopeAnimation();
    this.activeTab = tab;
    this.refreshUI();
    if (tab === 'FORGE') {
      this.promptInput.focus();
    }
  }

  private renderWorkspace(): void {
    if (this.activeTab === 'VAULT') {
      this.renderVaultGrid();
      return;
    }
    this.renderForge();
  }

  private buildVault(): void {
    if (this.vaultBuilt) return;
    this.vaultBuilt = true;

    const toolbar = document.createElement('div');
    toolbar.className = 'vault-toolbar';

    this.vaultSearchInput = document.createElement('input');
    this.vaultSearchInput.type = 'search';
    this.vaultSearchInput.placeholder = 'Search spells...';
    this.vaultSearchInput.className = 'vault-search';
    this.vaultSearchInput.addEventListener('input', () => {
      this.vaultSearchQuery = this.vaultSearchInput.value;
      this.renderVaultGrid();
    });
    toolbar.appendChild(this.vaultSearchInput);

    this.vaultSortSelect = document.createElement('select');
    this.vaultSortSelect.className = 'vault-sort-select';
    for (const order of VAULT_SORT_ORDERS) {
      const option = document.createElement('option');
      option.value = order;
      option.textContent = getVaultSortLabel(order);
      this.vaultSortSelect.appendChild(option);
    }
    this.vaultSortSelect.value = this.vaultSortOrder;
    this.vaultSortSelect.addEventListener('change', () => {
      this.vaultSortOrder = this.vaultSortSelect.value as VaultSortOrder;
      this.renderVaultGrid();
    });
    toolbar.appendChild(this.vaultSortSelect);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'vault-btn-reset';
    resetBtn.textContent = 'Reset Loadout';
    resetBtn.addEventListener('click', () => {
      if (
        !window.confirm(
          'Reset your equipped loadout to the default demo spells? This will replace all five action slots.',
        )
      ) {
        return;
      }
      SpellInventoryManager.resetToDefaultLoadout();
    });
    toolbar.appendChild(resetBtn);

    this.vaultRoot.appendChild(toolbar);

    this.vaultRoleFilterRow = document.createElement('div');
    this.vaultRoleFilterRow.className = 'vault-filter-row';
    this.vaultRoot.appendChild(this.vaultRoleFilterRow);

    this.vaultMetaFilterRow = document.createElement('div');
    this.vaultMetaFilterRow.className = 'vault-filter-row';
    this.vaultRoot.appendChild(this.vaultMetaFilterRow);

    this.buildVaultFilterChips();

    this.spellGrid = document.createElement('div');
    this.spellGrid.className = 'spell-grid-square';
    this.vaultRoot.appendChild(this.spellGrid);
  }

  private buildVaultFilterChips(): void {
    this.vaultRoleFilterRow.innerHTML = '';
    this.vaultMetaFilterRow.innerHTML = '';

    const allRolesBtn = document.createElement('button');
    allRolesBtn.type = 'button';
    allRolesBtn.textContent = 'All';
    allRolesBtn.style.cssText = chipStyle(this.vaultRoleFilters.size === 0);
    allRolesBtn.addEventListener('click', () => {
      this.vaultRoleFilters.clear();
      this.refreshVaultFilterChips();
      this.renderVaultGrid();
    });
    this.vaultRoleFilterRow.appendChild(allRolesBtn);

    for (const role of SPELL_ROLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = getSpellRoleLabel(role);
      btn.style.cssText = chipStyle(this.vaultRoleFilters.has(role));
      btn.addEventListener('click', () => {
        if (this.vaultRoleFilters.has(role)) {
          this.vaultRoleFilters.delete(role);
        } else {
          this.vaultRoleFilters.add(role);
        }
        this.refreshVaultFilterChips();
        this.renderVaultGrid();
      });
      this.vaultRoleFilterRow.appendChild(btn);
    }

    const metaFilters: { id: VaultMetaFilter; label: string }[] = [
      { id: 'EQUIPPED', label: 'Equipped' },
      { id: 'NEW', label: 'New' },
      { id: 'CUSTOM', label: 'Custom' },
    ];

    for (const meta of metaFilters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = meta.label;
      btn.style.cssText = chipStyle(this.vaultMetaFilters.has(meta.id));
      btn.addEventListener('click', () => {
        if (this.vaultMetaFilters.has(meta.id)) {
          this.vaultMetaFilters.delete(meta.id);
        } else {
          this.vaultMetaFilters.add(meta.id);
        }
        this.refreshVaultFilterChips();
        this.renderVaultGrid();
      });
      this.vaultMetaFilterRow.appendChild(btn);
    }
  }

  private refreshVaultFilterChips(): void {
    const roleButtons = [...this.vaultRoleFilterRow.querySelectorAll('button')];
    const allRolesBtn = roleButtons[0];
    if (allRolesBtn) {
      allRolesBtn.style.cssText = chipStyle(this.vaultRoleFilters.size === 0);
    }
    for (let i = 0; i < SPELL_ROLES.length; i++) {
      const btn = roleButtons[i + 1];
      if (btn) {
        btn.style.cssText = chipStyle(this.vaultRoleFilters.has(SPELL_ROLES[i]));
      }
    }

    const metaButtons = [...this.vaultMetaFilterRow.querySelectorAll('button')];
    const metaIds: VaultMetaFilter[] = ['EQUIPPED', 'NEW', 'CUSTOM'];
    for (let i = 0; i < metaIds.length; i++) {
      const btn = metaButtons[i];
      if (btn) {
        btn.style.cssText = chipStyle(this.vaultMetaFilters.has(metaIds[i]));
      }
    }
  }

  private hasVaultFiltersActive(): boolean {
    return (
      this.vaultSearchQuery.trim().length > 0 ||
      this.vaultRoleFilters.size > 0 ||
      this.vaultMetaFilters.size > 0
    );
  }

  private renderVaultGrid(): void {
    this.buildVault();
    this.spellGrid.innerHTML = '';

    const q = this.vaultSearchQuery.trim().toLowerCase();
    const loadout = SpellInventoryManager.getLoadout();
    const loadoutSpellIds = new Set(
      Object.values(loadout).filter((id): id is string => id !== null),
    );
    const equippedSlotBySpellId = new Map<string, ActionSlotKey>();
    for (const [slot, id] of Object.entries(loadout)) {
      if (id) equippedSlotBySpellId.set(id, slot as ActionSlotKey);
    }
    const metaContext = {
      loadoutSpellIds,
      isNewSpell: (id: string) => SpellInventoryManager.isNewSpell(id),
      isPresetSpell: (id: string) => SpellInventoryManager.isPresetSpell(id),
    };

    const spells = sortVaultSpells(
      SpellInventoryManager.getAllSpells().filter((spell) => {
        if (q) {
          const archetype = (spell.archetype ?? '').toLowerCase();
          const tagline = (spell.tagline ?? '').toLowerCase();
          const matchesText =
            spell.name.toLowerCase().includes(q) ||
            archetype.includes(q) ||
            tagline.includes(q);
          if (!matchesText) return false;
        }
        if (!spellMatchesRoleFilter(spell, this.vaultRoleFilters)) return false;
        if (!spellMatchesMetaFilter(spell, this.vaultMetaFilters, metaContext)) return false;
        return true;
      }),
      this.vaultSortOrder,
      (id) => SpellInventoryManager.getSpellInsertionIndex(id),
    );

    const spellIds = new Set(spells.map((s) => s.id));
    if (
      this.selectedSpellId === null ||
      !spellIds.has(this.selectedSpellId)
    ) {
      const defaultId = loadout.LMB ?? spells[0]?.id ?? null;
      this.selectedSpellId = defaultId;
    }

    if (spells.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = this.hasVaultFiltersActive()
        ? 'No spells match your filters.'
        : 'No spells in inventory.';
      empty.style.cssText = `padding:24px;text-align:center;color:${RETRO_COLORS.textMuted};font-size:${FONTS.size.body};grid-column:1/-1;`;
      this.spellGrid.appendChild(empty);
      this.renderTacticalInspector();
      return;
    }

    for (const spell of spells) {
      this.spellGrid.appendChild(this.createSpellTile(spell, equippedSlotBySpellId));
    }

    this.renderTacticalInspector();
  }

  private renderTacticalInspector(): void {
    this.stopHeroScopeAnimation();
    this.inspectorPane.innerHTML = '';

    const activeId = this.hoveredSpellId ?? this.selectedSpellId;
    const spell = activeId ? (SpellInventoryManager.getSpell(activeId) ?? null) : null;

    if (!spell) {
      const empty = document.createElement('div');
      empty.className = 'inspector-empty';
      empty.textContent = 'Select or hover a spell to inspect telemetry';
      this.inspectorPane.appendChild(empty);
      return;
    }

    const archetypeColor = getArchetypeColor(spell.archetype, spell.visuals?.color);
    const rarity = resolveSpellRarity(spell);
    const tier = rarity.toLowerCase();
    const telemetry = extractSpellTelemetry(spell);
    const profile = calculateCombatProfile(telemetry);
    const loadout = SpellInventoryManager.getLoadout();
    const evolutionDiff = resolveSpellEvolutionDiff(spell);

    const panel = document.createElement('div');
    panel.className = `inspector-panel tier-${tier}`;

    const heroWrap = document.createElement('div');
    heroWrap.className = `inspector-hero-wrap tier-${tier}`;
    if (rarity === 'COMMON') {
      heroWrap.style.borderColor = archetypeColor;
      heroWrap.style.boxShadow = `inset 0 0 16px rgba(0, 0, 0, 0.8), 0 0 12px ${archetypeColor}44`;
    }

    const scopeHud = extractScopeHudData(spell);
    heroWrap.appendChild(buildScopeCornerHud(scopeHud.channels, 'top-left'));
    heroWrap.appendChild(buildScopeCornerHud(scopeHud.velocity, 'top-right'));
    heroWrap.appendChild(buildScopeCornerHud(scopeHud.spread, 'bottom-left'));
    heroWrap.appendChild(buildScopeCornerHud(scopeHud.collision, 'bottom-right'));

    const scopeCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    scopeCanvas.width = SCOPE_SIZE * dpr;
    scopeCanvas.height = SCOPE_SIZE * dpr;
    scopeCanvas.style.width = `${SCOPE_SIZE}px`;
    scopeCanvas.style.height = `${SCOPE_SIZE}px`;
    heroWrap.appendChild(scopeCanvas);

    const scopePadding = Math.round(SCOPE_SIZE * 0.16);
    const { origin, paths, endpoints } = resolveIconTrajectoryPaths(
      spell,
      SCOPE_SIZE,
      scopePadding,
    );
    const scopeCtx = scopeCanvas.getContext('2d');
    if (scopeCtx) {
      scopeCtx.scale(dpr, dpr);
      this.startHeroScopeAnimation(
        scopeCanvas,
        scopeCtx,
        origin,
        paths,
        endpoints,
        archetypeColor,
        spell.visuals?.projectileStyle,
      );
    }

    const header = document.createElement('div');
    header.className = 'inspector-header';

    const title = document.createElement('div');
    title.className = 'inspector-title';
    title.textContent = spell.name;

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'inspector-header-tags';

    const rarityTag = document.createElement('span');
    rarityTag.className = `inspector-rarity-tag tier-${tier}`;
    rarityTag.textContent = getTierCrest(rarity);

    const archetypeTag = document.createElement('span');
    archetypeTag.className = 'inspector-archetype-tag';
    archetypeTag.textContent = spell.archetype ?? 'UNKNOWN';
    archetypeTag.style.color = archetypeColor;
    archetypeTag.style.borderColor = archetypeColor;
    archetypeTag.style.background = `${archetypeColor}18`;

    tagsWrap.appendChild(rarityTag);
    tagsWrap.appendChild(archetypeTag);

    header.appendChild(title);
    header.appendChild(tagsWrap);

    const compareBanner = document.createElement('div');
    compareBanner.className = 'inspector-compare-banner';
    compareBanner.id = 'inspector-compare-banner';

    let mutationBanner: HTMLElement | null = null;
    if (evolutionDiff.length > 0) {
      mutationBanner = document.createElement('div');
      mutationBanner.className = 'forge-mutation-banner';
      const arrow = document.createElement('span');
      arrow.textContent = '▲';
      mutationBanner.appendChild(arrow);
      mutationBanner.appendChild(document.createTextNode(` ${evolutionDiff[0]}`));
    }

    const telemetryGrid = document.createElement('div');
    telemetryGrid.className = 'inspector-telemetry-grid';

    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('COOLDOWN', telemetry.cooldownSec, 'cooldown'),
    );
    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('RECOIL', `${telemetry.recoilKick} px/s`, 'recoil'),
    );

    const repulseVal = document.createElement('span');
    repulseVal.className = 'telemetry-value val-repulse';
    repulseVal.textContent = `${telemetry.repulseForce} Force`;
    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('REPULSE FORCE', repulseVal, 'repulse'),
    );

    const instabilityVal = document.createElement('span');
    instabilityVal.className = 'telemetry-value val-instability';
    instabilityVal.textContent = `+${telemetry.instabilityYield}% Yield`;
    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('INSTABILITY', instabilityVal, 'instability'),
    );

    if (telemetry.directDamage > 0) {
      telemetryGrid.appendChild(
        this.buildInspectorTelemetryCell(
          'DIRECT DAMAGE',
          `${telemetry.directDamage} HP`,
          'damage',
        ),
      );
    }

    const deliveryVal = document.createElement('span');
    deliveryVal.className = 'telemetry-value val-delivery';
    deliveryVal.textContent = telemetry.deliveryText;
    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('DELIVERY SPECS', deliveryVal, undefined, true),
    );

    const profileCard = this.buildImpactProfileCard(profile);

    const tagsRow = document.createElement('div');
    tagsRow.className = 'inspector-tags-row';
    this.appendSemanticBadges(tagsRow, spell);

    const desc = document.createElement('div');
    desc.className = 'inspector-desc';
    const archetypeNote =
      (spell.archetype && ARCHETYPE_DESCRIPTIONS[spell.archetype]) || ARCHETYPE_FALLBACK;
    const flavor = spell.tagline || spell.description || '';
    desc.textContent = flavor ? `${archetypeNote}\n\n${flavor}` : archetypeNote;

    const actionsSection = document.createElement('div');
    actionsSection.className = 'inspector-actions-section';
    const upgradeBtn = document.createElement('button');
    upgradeBtn.type = 'button';
    upgradeBtn.className = 'inspector-upgrade-btn';
    upgradeBtn.innerHTML = '<span>✦</span> UPGRADE / EVOLVE SPELL';
    upgradeBtn.addEventListener('click', () => {
      this.startEvolution(spell.id);
    });
    actionsSection.appendChild(upgradeBtn);

    const equipSection = document.createElement('div');
    equipSection.className = 'inspector-equip-section';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'inspector-equip-label-wrap';

    const equipLabel = document.createElement('span');
    equipLabel.className = 'inspector-equip-label';
    equipLabel.textContent = 'EQUIP TO LOADOUT';

    const equipHint = document.createElement('span');
    equipHint.className = 'inspector-equip-hint';
    equipHint.textContent = 'PRESS [1-5]';

    labelWrap.appendChild(equipLabel);
    labelWrap.appendChild(equipHint);

    const equipButtons = document.createElement('div');
    equipButtons.className = 'inspector-equip-buttons';

    for (const mapping of SLOT_KEY_MAPPINGS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inspector-equip-btn';
      btn.dataset.slot = mapping.slot;

      const isEquipped = loadout[mapping.slot] === spell.id;
      if (isEquipped) {
        btn.classList.add('is-active-slot');
      }

      const keynum = document.createElement('span');
      keynum.className = 'equip-btn-keynum';
      keynum.textContent = `[${mapping.keyNum}]`;

      const slotname = document.createElement('span');
      slotname.className = 'equip-btn-slotname';
      slotname.textContent = mapping.slot;

      btn.appendChild(keynum);
      btn.appendChild(slotname);

      if (isEquipped) {
        const check = document.createElement('span');
        check.className = 'equip-btn-check';
        check.textContent = '✓';
        btn.appendChild(check);
      }

      btn.addEventListener('mouseenter', () => {
        btn.classList.add('is-comparing');
        this.showSlotComparison(mapping.slot, spell);
      });
      btn.addEventListener('mouseleave', () => {
        btn.classList.remove('is-comparing');
        this.clearSlotComparison();
      });
      btn.addEventListener('click', () => {
        this.executeQuickEquip(mapping.slot, spell.id);
      });
      equipButtons.appendChild(btn);
    }

    equipSection.appendChild(labelWrap);
    equipSection.appendChild(equipButtons);

    panel.appendChild(heroWrap);
    panel.appendChild(header);
    panel.appendChild(compareBanner);
    if (mutationBanner) panel.appendChild(mutationBanner);
    panel.appendChild(telemetryGrid);
    panel.appendChild(profileCard);
    panel.appendChild(tagsRow);
    panel.appendChild(desc);
    panel.appendChild(actionsSection);
    panel.appendChild(equipSection);
    this.inspectorPane.appendChild(panel);
  }

  private createSpellTile(
    spell: AbilitySchema,
    equippedSlotBySpellId: Map<string, ActionSlotKey>,
  ): HTMLElement {
    const archetypeColor = getArchetypeColor(spell.archetype, spell.visuals?.color);
    const rarity = resolveSpellRarity(spell);
    const tile = document.createElement('div');
    tile.className = `spell-tile tier-${rarity.toLowerCase()}`;
    tile.dataset.spellId = spell.id;
    tile.style.borderColor = archetypeColor;

    if (rarity !== 'COMMON') {
      const notch = document.createElement('div');
      notch.className = `tile-rarity-notch notch-${rarity.toLowerCase()}`;
      notch.textContent = rarity === 'RARE' ? '◈' : rarity === 'EPIC' ? '✦' : '★';
      tile.appendChild(notch);
    }

    if (this.selectedSpellId === spell.id) {
      tile.classList.add('tile-selected');
    }

    const equippedSlot = equippedSlotBySpellId.get(spell.id);
    if (equippedSlot) {
      const badge = document.createElement('div');
      badge.className = 'tile-equipped-badge';
      badge.textContent = equippedSlot;
      tile.appendChild(badge);
    }

    if (SpellInventoryManager.isNewSpell(spell.id)) {
      tile.classList.add('tile-new');
      const badge = document.createElement('div');
      badge.className = 'tile-new-badge';
      badge.textContent = 'NEW';
      tile.appendChild(badge);
    }

    const iconWrap = document.createElement('div');
    iconWrap.className = 'tile-icon-wrap';
    iconWrap.appendChild(generateSpellIcon(spell, 56));
    tile.appendChild(iconWrap);

    tile.addEventListener('mouseenter', () => {
      this.hoveredSpellId = spell.id;
      if (
        rarity === 'COMMON' &&
        !tile.classList.contains('tile-selected') &&
        !tile.classList.contains('tile-new')
      ) {
        tile.style.boxShadow = `0 0 8px ${archetypeColor}66`;
      }
      this.renderTacticalInspector();
    });

    tile.addEventListener('mouseleave', () => {
      this.hoveredSpellId = null;
      if (!tile.classList.contains('tile-selected') && rarity === 'COMMON') {
        tile.style.boxShadow = '';
      }
      this.renderTacticalInspector();
    });

    tile.addEventListener('click', () => {
      this.selectedSpellId = spell.id;
      if (SpellInventoryManager.markSpellInspected(spell.id)) {
        return;
      }
      for (const sibling of this.spellGrid.querySelectorAll('.spell-tile')) {
        sibling.classList.remove('tile-selected');
        (sibling as HTMLElement).style.boxShadow = '';
      }
      tile.classList.add('tile-selected');
      tile.style.boxShadow = '';
      this.renderTacticalInspector();
    });

    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const items = ACTION_SLOT_KEYS.map((slotKey) => ({
        label: `[${slotKey}] ${getCategoryLabel(SLOT_CATEGORY_MAP[slotKey])}`,
        onSelect: () => {
          SpellInventoryManager.equipSpell(slotKey, spell.id);
        },
      }));
      showQuickEquipMenu(e.clientX, e.clientY, items);
    });

    attachVaultCardDrag(tile, spell.id);
    return tile;
  }

  private renderForge(): void {
    this.renderSynthesisControls();
    if (this.forgeVaultPickerActive) {
      this.renderForgeVaultPickerCards();
    } else {
      this.renderResultCards();
    }
  }

  private renderApiStatusPill(): void {
    const status = getApiConnectionStatus();
    const settings = getAiSettings();
    const model = status.model || settings.model || DEFAULT_MODEL;
    const hasKey = settings.apiKey.trim().length > 0;

    if (status.online) {
      this.apiStatusPill.textContent = `● ${model} (Active)`;
      this.apiStatusPill.style.color = '#6ee7b7';
      this.apiStatusPill.style.borderColor = 'rgba(52,211,153,0.45)';
      this.apiStatusPill.style.background = 'rgba(52,211,153,0.12)';
      this.apiStatusPill.title = 'AI online — last synthesis succeeded';
    } else if (!hasKey) {
      this.apiStatusPill.textContent = '○ Heuristic Mode';
      this.apiStatusPill.style.color = '#fcd34d';
      this.apiStatusPill.style.borderColor = 'rgba(245,158,11,0.4)';
      this.apiStatusPill.style.background = 'rgba(245,158,11,0.1)';
      this.apiStatusPill.title = 'No API key configured — using offline heuristics';
    } else {
      this.apiStatusPill.textContent = '○ Heuristic Fallback';
      this.apiStatusPill.style.color = '#fcd34d';
      this.apiStatusPill.style.borderColor = 'rgba(245,158,11,0.4)';
      this.apiStatusPill.style.background = 'rgba(245,158,11,0.1)';
      this.apiStatusPill.title = status.lastError
        ? `Last error: ${status.lastError}`
        : 'API key set — awaiting successful call';
    }
  }

  private showSynthesisWarning(message: string): void {
    this.apiWarningBanner.style.display = 'block';
    this.apiWarningBanner.textContent = message;
  }

  private clearSynthesisWarning(): void {
    this.apiWarningBanner.style.display = 'none';
    this.apiWarningBanner.textContent = '';
  }

  private clearSynthesisTimer(resetButton = true): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    if (resetButton) {
      this.synthesizeBtn.textContent = 'Synthesize';
      this.synthesizeBtn.disabled = false;
    }
  }

  private renderBottomLoadoutBay(): void {
    this.bottomLoadoutBay.innerHTML = '';
    const equipped = SpellInventoryManager.getEquippedAbilities();
    const loadout = SpellInventoryManager.getLoadout();

    for (const key of ACTION_SLOT_KEYS) {
      const spell = equipped[key];
      const isEvolveSource =
        this.evolvingBaseSpellId !== null && loadout[key] === this.evolvingBaseSpellId;

      const slot = document.createElement('div');
      slot.className = 'bottom-slot drop-zone';
      slot.dataset.slotKey = key;
      if (isEvolveSource) {
        slot.classList.add('evolve-source');
      }

      const badge = document.createElement('span');
      badge.className = 'bottom-slot-badge';
      badge.textContent = key;
      slot.appendChild(badge);

      if (spell) {
        slot.appendChild(generateSpellIcon(spell, 48));

        const name = document.createElement('span');
        name.className = 'bottom-slot-name';
        name.textContent = spell.name;
        slot.appendChild(name);

        attachDockSlotDrag(slot, spell.id, key);
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showQuickEquipMenu(e.clientX, e.clientY, [
            {
              label: 'Unequip',
              onSelect: () => SpellInventoryManager.unequipSlot(key),
            },
          ]);
        });
      }

      attachInventoryDropZone(slot, key, (e) => this.handleForgeCardDrop(key, e));
      this.bottomLoadoutBay.appendChild(slot);
    }
  }

  private renderSynthesisControls(): void {
    this.modeRow.innerHTML = '';
    this.modeRow.style.display = this.evolvingBaseSpellId ? 'none' : 'flex';
    const modes: { id: WorkshopMode; label: string }[] = [
      { id: 'FORGE_NEW', label: 'Forge New Spell' },
      { id: 'PASSIVE_UPGRADES', label: 'Passive Upgrades' },
    ];
    for (const m of modes) {
      const btn = document.createElement('button');
      btn.textContent = m.label;
      btn.style.cssText = chipStyle(this.mode === m.id);
      btn.onclick = () => this.setMode(m.id);
      this.modeRow.appendChild(btn);
    }

    this.categoryRow.innerHTML = '';
    this.categoryRow.style.display = 'none';

    if (this.evolvingBaseSpellId) {
      const baseSpell = SpellInventoryManager.getSpell(this.evolvingBaseSpellId);
      this.evolutionBanner.className = 'forge-evolving-banner';
      this.evolutionBanner.style.display = 'flex';
      this.evolutionBanner.innerHTML = '';

      const text = document.createElement('span');
      text.textContent = `UPGRADING BASE: [${baseSpell?.name ?? 'Unknown'}]`;

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'forge-evolving-cancel';
      cancel.textContent = 'Cancel';
      cancel.onclick = () => this.cancelEvolution();

      this.evolutionBanner.appendChild(text);
      this.evolutionBanner.appendChild(cancel);
    } else {
      this.evolutionBanner.className = '';
      this.evolutionBanner.style.display = 'none';
      this.evolutionBanner.innerHTML = '';
    }

    this.chipsRow.style.display =
      this.evolvingBaseSpellId || this.mode === 'PASSIVE_UPGRADES' ? 'none' : 'flex';

    if (this.mode === 'PASSIVE_UPGRADES') {
      this.promptInput.placeholder = 'Describe a passive upgrade... (e.g. "faster movement")';
    } else if (this.evolvingBaseSpellId) {
      this.promptInput.placeholder =
        "Describe mutation or upgrade (e.g. 'Add cluster bomblets on impact and reduce cooldown')...";
    } else {
      this.promptInput.placeholder = 'Describe your ability... (e.g. "ice vortex boomerang")';
    }
  }

  private resolveEffectivePrompt(): string {
    return (
      this.promptInput.value.trim() ||
      (this.mode === 'PASSIVE_UPGRADES'
        ? 'kinetic conditioning'
        : this.mode === 'EVOLVE_EXISTING'
          ? 'cluster bomblets on impact'
          : 'kinetic combat ability')
    );
  }

  private resolveSynthesisCategory(): SkillCategory {
    return this.mode === 'EVOLVE_EXISTING' && this.evolutionContext
      ? this.evolutionContext.category
      : this.selectedCategory;
  }

  private invalidatePrefetch(): void {
    this.prefetchCache = invalidatePrefetch(this.prefetchCache);
  }

  private startPrefetch(): void {
    this.prefetchCache = startPrefetch(
      this.prefetchCache,
      this.intermissionMode,
      this.mode,
      this.resolveSynthesisCategory(),
      this.resolveEffectivePrompt(),
      this.evolutionContext,
      () => this.callbacks.getLoadout(),
    );
  }

  private async synthesize(): Promise<void> {
    if (this.mode === 'EVOLVE_EXISTING' && !this.evolutionContext) {
      this.loadingEl.style.display = 'block';
      this.loadingEl.textContent = 'Select a base ability to evolve first.';
      setTimeout(() => {
        this.loadingEl.style.display = 'none';
        this.loadingEl.textContent = 'Synthesizing...';
      }, 1600);
      return;
    }

    const prompt = this.resolveEffectivePrompt();
    const category = this.resolveSynthesisCategory();
    const key = buildCurrentPrefetchKey(
      this.mode,
      category,
      prompt,
      this.evolutionContext,
    );
    const cachedEntry = this.prefetchCache?.key === key ? this.prefetchCache : null;
    const prefetchCards = cachedEntry?.cards ?? null;
    let prefetchPromise: Promise<DraftCard[]> | null =
      cachedEntry && !cachedEntry.cards ? cachedEntry.promise : null;

    if (cachedEntry) {
      this.prefetchCache = null;
    } else {
      this.invalidatePrefetch();
    }

    this.clearSynthesisWarning();
    this.forgeVaultPickerActive = false;
    this.vaultSavedCardIndex = null;
    const useStreaming =
      this.mode !== 'PASSIVE_UPGRADES' &&
      getAiSettings().apiKey.trim().length > 0 &&
      !prefetchCards;

    if (useStreaming && prefetchPromise && cachedEntry) {
      cachedEntry.abortController.abort();
      cachedEntry.promise.catch(() => {});
      prefetchPromise = null;
    }

    if (useStreaming) {
      this.loadingEl.style.display = 'none';
      this.renderStreamingSkeletons();
    } else {
      this.loadingEl.style.display = 'block';
      this.loadingEl.textContent = 'Synthesizing...';
      this.cardsContainer.innerHTML = '';
    }

    // In-flight prefetch (non-streaming) measures from prefetch dispatch; fresh requests start now.
    this.synthesisStartTime =
      prefetchPromise && !useStreaming && cachedEntry
        ? cachedEntry.startedAt
        : performance.now();
    this.latencyBadgeEl.style.display = 'none';
    this.synthesizeBtn.disabled = true;
    this.clearSynthesisTimer(false);
    this.timerIntervalId = window.setInterval(() => {
      const elapsedSec = ((performance.now() - this.synthesisStartTime) / 1000).toFixed(1);
      this.synthesizeBtn.textContent = `Synthesizing... (${elapsedSec}s)`;
    }, 50);

    try {
      if (prefetchCards) {
        this.cards = prefetchCards;
      } else if (prefetchPromise) {
        this.cards = await prefetchPromise;
      } else {
        const loadout = this.callbacks.getLoadout();
        this.cards = await synthesizeAbility(
          prompt,
          category,
          loadout,
          this.mode === 'EVOLVE_EXISTING' ? this.evolutionContext ?? undefined : undefined,
          this.mode === 'PASSIVE_UPGRADES',
          {
            onCardChunk: useStreaming
              ? (index, partial) => this.updateStreamingCard(index, partial)
              : undefined,
          },
        );
      }

      const meta = getLastSynthesisMeta();
      if (meta.source === 'heuristic' && meta.error) {
        if (meta.error === 'No API key configured') {
          this.showSynthesisWarning(
            'Heuristic Mode (no API key). Displaying offline cards.',
          );
        } else {
          this.showSynthesisWarning(
            `API call failed: ${meta.error}. Displaying heuristic cards.`,
          );
        }
      }

      this.renderApiStatusPill();
      if (this.shouldShowForgeVaultPicker()) {
        await this.showForgeVaultPicker();
      } else if (useStreaming && this.streamingSlots) {
        this.finalizeStreamingCards();
      } else {
        this.renderResultCards();
      }
    } finally {
      this.clearSynthesisTimer();
      const duration = Math.round(performance.now() - this.synthesisStartTime);
      this.lastDurationMs = duration;
      if (this.open_) {
        this.latencyBadgeEl.textContent = `⏱ ${formatDuration(duration)}`;
        this.latencyBadgeEl.style.display = 'inline-block';
      }
      this.loadingEl.style.display = 'none';
    }
  }

  private shouldShowForgeVaultPicker(): boolean {
    return !this.intermissionMode && this.mode !== 'PASSIVE_UPGRADES';
  }

  private mintSpellId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `spell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private clearVaultFilters(): void {
    this.vaultSearchQuery = '';
    if (this.vaultBuilt) {
      this.vaultSearchInput.value = '';
    }
    this.vaultRoleFilters.clear();
    this.vaultMetaFilters.clear();
    this.refreshVaultFilterChips();
  }

  private async prepareForgeCardsForDisplay(): Promise<void> {
    for (const card of this.cards) {
      if (card.type !== 'ACTIVE_ABILITY' || card.abilityPayload) continue;
      card.abilityPayload = await compileAbilityPayload(
        card,
        this.evolutionContext?.baseAbility,
      );
      stampDraftCardMetadataOntoAbility(card.abilityPayload, card);
    }
  }

  private async showForgeVaultPicker(): Promise<void> {
    await this.prepareForgeCardsForDisplay();
    this.streamingSlots = null;
    this.forgeVaultPickerActive = true;
    this.renderForgeVaultPickerCards();
  }

  private getForgePickerCards(): DraftCard[] {
    return this.cards.filter((card) => card.type === 'ACTIVE_ABILITY');
  }

  private getForgePickerCard(cardIndex: number): DraftCard | null {
    return this.getForgePickerCards()[cardIndex] ?? null;
  }

  private handleForgeCardDrop(targetSlot: ActionSlotKey, event: DragEvent): void {
    if (!this.forgeVaultPickerActive) return;

    const raw = event.dataTransfer?.getData('text/plain');
    if (!raw) return;

    const payload = parseForgeCardDragPayload(raw);
    if (!payload) return;

    const card = this.getForgePickerCard(payload.cardIndex);
    if (!card?.abilityPayload) return;

    if (this.vaultSavedCardIndex !== null && this.vaultSavedCardIndex !== payload.cardIndex) {
      return;
    }

    if (this.vaultSavedCardIndex === null) {
      this.saveCardToVault(card, payload.cardIndex);
    }

    const spellId = card.abilityPayload?.id;
    if (spellId) {
      SpellInventoryManager.equipSpell(targetSlot, spellId);
    }
  }

  private saveCardToVault(card: DraftCard, cardIndex: number): void {
    if (this.vaultSavedCardIndex !== null || !card.abilityPayload) return;

    const ability = structuredClone(card.abilityPayload);
    ability.id = this.mintSpellId();
    ability.name = card.title || ability.name;
    ability.tagline = card.tagline;
    ability.description = card.description;
    stampDraftCardMetadataOntoAbility(ability, card);

    const stored = this.callbacks.onStoreSpell(ability);
    card.abilityPayload = stored;
    this.vaultSavedCardIndex = cardIndex;

    const category = this.resolveSynthesisCategory();
    this.evolvingBaseSpellId = null;
    this.evolutionContext = null;
    this.mode = 'FORGE_NEW';
    this.selectedCategory = category;
    this.renderForgeVaultPickerCards();
  }

  private navigateToVaultSpell(spellId: string): void {
    this.hoveredSpellId = null;
    this.clearVaultFilters();
    this.selectedSpellId = spellId;
    this.setActiveTab('VAULT');
  }

  private ensureCombatTooltip(): HTMLElement {
    if (this.tooltipEl) return this.tooltipEl;
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'retro-combat-tooltip';
    document.body.appendChild(this.tooltipEl);
    return this.tooltipEl;
  }

  private destroyCombatTooltip(): void {
    if (!this.tooltipEl) return;
    this.tooltipEl.classList.remove('is-visible');
    this.tooltipEl.remove();
    this.tooltipEl = null;
  }

  private attachSemanticTooltip(el: HTMLElement, title: string, text: string): void {
    el.addEventListener('mouseenter', () => {
      const tooltip = this.ensureCombatTooltip();
      tooltip.innerHTML = '';
      const header = document.createElement('div');
      header.className = 'retro-combat-tooltip-header';
      header.textContent = title;
      const body = document.createElement('div');
      body.className = 'retro-combat-tooltip-body';
      body.textContent = text;
      tooltip.appendChild(header);
      tooltip.appendChild(body);

      tooltip.classList.remove('is-visible');
      tooltip.style.top = '0px';
      tooltip.style.left = '0px';
      const rect = el.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      let top = rect.top - tooltipHeight - 8;
      if (top < 8) {
        top = rect.bottom + 8;
      }
      let left = rect.left + rect.width / 2 - tooltipWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.classList.add('is-visible');
    });

    el.addEventListener('mouseleave', () => {
      this.tooltipEl?.classList.remove('is-visible');
    });
  }

  private buildSemanticBadge(action: ActionPayload): HTMLElement {
    const def = resolveSemanticAction(action);
    const badge = document.createElement('div');
    badge.className = 'semantic-badge';
    badge.style.setProperty('--badge-accent', def.accentColor);
    badge.textContent = def.label;
    this.attachSemanticTooltip(badge, def.label, def.getDescription(action));
    return badge;
  }

  private appendSemanticBadges(container: HTMLElement, ability: AbilitySchema): void {
    const actions = collectUniqueSemanticActions(ability);
    if (actions.length === 0) {
      const instant = document.createElement('div');
      instant.className = 'semantic-badge';
      instant.style.setProperty('--badge-accent', '#00e5ff');
      instant.textContent = '⚡ INSTANT CAST';
      this.attachSemanticTooltip(
        instant,
        'INSTANT CAST',
        'Resolves immediately on cast with no traveling projectile payload.',
      );
      container.appendChild(instant);
      return;
    }
    for (const action of actions) {
      container.appendChild(this.buildSemanticBadge(action));
    }
  }

  private appendCardMechanicBadges(container: HTMLElement, card: DraftCard): void {
    if (card.type === 'ACTIVE_ABILITY' && card.abilityPayload) {
      this.appendSemanticBadges(container, card.abilityPayload);
      return;
    }
    for (const b of extractMechanicBadges(card).slice(0, 6)) {
      const badge = renderBadge(b.label, b.kind);
      badge.setAttribute('data-badge', b.label);
      container.appendChild(badge);
    }
  }

  private stopHeroScopeAnimation(): void {
    if (this.heroScopeAnimId !== null) {
      cancelAnimationFrame(this.heroScopeAnimId);
      this.heroScopeAnimId = null;
    }
  }

  private startHeroScopeAnimation(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    origin: { x: number; y: number },
    paths: { points: { x: number; y: number }[]; isClosed: boolean }[],
    endpoints: { x: number; y: number }[],
    archetypeColor: string,
    payloadStyle?: ProjectileStyle,
  ): void {
    const animate = (timestamp: number): void => {
      if (!canvas.isConnected) {
        this.stopHeroScopeAnimation();
        return;
      }

      ctx.clearRect(0, 0, SCOPE_SIZE, SCOPE_SIZE);
      this.drawScopeBackground(ctx, SCOPE_SIZE, timestamp, archetypeColor, origin);
      this.drawScopePaths(ctx, origin, paths, endpoints, archetypeColor, payloadStyle);
      this.drawScopePulses(ctx, paths, timestamp, archetypeColor);

      this.heroScopeAnimId = requestAnimationFrame(animate);
    };

    this.heroScopeAnimId = requestAnimationFrame(animate);
  }

  private drawScopeBackground(
    ctx: CanvasRenderingContext2D,
    size: number,
    timestamp: number,
    color: string,
    origin: { x: number; y: number },
  ): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= size; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    const scanY = (timestamp * 0.04) % size;
    const scanGrad = ctx.createLinearGradient(0, scanY - 1, 0, scanY + 1);
    scanGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    scanGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    scanGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = scanGrad;
    ctx.fillRect(0, scanY - 1, size, 2);

    const sonarRad = (timestamp * 0.03) % (size / 2);
    const sonarAlpha = 1 - sonarRad / (size / 2);
    ctx.strokeStyle = hexToRgba(color, sonarAlpha * 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, sonarRad, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawScopePaths(
    ctx: CanvasRenderingContext2D,
    origin: { x: number; y: number },
    paths: { points: { x: number; y: number }[]; isClosed: boolean }[],
    endpoints: { x: number; y: number }[],
    color: string,
    payloadStyle?: ProjectileStyle,
  ): void {
    if (paths.length === 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.5;
      const cx = SCOPE_SIZE / 2;
      const cy = SCOPE_SIZE / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy);
      ctx.lineTo(cx + 4, cy);
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx, cy + 4);
      ctx.stroke();
      return;
    }

    const originRadius = Math.max(2, SCOPE_SIZE * 0.04);
    const lineWidth = Math.max(1.5, SCOPE_SIZE * 0.035);
    const markerSize = SCOPE_SIZE * 0.1;

    ctx.fillStyle = hexToRgba(color, 0.6);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, originRadius, 0, Math.PI * 2);
    ctx.fill();

    for (const path of paths) {
      if (path.points.length < 2) continue;

      const start = path.points[0];
      const end = path.points[path.points.length - 1];
      const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      gradient.addColorStop(0, hexToRgba(color, 0.15));
      gradient.addColorStop(0.7, hexToRgba(color, 0.7));
      gradient.addColorStop(1, hexToRgba(color, 1));

      ctx.strokeStyle = gradient;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;

      ctx.beginPath();
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      if (path.isClosed) {
        ctx.closePath();
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    for (const endpoint of endpoints) {
      this.drawScopeEndpointMarker(ctx, endpoint.x, endpoint.y, color, markerSize, payloadStyle);
    }
  }

  private drawScopeEndpointMarker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    markerSize: number,
    payloadStyle?: ProjectileStyle,
  ): void {
    const r = markerSize * 0.5;
    ctx.fillStyle = hexToRgba(color, 0.85);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    if (payloadStyle === 'BEAM') {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y + r * 0.6);
      ctx.lineTo(x + r * 0.6, y - r * 0.6);
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawScopePulses(
    ctx: CanvasRenderingContext2D,
    paths: { points: { x: number; y: number }[]; isClosed: boolean }[],
    timestamp: number,
    color: string,
  ): void {
    const progress = (timestamp % SCOPE_PULSE_PERIOD_MS) / SCOPE_PULSE_PERIOD_MS;

    for (const path of paths) {
      if (path.points.length < 2) continue;

      const tailStart = Math.max(0, progress - 0.05);
      const tailSteps = 5;
      for (let i = 0; i <= tailSteps; i++) {
        const t = tailStart + ((progress - tailStart) * i) / tailSteps;
        const pos = samplePathAtProgress(path.points, t);
        const alpha = 0.15 + (i / tailSteps) * 0.35;
        ctx.fillStyle = hexToRgba(color, alpha);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const head = samplePathAtProgress(path.points, progress);
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  private buildInspectorTelemetryCell(
    label: string,
    valueContent: string | HTMLElement,
    metricKey?: string,
    fullWidth = false,
  ): HTMLElement {
    const cellEl = document.createElement('div');
    cellEl.className = fullWidth ? 'telemetry-cell cell-span-2' : 'telemetry-cell';

    const labelEl = document.createElement('span');
    labelEl.className = 'telemetry-label';
    labelEl.textContent = label;

    cellEl.appendChild(labelEl);

    if (typeof valueContent === 'string') {
      const valueEl = document.createElement('span');
      valueEl.className = 'telemetry-value';
      valueEl.textContent = valueContent;
      cellEl.appendChild(valueEl);
    } else {
      cellEl.appendChild(valueContent);
    }

    if (metricKey) {
      const delta = document.createElement('span');
      delta.className = 'telemetry-delta';
      delta.dataset.metric = metricKey;
      cellEl.appendChild(delta);
    }

    return cellEl;
  }

  private updateTelemetryDelta(metric: string, text: string, className: string): void {
    const delta = this.inspectorPane.querySelector(
      `.telemetry-delta[data-metric="${metric}"]`,
    );
    if (!delta) return;
    delta.textContent = text;
    delta.className = `telemetry-delta is-visible ${className}`;
  }

  private executeQuickEquip(slotKey: ActionSlotKey, spellId: string): void {
    SpellInventoryManager.equipSpell(slotKey, spellId);
    this.clearSlotComparison();
    this.renderTacticalInspector();

    const flashBtn = this.inspectorPane.querySelector(
      `.inspector-equip-btn[data-slot="${slotKey}"]`,
    ) as HTMLElement | null;
    if (flashBtn) {
      flashBtn.classList.add('equip-flash-animation');
      window.setTimeout(() => flashBtn.classList.remove('equip-flash-animation'), 350);
    }
  }

  private showSlotComparison(slotKey: ActionSlotKey, inspectedSpell: AbilitySchema): void {
    const banner = this.inspectorPane.querySelector('#inspector-compare-banner');
    if (!banner) return;

    const loadout = SpellInventoryManager.getLoadout();
    const equippedId = loadout[slotKey];
    const equippedSpell = equippedId ? (SpellInventoryManager.getSpell(equippedId) ?? null) : null;

    if (!equippedSpell) {
      banner.textContent = `COMPARING VS [${slotKey}]: EMPTY SLOT (ALL NEW STATS)`;
      banner.classList.add('is-visible');
      for (const delta of this.inspectorPane.querySelectorAll('.telemetry-delta')) {
        delta.textContent = '(NEW)';
        delta.className = 'telemetry-delta is-visible delta-better';
      }
      return;
    }

    if (equippedSpell.id === inspectedSpell.id) {
      this.clearSlotComparison();
      banner.textContent = `ALREADY EQUIPPED IN [${slotKey}]`;
      banner.classList.add('is-visible');
      return;
    }

    const inspectedTel = extractSpellTelemetry(inspectedSpell);
    const targetTel = extractSpellTelemetry(equippedSpell);

    const diffMs = inspectedSpell.cooldownMs - equippedSpell.cooldownMs;
    const cdFormatted = `${diffMs >= 0 ? '+' : ''}${(diffMs / 1000).toFixed(1)}s`;
    this.updateTelemetryDelta(
      'cooldown',
      diffMs !== 0 ? `(${cdFormatted})` : '(±0)',
      diffMs < 0 ? 'delta-better' : diffMs > 0 ? 'delta-worse' : 'delta-neutral',
    );

    const diffRecoil = (inspectedSpell.recoilKick ?? 0) - (equippedSpell.recoilKick ?? 0);
    const recoilFormatted = `${diffRecoil >= 0 ? '+' : ''}${diffRecoil}`;
    this.updateTelemetryDelta(
      'recoil',
      diffRecoil !== 0 ? `(${recoilFormatted})` : '(±0)',
      diffRecoil < 0 ? 'delta-better' : diffRecoil > 0 ? 'delta-worse-recoil' : 'delta-neutral',
    );

    const diffRepulse = inspectedTel.repulseForce - targetTel.repulseForce;
    const repulseFormatted = `${diffRepulse >= 0 ? '+' : ''}${diffRepulse}`;
    this.updateTelemetryDelta(
      'repulse',
      diffRepulse !== 0 ? `(${repulseFormatted})` : '(±0)',
      diffRepulse > 0 ? 'delta-better' : diffRepulse < 0 ? 'delta-worse' : 'delta-neutral',
    );

    const diffInstab = inspectedTel.instabilityYield - targetTel.instabilityYield;
    const instabFormatted = `${diffInstab >= 0 ? '+' : ''}${diffInstab}%`;
    this.updateTelemetryDelta(
      'instability',
      diffInstab !== 0 ? `(${instabFormatted})` : '(±0)',
      diffInstab > 0 ? 'delta-better' : diffInstab < 0 ? 'delta-worse' : 'delta-neutral',
    );

    const damageDelta = this.inspectorPane.querySelector(
      '.telemetry-delta[data-metric="damage"]',
    );
    if (damageDelta) {
      const diffDmg = inspectedTel.directDamage - targetTel.directDamage;
      const dmgFormatted = `${diffDmg >= 0 ? '+' : ''}${diffDmg} HP`;
      this.updateTelemetryDelta(
        'damage',
        diffDmg !== 0 ? `(${dmgFormatted})` : '(±0)',
        diffDmg > 0 ? 'delta-better' : diffDmg < 0 ? 'delta-worse' : 'delta-neutral',
      );
    }

    banner.textContent = `COMPARING VS [${slotKey}] ${equippedSpell.name}`;
    banner.classList.add('is-visible');
  }

  private clearSlotComparison(): void {
    const banner = this.inspectorPane.querySelector('#inspector-compare-banner');
    if (banner) {
      banner.classList.remove('is-visible');
      banner.textContent = '';
    }
    for (const delta of this.inspectorPane.querySelectorAll('.telemetry-delta')) {
      delta.textContent = '';
      delta.className = 'telemetry-delta';
    }
  }

  private buildImpactProfileCard(profile: CombatImpactProfile): HTMLElement {
    const card = document.createElement('div');
    card.className = 'inspector-profile-card';

    const header = document.createElement('div');
    header.className = 'inspector-profile-header';

    const title = document.createElement('span');
    title.className = 'inspector-profile-title';
    title.textContent = 'PHYSICAL IMPACT SPECTRUM';

    const role = document.createElement('span');
    role.className = 'inspector-profile-role';
    role.textContent = profile.dominantRole;

    header.appendChild(title);
    header.appendChild(role);

    const bar = document.createElement('div');
    bar.className = 'impact-gauge-bar';

    const segments: { pct: number; cls: string }[] = [
      { pct: profile.launchPct, cls: 'seg-launch' },
      { pct: profile.instabilityPct, cls: 'seg-instability' },
      { pct: profile.controlPct, cls: 'seg-control' },
    ];

    for (const seg of segments) {
      if (seg.pct > 0) {
        const el = document.createElement('div');
        el.className = `impact-gauge-segment ${seg.cls}`;
        el.style.width = `${seg.pct}%`;
        bar.appendChild(el);
      }
    }

    const legend = document.createElement('div');
    legend.className = 'impact-gauge-legend';

    const legendItems = [
      { color: '#ffaa00', label: 'Launch', pct: profile.launchPct },
      { color: '#ff4400', label: 'Instability', pct: profile.instabilityPct },
      { color: '#00e5ff', label: 'Control', pct: profile.controlPct },
    ];

    for (const item of legendItems) {
      const legendItem = document.createElement('span');
      legendItem.className = 'legend-item';

      const pip = document.createElement('span');
      pip.className = 'legend-pip';
      pip.style.background = item.color;

      legendItem.appendChild(pip);
      legendItem.appendChild(document.createTextNode(`${item.label} ${item.pct}%`));
      legend.appendChild(legendItem);
    }

    card.appendChild(header);
    card.appendChild(bar);
    card.appendChild(legend);
    return card;
  }

  private buildTelemetryItem(label: string, value: string, extraClass = ''): HTMLElement {
    const item = document.createElement('div');
    item.className = 'telemetry-item';

    const key = document.createElement('span');
    key.className = 'telemetry-k';
    key.textContent = label;

    const val = document.createElement('span');
    val.className = `telemetry-v${extraClass ? ` ${extraClass}` : ''}`;
    val.textContent = value;

    item.appendChild(key);
    item.appendChild(val);
    return item;
  }

  private buildForgeTelemetryCard(
    card: DraftCard,
    cardIndex: number,
    allCards: DraftCard[],
  ): HTMLElement | null {
    const ability = card.abilityPayload;
    if (!ability) return null;

    const telemetry = extractSpellTelemetry(ability);
    const tier = normalizeForgeTierRarity(card.rarity);
    const rarityColor = RARITY_COLORS[card.rarity];
    const archetype = ability.archetype ?? 'KINETIC';
    const archetypeColor = getArchetypeColor(archetype, ability.visuals?.color);
    const superKey = resolveSuperchargedMetricKey(telemetry, tier);

    const root = document.createElement('div');
    root.className = `forge-card-redesign tier-${tier.toLowerCase()}`;
    root.style.setProperty('--card-border-color', rarityColor);
    root.style.setProperty('--card-glow-color', `${rarityColor}44`);

    const header = document.createElement('div');
    header.className = 'forge-card-header';

    const rarityEl = document.createElement('span');
    rarityEl.className = 'forge-card-rarity forge-card-crest';
    rarityEl.textContent = getTierCrest(tier);

    const archetypeEl = document.createElement('span');
    archetypeEl.className = 'forge-card-archetype';
    archetypeEl.textContent = archetype;
    archetypeEl.style.color = archetypeColor;
    archetypeEl.style.borderColor = archetypeColor;
    archetypeEl.style.background = `${archetypeColor}18`;

    header.appendChild(rarityEl);
    header.appendChild(archetypeEl);

    const perk = resolveMutationPerk(card, telemetry);
    const mutationBanner = document.createElement('div');
    mutationBanner.className = 'forge-mutation-banner';
    if (perk) {
      const arrow = document.createElement('span');
      arrow.textContent = '▲';
      mutationBanner.appendChild(arrow);
      mutationBanner.appendChild(document.createTextNode(` ${perk}`));
    }

    const glyphFrame = document.createElement('div');
    glyphFrame.className = 'forge-card-glyph-frame';
    glyphFrame.appendChild(generateSpellIcon(ability, 64));

    const info = document.createElement('div');
    info.className = 'forge-card-info';

    const title = document.createElement('div');
    title.className = 'forge-card-title';
    title.textContent = resolveForgeCardTitle(card, cardIndex, allCards);

    const tagline = document.createElement('div');
    tagline.className = 'forge-card-tagline';
    tagline.textContent = card.tagline;

    const desc = document.createElement('div');
    desc.className = 'forge-card-desc';
    desc.textContent = card.description;

    info.appendChild(title);
    info.appendChild(tagline);
    info.appendChild(desc);

    const telemetryGrid = document.createElement('div');
    telemetryGrid.className = 'forge-card-telemetry';

    const cooldownItem = this.buildTelemetryItem('Cooldown', telemetry.cooldownSec);
    telemetryGrid.appendChild(cooldownItem);
    telemetryGrid.appendChild(this.buildTelemetryItem('Recoil', `${telemetry.recoilKick} px/s`));

    const repulseItem = this.buildTelemetryItem(
      'Repulse',
      telemetry.repulseForce > 0 ? `${telemetry.repulseForce} Force` : 'Minimal',
      telemetry.repulseForce > 0 ? 'highlight-repulse' : '',
    );
    telemetryGrid.appendChild(repulseItem);

    const instabilityItem = this.buildTelemetryItem(
      'Instability',
      `+${telemetry.instabilityYield}% Yield`,
      'highlight-instability',
    );
    telemetryGrid.appendChild(instabilityItem);

    if (superKey === 'cooldown') {
      cooldownItem.querySelector('.telemetry-v')?.classList.add('stat-supercharged');
    } else if (superKey === 'repulse') {
      repulseItem.querySelector('.telemetry-v')?.classList.add('stat-supercharged');
    } else if (superKey === 'instability') {
      instabilityItem.querySelector('.telemetry-v')?.classList.add('stat-supercharged');
    }

    if (telemetry.directDamage > 0) {
      telemetryGrid.appendChild(
        this.buildTelemetryItem('Direct HP', `${telemetry.directDamage} HP`),
      );
    }

    const deliveryItem = this.buildTelemetryItem('Delivery', telemetry.deliveryText);
    deliveryItem.classList.add('telemetry-row-full');
    telemetryGrid.appendChild(deliveryItem);

    const badgeRow = document.createElement('div');
    badgeRow.className = 'forge-semantic-badges';
    this.appendSemanticBadges(badgeRow, ability);

    const statusBlock = document.createElement('div');
    statusBlock.className = 'forge-card-status-block';
    statusBlock.textContent =
      telemetry.ccDescriptions.length > 0
        ? telemetry.ccDescriptions.join(' · ')
        : '[CLEAN HIT] Pure Kinetic Force';

    const footer = document.createElement('div');
    footer.className = 'forge-card-footer';

    const isSaved = this.vaultSavedCardIndex === cardIndex;
    const anotherSaved =
      this.vaultSavedCardIndex !== null && this.vaultSavedCardIndex !== cardIndex;

    if (isSaved) {
      root.classList.add('forge-card-saved');

      const storedIndicator = document.createElement('div');
      storedIndicator.className = 'forge-stored-indicator';
      storedIndicator.textContent = '✦ SAVED TO SPELL VAULT';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'forge-claim-btn';
      viewBtn.textContent = 'VIEW IN VAULT';
      viewBtn.addEventListener('click', () => {
        if (ability.id) this.navigateToVaultSpell(ability.id);
      });

      footer.appendChild(storedIndicator);
      footer.appendChild(viewBtn);
    } else if (anotherSaved) {
      root.classList.add('forge-card-discarded');

      const discardedHint = document.createElement('div');
      discardedHint.className = 'forge-card-discarded-hint';
      discardedHint.textContent = 'Not saved';
      footer.appendChild(discardedHint);
    } else {
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'forge-claim-btn';
      saveBtn.textContent = 'SAVE TO VAULT';
      saveBtn.addEventListener('click', () => this.saveCardToVault(card, cardIndex));
      footer.appendChild(saveBtn);
    }

    if (!anotherSaved) {
      attachForgeCardDrag(glyphFrame, cardIndex);
    }

    root.appendChild(header);
    if (perk) root.appendChild(mutationBanner);
    root.appendChild(glyphFrame);
    root.appendChild(info);
    root.appendChild(telemetryGrid);
    root.appendChild(badgeRow);
    root.appendChild(statusBlock);
    root.appendChild(footer);

    return root;
  }

  private renderForgeVaultPickerCards(): void {
    this.cardsContainer.innerHTML = '';

    if (this.vaultSavedCardIndex === null) {
      const hint = document.createElement('div');
      hint.className = 'forge-vault-picker-hint';
      hint.textContent = 'Choose one spell to save, or drag it to your loadout below.';
      this.cardsContainer.appendChild(hint);
    }

    const abilityCards = this.cards.filter((c) => c.type === 'ACTIVE_ABILITY');
    let cardIndex = 0;
    for (const card of abilityCards) {
      const el = this.buildForgeTelemetryCard(card, cardIndex, abilityCards);
      cardIndex += 1;
      if (el) this.cardsContainer.appendChild(el);
    }
  }

  private resolveEquipTarget(card?: DraftCard): DraftSelection['slot'] | null {
    if (this.intermissionMode) return null;
    return card?.category ? CATEGORY_SLOT_MAP[card.category] : null;
  }

  private renderStreamingSkeletons(): void {
    this.cardsContainer.innerHTML = '';
    this.streamingSlots = [];
    const color = RARITY_COLORS.COMMON;

    for (let index = 0; index < 3; index++) {
      const root = document.createElement('div');
      root.style.cssText = `
        display:flex;flex-direction:column;min-height:0;overflow:hidden;
        padding:12px 14px;border-radius:4px;
        ${retroPanelStyle('cyan')}
        border:2px solid ${color};
        box-shadow:0 0 24px ${color}55, inset 0 1px 0 ${color}22;
      `;

      const rarityBadge = document.createElement('div');
      rarityBadge.textContent = 'FORGING...';
      rarityBadge.style.cssText = `font-size:${FONTS.size.badge};color:${color};font-weight:bold;margin-bottom:2px;flex-shrink:0;`;

      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = 'Forging Spell...';
      title.style.cssText =
        `font-size:${FONTS.size.lg};font-weight:bold;margin-bottom:2px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:forgePulse 1.4s ease-in-out infinite;`;

      const tagline = document.createElement('div');
      tagline.className = 'card-tagline';
      tagline.textContent = 'Synthesizing concept...';
      tagline.style.cssText = `font-size:${FONTS.size.sm};color:#666;margin-bottom:6px;flex-shrink:0;`;

      const desc = document.createElement('div');
      desc.className = 'card-desc';
      desc.textContent = '';
      desc.style.cssText = `
        font-size:${FONTS.size.body};color:#aaa;margin-bottom:8px;line-height:1.35;flex-shrink:0;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
      `;

      const badges = document.createElement('div');
      badges.className = 'card-badges';
      badges.style.cssText =
        'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;flex-shrink:0;min-height:18px;';

      const power = renderPowerBar(0, 'COMMON', false);
      power.className = 'card-power';
      const fill = power.querySelector('div > div');
      if (fill instanceof HTMLElement) {
        fill.style.animation = 'forgePulse 1.4s ease-in-out infinite';
      }

      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:auto;flex-shrink:0;';

      const equipBtn = document.createElement('button');
      equipBtn.className = 'card-equip-btn';
      equipBtn.textContent = 'Synthesizing...';
      equipBtn.disabled = true;
      equipBtn.style.cssText = btnStyle(false) + 'width:100%;opacity:0.6;cursor:not-allowed;';
      const slotIndex = index;
      equipBtn.onclick = () => {
        const card = this.streamingSlots?.[slotIndex]?.card;
        const targetSlot = this.resolveEquipTarget(card ?? undefined);
        if (!card || !targetSlot) return;
        this.equip(card, targetSlot);
      };
      footer.appendChild(equipBtn);

      root.appendChild(rarityBadge);
      root.appendChild(title);
      root.appendChild(tagline);
      root.appendChild(desc);
      root.appendChild(badges);
      root.appendChild(power);
      root.appendChild(footer);
      this.cardsContainer.appendChild(root);

      this.streamingSlots.push({
        root,
        rarityBadge,
        title,
        tagline,
        desc,
        badges,
        power,
        equipBtn,
        card: null,
        finalized: false,
      });
    }
  }

  private updateStreamingCard(index: number, partial: PartialCardStream): void {
    const slot = this.streamingSlots?.[index];
    if (!slot || slot.finalized) return;

    if (partial.name) {
      slot.title.textContent = partial.name;
      slot.title.style.animation = '';
    }
    if (partial.tagline) slot.tagline.textContent = partial.tagline;
    if (partial.description) slot.desc.textContent = partial.description;
    renderStreamBadges(slot.badges, partial.detectedBadges, STREAM_BADGE_KINDS);

    if (partial.isComplete && partial.validatedCard) {
      slot.card = partial.validatedCard;
      const targetSlot = this.resolveEquipTarget(partial.validatedCard);
      const newPower = renderPowerBar(
        partial.validatedCard.budgetCost,
        partial.validatedCard.rarity,
        false,
      );
      slot.power.replaceWith(newPower);
      slot.power = newPower;
      slot.equipBtn.disabled = false;
      slot.equipBtn.style.cssText =
        btnStyleRarity(partial.validatedCard.rarity) + 'width:100%;cursor:pointer;opacity:1;';
      slot.equipBtn.textContent = targetSlot ? `Equip to ${targetSlot}` : 'Equip';
    }
  }

  private finalizeStreamingCards(): void {
    if (!this.streamingSlots) return;
    const loadout = this.callbacks.getLoadout();

    for (let i = 0; i < this.streamingSlots.length; i++) {
      const slot = this.streamingSlots[i];
      const card = this.cards[i];
      if (!card) continue;

      slot.card = card;
      slot.finalized = true;
      const color = RARITY_COLORS[card.rarity];
      slot.root.style.border = `2px solid ${color}`;
      slot.root.style.boxShadow = `0 0 24px ${color}55, inset 0 1px 0 ${color}22`;
      slot.rarityBadge.textContent = card.rarity;
      slot.rarityBadge.style.color = color;

      slot.title.textContent = card.title;
      slot.tagline.textContent = card.tagline;
      slot.desc.textContent = card.description;

      slot.badges.innerHTML = '';
      this.appendCardMechanicBadges(slot.badges, card);

      const newPower = renderPowerBar(
        card.budgetCost,
        card.rarity,
        card.type === 'PASSIVE_UPGRADE',
      );
      slot.power.replaceWith(newPower);
      slot.power = newPower;

      if (card.type === 'ACTIVE_ABILITY') {
        const compareAgainst = this.getCompareAbility(loadout);
        const diff = this.statDiff(compareAgainst, card.abilityPayload);
        const existingDiff = slot.root.querySelector('.card-stat-diff');
        existingDiff?.remove();
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.className = 'card-stat-diff';
          diffEl.textContent = diff;
          diffEl.style.cssText = `font-size:${FONTS.size.sm};color:#4f8;margin-bottom:8px;`;
          slot.power.before(diffEl);
        }
      }

      const targetSlot = this.resolveEquipTarget(card);
      slot.equipBtn.disabled = false;
      slot.equipBtn.style.cssText = btnStyleRarity(card.rarity) + 'width:100%;cursor:pointer;opacity:1;';
      if (targetSlot) {
        slot.equipBtn.textContent = `Equip to ${targetSlot}`;
        slot.equipBtn.onclick = () => this.equip(card, targetSlot);
      } else if (card.type === 'ACTIVE_ABILITY' && !this.intermissionMode) {
        slot.equipBtn.replaceWith(this.buildSlotPickerFooter(card));
      } else if (card.type === 'PASSIVE_UPGRADE') {
        slot.equipBtn.textContent = 'Equip Passive';
        slot.equipBtn.onclick = () => this.equip(card, 'PASSIVE');
      }
    }

    this.streamingSlots = null;
  }

  private buildSlotPickerFooter(card: DraftCard): HTMLElement {
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    for (const key of ACTION_SLOT_KEYS) {
      const slotBtn = document.createElement('button');
      slotBtn.textContent = `[${key}]`;
      slotBtn.style.cssText = btnStyleRarity(card.rarity) + 'flex:1;min-width:44px;padding:6px 8px;';
      slotBtn.onclick = () => this.equip(card, key);
      btnContainer.appendChild(slotBtn);
    }
    return btnContainer;
  }

  private renderResultCards(): void {
    this.cardsContainer.innerHTML = '';
    const loadout = this.callbacks.getLoadout();

    for (const card of this.cards) {
      const el = document.createElement('div');
      const color = RARITY_COLORS[card.rarity];
      el.style.cssText = `
        display:flex;flex-direction:column;min-height:0;overflow:hidden;
        padding:12px 14px;border-radius:4px;
        ${retroPanelStyle('cyan')}
        border:2px solid ${color};
        box-shadow:0 0 24px ${color}55, inset 0 1px 0 ${color}22;
      `;

      const rarityBadge = document.createElement('div');
      rarityBadge.textContent = card.rarity;
      rarityBadge.style.cssText = `font-size:${FONTS.size.badge};color:${color};font-weight:bold;margin-bottom:2px;flex-shrink:0;`;

      const cardTitle = document.createElement('div');
      cardTitle.textContent = card.title;
      cardTitle.style.cssText =
        `font-size:${FONTS.size.lg};font-weight:bold;margin-bottom:2px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;

      const tagline = document.createElement('div');
      tagline.textContent = card.tagline;
      tagline.style.cssText = `font-size:${FONTS.size.sm};color:#888;margin-bottom:6px;flex-shrink:0;`;

      const desc = document.createElement('div');
      desc.textContent = card.description;
      desc.style.cssText = `
        font-size:${FONTS.size.body};color:#aaa;margin-bottom:8px;line-height:1.35;flex-shrink:0;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
      `;

      const badges = document.createElement('div');
      badges.style.cssText =
        'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;flex-shrink:0;';
      this.appendCardMechanicBadges(badges, card);

      el.appendChild(rarityBadge);
      el.appendChild(cardTitle);
      el.appendChild(tagline);
      el.appendChild(desc);
      el.appendChild(badges);

      if (card.evolutionDiff && card.evolutionDiff.length > 0) {
        const diffList = document.createElement('div');
        diffList.style.cssText =
          `font-size:${FONTS.size.sm};color:#6cf;margin-bottom:6px;line-height:1.35;flex-shrink:0;`;
        diffList.textContent = card.evolutionDiff.join(' · ');
        el.appendChild(diffList);
      }

      el.appendChild(
        renderPowerBar(
          card.budgetCost,
          card.rarity,
          card.type === 'PASSIVE_UPGRADE',
        ),
      );

      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:auto;flex-shrink:0;';

      if (card.type === 'ACTIVE_ABILITY') {
        const compareAgainst = this.getCompareAbility(loadout);
        const diff = this.statDiff(compareAgainst, card.abilityPayload);
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.textContent = diff;
          diffEl.style.cssText = `font-size:${FONTS.size.sm};color:#4f8;margin-bottom:8px;`;
          footer.appendChild(diffEl);
        }

        const targetSlot = card.category ? CATEGORY_SLOT_MAP[card.category] : null;

        if (targetSlot && !this.intermissionMode) {
          const equipBtn = document.createElement('button');
          equipBtn.textContent = `Equip to ${targetSlot}`;
          equipBtn.style.cssText = btnStyleRarity(card.rarity) + 'width:100%;';
          equipBtn.onclick = () => this.equip(card, targetSlot);
          footer.appendChild(equipBtn);
        } else {
          const btnContainer = document.createElement('div');
          btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
          for (const key of ACTION_SLOT_KEYS) {
            const slotBtn = document.createElement('button');
            slotBtn.textContent = `[${key}]`;
            slotBtn.style.cssText =
              btnStyleRarity(card.rarity) + 'flex:1;min-width:44px;padding:6px 8px;';
            slotBtn.onclick = () => this.equip(card, key);
            btnContainer.appendChild(slotBtn);
          }
          footer.appendChild(btnContainer);
        }
      } else {
        const passiveBtn = document.createElement('button');
        passiveBtn.textContent = 'Equip Passive';
        passiveBtn.style.cssText = btnStyleRarity(card.rarity) + 'width:100%;';
        passiveBtn.onclick = () => this.equip(card, 'PASSIVE');
        footer.appendChild(passiveBtn);
      }

      el.appendChild(footer);
      this.cardsContainer.appendChild(el);
    }
  }

  private getCompareAbility(loadout: PlayerLoadout): AbilitySchema | null {
    if (this.evolutionContext) return this.evolutionContext.baseAbility;
    return loadout.abilities[0];
  }

  private statDiff(current: AbilitySchema | null, incoming?: AbilitySchema): string | null {
    if (!incoming) return null;
    const parts: string[] = [];
    if (current) {
      const cdDelta = incoming.cooldownMs - current.cooldownMs;
      if (cdDelta !== 0) parts.push(`CD ${cdDelta > 0 ? '+' : ''}${cdDelta}ms`);
      const recoilDelta = incoming.recoilKick - current.recoilKick;
      if (recoilDelta !== 0) parts.push(`Recoil ${recoilDelta > 0 ? '+' : ''}${recoilDelta}`);
    } else {
      if (incoming.recoilKick > 0) parts.push(`Recoil ${incoming.recoilKick}`);
      parts.push(`CD ${incoming.cooldownMs}ms`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  private equip(card: DraftCard, slot: DraftSelection['slot']): void {
    if (card.abilityPayload) {
      stampDraftCardMetadataOntoAbility(card.abilityPayload, card);
      card.abilityPayload.id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `spell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    this.callbacks.onEquip({ card, slot });
    this.close();
  }
}
