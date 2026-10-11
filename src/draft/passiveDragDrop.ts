import type {
  PassiveModifierPayload,
  PassiveSlotLabel,
  PassiveSlotTuple,
} from '../types/cards';
import { PassiveInventoryManager } from '../game/PassiveInventory';

export type PassiveVaultDragPayload = {
  source: 'PASSIVE_VAULT';
  cardId: string;
};

export type PassiveSlotDragPayload = {
  source: 'PASSIVE_SLOT';
  sourceSlotIndex: number;
};

export type PassiveDragPayload = PassiveVaultDragPayload | PassiveSlotDragPayload;

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

function passiveDragDropEffect(payload: PassiveDragPayload | null): 'copy' | 'move' | 'none' {
  if (!payload) return 'none';
  return payload.source === 'PASSIVE_VAULT' ? 'copy' : 'move';
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
    if (obj.source === 'PASSIVE_VAULT') {
      if (typeof obj.cardId !== 'string' || !obj.cardId.trim()) return null;
      return { source: 'PASSIVE_VAULT', cardId: obj.cardId };
    }
    if (obj.source === 'PASSIVE_SLOT') {
      if (typeof obj.sourceSlotIndex !== 'number' || !Number.isInteger(obj.sourceSlotIndex)) {
        return null;
      }
      if (obj.sourceSlotIndex < 0) return null;
      return { source: 'PASSIVE_SLOT', sourceSlotIndex: obj.sourceSlotIndex };
    }
    return null;
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
    payload: PassiveModifierPayload[],
    label?: PassiveSlotLabel,
  ) => void;
  unequipPassive: (slotIndex: number) => void;
}

export interface PassiveEquipBarDragState {
  passives: PassiveSlotTuple;
  labels: Array<PassiveSlotLabel | null>;
}

function swapPassiveSlots(
  sourceIndex: number,
  targetIndex: number,
  state: PassiveEquipBarDragState,
  callbacks: PassiveEquipCallbacks,
): void {
  if (sourceIndex === targetIndex) return;

  const sourceMod = state.passives[sourceIndex];
  const sourceLabel = state.labels[sourceIndex];
  if (!sourceMod || sourceMod.length === 0) return;

  const targetMod = state.passives[targetIndex];
  const targetLabel = state.labels[targetIndex];

  callbacks.equipPassive(
    targetIndex,
    sourceMod,
    sourceLabel ? { ...sourceLabel } : undefined,
  );

  if (targetMod) {
    callbacks.equipPassive(
      sourceIndex,
      targetMod,
      targetLabel ? { ...targetLabel } : undefined,
    );
  } else {
    callbacks.unequipPassive(sourceIndex);
  }
}

function equipFromVault(
  targetIndex: number,
  cardId: string,
  callbacks: PassiveEquipCallbacks,
): void {
  const card = PassiveInventoryManager.get(cardId);
  const mods = card?.passivePayload;
  if (!mods || mods.length === 0) return;
  callbacks.equipPassive(
    targetIndex,
    mods,
    card ? { title: card.title, tagline: card.tagline } : undefined,
  );
}

export function attachPassiveVaultDrag(tile: HTMLElement, cardId: string): void {
  tile.draggable = true;
  tile.addEventListener('dragstart', (event) => {
    const payload: PassiveVaultDragPayload = { source: 'PASSIVE_VAULT', cardId };
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

export function attachPassiveSlotDrag(
  slot: HTMLElement,
  sourceSlotIndex: number,
): void {
  slot.draggable = true;
  slot.addEventListener('dragstart', (event) => {
    const payload: PassiveSlotDragPayload = {
      source: 'PASSIVE_SLOT',
      sourceSlotIndex,
    };
    setActivePassiveDrag(payload);
    const serialized = serializePassiveDragPayload(payload);
    event.dataTransfer?.setData('text/plain', serialized);
    event.dataTransfer?.setData('application/x-luna-passive', serialized);
    event.dataTransfer!.effectAllowed = 'move';
    setPassiveDragImage(slot, event);
    slot.classList.add('is-dragging');
  });
  slot.addEventListener('dragend', () => {
    setActivePassiveDrag(null);
    clearPassiveDragGhost();
    slot.classList.remove('is-dragging');
  });
}

export function attachPassiveSlotDrop(
  slot: HTMLElement,
  slotIndex: number,
  barState: PassiveEquipBarDragState,
  callbacks: PassiveEquipCallbacks,
): void {
  slot.addEventListener('dragenter', (event) => {
    const active = getActivePassiveDrag();
    if (!active) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = passiveDragDropEffect(active);
    }
    const related = event.relatedTarget as Node | null;
    if (related && slot.contains(related)) return;
    slot.classList.add('passive-slot-drop-hover');
  });

  slot.addEventListener('dragover', (event) => {
    const active = getActivePassiveDrag();
    if (!active) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = passiveDragDropEffect(active);
    }
  });

  slot.addEventListener('dragleave', (event) => {
    const related = event.relatedTarget as Node | null;
    if (related && slot.contains(related)) return;
    slot.classList.remove('passive-slot-drop-hover');
  });

  slot.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    slot.classList.remove('passive-slot-drop-hover');
    const raw =
      event.dataTransfer?.getData('application/x-luna-passive') ||
      event.dataTransfer?.getData('text/plain') ||
      '';
    const payload = resolvePassiveDragPayload(raw);
    if (!payload) return;

    if (payload.source === 'PASSIVE_VAULT') {
      equipFromVault(slotIndex, payload.cardId, callbacks);
      return;
    }

    swapPassiveSlots(payload.sourceSlotIndex, slotIndex, barState, callbacks);
  });
}

/** Unequip when a slot-originated drag is dropped outside equip slots. */
export function attachPassiveSlotUnequipZone(
  element: HTMLElement,
  callbacks: PassiveEquipCallbacks,
): void {
  const onDragEnter = (event: DragEvent): void => {
    const active = getActivePassiveDrag();
    if (active?.source !== 'PASSIVE_SLOT') return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const onDragOver = (event: DragEvent): void => {
    const active = getActivePassiveDrag();
    if (active?.source !== 'PASSIVE_SLOT') return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const onDrop = (event: DragEvent): void => {
    const active = getActivePassiveDrag();
    if (active?.source !== 'PASSIVE_SLOT') return;
    const target = event.target as Node | null;
    if (target && (target as Element).closest?.('.passive-slot')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    callbacks.unequipPassive(active.sourceSlotIndex);
    setActivePassiveDrag(null);
    clearPassiveDragGhost();
  };

  element.addEventListener('dragenter', onDragEnter, true);
  element.addEventListener('dragover', onDragOver, true);
  element.addEventListener('drop', onDrop);
}
