import type { PassiveModifierPayload, PassiveSlotLabel } from '../types/cards';
import { PassiveInventoryManager } from '../game/PassiveInventory';

export type PassiveDragSource = 'PASSIVE_VAULT';

export interface PassiveDragPayload {
  source: PassiveDragSource;
  cardId: string;
}

let activePassiveDrag: PassiveDragPayload | null = null;

let passiveDragGhost: HTMLElement | null = null;
let passiveDragMoveHandler: ((event: DragEvent) => void) | null = null;

function clearPassiveDragGhost(): void {
  if (passiveDragMoveHandler) {
    document.removeEventListener('drag', passiveDragMoveHandler);
    document.removeEventListener('dragover', passiveDragMoveHandler);
    passiveDragMoveHandler = null;
  }
  passiveDragGhost?.remove();
  passiveDragGhost = null;
}

function placePassiveDragGhost(clientX: number, clientY: number): void {
  if (!passiveDragGhost || (clientX === 0 && clientY === 0)) return;
  const w = passiveDragGhost.offsetWidth;
  const h = passiveDragGhost.offsetHeight;
  passiveDragGhost.style.left = `${clientX - w / 2}px`;
  passiveDragGhost.style.top = `${clientY - h / 2}px`;
}

/** Chrome drag preview is offset from the cursor; follow the pointer with a centered ghost. */
function setPassiveDragImage(source: HTMLElement, event: DragEvent): void {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;

  const rect = source.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  clearPassiveDragGhost();

  const canvas = source.querySelector('canvas');
  let ghost: HTMLElement;
  if (canvas instanceof HTMLCanvasElement && canvas.width > 0) {
    const ghostCanvas = document.createElement('canvas');
    ghostCanvas.width = cssW;
    ghostCanvas.height = cssH;
    ghostCanvas.style.width = `${cssW}px`;
    ghostCanvas.style.height = `${cssH}px`;
    const ctx = ghostCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, cssW, cssH);
    }
    ghost = ghostCanvas;
  } else {
    ghost = source.cloneNode(true) as HTMLElement;
    ghost.style.width = `${cssW}px`;
    ghost.style.height = `${cssH}px`;
    ghost.style.boxSizing = 'border-box';
    ghost.style.margin = '0';
  }

  ghost.style.position = 'fixed';
  ghost.style.zIndex = '100000';
  ghost.style.pointerEvents = 'none';
  document.body.appendChild(ghost);
  passiveDragGhost = ghost;
  placePassiveDragGhost(event.clientX, event.clientY);
  passiveDragMoveHandler = (ev: DragEvent) => placePassiveDragGhost(ev.clientX, ev.clientY);
  document.addEventListener('drag', passiveDragMoveHandler);
  document.addEventListener('dragover', passiveDragMoveHandler);

  const blank = document.createElement('canvas');
  blank.width = 1;
  blank.height = 1;
  dataTransfer.setDragImage(blank, 0, 0);
}

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
    setPassiveDragImage(tile, event);
    tile.classList.add('is-dragging');
  });
  tile.addEventListener('dragend', () => {
    setActivePassiveDrag(null);
    clearPassiveDragGhost();
    tile.classList.remove('is-dragging');
  });
}

export function attachPassiveSlotDrop(
  slot: HTMLElement,
  slotIndex: number,
  callbacks: PassiveEquipCallbacks,
): void {
  slot.addEventListener('dragenter', (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    const related = event.relatedTarget as Node | null;
    if (related && slot.contains(related)) return;
    slot.classList.add('passive-slot-drop-hover');
  });

  slot.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  });

  slot.addEventListener('dragleave', (event) => {
    const related = event.relatedTarget as Node | null;
    if (related && slot.contains(related)) return;
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
