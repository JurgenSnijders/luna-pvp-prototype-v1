import { BASELINE_INSTABILITY_ON_HIT } from '../engine/PhysicsWorld';
import { computeSpellCombatProfile } from '../primitives/combatProfile';
import { ACTION_SLOT_KEYS, type ActionSlotKey } from '../types/cards';
import type { AbilitySchema } from '../types/schema';
import { walkActions } from '../types/schema';
import { inferSpellRoles } from './spellRoles';

export type KitTag = 'PRIMER' | 'FINISHER' | 'UTILITY';

export type DominantKitTag = KitTag;

export interface SlotKitProfile {
  slotKey: ActionSlotKey;
  ability: AbilitySchema;
  tags: KitTag[];
  dominantTag: DominantKitTag | null;
}

export interface LoadoutKitMeter {
  primer: number;
  finisher: number;
  utility: number;
  total: number;
}

export interface LoadoutKitAnalysis {
  slots: SlotKitProfile[];
  filledCount: number;
  meter: LoadoutKitMeter;
  warnings: string[];
  synergy: string | null;
}

const FINISHER_REACH_PX = 400;

function hasUtilityAction(spell: AbilitySchema): boolean {
  let found = false;
  walkActions(spell, (v) => {
    if (!v.isPrimary) return;
    const type = v.action.type;
    if (
      type === 'REFLECT_PROJECTILES' ||
      type === 'SPAWN_OBSTACLE' ||
      type === 'APPLY_STASIS'
    ) {
      found = true;
    }
  });
  return found;
}

function classifySlotTags(spell: AbilitySchema): KitTag[] {
  const profile = computeSpellCombatProfile(spell);
  const tags = new Set<KitTag>();

  if (
    profile.instabilityYield > BASELINE_INSTABILITY_ON_HIT &&
    !profile.instabilityAppliesToSelf
  ) {
    tags.add('PRIMER');
  }

  if (profile.displacement.lethality.maxTravelPx >= FINISHER_REACH_PX) {
    tags.add('FINISHER');
  }

  const roles = inferSpellRoles(spell);
  if (hasUtilityAction(spell) || roles.includes('MOBILITY')) {
    tags.add('UTILITY');
  }

  return [...tags];
}

function resolveDominantTag(tags: KitTag[]): DominantKitTag | null {
  if (tags.length === 0) return null;
  if (tags.includes('FINISHER')) return 'FINISHER';
  if (tags.includes('PRIMER')) return 'PRIMER';
  if (tags.includes('UTILITY')) return 'UTILITY';
  return null;
}

function buildMeter(slots: SlotKitProfile[]): LoadoutKitMeter {
  let primer = 0;
  let finisher = 0;
  let utility = 0;

  for (const slot of slots) {
    if (slot.tags.includes('PRIMER')) primer++;
    if (slot.tags.includes('FINISHER')) finisher++;
    if (slot.tags.includes('UTILITY')) utility++;
  }

  return {
    primer,
    finisher,
    utility,
    total: primer + finisher + utility,
  };
}

function buildWarnings(slots: SlotKitProfile[]): string[] {
  const filled = slots.filter((s) => s.dominantTag !== null);
  if (filled.length === 0) return [];

  const warnings: string[] = [];
  const hasFinisher = slots.some((s) => s.tags.includes('FINISHER'));
  const hasMobility = slots.some((s) =>
    inferSpellRoles(s.ability).includes('MOBILITY'),
  );

  if (!hasFinisher) {
    warnings.push('No ring-out finisher');
  }
  if (!hasMobility) {
    warnings.push('No mobility tools');
  }

  const dominantCounts = new Map<DominantKitTag, number>();
  for (const slot of filled) {
    const tag = slot.dominantTag!;
    dominantCounts.set(tag, (dominantCounts.get(tag) ?? 0) + 1);
  }
  for (const count of dominantCounts.values()) {
    if (count >= 3) {
      warnings.push('Redundant primary role');
      break;
    }
  }

  return warnings;
}

function isPrimerSlot(slot: SlotKitProfile): boolean {
  return slot.tags.includes('PRIMER');
}

function isPullSlot(slot: SlotKitProfile): boolean {
  const profile = computeSpellCombatProfile(slot.ability);
  return profile.displacement.primaryTag === 'PULL';
}

function isPushFinisherSlot(slot: SlotKitProfile): boolean {
  const profile = computeSpellCombatProfile(slot.ability);
  return (
    profile.displacement.primaryTag === 'PUSH' &&
    profile.displacement.lethality.maxTravelPx >= FINISHER_REACH_PX
  );
}

function buildSynergy(slots: SlotKitProfile[]): string | null {
  if (slots.length < 2) return null;

  for (const primer of slots) {
    if (!isPrimerSlot(primer)) continue;
    for (const other of slots) {
      if (other.slotKey === primer.slotKey) continue;
      if (other.ability.archetype === 'PLASMA') {
        return `${primer.slotKey} primes instability → ${other.slotKey} detonates`;
      }
    }
  }

  for (const pull of slots) {
    if (!isPullSlot(pull)) continue;
    for (const other of slots) {
      if (other.slotKey === pull.slotKey) continue;
      if (isPushFinisherSlot(other)) {
        return `${pull.slotKey} drags in → ${other.slotKey} ring-out`;
      }
    }
  }

  return null;
}

export function analyzeLoadoutKit(
  equipped: Record<ActionSlotKey, AbilitySchema | null>,
): LoadoutKitAnalysis {
  const slots: SlotKitProfile[] = [];

  for (const slotKey of ACTION_SLOT_KEYS) {
    const ability = equipped[slotKey];
    if (!ability) continue;

    const tags = classifySlotTags(ability);
    slots.push({
      slotKey,
      ability,
      tags,
      dominantTag: resolveDominantTag(tags),
    });
  }

  const meter = buildMeter(slots);

  return {
    slots,
    filledCount: slots.length,
    meter,
    warnings: buildWarnings(slots),
    synergy: buildSynergy(slots),
  };
}
