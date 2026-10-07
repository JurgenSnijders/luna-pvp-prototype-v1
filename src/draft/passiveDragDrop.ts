import type { PassiveModifierPayload, PassiveSlotLabel } from '../types/cards';
import { PassiveInventoryManager } from '../game/PassiveInventory';

export type PassiveDragSource = 'PASSIVE_VAULT';

export interface PassiveDragPayload {
  source: PassiveDragSource;
  cardId: string;
}

let activePassiveDrag: PassiveDragPayload | null = null;

export function setActivePassiveDrag(payload: PassiveDragPayload | null): void {
  activePassiveDrag = payload;
}

export function getActivePassiveDrag(): PassiveDragPayload | null {
  return activePassiveDrag;
}

export function serializePassiveDragPayload(payload: PassiveDragPayload): string {
  return JSON.stringify(payload);
}

export function parsePassiveDragPayload(raw: string): PassiveDragPayload | null {
  if (!raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.source !== 'PASSIVE_VAULT') return null;
    if (typeof obj.cardId !== 'string' || !obj.cardId.trim()) return null;
    return { source: 'PASSIVE_VAULT', cardId: obj.cardId };
  } catch {
    return null;
  }
}

export function resolvePassiveDragPayload(raw: string): PassiveDragPayload | null {
  return parsePassiveDragPayload(raw) ?? activePassiveDrag;
}

export interface PassiveEquipCallbacks {
  equipPassive: (
    slotIndex: number,
    payload: PassiveModifierPayload,
    label?: PassiveSlotLabel,
  ) => void;
  unequipPassive: (slotIndex: number) => void;
}

export function attachPassiveVaultDrag(tile: HTMLElement, cardId: string): void {
  tile.draggable = true;
  tile.addEventListener('dragstart', (event) => {
    const payload: PassiveDragPayload = { source: 'PASSIVE_VAULT', cardId };
    setActivePassiveDrag(payload);
    const serialized = serializePassiveDragPayload(payload);
    event.dataTransfer?.setData('text/plain', serialized);
    event.dataTransfer?.setData('application/x-luna-passive', serialized);
    event.dataTransfer!.effectAllowed = 'copy';
    tile.classList.add('is-dragging');
  });
  tile.addEventListener('dragend', () => {
    setActivePassiveDrag(null);
    tile.classList.remove('is-dragging');
  });
}

export function attachPassiveSlotDrop(
  slot: HTMLElement,
  slotIndex: number,
  callbacks: PassiveEquipCallbacks,
): void {
  slot.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    slot.classList.add('passive-slot-drop-hover');
  });
  slot.addEventListener('dragleave', () => {
    slot.classList.remove('passive-slot-drop-hover');
  });
  slot.addEventListener('drop', (event) => {
    event.preventDefault();
    slot.classList.remove('passive-slot-drop-hover');
    const raw =
      event.dataTransfer?.getData('application/x-luna-passive') ||
      event.dataTransfer?.getData('text/plain') ||
      '';
    const payload = resolvePassiveDragPayload(raw);
    if (!payload) return;
    const card = PassiveInventoryManager.get(payload.cardId);
    const mod = card?.passivePayload?.[0];
    if (!mod) return;
    callbacks.equipPassive(slotIndex, mod, card ? { title: card.title, tagline: card.tagline } : undefined);
  });
}
