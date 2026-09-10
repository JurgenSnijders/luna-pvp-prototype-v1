import { applyModifiers, getEligibleStatNodes, getStatCatalogEntry } from '../ai/budget/modifiers';
import { balanceAbilitySchema, clampSchemaValues } from '../ai/budget/balance';
import { CATEGORY_BUDGETS, MAX_EVOLUTION_TIER } from '../ai/budget/constants';
import { analyzeSaturation, type SaturationReport } from '../ai/budget/saturation';
import { scoreAbilitySchema } from '../ai/budget/score';
import { ACTION_SLOT_KEYS, type SkillCategory } from '../types/cards';
import type { EvolutionNode, EvolutionTree, SpellModifier } from '../types/evolution';
import { validateEvolutionTree } from '../types/evolution';
import type { AbilitySchema } from '../types/schema';
import { validateAbilitySchema } from '../types/schema';
import { SpellInventoryManager } from './SpellInventory';

const STORAGE_KEY = 'spell_evolution_v1';
const FORK_STORAGE_KEY = 'spell_evolution_forks_v1';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function mintNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveTier(activePath: string[]): number {
  if (activePath.length === 0) return 1;
  return Math.min(MAX_EVOLUTION_TIER, activePath.length);
}

function collectStatModifiers(tree: EvolutionTree): SpellModifier[] {
  const modifiers: SpellModifier[] = [];
  for (const nodeId of tree.activePath) {
    const node = tree.nodes.find((entry) => entry.id === nodeId);
    if (!node || node.kind !== 'STAT' || !node.modifiers) continue;
    modifiers.push(...node.modifiers);
  }
  return modifiers;
}

function resolveBaseSchema(tree: EvolutionTree): AbilitySchema {
  let base = structuredClone(tree.baseSchema);
  for (const nodeId of tree.activePath) {
    const node = tree.nodes.find((entry) => entry.id === nodeId);
    if (node?.kind === 'MECHANIC' && node.resolvedSchema) {
      base = structuredClone(node.resolvedSchema);
    }
  }
  return base;
}

export function resolveEvolutionTree(
  tree: EvolutionTree,
  category: SkillCategory,
): { schema: AbilitySchema; saturation: SaturationReport } {
  const tier = resolveTier(tree.activePath);
  const base = resolveBaseSchema(tree);
  const balanced = balanceAbilitySchema(base, category, tier);
  const modified = applyModifiers(balanced, collectStatModifiers(tree));

  const minCd = CATEGORY_BUDGETS[category].minCdMs;
  modified.cooldownMs = Math.max(minCd, Math.round(modified.cooldownMs));

  const preClamp = structuredClone(modified);
  const clamped = clampSchemaValues(modified);
  const saturation = analyzeSaturation(preClamp, clamped);
  const validated = validateAbilitySchema(clamped) ?? clamped;

  validated.id = tree.rootSpellId;
  return { schema: validated, saturation };
}

class EvolutionStoreImpl {
  private trees: Record<string, EvolutionTree> = {};
  private presetForks: Record<string, string> = {};

  constructor() {
    this.loadFromStorage();
    this.loadForksFromStorage();
  }

  private loadFromStorage(): void {
    if (!canUseStorage()) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const record = parsed as Record<string, unknown>;
      const next: Record<string, EvolutionTree> = {};
      for (const [spellId, value] of Object.entries(record)) {
        const tree = validateEvolutionTree(value, validateAbilitySchema);
        if (tree) next[spellId] = tree;
      }
      this.trees = next;
    } catch {
      this.trees = {};
    }
  }

  private persist(): void {
    if (!canUseStorage()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.trees));
  }

  private loadForksFromStorage(): void {
    if (!canUseStorage()) return;
    const raw = localStorage.getItem(FORK_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      const next: Record<string, string> = {};
      for (const [presetId, forkId] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof forkId === 'string' && forkId.trim()) next[presetId] = forkId;
      }
      this.presetForks = next;
    } catch {
      this.presetForks = {};
    }
  }

  private persistForks(): void {
    if (!canUseStorage()) return;
    localStorage.setItem(FORK_STORAGE_KEY, JSON.stringify(this.presetForks));
  }

  getTree(spellId: string): EvolutionTree | null {
    const tree = this.trees[spellId];
    return tree ? structuredClone(tree) : null;
  }

  private saveTree(tree: EvolutionTree): void {
    this.trees[tree.rootSpellId] = tree;
    this.persist();
  }

  private forkPresetIfNeeded(spellId: string): string {
    if (!SpellInventoryManager.isPresetSpell(spellId)) return spellId;
    const existingFork = this.presetForks[spellId];
    if (existingFork && SpellInventoryManager.getSpell(existingFork)) {
      return existingFork;
    }

    const spell = SpellInventoryManager.getSpell(spellId);
    if (!spell) return spellId;

    const cloned = SpellInventoryManager.addSpell(structuredClone(spell));
    this.presetForks[spellId] = cloned.id;
    this.persistForks();

    const loadout = SpellInventoryManager.getLoadout();
    for (const slotKey of ACTION_SLOT_KEYS) {
      if (loadout[slotKey] === spellId) {
        SpellInventoryManager.equipSpell(slotKey, cloned.id);
      }
    }
    return cloned.id;
  }

  ensureTree(spellId: string, category: SkillCategory): EvolutionTree {
    const existing = this.trees[spellId];
    if (existing) return structuredClone(existing);

    const actualId = this.forkPresetIfNeeded(spellId);
    const spell = SpellInventoryManager.getSpell(actualId);
    if (!spell) {
      throw new Error(`Cannot ensure evolution tree for missing spell: ${spellId}`);
    }

    const tree: EvolutionTree = {
      version: 1,
      rootSpellId: actualId,
      baseSchema: structuredClone(spell),
      nodes: [],
      activePath: [],
    };

    this.saveTree(tree);
    if (actualId !== spellId) {
      this.commit(actualId, category);
    }
    return structuredClone(tree);
  }

  addStatNode(spellId: string, catalogId: string, category: SkillCategory): EvolutionTree {
    const tree = this.ensureTree(spellId, category);
    const entry = getStatCatalogEntry(catalogId);
    if (!entry) throw new Error(`Unknown stat catalog id: ${catalogId}`);

    const { schema } = resolveEvolutionTree(tree, category);
    if (!entry.requires(schema)) {
      throw new Error(`Stat node ${catalogId} is not eligible for this spell`);
    }

    const nextTier = tree.activePath.length + 1;
    if (nextTier > MAX_EVOLUTION_TIER) {
      throw new Error(`Evolution tier cap reached (${MAX_EVOLUTION_TIER})`);
    }

    const parentId =
      tree.activePath.length > 0 ? tree.activePath[tree.activePath.length - 1] : null;

    const node: EvolutionNode = {
      id: mintNodeId(),
      parentId,
      tier: nextTier,
      kind: 'STAT',
      label: entry.label,
      modifiers: structuredClone(entry.modifiers),
    };

    tree.nodes.push(node);
    tree.activePath.push(node.id);
    this.saveTree(tree);
    this.commit(tree.rootSpellId, category);
    return structuredClone(tree);
  }

  addMechanicNode(
    spellId: string,
    schema: AbilitySchema,
    diff: string[] | undefined,
    category: SkillCategory,
  ): EvolutionTree {
    const tree = this.ensureTree(spellId, category);
    const nextTier = tree.activePath.length + 1;
    if (nextTier > MAX_EVOLUTION_TIER) {
      throw new Error(`Evolution tier cap reached (${MAX_EVOLUTION_TIER})`);
    }

    const parentId =
      tree.activePath.length > 0 ? tree.activePath[tree.activePath.length - 1] : null;

    const node: EvolutionNode = {
      id: mintNodeId(),
      parentId,
      tier: nextTier,
      kind: 'MECHANIC',
      label: schema.name ?? 'Mechanic Evolution',
      resolvedSchema: structuredClone(schema),
      diff: diff?.length ? [...diff] : undefined,
    };

    tree.nodes.push(node);
    tree.activePath.push(node.id);
    this.saveTree(tree);
    this.commit(tree.rootSpellId, category);
    return structuredClone(tree);
  }

  setActivePath(spellId: string, nodeIds: string[], category: SkillCategory): EvolutionTree {
    const tree = this.ensureTree(spellId, category);
    const known = new Set(tree.nodes.map((node) => node.id));
    for (const id of nodeIds) {
      if (!known.has(id)) throw new Error(`Unknown evolution node: ${id}`);
    }
    tree.activePath = [...nodeIds];
    this.saveTree(tree);
    this.commit(tree.rootSpellId, category);
    return structuredClone(tree);
  }

  resetTree(spellId: string, category: SkillCategory): EvolutionTree {
    const tree = this.ensureTree(spellId, category);
    tree.nodes = [];
    tree.activePath = [];
    this.saveTree(tree);
    this.commit(tree.rootSpellId, category);
    return structuredClone(tree);
  }

  resolveSpell(
    spellId: string,
    category: SkillCategory,
  ): { schema: AbilitySchema; saturation: SaturationReport; tier: number; power: number } {
    const tree = this.trees[spellId] ?? this.ensureTree(spellId, category);
    const resolved = resolveEvolutionTree(tree, category);
    return {
      ...resolved,
      tier: resolveTier(tree.activePath),
      power: scoreAbilitySchema(resolved.schema),
    };
  }

  getEligibleStatNodes(spellId: string, category: SkillCategory): ReturnType<typeof getEligibleStatNodes> {
    const { schema } = this.resolveSpell(spellId, category);
    return getEligibleStatNodes(schema);
  }

  commit(
    spellId: string,
    category: SkillCategory,
  ): { schema: AbilitySchema; saturation: SaturationReport } {
    const resolved = this.resolveSpell(spellId, category);
    const stored = SpellInventoryManager.addSpell({
      ...resolved.schema,
      id: spellId,
    });

    const loadout = SpellInventoryManager.getLoadout();
    for (const slotKey of ACTION_SLOT_KEYS) {
      if (loadout[slotKey] === spellId) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('loadoutchanged', {
              detail: { slotKey, spellId },
            }),
          );
        }
        break;
      }
    }

    return { schema: stored, saturation: resolved.saturation };
  }

  getResolvedSpellId(spellId: string): string {
    const tree = this.trees[spellId];
    if (tree) return tree.rootSpellId;
    if (this.presetForks[spellId]) return this.presetForks[spellId];
    return this.forkPresetIfNeeded(spellId);
  }
}

export const EvolutionStore = new EvolutionStoreImpl();

export type { SaturationReport };
