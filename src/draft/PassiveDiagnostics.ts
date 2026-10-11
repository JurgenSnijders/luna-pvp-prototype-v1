import { getArchetypeColor } from '../render/canvas/archetypeColors';
import type {
  DraftCard,
  PassiveModifierPayload,
  PassiveOp,
  PassiveSlotTuple,
  PassiveStat,
} from '../types/cards';
import type { PassiveHook, PassiveSplice } from '../types/combatEvents';
import type { ActionPayload, SpellArchetype } from '../types/schema';
import { FONTS, RETRO_COLORS } from '../ui/tokens';

const STAT_LABELS: Record<PassiveStat, string> = {
  MOVE_SPEED: 'MOVE SPEED',
  ACCELERATION: 'ACCELERATION',
  LINEAR_DRAG: 'LINEAR DRAG',
  MASS: 'MASS',
  KNOCKBACK_RESISTANCE: 'KNOCKBACK RESISTANCE',
  COOLDOWN_REDUCTION_PCT: 'COOLDOWN REDUCTION',
};

interface AggregatedStat {
  stat: PassiveStat;
  op: PassiveOp;
  value: number;
}

interface ArchetypeSpliceGroup {
  archetype: SpellArchetype | 'UNIVERSAL';
  bounces: number;
  pierce: number;
  effectLines: string[];
}

const TRIGGER_WHEN: Record<string, string> = {
  ON_HIT: 'On impact',
  ON_EXPIRY: 'On timeout',
  ON_BOUNCE: 'On bounce',
  ON_AIR_APEX: 'At apex',
  ON_CAST: 'On cast',
  ON_HIT_WALL: 'On wall hit',
  ON_GROUND_SLAM: 'On slam',
  ON_TICK: 'While active',
};

function formatTriggerWhen(trigger: string): string {
  if (TRIGGER_WHEN[trigger]) return TRIGGER_WHEN[trigger];
  const lower = trigger.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatSpliceActionPhrase(action: ActionPayload): string {
  switch (action.type) {
    case 'SPAWN_PROJECTILE': {
      const count = action.emitter?.count ?? 1;
      if (count > 1) return `split into ${count}`;
      return 'fire a projectile';
    }
    case 'SPAWN_FIELD':
      return action.field.fieldType.replace(/_/g, ' ').toLowerCase();
    case 'APPLY_IMPULSE':
      return 'knockback';
    case 'APPLY_STASIS':
      return 'stasis';
    case 'ADD_INSTABILITY':
      return 'vulnerability';
    case 'MODIFY_STAT':
      return 'stat change';
    default:
      return action.type.replace(/_/g, ' ').toLowerCase();
  }
}

export function formatPassiveSpliceLine(splice: PassiveSplice): string {
  const op = splice.operation;
  switch (op.type) {
    case 'ADD_BOUNCE':
      return `+${op.amount} bounce${op.amount === 1 ? '' : 's'}`;
    case 'ADD_PIERCE':
      return `+${op.amount} pierce${op.amount === 1 ? '' : 's'}`;
    case 'APPEND_TRIGGER': {
      const when = formatTriggerWhen(op.node.trigger);
      const effects = op.node.actions.map(formatSpliceActionPhrase).filter(Boolean);
      const effectText = effects.length > 0 ? effects.join(' and ') : 'trigger effect';
      return `${when}, ${effectText}`;
    }
  }
}

function collectEquippedPassives(passives: PassiveSlotTuple): PassiveModifierPayload[] {
  return passives.filter((mod): mod is PassiveModifierPayload => mod !== null);
}

export function aggregatePassiveStats(
  equipped: PassiveModifierPayload[],
): AggregatedStat[] {
  const totals = new Map<string, AggregatedStat>();

  for (const mod of equipped) {
    if (mod.stat === undefined || mod.op === undefined || mod.value === undefined) continue;
    const key = `${mod.stat}|${mod.op}`;
    const existing = totals.get(key);
    if (existing) {
      existing.value += mod.value;
    } else {
      totals.set(key, { stat: mod.stat, op: mod.op, value: mod.value });
    }
  }

  return [...totals.values()].sort((a, b) => {
    const labelA = STAT_LABELS[a.stat];
    const labelB = STAT_LABELS[b.stat];
    if (labelA !== labelB) return labelA.localeCompare(labelB);
    return a.op.localeCompare(b.op);
  });
}

export function collectPassiveHooks(equipped: PassiveModifierPayload[]): PassiveHook[] {
  const hooks: PassiveHook[] = [];
  for (const mod of equipped) {
    if (mod.hooks) hooks.push(...mod.hooks);
  }
  return hooks;
}

export function aggregatePassiveSplices(
  equipped: PassiveModifierPayload[],
): ArchetypeSpliceGroup[] {
  const groups = new Map<string, ArchetypeSpliceGroup>();

  const ensureGroup = (archetype: SpellArchetype | 'UNIVERSAL'): ArchetypeSpliceGroup => {
    const key = archetype;
    const existing = groups.get(key);
    if (existing) return existing;
    const created: ArchetypeSpliceGroup = {
      archetype,
      bounces: 0,
      pierce: 0,
      effectLines: [],
    };
    groups.set(key, created);
    return created;
  };

  for (const mod of equipped) {
    if (!mod.splices) continue;
    for (const splice of mod.splices) {
      const archetype = splice.targetArchetype ?? 'UNIVERSAL';
      const group = ensureGroup(archetype);
      applySpliceToGroup(group, splice);
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.archetype === 'UNIVERSAL') return 1;
    if (b.archetype === 'UNIVERSAL') return -1;
    return a.archetype.localeCompare(b.archetype);
  });
}

function applySpliceToGroup(group: ArchetypeSpliceGroup, splice: PassiveSplice): void {
  const op = splice.operation;
  switch (op.type) {
    case 'ADD_BOUNCE':
      group.bounces += op.amount;
      break;
    case 'ADD_PIERCE':
      group.pierce += op.amount;
      break;
    case 'APPEND_TRIGGER':
      group.effectLines.push(formatPassiveSpliceLine(splice));
      break;
  }
}

function formatStatLine(entry: AggregatedStat): string {
  const label = STAT_LABELS[entry.stat];
  if (entry.op === 'MULTIPLY') {
    const scale = Number.isInteger(entry.value)
      ? entry.value.toString()
      : entry.value.toFixed(2).replace(/\.?0+$/, '');
    return `×${scale} ${label}`;
  }

  const signed = entry.value >= 0 ? `+${entry.value}` : `${entry.value}`;
  if (entry.stat === 'COOLDOWN_REDUCTION_PCT') {
    return `${signed}% ${label}`;
  }
  return `${signed} ${label}`;
}

function statPolarityClass(entry: AggregatedStat): 'gain' | 'loss' | 'neutral' {
  if (entry.op === 'MULTIPLY') {
    if (entry.value > 1) return 'gain';
    if (entry.value < 1) return 'loss';
    return 'neutral';
  }
  if (entry.value > 0) return 'gain';
  if (entry.value < 0) return 'loss';
  return 'neutral';
}

function formatHookAction(action: ActionPayload): string {
  const target =
    'target' in action && typeof action.target === 'string' ? action.target : null;
  return target ? `${target}: ${action.type}` : action.type;
}

function formatHookLine(hook: PassiveHook): string {
  const actions = hook.actions.map(formatHookAction).join(', ');
  return `[${hook.on}] ↳ ${actions}`;
}

function formatSpliceLines(group: ArchetypeSpliceGroup): string[] {
  const lines: string[] = [];
  if (group.bounces > 0) {
    lines.push(`+${group.bounces} bounce${group.bounces === 1 ? '' : 's'}`);
  }
  if (group.pierce > 0) {
    lines.push(`+${group.pierce} pierce${group.pierce === 1 ? '' : 's'}`);
  }
  lines.push(...group.effectLines);
  return lines;
}

function collectCardSplices(mods: PassiveModifierPayload[]): PassiveSplice[] {
  const splices: PassiveSplice[] = [];
  for (const mod of mods) {
    if (mod.splices) splices.push(...mod.splices);
  }
  return splices;
}

function createSection(title: string): { section: HTMLElement; list: HTMLElement } {
  const section = document.createElement('section');
  section.className = 'passive-diagnostics-section';

  const heading = document.createElement('h3');
  heading.className = 'passive-diagnostics-section-title';
  heading.textContent = title;

  const list = document.createElement('div');
  list.className = 'passive-diagnostics-list';

  section.appendChild(heading);
  section.appendChild(list);
  return { section, list };
}

function appendRow(
  list: HTMLElement,
  text: string,
  className?: string,
  archetype?: SpellArchetype | 'UNIVERSAL',
): void {
  const row = document.createElement('div');
  row.className = 'passive-diagnostics-row';
  if (className) row.classList.add(className);

  if (archetype) {
    const tag = document.createElement('span');
    tag.className = 'passive-diagnostics-archetype';
    tag.textContent = `[${archetype}]`;
    if (archetype === 'UNIVERSAL') {
      tag.classList.add('passive-diagnostics-archetype-universal');
    } else {
      tag.style.color = getArchetypeColor(archetype);
      tag.style.borderColor = getArchetypeColor(archetype);
    }
    row.appendChild(tag);

    const detail = document.createElement('span');
    detail.className = 'passive-diagnostics-detail';
    detail.textContent = `↳ ${text}`;
    row.appendChild(detail);
  } else {
    row.textContent = text;
  }

  list.appendChild(row);
}

export function renderPassiveDiagnostics(
  container: HTMLElement,
  passives: PassiveSlotTuple,
): void {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'passive-diagnostics-panel';

  const heading = document.createElement('h2');
  heading.className = 'passive-diagnostics-heading';
  heading.textContent = 'System Diagnostics';

  panel.appendChild(heading);

  const equipped = collectEquippedPassives(passives);
  if (equipped.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'passive-diagnostics-empty';
    empty.textContent = 'NO ACTIVE MUTATIONS';
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }

  const stats = aggregatePassiveStats(equipped);
  const hooks = collectPassiveHooks(equipped);
  const splices = aggregatePassiveSplices(equipped);

  if (stats.length > 0) {
    const { section, list } = createSection('GLOBAL TELEMETRY');
    for (const entry of stats) {
      appendRow(list, formatStatLine(entry), `passive-diagnostics-${statPolarityClass(entry)}`);
    }
    panel.appendChild(section);
  }

  if (hooks.length > 0) {
    const { section, list } = createSection('ACTIVE ENGINE HOOKS');
    for (const hook of hooks) {
      appendRow(list, formatHookLine(hook), 'passive-diagnostics-hook');
    }
    panel.appendChild(section);
  }

  if (splices.length > 0) {
    const { section, list } = createSection('Spell edits');
    for (const group of splices) {
      for (const line of formatSpliceLines(group)) {
        appendRow(list, line, 'passive-diagnostics-splice', group.archetype);
      }
    }
    panel.appendChild(section);
  }

  container.appendChild(panel);
}

function getPassiveCardIconData(card: DraftCard): string | undefined {
  return card.passivePayload?.find((mod) => mod.iconData)?.iconData;
}

export function renderPassiveInspector(container: HTMLElement, card: DraftCard): void {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'passive-diagnostics-panel';

  const iconData = getPassiveCardIconData(card);
  if (iconData) {
    const art = document.createElement('div');
    art.className = 'passive-inspector-art';
    art.style.backgroundImage = `url("${iconData}")`;
    panel.appendChild(art);
  }

  const heading = document.createElement('h2');
  heading.className = 'passive-diagnostics-heading';
  heading.textContent = card.title;
  panel.appendChild(heading);

  const flavorParts: string[] = [];
  if (card.tagline) flavorParts.push(card.tagline);
  if (card.description && card.description !== card.tagline) {
    flavorParts.push(card.description);
  }
  if (flavorParts.length > 0) {
    const flavor = document.createElement('p');
    flavor.className = 'passive-inspector-flavor';
    flavor.textContent = flavorParts.join(' — ');
    panel.appendChild(flavor);
  }

  const mods = card.passivePayload ?? [];
  const stats = aggregatePassiveStats(mods);
  const hooks = collectPassiveHooks(mods);
  const splices = collectCardSplices(mods);

  if (stats.length === 0 && hooks.length === 0 && splices.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'passive-diagnostics-empty';
    empty.textContent = 'NO MODIFIERS';
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }

  if (stats.length > 0) {
    const { section, list } = createSection('STAT MODIFIERS');
    for (const entry of stats) {
      appendRow(list, formatStatLine(entry), `passive-diagnostics-${statPolarityClass(entry)}`);
    }
    panel.appendChild(section);
  }

  if (hooks.length > 0) {
    const { section, list } = createSection('ACTIVE ENGINE HOOKS');
    for (const hook of hooks) {
      appendRow(list, formatHookLine(hook), 'passive-diagnostics-hook');
    }
    panel.appendChild(section);
  }

  if (splices.length > 0) {
    const { section, list } = createSection('Spell edits');
    for (const splice of splices) {
      const archetype = splice.targetArchetype ?? 'UNIVERSAL';
      appendRow(list, formatPassiveSpliceLine(splice), 'passive-diagnostics-splice', archetype);
    }
    panel.appendChild(section);
  }

  container.appendChild(panel);
}
