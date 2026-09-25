import type { ActionSlotKey } from '../types/cards';
import {
  parseSpellDragPayload,
  serializeSpellDragPayload,
  SpellInventoryManager,
  type SpellDragPayload,
} from './SpellInventory';

/** Same-page drag payload. Chrome often leaves text/plain unreadable on drop. */
let activeSpellDrag: SpellDragPayload | null = null;
let activeForgeDrag: ForgeCardDragPayload | null = null;

let dragGhost: HTMLCanvasElement | null = null;
let dragMoveHandler: ((event: DragEvent) => void) | null = null;

const FORGE_POINTER_DRAG_THRESHOLD_PX = 5;
const LOADOUT_DROP_PRIORITY = 1;
const HUD_DROP_PRIORITY = 2;

export interface SlotDropZoneRect {
  slotKey: ActionSlotKey;
  left: number;
  top: number;
  right: number;
  bottom: number;
  priority: number;
}

interface RegisteredSlotDropZone {
  element: HTMLElement;
  slotKey: ActionSlotKey;
  priority: number;
}

const registeredSlotDropZones: RegisteredSlotDropZone[] = [];

function clearDragGhost(): void {
  if (dragMoveHandler) {
    document.removeEventListener('drag', dragMoveHandler);
    document.removeEventListener('dragover', dragMoveHandler);
    dragMoveHandler = null;
  }
  dragGhost?.remove();
  dragGhost = null;
}

function placeDragGhost(clientX: number, clientY: number): void {
  if (!dragGhost || (clientX === 0 && clientY === 0)) return;
  const w = dragGhost.offsetWidth || dragGhost.width;
  const h = dragGhost.offsetHeight || dragGhost.height;
  dragGhost.style.left = `${clientX - w / 2}px`;
  dragGhost.style.top = `${clientY - h / 2}px`;
}

function createPointerDragGhost(source: HTMLElement, clientX: number, clientY: number): void {
  const canvas = source.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  clearDragGhost();
  const ghost = document.createElement('canvas');
  ghost.width = cssW;
  ghost.height = cssH;
  ghost.style.position = 'fixed';
  ghost.style.zIndex = '100000';
  ghost.style.pointerEvents = 'none';
  ghost.style.width = `${cssW}px`;
  ghost.style.height = `${cssH}px`;
  const ctx = ghost.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, cssW, cssH);
  }
  document.body.appendChild(ghost);
  dragGhost = ghost;
  placeDragGhost(clientX, clientY);
}

function pruneDisconnectedSlotDropZones(): void {
  for (let i = registeredSlotDropZones.length - 1; i >= 0; i--) {
    if (!registeredSlotDropZones[i].element.isConnected) {
      registeredSlotDropZones.splice(i, 1);
    }
  }
}

export function registerSlotDropZone(
  element: HTMLElement,
  slotKey: ActionSlotKey,
  priority = LOADOUT_DROP_PRIORITY,
): void {
  unregisterSlotDropZone(element);
  registeredSlotDropZones.push({ element, slotKey, priority });
}

export function unregisterSlotDropZone(element: HTMLElement): void {
  const idx = registeredSlotDropZones.findIndex((zone) => zone.element === element);
  if (idx >= 0) registeredSlotDropZones.splice(idx, 1);
}

export function collectSlotDropZoneRects(): SlotDropZoneRect[] {
  pruneDisconnectedSlotDropZones();
  const rects: SlotDropZoneRect[] = [];
  for (const zone of registeredSlotDropZones) {
    if (!zone.element.isConnected) continue;
    const rect = zone.element.getBoundingClientRect();
    rects.push({
      slotKey: zone.slotKey,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      priority: zone.priority,
    });
  }
  return rects;
}

export function hitTestSlotDropZones(
  x: number,
  y: number,
  zones: readonly SlotDropZoneRect[],
): ActionSlotKey | null {
  let best: SlotDropZoneRect | null = null;
  for (const zone of zones) {
    if (x < zone.left || x > zone.right || y < zone.top || y > zone.bottom) continue;
    if (!best || zone.priority > best.priority) {
      best = zone;
    }
  }
  return best?.slotKey ?? null;
}

export function hitTestRegisteredSlotDropZones(x: number, y: number): ActionSlotKey | null {
  return hitTestSlotDropZones(x, y, collectSlotDropZoneRects());
}

function clearDropZoneHighlights(): void {
  for (const zone of registeredSlotDropZones) {
    zone.element.classList.remove('drag-over');
  }
}

function updateDropZoneHighlight(clientX: number, clientY: number): void {
  const hitKey = hitTestRegisteredSlotDropZones(clientX, clientY);
  for (const zone of registeredSlotDropZones) {
    if (!zone.element.isConnected) continue;
    zone.element.classList.toggle('drag-over', zone.slotKey === hitKey);
  }
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('button, input, textarea, a, select, label'));
}

/**
 * Chrome does not paint its native drag preview for this panel (transform + backdrop-filter).
 * Follow the pointer with a real element instead.
 */
function setSpellDragImage(source: HTMLElement, event: DragEvent): void {
  const dataTransfer = event.dataTransfer;
  const canvas = source.querySelector('canvas');
  if (!dataTransfer || !(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return;

  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(rect.width));
  const cssH = Math.max(1, Math.round(rect.height));
  clearDragGhost();
  const ghost = document.createElement('canvas');
  ghost.width = cssW;
  ghost.height = cssH;
  ghost.style.position = 'fixed';
  ghost.style.zIndex = '100000';
  ghost.style.pointerEvents = 'none';
  ghost.style.width = `${cssW}px`;
  ghost.style.height = `${cssH}px`;
  const ctx = ghost.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, cssW, cssH);
  }
  document.body.appendChild(ghost);
  dragGhost = ghost;
  placeDragGhost(event.clientX, event.clientY);
  dragMoveHandler = (ev: DragEvent) => placeDragGhost(ev.clientX, ev.clientY);
  document.addEventListener('drag', dragMoveHandler);
  document.addEventListener('dragover', dragMoveHandler);
  const blank = document.createElement('canvas');
  blank.width = 1;
  blank.height = 1;
  dataTransfer.setDragImage(blank, 0, 0);
}

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
    // Chrome only treats the slot as a drop target when dragenter is canceled.
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
    }
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
    const raw = e.dataTransfer?.getData('text/plain') ?? '';
    const fromTransfer = raw ? parseSpellDragPayload(raw) : null;
    const payload = fromTransfer ?? activeSpellDrag;
    if (payload) {
      SpellInventoryManager.applySpellDrop(slotKey, payload);
      activeSpellDrag = null;
      clearDragGhost();
      return;
    }
    onFallbackDrop?.(e);
  });
}

export function attachVaultCardDrag(card: HTMLElement, spellId: string): void {
  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    const payload: SpellDragPayload = { source: 'VAULT', spellId };
    activeSpellDrag = payload;
    activeForgeDrag = null;
    e.dataTransfer?.setData('text/plain', serializeSpellDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    setSpellDragImage(card, e);
    card.classList.add('is-dragging');
  });
  card.addEventListener('dragend', () => {
    activeSpellDrag = null;
    clearDragGhost();
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
    const payload: SpellDragPayload = { source: 'DOCK', spellId, slotKey };
    activeSpellDrag = payload;
    activeForgeDrag = null;
    e.dataTransfer?.setData('text/plain', serializeSpellDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    setSpellDragImage(panel, e);
    panel.classList.add('is-dragging');
  });
  panel.addEventListener('dragend', () => {
    activeSpellDrag = null;
    clearDragGhost();
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
    const payload: SpellDragPayload = { source: 'HUD', spellId, slotKey };
    activeSpellDrag = payload;
    activeForgeDrag = null;
    e.dataTransfer?.setData('text/plain', serializeSpellDragPayload(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    setSpellDragImage(root, e);
    root.classList.add('is-dragging');
  });
  root.addEventListener('dragend', () => {
    activeSpellDrag = null;
    clearDragGhost();
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

export function readForgeCardDrag(event: DragEvent): ForgeCardDragPayload | null {
  const raw = event.dataTransfer?.getData('text/plain') ?? '';
  const fromTransfer = raw ? parseForgeCardDragPayload(raw) : null;
  const payload = fromTransfer ?? activeForgeDrag;
  activeForgeDrag = null;
  return payload;
}

export interface ForgeCardPointerDragOptions {
  cardIndex: number;
  canStartDrag: () => boolean;
  onDrop: (slotKey: ActionSlotKey, cardIndex: number) => void;
}

export function attachForgeCardPointerDrag(
  cardEl: HTMLElement,
  options: ForgeCardPointerDragOptions,
): void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let suppressNextClick = false;

  const finishDrag = (clientX: number, clientY: number): void => {
    if (!dragging) return;
    dragging = false;
    cardEl.classList.remove('is-dragging');
    clearDropZoneHighlights();
    clearDragGhost();

    const slotKey = hitTestRegisteredSlotDropZones(clientX, clientY);
    if (slotKey) {
      suppressNextClick = true;
      options.onDrop(slotKey, options.cardIndex);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pointerId === null || event.pointerId !== pointerId) return;

    if (!dragging) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (dx * dx + dy * dy < FORGE_POINTER_DRAG_THRESHOLD_PX * FORGE_POINTER_DRAG_THRESHOLD_PX) {
        return;
      }
      if (!options.canStartDrag()) {
        return;
      }
      dragging = true;
      cardEl.classList.add('is-dragging');
      createPointerDragGhost(cardEl, event.clientX, event.clientY);
    }

    placeDragGhost(event.clientX, event.clientY);
    updateDropZoneHighlight(event.clientX, event.clientY);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    finishDrag(event.clientX, event.clientY);
    if (cardEl.hasPointerCapture(event.pointerId)) {
      cardEl.releasePointerCapture(event.pointerId);
    }
    cardEl.removeEventListener('pointermove', onPointerMove);
    cardEl.removeEventListener('pointerup', onPointerUp);
    cardEl.removeEventListener('pointercancel', onPointerUp);
    pointerId = null;
  };

  cardEl.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (isInteractiveDragTarget(event.target)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
    cardEl.setPointerCapture(event.pointerId);
    cardEl.addEventListener('pointermove', onPointerMove);
    cardEl.addEventListener('pointerup', onPointerUp);
    cardEl.addEventListener('pointercancel', onPointerUp);
  });

  cardEl.addEventListener(
    'click',
    (event) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

export { LOADOUT_DROP_PRIORITY, HUD_DROP_PRIORITY };
