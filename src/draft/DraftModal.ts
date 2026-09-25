import {
  DEFAULT_MODEL,
  compileAbilityPayload,
  getAiSettings,
  getApiConnectionStatus,
  getLastSynthesisMeta,
  synthesizeAbility,
} from '../ai/Synthesizer';
import { AudioEngine } from '../audio/AudioEngine';
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
  ACTION_SLOT_INDEX,
  ACTION_SLOT_KEYS,
  CATEGORY_SLOT_MAP,
  getCategoryLabel,
  SLOT_CATEGORY_MAP,
} from '../types/cards';
import type {
  AbilitySchema,
  ActionPayload,
  EmitterConfig,
  SpellArchetype,
  TrajectoryConfig,
  TriggerNode,
} from '../types/schema';
import { walkActions } from '../types/schema';
import {
  compareCombatProfiles,
  computeSpellCombatProfile,
  formatCombatStatDiff,
  formatProfileCadence,
  polarityCssClass,
  ringOutTierBadgeClass,
  type CombatProfileDiff,
  type KineticLethalityProfile,
  type MechanicDiffChip,
  type MetricDelta,
  type SpellCombatProfile,
} from '../primitives/combatProfile';
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
  getTierCrest,
  hexToRgba,
  injectStyles,
  normalizeForgeTierRarity,
  renderPowerBar,
  resolveSpellRarity,
  showQuickEquipMenu,
} from './workshopStyles';

export { normalizeForgeTierRarity, resolveSpellRarity } from './workshopStyles';
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
  attachForgeCardPointerDrag,
  attachInventoryDropZone,
  attachVaultCardDrag,
  LOADOUT_DROP_PRIORITY,
  registerSlotDropZone,
} from '../game/spellDragDrop';
import { generateSpellIcon, getArchetypeColor } from '../render/canvas/SpellIconGenerator';
import { clampSchemaValues } from '../ai/budget/balance';
import { analyzeSaturation, formatSaturationChips } from '../ai/budget/saturation';
import { EvolutionStore } from '../game/EvolutionStore';
import { renderEvolutionTree } from './EvolutionTreePanel';
import { recordSpellPlayback, type PlaybackRecording } from './InspectorPlaybackSim';
import { drawScopeProjectile } from '../render/canvas/projectiles';
import { ActionBarHUD } from '../render/ActionBarHUD';
import { FONTS, RETRO_COLORS, retroPanelStyle } from '../ui/tokens';

type WorkshopTab = 'VAULT' | 'FORGE' | 'TREE';

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
const FORGE_PARALLEL_RARITIES: CardRarity[] = ['COMMON', 'RARE', 'EPIC'];

interface ForgeCardSlot {
  cardEl: HTMLElement;
  footerEl: HTMLElement;
  rarity: CardRarity;
  cardIndex: number;
  titleEl: HTMLElement;
  taglineEl: HTMLElement;
  descEl: HTMLElement;
  archetypeEl: HTMLElement;
  mutationSlotEl: HTMLElement;
  glyphFrameEl: HTMLElement;
  telemetryGridEl: HTMLElement;
  telemetryItems: {
    cooldown: HTMLElement;
    repulse: HTMLElement;
    instability: HTMLElement;
  };
  telemetryValues: {
    cooldown: HTMLElement;
    recoil: HTMLElement;
    repulse: HTMLElement;
    instability: HTMLElement;
    delivery: HTMLElement;
  };
  statusEl: HTMLElement;
  mechanicChipsRowEl: HTMLElement;
  equippedDiffEl: HTMLElement;
  badgesRowEl: HTMLElement;
  saveBtn: HTMLButtonElement;
  isSealed: boolean;
  card: DraftCard | null;
  handlersBound: boolean;
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

export function stripMutationPerkNumericParenthetical(perk: string): string {
  return perk.replace(/\s*\([^)]*\d[^)]*\)\s*$/i, '').trim();
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

const SCOPE_WIDTH = 240;
const SCOPE_HEIGHT = 120;

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
  MASS_ATTRACTOR: {
    label: '🌀 GRAVITY WELL',
    category: 'CONTROL',
    accentColor: '#bf00ff',
    getDescription: (a) =>
      a.type === 'SPAWN_FIELD'
        ? `Pulls targets toward a ${a.field.radius ?? 60}px singularity with ${Math.abs(a.field.strength ?? 5000)} field strength.`
        : 'Pulls targets toward a gravitational singularity.',
  },
  VORTEX_TANGENT: {
    label: '🌪️ VORTEX',
    category: 'CONTROL',
    accentColor: '#bf00ff',
    getDescription: (a) =>
      a.type === 'SPAWN_FIELD'
        ? `Spins targets in a ${a.field.radius ?? 60}px tangential vortex with inward pull.`
        : 'Spins targets in a tangential vortex field.',
  },
  FRICTION_OVERRIDE: {
    label: '🧊 FRICTION PATCH',
    category: 'CONTROL',
    accentColor: '#00e5ff',
    getDescription: (a) =>
      a.type === 'SPAWN_FIELD'
        ? `Overrides ground friction to ${a.field.frictionValue ?? 0.02} inside a ${a.field.radius ?? 60}px zone.`
        : 'Overrides friction inside a hazard zone.',
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
  MODIFY_STAT_DAMAGE: {
    label: '💔 DIRECT DAMAGE',
    category: 'OFFENSE',
    accentColor: '#ff0055',
    getDescription: (a) =>
      a.type === 'MODIFY_STAT'
        ? `Depletes ${Math.abs(a.value ?? 10)} target health on impact.`
        : 'Depletes target health.',
  },
  MODIFY_STAT_HEAL: {
    label: '💚 HEAL',
    category: 'UTILITY',
    accentColor: '#44ff88',
    getDescription: (a) =>
      a.type === 'MODIFY_STAT'
        ? `Restores ${a.value ?? 10} health points to the target.`
        : 'Restores health points.',
  },
  MODIFY_STAT_moveSpeed: {
    label: '⚡ HASTE',
    category: 'UTILITY',
    accentColor: '#00e5ff',
    getDescription: (a) =>
      a.type === 'MODIFY_STAT'
        ? `Modifies movement velocity (${a.mode} ${a.value}).`
        : 'Modifies movement velocity.',
  },
  MODIFY_STAT_mass: {
    label: '⚖️ MASS SHIFT',
    category: 'CONTROL',
    accentColor: '#d4a373',
    getDescription: (a) =>
      a.type === 'MODIFY_STAT'
        ? `Alters target mass (${a.mode} ${a.value}), changing knockback susceptibility.`
        : 'Alters target mass.',
  },
  MODIFY_STAT_linearDrag: {
    label: '🛞 DRAG SHIFT',
    category: 'CONTROL',
    accentColor: '#00e5ff',
    getDescription: (a) =>
      a.type === 'MODIFY_STAT'
        ? `Changes target linear drag (${a.mode} ${a.value}), affecting slide distance.`
        : 'Changes target linear drag.',
  },
  MODIFY_STAT_instabilityPct: {
    label: '⚡ INSTABILITY',
    category: 'CONTROL',
    accentColor: '#ff4400',
    getDescription: (a) =>
      a.type === 'MODIFY_STAT'
        ? `Directly shifts instability (${a.mode} ${a.value}).`
        : 'Directly shifts instability.',
  },
  APPLY_STASIS: {
    label: '❄️ STASIS',
    category: 'CONTROL',
    accentColor: '#00e5ff',
    getDescription: (a) =>
      a.type === 'APPLY_STASIS'
        ? `Suspends target velocity and physics for ${(a.durationMs / 1000).toFixed(1)}s.`
        : 'Suspends target velocity, actions, and physics interactions.',
  },
  RELEASE_STASIS: {
    label: '🔓 RELEASE STASIS',
    category: 'UTILITY',
    accentColor: '#00e5ff',
    getDescription: () => 'Releases an active stasis lock, restoring normal physics.',
  },
  REFLECT_PROJECTILES: {
    label: '🛡️ REFLECT GUARD',
    category: 'DEFENSE',
    accentColor: '#ffd700',
    getDescription: (a) =>
      a.type === 'REFLECT_PROJECTILES'
        ? `Deflects incoming projectiles within a ${a.arcDeg ?? 360}° wedge back toward attackers.`
        : 'Deflects incoming enemy projectiles within the active wedge.',
  },
  MUTATE_TERRAIN: {
    label: '🌋 TERRAIN SHIFT',
    category: 'CONTROL',
    accentColor: '#ff6644',
    getDescription: (a) =>
      a.type === 'MUTATE_TERRAIN'
        ? `Alters arena floor (${a.mutation.type}) across a ${a.mutation.radius}px radius.`
        : 'Alters the arena floor, creating or removing hazardous terrain.',
  },
  MORPH_ENTITY: {
    label: '🔄 MORPH',
    category: 'UTILITY',
    accentColor: '#bf00ff',
    getDescription: (a) =>
      a.type === 'MORPH_ENTITY'
        ? `Transforms the target for ${(a.morph.durationMs / 1000).toFixed(1)}s with altered combat stats.`
        : 'Temporarily transforms the target into an alternate combatant form.',
  },
  APPLY_STEALTH: {
    label: '👻 STEALTH',
    category: 'UTILITY',
    accentColor: '#94a3b8',
    getDescription: (a) =>
      a.type === 'APPLY_STEALTH'
        ? `Cloaks the caster for ${(a.durationMs / 1000).toFixed(1)}s, breaking targeting locks.`
        : 'Cloaks the caster, granting temporary invisibility.',
  },
  APPLY_STATUS: {
    label: '✨ STATUS',
    category: 'CONTROL',
    accentColor: '#bf00ff',
    getDescription: (a) =>
      a.type === 'APPLY_STATUS'
        ? `Applies ${a.archetype} elemental status for ${(a.durationMs / 1000).toFixed(1)}s.`
        : 'Applies an elemental status effect to the target.',
  },
  LAUNCH_VERTICAL: {
    label: '🚀 LAUNCH',
    category: 'OFFENSE',
    accentColor: '#ffaa00',
    getDescription: (a) =>
      a.type === 'LAUNCH_VERTICAL'
        ? `Launches targets airborne${a.targetApex ? ` to ${a.targetApex}px apex` : ''}.`
        : 'Launches targets airborne along a ballistic arc.',
  },
  SET_GRAVITY_SCALE: {
    label: '🌍 GRAVITY SHIFT',
    category: 'CONTROL',
    accentColor: '#00e5ff',
    getDescription: (a) =>
      a.type === 'SET_GRAVITY_SCALE'
        ? `Sets gravity to ${a.scale}× for ${((a.durationMs ?? 1000) / 1000).toFixed(1)}s.`
        : 'Modifies gravitational pull, altering fall speed and apex hang time.',
  },
  CAST_CHILD_PAYLOAD: {
    label: '💣 SPLIT PAYLOAD',
    category: 'OFFENSE',
    accentColor: '#ff6644',
    getDescription: () => 'Detonates or splits into a secondary nested payload.',
  },
  PLAY_VFX: {
    label: '✨ VFX BURST',
    category: 'UTILITY',
    accentColor: '#cbd5e1',
    getDescription: () => 'Triggers a cosmetic visual burst with no direct physics cost.',
  },
};

function semanticActionKey(action: ActionPayload): string {
  if (action.type === 'SPAWN_FIELD') {
    const fieldType = action.field.fieldType;
    if (fieldType === 'RADIAL_IMPULSE') return 'RADIAL_IMPULSE';
    if (fieldType === 'MASS_ATTRACTOR') return 'MASS_ATTRACTOR';
    if (fieldType === 'VORTEX_TANGENT') return 'VORTEX_TANGENT';
    if (fieldType === 'FRICTION_OVERRIDE') return 'FRICTION_OVERRIDE';
  }
  if (action.type === 'MODIFY_STAT') {
    if (action.stat === 'health') {
      return action.value < 0 ? 'MODIFY_STAT_DAMAGE' : 'MODIFY_STAT_HEAL';
    }
    return `MODIFY_STAT_${action.stat}`;
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

export function extractSpellTelemetry(ability: AbilitySchema): SpellTelemetry {
  const profile = computeSpellCombatProfile(ability);
  return {
    cooldownSec: formatDurationSec(ability.cooldownMs),
    recoilKick: profile.recoilKick,
    repulseForce: profile.displacement.peakForce,
    instabilityYield: profile.instabilityYield,
    directDamage: profile.directDamage,
    ccDescriptions: profile.controlDescriptions,
    deliveryText: profile.delivery.summary,
  };
}

function formatInspectorPeakForce(profile: SpellCombatProfile): string {
  const force = profile.displacement.peakForce;
  const tag = profile.displacement.primaryTag;
  const maxTravelPx = profile.displacement.lethality.maxTravelPx;
  if (tag === 'NONE' || tag === 'MIXED' || force === 0) {
    return `${force} Force`;
  }
  return `${force} [${tag}] (~${maxTravelPx}px)`;
}

function appendLethalityToRepulseCell(
  cellEl: HTMLElement,
  lethality: KineticLethalityProfile,
): void {
  const subtext = document.createElement('div');
  subtext.className = 'displacement-distance-subtext';
  subtext.textContent = lethality.summary;

  const badgeWrap = document.createElement('div');
  badgeWrap.style.marginTop = '4px';

  const badge = document.createElement('span');
  badge.className = `lethality-badge ${ringOutTierBadgeClass(lethality.tier)}`;
  badge.textContent = lethality.label;

  badgeWrap.appendChild(badge);
  cellEl.appendChild(subtext);
  cellEl.appendChild(badgeWrap);
}

function formatInspectorInstability(profile: SpellCombatProfile): string {
  return `+${profile.instabilityYield}%`;
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
  private treeRoot!: HTMLElement;
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

  private activeForgeCardSlots: ForgeCardSlot[] | null = null;
  private forgePipSignature: string | null = null;

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
  private treeSpellId: string | null = null;
  private hoveredSpellId: string | null = null;
  private selectedForgeIndex: number | null = null;
  private activeTransientSpell: AbilitySchema | null = null;
  private heroScopeAnimId: number | null = null;
  private activePlaybackRecording: PlaybackRecording | null = null;
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
  constructor(private callbacks: DraftModalCallbacks) {
    injectStyles();

    this.overlay = document.createElement('div');
    this.overlay.className = 'workshop-overlay';
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: none; align-items: center; justify-content: center;
      background: rgba(4,6,14,0.72); backdrop-filter: var(--panel-backdrop-filter, blur(12px));
      opacity: 0; transition: opacity 0.2s ease;
      pointer-events: auto; padding: 16px;
    `;

    this.panel = document.createElement('div');
    this.panel.className = 'workshop-panel';
    this.panel.style.cssText = `
      width: min(1180px, 100%); height: min(95vh, 880px); overflow: hidden;
      display: flex; flex-direction: column;
      padding: 16px 20px 18px; border-radius: 4px;
      ${retroPanelStyle('cyan')}
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      transform: scale(0.97); transition: transform 0.2s ease;
      color: ${RETRO_COLORS.textPrimary}; font-family: ${FONTS.mono};
    `;
    this.panel.dataset.panel = 'true';

    const header = document.createElement('div');
    header.className = 'workshop-header';
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

    this.treeRoot = document.createElement('div');
    this.treeRoot.className = 'evolution-tree-host';
    this.treeRoot.style.display = 'none';

    this.workspaceContent = document.createElement('div');
    this.workspaceContent.className = 'workspace-content';
    this.workspaceContent.appendChild(this.vaultRoot);
    this.workspaceContent.appendChild(this.forgeRoot);
    this.workspaceContent.appendChild(this.treeRoot);

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
    AudioEngine.getInstance().unlockFromUserGesture();
    this.intermissionMode = false;
    this.mode = 'FORGE_NEW';
    this.evolutionContext = null;
    this.evolvingBaseSpellId = null;
    this.cards = [];
    this.forgeVaultPickerActive = false;
    this.vaultSavedCardIndex = null;
    this.clearForgeTransientState();
    this.clearSynthesisWarning();
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    ActionBarHUD.suppress();
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
    this.clearForgeTransientState();
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
    AudioEngine.getInstance().unlockFromUserGesture();
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
    this.treeRoot.style.display = this.activeTab === 'TREE' ? 'flex' : 'none';
    this.inspectorPane.style.display = this.activeTab === 'TREE' ? 'none' : '';
  }

  private clearForgeTransientState(): void {
    this.selectedForgeIndex = null;
    this.activeTransientSpell = null;
  }

  private setActiveTab(tab: WorkshopTab): void {
    this.stopHeroScopeAnimation();
    if (tab === 'VAULT') {
      this.clearForgeTransientState();
    }
    this.activeTab = tab;
    this.refreshUI();
    if (tab === 'FORGE') {
      this.promptInput.focus();
    }
    if (tab === 'VAULT') {
      this.renderTacticalInspector();
    }
  }

  private renderWorkspace(): void {
    if (this.activeTab === 'VAULT') {
      this.renderVaultGrid();
      return;
    }
    if (this.activeTab === 'TREE') {
      this.renderEvolutionTreeView();
      return;
    }
    this.renderForge();
  }

  private resolveTreeCategory(spellId: string): SkillCategory {
    const loadout = SpellInventoryManager.getLoadout();
    for (const key of ACTION_SLOT_KEYS) {
      if (loadout[key] === spellId) return SLOT_CATEGORY_MAP[key];
    }
    return 'SECONDARY';
  }

  private openEvolutionTree(spellId: string): void {
    const resolvedId = EvolutionStore.getResolvedSpellId(spellId);
    this.treeSpellId = resolvedId;
    this.selectedSpellId = resolvedId;
    EvolutionStore.ensureTree(resolvedId, this.resolveTreeCategory(resolvedId));
    this.setActiveTab('TREE');
  }

  private renderEvolutionTreeView(): void {
    if (!this.treeSpellId) {
      this.treeRoot.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'evolution-tree-empty';
      empty.textContent = 'Select a spell in the vault to open its evolution tree.';
      this.treeRoot.appendChild(empty);
      return;
    }

    const category = this.resolveTreeCategory(this.treeSpellId);
    renderEvolutionTree(this.treeRoot, {
      spellId: this.treeSpellId,
      category,
      onGenerateMechanic: (resolvedId) => {
        this.startEvolution(resolvedId);
      },
      onCommitted: () => {
        this.renderBottomLoadoutBay();
        if (this.activeTab === 'VAULT') {
          this.renderVaultGrid();
          this.renderTacticalInspector();
        }
      },
      stopPreview: () => this.stopHeroScopeAnimation(),
      startPreview: (container, spell) => this.mountHeroScopePreview(container, spell),
    });
  }

  private mountHeroScopePreview(container: HTMLElement, spell: AbilitySchema): void {
    this.stopHeroScopeAnimation();
    container.innerHTML = '';

    const archetypeColor = getArchetypeColor(spell.archetype, spell.visuals?.color);
    const heroWrap = document.createElement('div');
    heroWrap.className = 'inspector-hero-wrap';
    heroWrap.style.borderColor = archetypeColor;
    heroWrap.style.boxShadow = `inset 0 0 16px rgba(0, 0, 0, 0.8), 0 0 12px ${archetypeColor}44`;

    const scopeCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    scopeCanvas.width = SCOPE_WIDTH * dpr;
    scopeCanvas.height = SCOPE_HEIGHT * dpr;
    scopeCanvas.style.width = `${SCOPE_WIDTH}px`;
    scopeCanvas.style.height = `${SCOPE_HEIGHT}px`;
    heroWrap.appendChild(scopeCanvas);
    container.appendChild(heroWrap);

    this.activePlaybackRecording = recordSpellPlayback(spell, SCOPE_WIDTH, SCOPE_HEIGHT, 16);
    const scopeCtx = scopeCanvas.getContext('2d');
    if (scopeCtx) {
      scopeCtx.scale(dpr, dpr);
      this.startHeroScopeAnimation(
        scopeCanvas,
        scopeCtx,
        this.activePlaybackRecording,
        archetypeColor,
      );
    }
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

  private renderTacticalInspector(explicitSpell?: AbilitySchema | null): void {
    this.stopHeroScopeAnimation();
    this.inspectorPane.innerHTML = '';

    let spell: AbilitySchema | null = explicitSpell ?? this.activeTransientSpell ?? null;
    if (!spell && this.activeTab === 'VAULT') {
      const activeId = this.hoveredSpellId ?? this.selectedSpellId;
      if (activeId) {
        spell = SpellInventoryManager.getSpell(activeId) ?? null;
      }
    }

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
    const combatProfile = computeSpellCombatProfile(spell);
    const profile = calculateCombatProfile(telemetry);
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
    scopeCanvas.width = SCOPE_WIDTH * dpr;
    scopeCanvas.height = SCOPE_HEIGHT * dpr;
    scopeCanvas.style.width = `${SCOPE_WIDTH}px`;
    scopeCanvas.style.height = `${SCOPE_HEIGHT}px`;
    heroWrap.appendChild(scopeCanvas);

    this.activePlaybackRecording = recordSpellPlayback(spell, SCOPE_WIDTH, SCOPE_HEIGHT, 16);
    const scopeCtx = scopeCanvas.getContext('2d');
    if (scopeCtx) {
      scopeCtx.scale(dpr, dpr);
      this.startHeroScopeAnimation(
        scopeCanvas,
        scopeCtx,
        this.activePlaybackRecording,
        archetypeColor,
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

    let mutationBanner: HTMLElement | null = null;
    if (evolutionDiff.length > 0) {
      mutationBanner = document.createElement('div');
      mutationBanner.className = 'forge-mutation-banner';
      const arrow = document.createElement('span');
      arrow.textContent = '▲';
      mutationBanner.appendChild(arrow);
      mutationBanner.appendChild(document.createTextNode(` ${evolutionDiff[0]}`));
    }

    const inspectorBaseline = this.resolveInspectorBaseline(spell);
    const telemetryBlock = inspectorBaseline
      ? this.buildInspectorComparisonDrawer(spell, inspectorBaseline)
      : this.buildInspectorTelemetryGrid(telemetry, combatProfile);

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
    const isForgeTransientPreview =
      this.forgeVaultPickerActive && this.selectedForgeIndex !== null;
    if (isForgeTransientPreview) {
      const forgeHint = document.createElement('div');
      forgeHint.className = 'inspector-desc';
      forgeHint.style.textAlign = 'center';
      forgeHint.style.opacity = '0.7';
      forgeHint.textContent = 'Save to Vault to equip or evolve';
      actionsSection.appendChild(forgeHint);
    } else {
      const upgradeBtn = document.createElement('button');
      upgradeBtn.type = 'button';
      upgradeBtn.className = 'inspector-upgrade-btn';
      upgradeBtn.innerHTML = '<span>✦</span> UPGRADE / EVOLVE SPELL';
      upgradeBtn.addEventListener('click', () => {
        this.openEvolutionTree(spell.id);
      });
      actionsSection.appendChild(upgradeBtn);
    }

    panel.appendChild(heroWrap);
    panel.appendChild(header);
    if (mutationBanner) panel.appendChild(mutationBanner);
    panel.appendChild(telemetryBlock);
    panel.appendChild(profileCard);
    panel.appendChild(tagsRow);
    panel.appendChild(desc);
    panel.appendChild(actionsSection);
    this.inspectorPane.appendChild(panel);
  }

  private createSpellTile(
    spell: AbilitySchema,
    equippedSlotBySpellId: Map<string, ActionSlotKey>,
  ): HTMLElement {
    const archetypeColor = getArchetypeColor(spell.archetype, spell.visuals?.color);
    const tile = document.createElement('div');
    tile.className = 'spell-tile';
    tile.dataset.spellId = spell.id;
    tile.style.setProperty('--archetype-color', archetypeColor);
    tile.style.background =
      `radial-gradient(circle at 50% 100%, ${hexToRgba(archetypeColor, 0.22)} 0%, transparent 70%), rgba(18, 18, 30, 0.85)`;
    tile.style.borderColor = archetypeColor;

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
    iconWrap.appendChild(generateSpellIcon(spell, 72));
    tile.appendChild(iconWrap);

    tile.addEventListener('mouseenter', () => {
      this.hoveredSpellId = spell.id;
      this.renderTacticalInspector();
    });

    tile.addEventListener('mouseleave', () => {
      this.hoveredSpellId = null;
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
      if (this.activeForgeCardSlots && this.activeForgeCardSlots.length > 0) {
        this.reappendForgeCardSlots();
      } else {
        this.renderForgeVaultPickerCards();
      }
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

      attachInventoryDropZone(slot, key);
      registerSlotDropZone(slot, key, LOADOUT_DROP_PRIORITY);
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
    this.clearForgeTransientState();
    const useStreaming =
      this.mode !== 'PASSIVE_UPGRADES' &&
      getAiSettings().apiKey.trim().length > 0 &&
      !prefetchCards;

    if (useStreaming && prefetchPromise && cachedEntry) {
      cachedEntry.abortController.abort();
      cachedEntry.promise.catch(() => {});
      prefetchPromise = null;
    }

    if (useStreaming && this.shouldShowForgeVaultPicker()) {
      this.loadingEl.style.display = 'none';
      this.mountForgeStreamingCards();
    } else if (useStreaming) {
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
        if (this.activeForgeCardSlots) {
          await this.reconcileForgeCardsAfterSynthesis();
        } else {
          await this.showForgeVaultPicker();
        }
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
    let cardIndex = 0;
    for (const card of this.cards) {
      if (card.type !== 'ACTIVE_ABILITY') continue;
      if (!card.abilityPayload) {
        card.abilityPayload = await compileAbilityPayload(
          card,
          this.evolutionContext?.baseAbility,
        );
        stampDraftCardMetadataOntoAbility(card.abilityPayload, card);
      }
      card.abilityPayload.id = card.abilityPayload.id ?? `forge_preview_${cardIndex}`;
      cardIndex += 1;
    }
  }

  private async showForgeVaultPicker(): Promise<void> {
    await this.prepareForgeCardsForDisplay();
    this.streamingSlots = null;
    this.activeForgeCardSlots = null;
    this.forgeVaultPickerActive = true;

    const pickerCards = this.getForgePickerCards();
    this.selectedForgeIndex = null;
    this.activeTransientSpell = null;

    this.renderForgeVaultPickerCards();

    if (pickerCards.length > 0) {
      this.previewForgeCard(0);
    }
  }

  private getForgePickerCards(): DraftCard[] {
    return this.cards.filter((card) => card.type === 'ACTIVE_ABILITY');
  }

  private getForgePickerCard(cardIndex: number): DraftCard | null {
    return this.getForgePickerCards()[cardIndex] ?? null;
  }

  private previewForgeCard(cardIndex: number): void {
    const slotCard = this.activeForgeCardSlots?.[cardIndex]?.card ?? null;
    const card = slotCard ?? this.getForgePickerCard(cardIndex);
    const ability = card?.abilityPayload ?? null;
    if (!ability) return;

    const unchanged = this.selectedForgeIndex === cardIndex;
    this.selectedForgeIndex = cardIndex;
    this.activeTransientSpell = ability;

    this.cardsContainer
      .querySelectorAll('.forge-card-redesign')
      .forEach((el, i) => el.classList.toggle('is-selected', i === cardIndex));

    if (!unchanged) {
      this.renderTacticalInspector(ability);
    }
  }

  private handleForgeCardDrop(targetSlot: ActionSlotKey, cardIndex: number): void {
    if (!this.forgeVaultPickerActive) return;

    const slotCard = this.activeForgeCardSlots?.[cardIndex]?.card ?? null;
    const card = slotCard ?? this.getForgePickerCard(cardIndex);
    if (!card?.abilityPayload) return;

    if (this.vaultSavedCardIndex !== null && this.vaultSavedCardIndex !== cardIndex) {
      return;
    }

    if (this.vaultSavedCardIndex === null) {
      this.saveCardToVault(card, cardIndex);
    }

    const spellId = card.abilityPayload?.id;
    if (spellId) {
      SpellInventoryManager.equipSpell(targetSlot, spellId);
    }
  }

  private saveCardToVault(card: DraftCard, cardIndex: number): void {
    if (this.vaultSavedCardIndex !== null || !card.abilityPayload) return;

    const ability = structuredClone(card.abilityPayload);
    ability.name = card.title || ability.name;
    ability.tagline = card.tagline;
    ability.description = card.description;
    stampDraftCardMetadataOntoAbility(ability, card);

    const category = this.resolveSynthesisCategory();

    if (this.evolvingBaseSpellId) {
      const spellId = EvolutionStore.getResolvedSpellId(this.evolvingBaseSpellId);
      ability.id = spellId;
      EvolutionStore.addMechanicNode(spellId, ability, card.evolutionDiff, category);
      const resolved = EvolutionStore.resolveSpell(spellId, category);
      card.abilityPayload = resolved.schema;
      this.treeSpellId = spellId;
      this.selectedSpellId = spellId;
    } else {
      ability.id = this.mintSpellId();
      const stored = this.callbacks.onStoreSpell(ability);
      card.abilityPayload = stored;
    }

    this.vaultSavedCardIndex = cardIndex;
    this.evolvingBaseSpellId = null;
    this.evolutionContext = null;
    this.mode = 'FORGE_NEW';
    this.selectedCategory = category;
    this.updateForgeCardFootersInPlace();
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

  private mountForgeStaticGlyph(slot: ForgeCardSlot, ability: AbilitySchema): void {
    slot.glyphFrameEl.classList.remove('is-streaming');
    slot.glyphFrameEl.innerHTML = '';
    const iconCanvas = generateSpellIcon(ability, 64);
    iconCanvas.className = 'forge-card-glyph-icon';
    slot.glyphFrameEl.appendChild(iconCanvas);
  }

  private clearForgeWinnerPips(): void {
    for (const slot of this.activeForgeCardSlots ?? []) {
      slot.telemetryItems.cooldown
        .querySelectorAll('.telemetry-winner-pip')
        .forEach((el) => el.remove());
      slot.telemetryItems.repulse
        .querySelectorAll('.telemetry-winner-pip')
        .forEach((el) => el.remove());
    }
  }

  private applyComparativeForgePips(): void {
    const slots = this.activeForgeCardSlots;
    if (!slots || slots.length < 2) {
      this.clearForgeWinnerPips();
      this.forgePipSignature = null;
      return;
    }

    if (!slots.every((slot) => slot.isSealed && slot.card?.abilityPayload)) {
      this.clearForgeWinnerPips();
      this.forgePipSignature = null;
      return;
    }

    const metrics = slots.map((slot) => {
      const telemetry = extractSpellTelemetry(slot.card!.abilityPayload!);
      return {
        cooldown: parseFloat(telemetry.cooldownSec) || 0,
        repulse: telemetry.repulseForce,
      };
    });

    const minCooldown = Math.min(...metrics.map((metric) => metric.cooldown));
    const maxRepulse = Math.max(...metrics.map((metric) => metric.repulse));
    const signature = `${minCooldown}|${maxRepulse}|${metrics
      .map((metric) => `${metric.cooldown},${metric.repulse}`)
      .join(';')}`;

    if (signature === this.forgePipSignature) return;
    this.forgePipSignature = signature;
    this.clearForgeWinnerPips();

    for (let i = 0; i < slots.length; i++) {
      const metric = metrics[i];
      if (maxRepulse > 0 && metric.repulse === maxRepulse) {
        const pip = document.createElement('span');
        pip.className = 'telemetry-winner-pip winner-repulse';
        pip.textContent = '▲ PEAK';
        slots[i].telemetryItems.repulse.appendChild(pip);
      }
      if (minCooldown < 5 && metric.cooldown === minCooldown) {
        const pip = document.createElement('span');
        pip.className = 'telemetry-winner-pip winner-cooldown';
        pip.textContent = '▲ FAST';
        slots[i].telemetryItems.cooldown.appendChild(pip);
      }
    }
  }

  private startHeroScopeAnimation(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    recording: PlaybackRecording,
    archetypeColor: string,
  ): void {
    const animate = (timestamp: number): void => {
      if (!canvas.isConnected) {
        this.stopHeroScopeAnimation();
        return;
      }

      const totalFrames = recording.frames.length;
      const frameIndex =
        totalFrames > 0 ? Math.floor(timestamp / (1000 / 60)) % totalFrames : 0;
      const frame = recording.frames[frameIndex];

      ctx.clearRect(0, 0, recording.canvasWidth, recording.canvasHeight);
      this.drawScopeBackground(
        ctx,
        recording.canvasWidth,
        recording.canvasHeight,
        timestamp,
        archetypeColor,
        recording.originCanvasPos,
      );

      if (!frame || totalFrames === 0) {
        this.drawScopeEmptyCrosshair(ctx, recording.canvasWidth, recording.canvasHeight);
        this.heroScopeAnimId = requestAnimationFrame(animate);
        return;
      }

      this.drawScopeCasterHub(ctx, recording.originCanvasPos, archetypeColor);
      this.drawScopeTargetReticle(ctx, recording.targetCanvasPos, archetypeColor);

      for (const zone of frame.zones) {
        this.drawScopeZone(ctx, zone.x, zone.y, zone.radius, zone.color, timestamp);
      }

      for (const proj of frame.projectiles) {
        drawScopeProjectile(
          ctx,
          proj.x,
          proj.y,
          proj.radius,
          proj.heading,
          proj.style,
          proj.color,
          timestamp,
          proj.z,
        );
      }

      for (const particle of frame.particles) {
        ctx.save();
        ctx.globalAlpha = particle.alpha;
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const impact of frame.impacts) {
        this.drawScopeImpact(ctx, impact.x, impact.y, impact.radius, impact.color, impact.age);
      }

      this.heroScopeAnimId = requestAnimationFrame(animate);
    };

    this.heroScopeAnimId = requestAnimationFrame(animate);
  }

  private drawScopeEmptyCrosshair(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.5;
    const cx = width / 2;
    const cy = height / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy);
    ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy + 4);
    ctx.stroke();
  }

  private drawScopeCasterHub(
    ctx: CanvasRenderingContext2D,
    origin: { x: number; y: number },
    color: string,
  ): void {
    const radius = Math.max(2, SCOPE_HEIGHT * 0.04);
    ctx.fillStyle = hexToRgba(color, 0.6);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawScopeTargetReticle(
    ctx: CanvasRenderingContext2D,
    target: { x: number; y: number },
    color: string,
  ): void {
    const r = 5;
    ctx.strokeStyle = hexToRgba(color, 0.35);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(target.x - r - 2, target.y);
    ctx.lineTo(target.x - r + 1, target.y);
    ctx.moveTo(target.x + r - 1, target.y);
    ctx.lineTo(target.x + r + 2, target.y);
    ctx.moveTo(target.x, target.y - r - 2);
    ctx.lineTo(target.x, target.y - r + 1);
    ctx.moveTo(target.x, target.y + r - 1);
    ctx.lineTo(target.x, target.y + r + 2);
    ctx.stroke();
  }

  private drawScopeZone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    timestamp: number,
  ): void {
    const rotation = (timestamp * 0.001) % (Math.PI * 2);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(0.6, color.replace(/[\d.]+\)$/, '0.12)'));
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.55)');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawScopeImpact(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
    age: number,
  ): void {
    const alpha = Math.max(0, 1 - age);
    const expandedRadius = radius * (1 + age * 1.5);
    ctx.strokeStyle = hexToRgba(color, alpha * 0.85);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, expandedRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba('#ffffff', alpha * 0.4);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(x, y, expandedRadius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawScopeBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timestamp: number,
    color: string,
    origin: { x: number; y: number },
  ): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= width; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const scanY = (timestamp * 0.04) % height;
    const scanGrad = ctx.createLinearGradient(0, scanY - 1, 0, scanY + 1);
    scanGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    scanGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
    scanGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = scanGrad;
    ctx.fillRect(0, scanY - 1, width, 2);

    const sonarMax = Math.min(width, height) / 2;
    const sonarRad = (timestamp * 0.03) % sonarMax;
    const sonarAlpha = 1 - sonarRad / sonarMax;
    ctx.strokeStyle = hexToRgba(color, sonarAlpha * 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, sonarRad, 0, Math.PI * 2);
    ctx.stroke();
  }

  private resolveInspectorBaseline(spell: AbilitySchema): {
    baseline: AbilitySchema;
    slotKey: ActionSlotKey;
    vsParent: boolean;
  } | null {
    const loadout = SpellInventoryManager.getLoadout();
    const isEquipped = Object.values(loadout).some((id) => id === spell.id);
    if (isEquipped) return null;

    if (
      this.evolutionContext &&
      this.evolutionContext.baseAbility.id !== spell.id
    ) {
      return {
        baseline: this.evolutionContext.baseAbility,
        slotKey: this.evolutionContext.slotKey,
        vsParent: true,
      };
    }

    let category: SkillCategory = this.selectedCategory;
    const matchingForgeSlot = this.activeForgeCardSlots?.find(
      (slot) =>
        slot.isSealed &&
        slot.card?.abilityPayload?.id === spell.id &&
        slot.card.category,
    );
    if (matchingForgeSlot?.card?.category) {
      category = matchingForgeSlot.card.category;
    }

    const slotKey = CATEGORY_SLOT_MAP[category];
    const baseline = SpellInventoryManager.getEquippedAbilities()[slotKey];
    if (!baseline || baseline.id === spell.id) return null;

    return {
      baseline,
      slotKey,
      vsParent: false,
    };
  }

  private buildInspectorTelemetryGrid(
    telemetry: SpellTelemetry,
    combatProfile: SpellCombatProfile,
  ): HTMLElement {
    const telemetryGrid = document.createElement('div');
    telemetryGrid.className = 'inspector-telemetry-grid';

    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('COOLDOWN', telemetry.cooldownSec),
    );
    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('RECOIL', `${telemetry.recoilKick} px/s`),
    );

    const repulseVal = document.createElement('span');
    repulseVal.className = 'telemetry-value val-repulse';
    repulseVal.textContent = `${telemetry.repulseForce} Force`;
    const repulseCell = this.buildInspectorTelemetryCell('REPULSE FORCE', repulseVal);
    if (combatProfile.displacement.peakForce > 0) {
      appendLethalityToRepulseCell(repulseCell, combatProfile.displacement.lethality);
    }
    telemetryGrid.appendChild(repulseCell);

    const instabilityVal = document.createElement('span');
    instabilityVal.className = 'telemetry-value val-instability';
    instabilityVal.textContent = `+${telemetry.instabilityYield}% Yield`;
    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('INSTABILITY', instabilityVal),
    );

    if (telemetry.directDamage > 0) {
      telemetryGrid.appendChild(
        this.buildInspectorTelemetryCell(
          'DIRECT DAMAGE',
          `${telemetry.directDamage} HP`,
        ),
      );
    }

    const deliveryVal = document.createElement('span');
    deliveryVal.className = 'telemetry-value val-delivery';
    deliveryVal.textContent = telemetry.deliveryText;
    telemetryGrid.appendChild(
      this.buildInspectorTelemetryCell('DELIVERY SPECS', deliveryVal, true),
    );

    return telemetryGrid;
  }

  private buildInspectorComparisonRow(
    label: string,
    inspectedText: string,
    baselineText: string,
    delta: MetricDelta | undefined,
    valueClass = '',
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'inspector-comparison-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'inspector-comparison-label';
    labelEl.textContent = label;

    const inspectedCell = document.createElement('div');
    inspectedCell.className = 'inspector-comparison-cell is-inspected';

    const inspectedVal = document.createElement('span');
    inspectedVal.className = `inspector-comparison-val${valueClass ? ` ${valueClass}` : ''}`;
    inspectedVal.textContent = inspectedText;
    inspectedCell.appendChild(inspectedVal);

    if (delta) {
      const pill = document.createElement('span');
      pill.className = `inspector-comparison-pill ${polarityCssClass(delta.polarity)}`;
      pill.textContent = delta.formattedDiff;
      inspectedCell.appendChild(pill);
    }

    const baselineCell = document.createElement('div');
    baselineCell.className = 'inspector-comparison-cell is-baseline';

    const baselineVal = document.createElement('span');
    baselineVal.className = `inspector-comparison-val${valueClass ? ` ${valueClass}` : ''}`;
    baselineVal.textContent = baselineText;
    baselineCell.appendChild(baselineVal);

    row.appendChild(labelEl);
    row.appendChild(inspectedCell);
    row.appendChild(baselineCell);
    return row;
  }

  private buildInspectorComparisonDrawer(
    spell: AbilitySchema,
    context: {
      baseline: AbilitySchema;
      slotKey: ActionSlotKey;
      vsParent: boolean;
    },
  ): HTMLElement {
    const drawer = document.createElement('div');
    drawer.className = 'inspector-comparison-drawer';

    const header = document.createElement('div');
    header.className = 'inspector-comparison-header';
    if (context.vsParent) {
      header.textContent = 'VS PARENT';
    } else {
      header.textContent = `VS [${context.slotKey}] ${context.baseline.name}`;
    }
    drawer.appendChild(header);

    const inspectedProfile = computeSpellCombatProfile(spell);
    const baselineProfile = computeSpellCombatProfile(context.baseline);
    const diff = compareCombatProfiles(inspectedProfile, baselineProfile);

    const rows = document.createElement('div');
    rows.className = 'inspector-comparison-rows';

    rows.appendChild(
      this.buildInspectorComparisonRow(
        'CADENCE',
        formatProfileCadence(inspectedProfile),
        formatProfileCadence(baselineProfile),
        diff.cooldown,
      ),
    );

    const forceDelta =
      diff.displacementDirectionMatch ? diff.peakDisplacement : undefined;
    rows.appendChild(
      this.buildInspectorComparisonRow(
        'PEAK FORCE',
        formatInspectorPeakForce(inspectedProfile),
        formatInspectorPeakForce(baselineProfile),
        forceDelta,
        'val-repulse',
      ),
    );

    rows.appendChild(
      this.buildInspectorComparisonRow(
        'INSTABILITY',
        formatInspectorInstability(inspectedProfile),
        formatInspectorInstability(baselineProfile),
        diff.instabilityYield,
        'val-instability',
      ),
    );

    rows.appendChild(
      this.buildInspectorComparisonRow(
        'RECOIL',
        `${inspectedProfile.recoilKick} px/s`,
        `${baselineProfile.recoilKick} px/s`,
        diff.recoil,
      ),
    );

    if (inspectedProfile.directDamage > 0 || baselineProfile.directDamage > 0) {
      rows.appendChild(
        this.buildInspectorComparisonRow(
          'DIRECT DMG',
          `${inspectedProfile.directDamage} HP`,
          `${baselineProfile.directDamage} HP`,
          diff.directDamage,
        ),
      );
    }

    drawer.appendChild(rows);

    if (diff.mechanicChips.length > 0) {
      const chipsRow = document.createElement('div');
      chipsRow.className = 'inspector-comparison-chips';
      for (const chip of diff.mechanicChips) {
        chipsRow.appendChild(this.renderMechanicDiffChip(chip));
      }
      drawer.appendChild(chipsRow);
    }

    if (inspectedProfile.delivery.summary) {
      const delivery = document.createElement('div');
      delivery.className = 'inspector-comparison-delivery';
      delivery.textContent = inspectedProfile.delivery.summary;
      drawer.appendChild(delivery);
    }

    return drawer;
  }

  private buildInspectorTelemetryCell(
    label: string,
    valueContent: string | HTMLElement,
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

    return cellEl;
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

  private mountForgeCardShell(cardIndex: number, rarity: CardRarity): ForgeCardSlot {
    const tier = normalizeForgeTierRarity(rarity);
    const rarityColor = RARITY_COLORS[rarity];

    const root = document.createElement('div');
    root.className = `forge-card-redesign tier-${tier.toLowerCase()}`;
    if (this.selectedForgeIndex === cardIndex) {
      root.classList.add('is-selected');
    }
    root.style.setProperty('--card-border-color', rarityColor);
    root.style.setProperty('--card-glow-color', `${rarityColor}44`);

    const header = document.createElement('div');
    header.className = 'forge-card-header';

    const rarityEl = document.createElement('span');
    rarityEl.className = 'forge-card-rarity forge-card-crest';
    rarityEl.textContent = getTierCrest(tier);

    const archetypeEl = document.createElement('span');
    archetypeEl.className = 'forge-card-archetype';
    archetypeEl.style.opacity = '0';
    archetypeEl.style.minWidth = '52px';

    header.appendChild(rarityEl);
    header.appendChild(archetypeEl);

    const mutationSlotEl = document.createElement('div');
    mutationSlotEl.className = 'forge-card-mutation-slot';

    const glyphFrameEl = document.createElement('div');
    glyphFrameEl.className = 'forge-card-glyph-frame is-streaming';

    const info = document.createElement('div');
    info.className = 'forge-card-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'forge-card-title is-forging';
    titleEl.textContent = 'Forging Spell...';

    const taglineEl = document.createElement('div');
    taglineEl.className = 'forge-card-tagline';
    taglineEl.textContent = 'Synthesizing concept...';

    const descEl = document.createElement('div');
    descEl.className = 'forge-card-desc';
    descEl.textContent = '';

    info.appendChild(titleEl);
    info.appendChild(taglineEl);
    info.appendChild(descEl);

    const telemetryGridEl = document.createElement('div');
    telemetryGridEl.className = 'forge-card-telemetry';

    const cooldownItem = this.buildTelemetryItem('Cooldown', '—');
    const recoilItem = this.buildTelemetryItem('Recoil', '—');
    const repulseItem = this.buildTelemetryItem('Repulse', '—');
    const instabilityItem = this.buildTelemetryItem('Instability', '—', 'highlight-instability');
    const deliveryItem = this.buildTelemetryItem('Delivery', '—');
    deliveryItem.classList.add('telemetry-row-full');

    telemetryGridEl.appendChild(cooldownItem);
    telemetryGridEl.appendChild(recoilItem);
    telemetryGridEl.appendChild(repulseItem);
    telemetryGridEl.appendChild(instabilityItem);
    telemetryGridEl.appendChild(deliveryItem);

    const badgesRowEl = document.createElement('div');
    badgesRowEl.className = 'forge-semantic-badges';

    const statusEl = document.createElement('div');
    statusEl.className = 'forge-card-status-block';
    statusEl.textContent = 'Awaiting telemetry...';

    const mechanicChipsRowEl = document.createElement('div');
    mechanicChipsRowEl.className = 'forge-mechanic-chips-row';

    const equippedDiffEl = document.createElement('div');
    equippedDiffEl.className = 'forge-card-equipped-diff';

    const footerEl = document.createElement('div');
    footerEl.className = 'forge-card-footer';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'forge-claim-btn save-vault-btn';
    saveBtn.textContent = 'SYNTHESIZING...';
    saveBtn.disabled = true;
    footerEl.appendChild(saveBtn);

    root.appendChild(header);
    root.appendChild(mutationSlotEl);
    root.appendChild(glyphFrameEl);
    root.appendChild(info);
    root.appendChild(telemetryGridEl);
    root.appendChild(badgesRowEl);
    root.appendChild(statusEl);
    root.appendChild(mechanicChipsRowEl);
    root.appendChild(equippedDiffEl);
    root.appendChild(footerEl);

    const cooldownVal = cooldownItem.querySelector('.telemetry-v');
    const recoilVal = recoilItem.querySelector('.telemetry-v');
    const repulseVal = repulseItem.querySelector('.telemetry-v');
    const instabilityVal = instabilityItem.querySelector('.telemetry-v');
    const deliveryVal = deliveryItem.querySelector('.telemetry-v');

    attachForgeCardPointerDrag(root, {
      cardIndex,
      canStartDrag: () => {
        const slot = this.activeForgeCardSlots?.[cardIndex];
        if (!slot?.isSealed) return false;
        if (this.vaultSavedCardIndex !== null && this.vaultSavedCardIndex !== cardIndex) {
          return false;
        }
        return true;
      },
      onDrop: (slotKey, droppedCardIndex) => {
        this.handleForgeCardDrop(slotKey, droppedCardIndex);
      },
    });

    return {
      cardEl: root,
      footerEl,
      rarity,
      cardIndex,
      titleEl,
      taglineEl,
      descEl,
      archetypeEl,
      mutationSlotEl,
      glyphFrameEl,
      telemetryGridEl,
      telemetryItems: {
        cooldown: cooldownItem,
        repulse: repulseItem,
        instability: instabilityItem,
      },
      telemetryValues: {
        cooldown: cooldownVal as HTMLElement,
        recoil: recoilVal as HTMLElement,
        repulse: repulseVal as HTMLElement,
        instability: instabilityVal as HTMLElement,
        delivery: deliveryVal as HTMLElement,
      },
      statusEl,
      mechanicChipsRowEl,
      equippedDiffEl,
      badgesRowEl,
      saveBtn,
      isSealed: false,
      card: null,
      handlersBound: false,
    };
  }

  private renderMechanicDiffChip(chip: MechanicDiffChip): HTMLElement {
    const el = document.createElement('span');
    const kindClass =
      chip.kind === 'BUFF' ? 'chip-buff' : chip.kind === 'MUTATION' ? 'chip-mutation' : 'chip-neutral';
    el.className = `mechanic-diff-chip ${kindClass}`;
    el.textContent = chip.label;
    return el;
  }

  private renderForgeEquippedComparison(slot: ForgeCardSlot, card: DraftCard): void {
    slot.mechanicChipsRowEl.innerHTML = '';
    slot.equippedDiffEl.innerHTML = '';

    const ability = card.abilityPayload;
    if (!ability) return;

    const baseline = this.getCompareAbility(this.callbacks.getLoadout(), card);
    if (!baseline) return;

    const currentProfile = computeSpellCombatProfile(ability);
    const baselineProfile = computeSpellCombatProfile(baseline);
    const diff = compareCombatProfiles(currentProfile, baselineProfile);

    for (const chip of diff.mechanicChips) {
      slot.mechanicChipsRowEl.appendChild(this.renderMechanicDiffChip(chip));
    }

    const tag = document.createElement('span');
    tag.className = 'forge-diff-baseline-tag';
    if (this.evolutionContext) {
      tag.textContent = 'vs Parent';
    } else if (card.category) {
      const slotKey = CATEGORY_SLOT_MAP[card.category];
      tag.textContent = `vs [${slotKey}] ${baseline.name}`;
    } else {
      tag.textContent = `vs ${baseline.name}`;
    }

    const valuesEl = document.createElement('div');
    valuesEl.className = 'forge-diff-values';

    const addDelta = (label: string, metric: CombatProfileDiff['cooldown']): void => {
      if (!metric) return;
      const span = document.createElement('span');
      span.className = `forge-diff-val ${polarityCssClass(metric.polarity)}`;
      span.textContent = `${label} ${metric.formattedDiff}`;
      valuesEl.appendChild(span);
    };

    addDelta('CD', diff.cooldown);
    addDelta('Force', diff.peakDisplacement);
    addDelta('Instab', diff.instabilityYield);

    slot.equippedDiffEl.appendChild(tag);
    slot.equippedDiffEl.appendChild(valuesEl);
  }

  private animateMetricRollUp(
    el: HTMLElement,
    targetValue: number,
    format: (value: number) => string,
    durationMs = 180,
  ): void {
    const start = performance.now();
    const step = (now: number): void => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(targetValue * eased);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = format(targetValue);
      }
    };
    requestAnimationFrame(step);
  }

  private populateForgeCardTelemetry(
    slot: ForgeCardSlot,
    card: DraftCard,
    options?: { animate?: boolean },
  ): void {
    const ability = card.abilityPayload;
    if (!ability) return;

    const telemetry = extractSpellTelemetry(ability);
    const combatProfile = computeSpellCombatProfile(ability);
    const tier = normalizeForgeTierRarity(card.rarity);
    const superKey = resolveSuperchargedMetricKey(telemetry, tier);
    const cooldownValue = parseFloat(telemetry.cooldownSec) || 0;
    const reachSuffix =
      combatProfile.displacement.peakForce > 0
        ? ` · ~${combatProfile.displacement.lethality.maxTravelPx}px reach`
        : '';

    if (options?.animate) {
      this.animateMetricRollUp(
        slot.telemetryValues.cooldown,
        cooldownValue,
        (value) => `${value.toFixed(1)}s`,
      );
      this.animateMetricRollUp(
        slot.telemetryValues.recoil,
        telemetry.recoilKick,
        (value) => `${Math.round(value)} px/s`,
      );
      if (telemetry.repulseForce > 0) {
        this.animateMetricRollUp(
          slot.telemetryValues.repulse,
          telemetry.repulseForce,
          (value) => {
            const rounded = Math.round(value);
            const base = `${rounded} Force`;
            return rounded >= telemetry.repulseForce ? `${base}${reachSuffix}` : base;
          },
        );
      } else {
        slot.telemetryValues.repulse.textContent = 'Minimal';
      }
    } else {
      slot.telemetryValues.cooldown.textContent = telemetry.cooldownSec;
      slot.telemetryValues.recoil.textContent = `${telemetry.recoilKick} px/s`;
      slot.telemetryValues.repulse.textContent =
        telemetry.repulseForce > 0
          ? `${telemetry.repulseForce} Force${reachSuffix}`
          : 'Minimal';
    }

    slot.telemetryValues.instability.textContent = `+${telemetry.instabilityYield}% Yield`;
    slot.telemetryValues.delivery.textContent = telemetry.deliveryText;

    slot.telemetryValues.repulse.classList.toggle(
      'highlight-repulse',
      telemetry.repulseForce > 0,
    );

    for (const item of Object.values(slot.telemetryItems)) {
      item.querySelector('.telemetry-v')?.classList.remove('stat-supercharged');
    }

    if (superKey === 'cooldown') {
      slot.telemetryValues.cooldown.classList.add('stat-supercharged');
    } else if (superKey === 'repulse') {
      slot.telemetryValues.repulse.classList.add('stat-supercharged');
    } else if (superKey === 'instability') {
      slot.telemetryValues.instability.classList.add('stat-supercharged');
    }
  }

  private renderForgeCardFooter(slot: ForgeCardSlot, cardIndex: number): void {
    const card = slot.card;
    slot.footerEl.innerHTML = '';

    const isSaved = this.vaultSavedCardIndex === cardIndex;
    const anotherSaved =
      this.vaultSavedCardIndex !== null && this.vaultSavedCardIndex !== cardIndex;

    slot.cardEl.classList.remove('forge-card-saved', 'forge-card-discarded');
    if (isSaved) {
      slot.cardEl.classList.add('forge-card-saved');
    } else if (anotherSaved) {
      slot.cardEl.classList.add('forge-card-discarded');
    }

    if (isSaved) {
      const storedIndicator = document.createElement('div');
      storedIndicator.className = 'forge-stored-indicator';
      storedIndicator.textContent = '✦ SAVED TO SPELL VAULT';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'forge-claim-btn save-vault-btn';
      viewBtn.textContent = 'VIEW IN VAULT';
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const spellId = card?.abilityPayload?.id;
        if (spellId) this.navigateToVaultSpell(spellId);
      });

      slot.footerEl.appendChild(storedIndicator);
      slot.footerEl.appendChild(viewBtn);
      slot.saveBtn = viewBtn;
      return;
    }

    if (anotherSaved) {
      const discardedHint = document.createElement('div');
      discardedHint.className = 'forge-card-discarded-hint';
      discardedHint.textContent = 'Not saved';
      slot.footerEl.appendChild(discardedHint);
      return;
    }

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'forge-claim-btn save-vault-btn';
    saveBtn.textContent = slot.isSealed ? 'SAVE TO VAULT' : 'SYNTHESIZING...';
    saveBtn.disabled = !slot.isSealed;
    if (slot.isSealed && card) {
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveCardToVault(card, cardIndex);
      });
    }
    slot.footerEl.appendChild(saveBtn);
    slot.saveBtn = saveBtn;
  }

  private updateForgeCardFootersInPlace(): void {
    if (this.activeForgeCardSlots) {
      for (const slot of this.activeForgeCardSlots) {
        this.renderForgeCardFooter(slot, slot.cardIndex);
      }
      return;
    }
    this.renderForgeVaultPickerCards();
  }

  private hoverForgeCard(cardIndex: number): void {
    const slot = this.activeForgeCardSlots?.[cardIndex];
    const ability = slot?.card?.abilityPayload;
    if (!ability) return;
    this.renderTacticalInspector(ability);
  }

  private restoreForgeInspectorPreview(): void {
    if (this.selectedForgeIndex !== null) {
      const slotAbility =
        this.activeForgeCardSlots?.[this.selectedForgeIndex]?.card?.abilityPayload ?? null;
      const pickerAbility = this.getForgePickerCard(this.selectedForgeIndex)?.abilityPayload ?? null;
      const ability = slotAbility ?? pickerAbility;
      if (ability) {
        this.renderTacticalInspector(ability);
        return;
      }
    }
    if (this.activeTransientSpell) {
      this.renderTacticalInspector(this.activeTransientSpell);
    }
  }

  private bindForgeCardInteraction(slot: ForgeCardSlot): void {
    if (slot.handlersBound) return;
    slot.handlersBound = true;

    const cardIndex = slot.cardIndex;
    slot.cardEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.forge-claim-btn')) return;
      if (!slot.isSealed) return;
      this.previewForgeCard(cardIndex);
    });

    slot.cardEl.addEventListener('mouseenter', () => {
      if (!slot.isSealed) return;
      this.hoverForgeCard(cardIndex);
    });

    slot.cardEl.addEventListener('mouseleave', (e) => {
      if (!slot.isSealed) return;
      const related = e.relatedTarget;
      if (related instanceof Element && related.closest('.forge-card-redesign')) {
        return;
      }
      this.restoreForgeInspectorPreview();
    });
  }

  private sealForgeCard(
    cardIndex: number,
    card: DraftCard,
    allCards?: DraftCard[],
  ): void {
    const slot = this.activeForgeCardSlots?.[cardIndex];
    if (!slot) return;
    this.sealForgeCardSlot(slot, card, allCards);
  }

  private sealForgeCardSlot(
    slot: ForgeCardSlot,
    card: DraftCard,
    allCards?: DraftCard[],
  ): void {
    const cardIndex = slot.cardIndex;
    const ability = card.abilityPayload;
    if (!ability || slot.isSealed) return;

    const pickerCards = allCards ?? this.getForgePickerCards();
    const telemetry = extractSpellTelemetry(ability);
    const archetype = ability.archetype ?? 'KINETIC';
    const archetypeColor = getArchetypeColor(archetype, ability.visuals?.color);

    slot.isSealed = true;
    slot.card = card;

    slot.titleEl.textContent = resolveForgeCardTitle(card, cardIndex, pickerCards);
    slot.titleEl.classList.remove('is-forging');
    slot.taglineEl.textContent = card.tagline;
    slot.descEl.textContent = card.description;

    slot.archetypeEl.textContent = archetype;
    slot.archetypeEl.style.opacity = '1';
    slot.archetypeEl.style.color = archetypeColor;
    slot.archetypeEl.style.borderColor = archetypeColor;
    slot.archetypeEl.style.background = `${archetypeColor}18`;

    slot.mutationSlotEl.innerHTML = '';
    const perk = resolveMutationPerk(card, telemetry);
    if (perk) {
      const mutationBanner = document.createElement('div');
      mutationBanner.className = 'forge-mutation-banner';
      const arrow = document.createElement('span');
      arrow.textContent = '▲';
      mutationBanner.appendChild(arrow);
      mutationBanner.appendChild(
        document.createTextNode(` ${stripMutationPerkNumericParenthetical(perk)}`),
      );
      slot.mutationSlotEl.appendChild(mutationBanner);
    }

    this.mountForgeStaticGlyph(slot, ability);

    slot.cardEl.classList.add('just-sealed');
    window.setTimeout(() => slot.cardEl.classList.remove('just-sealed'), 400);

    this.populateForgeCardTelemetry(slot, card, { animate: true });

    slot.badgesRowEl.innerHTML = '';
    this.appendSemanticBadges(slot.badgesRowEl, ability);

    slot.statusEl.textContent =
      telemetry.ccDescriptions.length > 0
        ? telemetry.ccDescriptions.join(' · ')
        : '[CLEAN HIT] Pure Kinetic Force';

    this.renderForgeEquippedComparison(slot, card);

    this.renderForgeCardFooter(slot, cardIndex);
    this.bindForgeCardInteraction(slot);

    if (this.selectedForgeIndex === null) {
      this.previewForgeCard(cardIndex);
    }

    this.applyComparativeForgePips();
  }

  private buildForgeTelemetryCard(
    card: DraftCard,
    cardIndex: number,
    allCards: DraftCard[],
  ): HTMLElement | null {
    if (!card.abilityPayload) return null;

    const slot = this.mountForgeCardShell(cardIndex, card.rarity);
    slot.titleEl.textContent = resolveForgeCardTitle(card, cardIndex, allCards);
    slot.taglineEl.textContent = card.tagline;
    slot.descEl.textContent = card.description;
    slot.titleEl.classList.remove('is-forging');
    if (!this.activeForgeCardSlots) {
      this.activeForgeCardSlots = [];
    }
    this.activeForgeCardSlots.push(slot);
    this.sealForgeCardSlot(slot, card, allCards);
    this.applyForgeCardSavedState(slot, cardIndex);
    return slot.cardEl;
  }

  private applyForgeCardSavedState(slot: ForgeCardSlot, cardIndex: number): void {
    if (this.vaultSavedCardIndex === null) return;
    this.renderForgeCardFooter(slot, cardIndex);
    if (this.vaultSavedCardIndex === cardIndex) {
      slot.cardEl.classList.add('forge-card-saved');
    } else {
      slot.cardEl.classList.add('forge-card-discarded');
    }
  }

  private ensureForgeVaultPickerHint(): void {
    const existing = this.cardsContainer.querySelector('.forge-vault-picker-hint');
    if (this.vaultSavedCardIndex !== null) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const hint = document.createElement('div');
    hint.className = 'forge-vault-picker-hint';
    hint.textContent = 'Choose one spell to save, or drag it to your loadout below.';
    this.cardsContainer.prepend(hint);
  }

  private mountForgeStreamingCards(): void {
    this.forgePipSignature = null;
    this.cardsContainer.innerHTML = '';
    this.streamingSlots = null;
    this.activeForgeCardSlots = [];
    this.forgeVaultPickerActive = true;
    this.selectedForgeIndex = null;
    this.activeTransientSpell = null;

    this.ensureForgeVaultPickerHint();

    for (let index = 0; index < FORGE_PARALLEL_RARITIES.length; index++) {
      const slot = this.mountForgeCardShell(index, FORGE_PARALLEL_RARITIES[index]);
      this.activeForgeCardSlots.push(slot);
      this.cardsContainer.appendChild(slot.cardEl);
    }
  }

  private reappendForgeCardSlots(): void {
    this.cardsContainer.innerHTML = '';
    this.ensureForgeVaultPickerHint();
    for (const slot of this.activeForgeCardSlots ?? []) {
      this.cardsContainer.appendChild(slot.cardEl);
    }
  }

  private async reconcileForgeCardsAfterSynthesis(): Promise<void> {
    await this.prepareForgeCardsForDisplay();
    this.forgeVaultPickerActive = true;

    const abilityCards = this.getForgePickerCards();
    for (let i = 0; i < abilityCards.length; i++) {
      const card = abilityCards[i];
      const slot = this.activeForgeCardSlots?.[i];
      if (!slot) continue;

      slot.card = card;
      slot.titleEl.textContent = resolveForgeCardTitle(card, i, abilityCards);
      slot.taglineEl.textContent = card.tagline;
      slot.descEl.textContent = card.description;

      if (!slot.isSealed) {
        this.sealForgeCard(i, card, abilityCards);
      } else {
        this.populateForgeCardTelemetry(slot, card);
        if (slot.card?.abilityPayload) {
          const telemetry = extractSpellTelemetry(slot.card.abilityPayload);
          slot.statusEl.textContent =
            telemetry.ccDescriptions.length > 0
              ? telemetry.ccDescriptions.join(' · ')
              : '[CLEAN HIT] Pure Kinetic Force';
          this.renderForgeEquippedComparison(slot, card);
        }
      }
    }

    this.ensureForgeVaultPickerHint();

    if (this.selectedForgeIndex === null && abilityCards.length > 0) {
      const firstSealed = this.activeForgeCardSlots?.findIndex((s) => s.isSealed) ?? -1;
      if (firstSealed >= 0) {
        this.previewForgeCard(firstSealed);
      }
    }

    this.applyComparativeForgePips();
  }

  private renderForgeVaultPickerCards(): void {
    this.forgePipSignature = null;
    this.activeForgeCardSlots = [];
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

    if (this.selectedForgeIndex !== null) {
      this.previewForgeCard(this.selectedForgeIndex);
    } else if (abilityCards.length > 0) {
      this.previewForgeCard(0);
    }

    this.applyComparativeForgePips();
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
    const forgeSlot = this.activeForgeCardSlots?.[index];
    if (forgeSlot && !forgeSlot.isSealed) {
      if (partial.name) {
        forgeSlot.titleEl.textContent = partial.name;
        forgeSlot.titleEl.classList.remove('is-forging');
      }
      if (partial.tagline) forgeSlot.taglineEl.textContent = partial.tagline;
      if (partial.description) forgeSlot.descEl.textContent = partial.description;
      if (partial.archetype) {
        const archetypeColor = getArchetypeColor(
          partial.archetype as SpellArchetype,
          undefined,
        );
        forgeSlot.archetypeEl.textContent = partial.archetype;
        forgeSlot.archetypeEl.style.opacity = '1';
        forgeSlot.archetypeEl.style.color = archetypeColor;
        forgeSlot.archetypeEl.style.borderColor = archetypeColor;
        forgeSlot.archetypeEl.style.background = `${archetypeColor}18`;
      }

      if (partial.isComplete && partial.validatedCard) {
        this.sealForgeCard(index, partial.validatedCard);
      }
      return;
    }

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
        const compareAgainst = this.getCompareAbility(loadout, card);
        const diff = this.statDiff(compareAgainst, card.abilityPayload);
        const existingDiff = slot.root.querySelector('.card-stat-diff');
        existingDiff?.remove();
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.className = 'card-stat-diff';
          diffEl.textContent = diff.text;
          diffEl.style.cssText = `font-size:${FONTS.size.sm};color:${diff.color};margin-bottom:8px;`;
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

      if (card.abilityPayload) {
        const preClamp = structuredClone(card.abilityPayload);
        const postClamp = clampSchemaValues(preClamp);
        const saturationChips = formatSaturationChips(analyzeSaturation(preClamp, postClamp));
        if (saturationChips.length > 0) {
          const chipRow = document.createElement('div');
          chipRow.className = 'evolution-saturation-chips';
          chipRow.style.marginBottom = '6px';
          for (const chip of saturationChips) {
            const chipEl = document.createElement('span');
            chipEl.className = 'evolution-saturation-chip';
            chipEl.textContent = chip;
            chipRow.appendChild(chipEl);
          }
          el.appendChild(chipRow);
        }
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
        const compareAgainst = this.getCompareAbility(loadout, card);
        const diff = this.statDiff(compareAgainst, card.abilityPayload);
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.textContent = diff.text;
          diffEl.style.cssText = `font-size:${FONTS.size.sm};color:${diff.color};margin-bottom:8px;`;
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

  private getCompareAbility(loadout: PlayerLoadout, card: DraftCard): AbilitySchema | null {
    if (this.evolutionContext) return this.evolutionContext.baseAbility;
    if (!card.category) return null;
    const slotKey = CATEGORY_SLOT_MAP[card.category];
    const slotIndex = ACTION_SLOT_INDEX[slotKey];
    return loadout.abilities[slotIndex];
  }

  private statDiff(
    baseline: AbilitySchema | null,
    incoming?: AbilitySchema,
  ): ReturnType<typeof formatCombatStatDiff> {
    if (!incoming || !baseline) return null;
    const currentProfile = computeSpellCombatProfile(incoming);
    const baselineProfile = computeSpellCombatProfile(baseline);
    const diff = compareCombatProfiles(currentProfile, baselineProfile);
    return formatCombatStatDiff(diff);
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
