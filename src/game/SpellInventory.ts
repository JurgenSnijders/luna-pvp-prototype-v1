import { PRESETS } from '../devtools/Presets';
import {
  ACTION_SLOT_KEYS,
  type ActionSlotKey,
  type LoadoutMap,
} from '../types/cards';
import type { AbilitySchema } from '../types/schema';
import { validateAbilitySchema } from '../types/schema';

export type { LoadoutMap };

const STORAGE_KEY_INVENTORY = 'spells_inventory_v1';
const STORAGE_KEY_LOADOUT = 'equipped_loadout_v1';

const GENERIC_IDS = new Set(['sanitized_ability', 'fallback_linear']);

const DEFAULT_LOADOUT: LoadoutMap = {
  LMB: 'kinetic_railgun',
  RMB: 'graviton_boomerang',
  Q: 'cryo_ice_trail',
  E: 'singularity_scatter',
  SPACE: 'phase_nova',
};

const DEFAULT_LOADOUT_BY_SLOT: Record<ActionSlotKey, string> = {
  LMB: 'kinetic_railgun',
  RMB: 'graviton_boomerang',
  Q: 'cryo_ice_trail',
  E: 'singularity_scatter',
  SPACE: 'phase_nova',
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function mintSpellId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `spell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyLoadout(): LoadoutMap {
  return {
    LMB: null,
    RMB: null,
    Q: null,
    E: null,
    SPACE: null,
  };
}

function isActionSlotKey(key: string): key is ActionSlotKey {
  return (ACTION_SLOT_KEYS as readonly string[]).includes(key);
}

export interface LoadoutChangedDetail {
  slotKey: ActionSlotKey;
  spellId: string | null;
}

class SpellInventoryStore {
  private inventory = new Map<string, AbilitySchema>();
  private loadout: LoadoutMap = createEmptyLoadout();
  private presetIds = new Set<string>();
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;

    this.presetIds.clear();
    for (const schema of Object.values(PRESETS)) {
      this.presetIds.add(schema.id);
      this.inventory.set(schema.id, structuredClone(schema));
    }

    this.loadCustomSpellsFromStorage();
    this.loadout = this.loadLoadoutFromStorage();
    this.persistLoadout();
    this.persistCustomSpells();

    this.initialized = true;
  }

  private loadCustomSpellsFromStorage(): void {
    if (!canUseStorage()) return;

    const raw = localStorage.getItem(STORAGE_KEY_INVENTORY);
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      for (const item of parsed) {
        const validated = validateAbilitySchema(item);
        if (!validated) continue;
        if (this.presetIds.has(validated.id)) continue;
        this.inventory.set(validated.id, validated);
      }
    } catch {
      // Ignore corrupt storage.
    }
  }

  private loadLoadoutFromStorage(): LoadoutMap {
    const fallback = (): LoadoutMap => ({ ...DEFAULT_LOADOUT });

    if (!canUseStorage()) return fallback();

    const raw = localStorage.getItem(STORAGE_KEY_LOADOUT);
    if (!raw) return fallback();

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback();

      const next = createEmptyLoadout();
      let valid = true;

      for (const slotKey of ACTION_SLOT_KEYS) {
        const value = (parsed as Record<string, unknown>)[slotKey];
        if (value === null) {
          next[slotKey] = null;
        } else if (typeof value === 'string') {
          next[slotKey] = value;
        } else {
          valid = false;
          break;
        }
      }

      if (!valid) return fallback();

      for (const slotKey of ACTION_SLOT_KEYS) {
        const spellId = next[slotKey];
        if (spellId !== null && !this.inventory.has(spellId)) {
          next[slotKey] = DEFAULT_LOADOUT_BY_SLOT[slotKey];
        }
      }

      return next;
    } catch {
      return fallback();
    }
  }

  private persistCustomSpells(): void {
    if (!canUseStorage()) return;

    const customs = this.getCustomSpells();
    localStorage.setItem(STORAGE_KEY_INVENTORY, JSON.stringify(customs));
  }

  private persistLoadout(): void {
    if (!canUseStorage()) return;
    localStorage.setItem(STORAGE_KEY_LOADOUT, JSON.stringify(this.loadout));
  }

  private dispatchInventoryUpdated(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('inventoryupdated'));
  }

  private dispatchLoadoutChanged(detail: LoadoutChangedDetail): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('loadoutchanged', { detail }));
  }

  private needsUniqueId(id: string | undefined): boolean {
    if (!id || !id.trim()) return true;
    if (GENERIC_IDS.has(id)) return true;
    if (this.presetIds.has(id)) return true;
    return false;
  }

  addSpell(spell: AbilitySchema): AbilitySchema {
    const stored = structuredClone(spell);
    if (this.needsUniqueId(stored.id)) {
      stored.id = mintSpellId();
    }
    this.inventory.set(stored.id, stored);
    this.persistCustomSpells();
    this.dispatchInventoryUpdated();
    return stored;
  }

  equipSpell(slotKey: ActionSlotKey, spellId: string | null): void {
    if (!isActionSlotKey(slotKey)) return;

    if (spellId !== null && !this.inventory.has(spellId)) {
      spellId = DEFAULT_LOADOUT_BY_SLOT[slotKey];
    }

    this.loadout[slotKey] = spellId;
    this.persistLoadout();
    this.dispatchLoadoutChanged({ slotKey, spellId });
  }

  getSpell(id: string): AbilitySchema | undefined {
    const spell = this.inventory.get(id);
    return spell ? structuredClone(spell) : undefined;
  }

  getAllSpells(): AbilitySchema[] {
    return Array.from(this.inventory.values()).map((spell) => structuredClone(spell));
  }

  getCustomSpells(): AbilitySchema[] {
    return Array.from(this.inventory.values())
      .filter((spell) => !this.presetIds.has(spell.id))
      .map((spell) => structuredClone(spell));
  }

  getLoadout(): LoadoutMap {
    return { ...this.loadout };
  }

  getEquippedAbilities(): Record<ActionSlotKey, AbilitySchema | null> {
    const equipped = {} as Record<ActionSlotKey, AbilitySchema | null>;
    for (const slotKey of ACTION_SLOT_KEYS) {
      const spellId = this.loadout[slotKey];
      equipped[slotKey] = spellId ? (this.getSpell(spellId) ?? null) : null;
    }
    return equipped;
  }
}

export const SpellInventoryManager = new SpellInventoryStore();
