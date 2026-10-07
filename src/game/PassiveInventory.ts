import { generateOfflinePassives } from '../ai/synthesizer/offline/forge';
import { generatePassiveIcon } from '../services/imageSynthesizer';
import type { DraftCard, PassiveModifierPayload } from '../types/cards';
import { validateDraftCard } from '../types/cards';

const STORAGE_KEY = 'passives_inventory_v1';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function passiveHasIconData(card: DraftCard): boolean {
  return card.passivePayload?.some((mod) => Boolean(mod.iconData)) ?? false;
}

function summarizePassiveModifiers(passives: PassiveModifierPayload[]): string {
  const parts: string[] = [];
  for (const mod of passives) {
    if (mod.stat !== undefined && mod.op !== undefined && mod.value !== undefined) {
      parts.push(`${mod.stat} ${mod.op} ${mod.value}`);
    }
    const hookCount = mod.hooks?.length ?? 0;
    if (hookCount > 0) {
      parts.push(`${hookCount} combat hook${hookCount === 1 ? '' : 's'}`);
    }
    const spliceCount = mod.splices?.length ?? 0;
    if (spliceCount > 0) {
      parts.push(`${spliceCount} ability splice${spliceCount === 1 ? '' : 's'}`);
    }
  }
  return parts.length > 0 ? parts.join('; ') : 'passive augment';
}

function buildPassiveIconDescription(card: DraftCard): string {
  const mechanics = card.passivePayload ? summarizePassiveModifiers(card.passivePayload) : '';
  return mechanics ? `${card.description} (${mechanics})` : card.description;
}

class PassiveInventoryStore {
  private cards = new Map<string, DraftCard>();
  private insertionOrder: string[] = [];
  private initialized = false;
  private pendingIconGeneration = new Set<string>();

  initialize(): void {
    if (this.initialized) return;
    this.loadFromStorage();
    if (this.cards.size === 0) {
      for (const card of generateOfflinePassives('training')) {
        this.cards.set(card.id, card);
        this.insertionOrder.push(card.id);
      }
      this.persist();
    }
    this.initialized = true;
  }

  private loadFromStorage(): void {
    if (!canUseStorage()) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        const card = validateDraftCard(item);
        if (!card || card.type !== 'PASSIVE_UPGRADE') continue;
        this.cards.set(card.id, card);
        if (!this.insertionOrder.includes(card.id)) {
          this.insertionOrder.push(card.id);
        }
      }
    } catch {
      // Ignore corrupt storage.
    }
  }

  private persist(): void {
    if (!canUseStorage()) return;
    const payload = this.insertionOrder
      .map((id) => this.cards.get(id))
      .filter((card): card is DraftCard => card !== undefined);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('[PassiveInventory] Failed to persist inventory (quota exceeded?)', err);
    }
  }

  private dispatchUpdated(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('passiveinventoryupdated'));
  }

  private stampIconData(cardId: string, iconData: string): void {
    const card = this.cards.get(cardId);
    if (!card?.passivePayload || passiveHasIconData(card)) return;

    for (const mod of card.passivePayload) {
      mod.iconData = iconData;
    }
    this.persist();
    this.dispatchUpdated();
  }

  private schedulePassiveIconGeneration(card: DraftCard): void {
    if (!canUseStorage()) return;
    if (passiveHasIconData(card)) return;
    if (this.pendingIconGeneration.has(card.id)) return;

    this.pendingIconGeneration.add(card.id);
    const description = buildPassiveIconDescription(card);

    generatePassiveIcon(card.title, description)
      .then((iconData) => {
        this.stampIconData(card.id, iconData);
      })
      .catch((err) => {
        console.error(`[PassiveInventory] Icon generation failed for "${card.title}"`, err);
      })
      .finally(() => {
        this.pendingIconGeneration.delete(card.id);
      });
  }

  add(card: DraftCard): DraftCard {
    this.initialize();
    if (card.type !== 'PASSIVE_UPGRADE') return card;
    const existing = this.cards.get(card.id);
    if (existing) return existing;
    const stored = structuredClone(card);
    this.cards.set(stored.id, stored);
    this.insertionOrder.push(stored.id);
    this.persist();
    this.dispatchUpdated();
    this.schedulePassiveIconGeneration(stored);
    return stored;
  }

  get(cardId: string): DraftCard | null {
    this.initialize();
    return this.cards.get(cardId) ?? null;
  }

  getAll(): DraftCard[] {
    this.initialize();
    return this.insertionOrder
      .map((id) => this.cards.get(id))
      .filter((card): card is DraftCard => card !== undefined);
  }
}

export const PassiveInventoryManager = new PassiveInventoryStore();
