import { generateOfflinePassives } from '../ai/synthesizer/offline/forge';
import type { DraftCard } from '../types/cards';
import { validateDraftCard } from '../types/cards';

const STORAGE_KEY = 'passives_inventory_v1';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

class PassiveInventoryStore {
  private cards = new Map<string, DraftCard>();
  private insertionOrder: string[] = [];
  private initialized = false;

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  private dispatchUpdated(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('passiveinventoryupdated'));
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
