import type { ActionSlotKey } from '../types/cards';
import {
  parseSpellDragPayload,
  serializeSpellDragPayload,
  SpellInventoryManager,
  type SpellDragPayload,
} from './SpellInventory';

export function attachInventoryDropZone(
  element: HTMLElement,
  slotKey: ActionSlotKey,
  onFallbackDrop?: (event: DragEvent) => void,
): void {
  element.classList.add('drop-zone');
  element.dataset.slotKey = slotKey;

  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!e.dataTransfer) return;
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
  });

  element.addEventListener('dragenter', (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && element.contains(related)) return;
    element.classList.add('drag-over');
  });

  element.addEventListener('dragleave', (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && element.contains(related)) return;
    element.classList.remove('drag-over');
  });

  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');
    const raw = e.dataTransfer?.getData('text/plain');
    if (raw) {
      const payload = parseSpellDragPayload(raw);
      if (payload) {
        SpellInventoryManager.applySpellDrop(slotKey, payload);
        return;
      }
    }
    onFallbackDrop?.(e);
  });
}

export function attachVaultCardDrag(card: HTMLElement, spellId: string): void {
  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    card.classList.add('is-dragging');
    const payload: SpellDragPayload = { source: 'VAULT', spellId };
    e.dataTransfer?.setData('text/plain', serializeSpellDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('is-dragging');
  });
}

export function attachDockSlotDrag(
  panel: HTMLElement,
  spellId: string,
  slotKey: ActionSlotKey,
): void {
  panel.draggable = true;
  panel.addEventListener('dragstart', (e) => {
    panel.classList.add('is-dragging');
    const payload: SpellDragPayload = { source: 'DOCK', spellId, slotKey };
    e.dataTransfer?.setData('text/plain', serializeSpellDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  panel.addEventListener('dragend', () => {
    panel.classList.remove('is-dragging');
  });
}

export function attachHudSlotDrag(root: HTMLElement, slotKey: ActionSlotKey): void {
  root.addEventListener('dragstart', (e) => {
    const spellId = root.dataset.equippedSpellId;
    if (!spellId) {
      e.preventDefault();
      return;
    }
    root.classList.add('is-dragging');
    const payload: SpellDragPayload = { source: 'HUD', spellId, slotKey };
    e.dataTransfer?.setData('text/plain', serializeSpellDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragend', () => {
    root.classList.remove('is-dragging');
  });
}

export interface ForgeCardDragPayload {
  source: 'FORGE';
  cardIndex: number;
}

export function parseForgeCardDragPayload(raw: string): ForgeCardDragPayload | null {
  if (!raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.source !== 'FORGE') return null;
    if (typeof obj.cardIndex !== 'number' || !Number.isInteger(obj.cardIndex) || obj.cardIndex < 0) {
      return null;
    }
    return { source: 'FORGE', cardIndex: obj.cardIndex };
  } catch {
    return null;
  }
}

export function serializeForgeCardDragPayload(payload: ForgeCardDragPayload): string {
  return JSON.stringify(payload);
}

export function attachForgeCardDrag(element: HTMLElement, cardIndex: number): void {
  element.draggable = true;
  element.classList.add('forge-card-drag-handle');
  element.addEventListener('dragstart', (e) => {
    element.classList.add('is-dragging');
    const payload: ForgeCardDragPayload = { source: 'FORGE', cardIndex };
    e.dataTransfer?.setData('text/plain', serializeForgeCardDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('is-dragging');
  });
}
