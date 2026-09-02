import { RETRO_COLORS } from '../../ui/tokens';

export interface FloatingLayout {
  x: number;
  y: number;
  w: number;
  h: number | null;
}

export interface ResolvedPanelLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloatingPanelController {
  setCollapsed(collapsed: boolean): void;
  consumeDragClick(): boolean;
  getLayout(): ResolvedPanelLayout;
  setLayout(partial: Partial<ResolvedPanelLayout>): void;
  resetLayout(): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const DEFAULT_WIDTH = 320;
export const MIN_PANEL_WIDTH = 240;
export const MIN_PANEL_HEIGHT = 160;
const MIN_WIDTH = MIN_PANEL_WIDTH;
const MIN_HEIGHT = MIN_PANEL_HEIGHT;
const MARGIN = 12;
const DRAG_THRESHOLD_PX = 4;
const EDGE = 6;
const CORNER = 12;

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RESIZE_CURSORS: Record<ResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseLayout(raw: string | null): FloatingLayout | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FloatingLayout>;
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.w !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y) ||
      !Number.isFinite(parsed.w)
    ) {
      return null;
    }
    const h =
      parsed.h === null || parsed.h === undefined
        ? null
        : typeof parsed.h === 'number' && Number.isFinite(parsed.h)
          ? parsed.h
          : null;
    return { x: parsed.x, y: parsed.y, w: parsed.w, h };
  } catch {
    return null;
  }
}

function defaultLayout(): FloatingLayout {
  return {
    x: Math.max(MARGIN, window.innerWidth - DEFAULT_WIDTH - MARGIN),
    y: MARGIN,
    w: DEFAULT_WIDTH,
    h: null,
  };
}

function clampLayout(layout: FloatingLayout, collapsed: boolean): FloatingLayout {
  const maxW = Math.max(MIN_WIDTH, window.innerWidth - MARGIN);
  const maxH = Math.max(MIN_HEIGHT, window.innerHeight - MARGIN);
  const w = clamp(layout.w, MIN_WIDTH, maxW);
  const h =
    layout.h === null || collapsed ? layout.h : clamp(layout.h, MIN_HEIGHT, maxH);
  const widthForClamp = collapsed ? Math.min(w, 200) : w;
  const heightForClamp = collapsed ? 40 : (h ?? MIN_HEIGHT);
  const x = clamp(layout.x, 0, Math.max(0, window.innerWidth - widthForClamp));
  const y = clamp(layout.y, 0, Math.max(0, window.innerHeight - heightForClamp));
  return { x, y, w, h };
}

export function attachFloatingPanel(opts: {
  panel: HTMLElement;
  dragHandle: HTMLElement;
  isDragIgnored: (target: EventTarget | null) => boolean;
  storageKey: string;
  collapsed?: boolean;
}): FloatingPanelController {
  const panel = opts.panel;
  let collapsed = opts.collapsed ?? false;
  const stored = parseLayout(localStorage.getItem(opts.storageKey));
  let placed = stored !== null;
  let layout = clampLayout(stored ?? defaultLayout(), false);
  let dragClickPending = false;
  let activePointerId: number | null = null;
  const listeners = new Set<() => void>();
  let notifying = false;

  const handles = new Map<ResizeEdge, HTMLElement>();
  const grip = document.createElement('div');

  function notify(): void {
    if (notifying) return;
    notifying = true;
    try {
      for (const listener of listeners) listener();
    } finally {
      notifying = false;
    }
  }

  function persist(): void {
    localStorage.setItem(opts.storageKey, JSON.stringify(layout));
  }

  function apply(): void {
    const next = clampLayout(layout, collapsed);
    layout = next;
    panel.style.top = `${next.y}px`;
    panel.style.bottom = 'auto';
    panel.style.margin = '0';
    if (placed) {
      panel.style.left = `${next.x}px`;
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = `${MARGIN}px`;
    }

    if (collapsed) {
      panel.style.width = 'auto';
      panel.style.height = 'auto';
      panel.style.maxHeight = 'none';
      panel.style.overflow = 'visible';
    } else {
      panel.style.width = `${next.w}px`;
      if (next.h === null) {
        panel.style.height = 'auto';
        panel.style.maxHeight = `${window.innerHeight - MARGIN}px`;
      } else {
        panel.style.height = `${next.h}px`;
        panel.style.maxHeight = 'none';
      }
      panel.style.overflow = 'hidden';
    }

    const showHandles = !collapsed;
    for (const handle of handles.values()) {
      handle.style.display = showHandles ? 'block' : 'none';
    }
    grip.style.display = showHandles ? 'block' : 'none';
    notify();
  }

  function syncLayoutFromDom(preserveAutoHeight: boolean): void {
    const rect = panel.getBoundingClientRect();
    layout = {
      x: rect.left,
      y: rect.top,
      w: collapsed ? layout.w : rect.width,
      h: collapsed || preserveAutoHeight ? layout.h : rect.height,
    };
  }

  function stopGameAim(e: Event): void {
    e.stopPropagation();
  }

  function suppressGameMouse(active: boolean): void {
    if (active) {
      window.addEventListener('mousemove', stopGameAim, true);
    } else {
      window.removeEventListener('mousemove', stopGameAim, true);
    }
  }

  function endPointer(): void {
    activePointerId = null;
    suppressGameMouse(false);
    opts.dragHandle.style.cursor = 'grab';
  }

  function onHeaderPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (opts.isDragIgnored(e.target)) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = panel.getBoundingClientRect().left;
    const startTop = panel.getBoundingClientRect().top;
    let dragging = false;
    e.stopPropagation();
    activePointerId = e.pointerId;
    opts.dragHandle.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== activePointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      dragging = true;
      dragClickPending = true;
      placed = true;
      opts.dragHandle.style.cursor = 'grabbing';
      suppressGameMouse(true);
      stopGameAim(ev);
      ev.preventDefault();

      const width = panel.getBoundingClientRect().width;
      const height = panel.getBoundingClientRect().height;
      layout.x = clamp(startLeft + dx, 0, Math.max(0, window.innerWidth - width));
      layout.y = clamp(startTop + dy, 0, Math.max(0, window.innerHeight - height));
      apply();
    };

    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== activePointerId) return;
      if (opts.dragHandle.hasPointerCapture(ev.pointerId)) {
        opts.dragHandle.releasePointerCapture(ev.pointerId);
      }
      opts.dragHandle.removeEventListener('pointermove', onMove);
      opts.dragHandle.removeEventListener('pointerup', onUp);
      opts.dragHandle.removeEventListener('pointercancel', onUp);
      if (dragging) {
        syncLayoutFromDom(layout.h === null);
        persist();
        stopGameAim(ev);
      }
      endPointer();
    };

    opts.dragHandle.addEventListener('pointermove', onMove);
    opts.dragHandle.addEventListener('pointerup', onUp);
    opts.dragHandle.addEventListener('pointercancel', onUp);
  }

  function onResizePointerDown(edge: ResizeEdge, e: PointerEvent): void {
    if (e.button !== 0 || collapsed) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const start = panel.getBoundingClientRect();
    activePointerId = e.pointerId;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    suppressGameMouse(true);

    const onMove = (ev: PointerEvent): void => {
      if (ev.pointerId !== activePointerId) return;
      stopGameAim(ev);
      ev.preventDefault();

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let left = start.left;
      let top = start.top;
      let width = start.width;
      let height = start.height;

      if (edge.includes('e')) width = start.width + dx;
      if (edge.includes('s')) height = start.height + dy;
      if (edge.includes('w')) {
        width = start.width - dx;
        left = start.left + dx;
      }
      if (edge.includes('n')) {
        height = start.height - dy;
        top = start.top + dy;
      }

      if (width < MIN_WIDTH) {
        if (edge.includes('w')) left = start.right - MIN_WIDTH;
        width = MIN_WIDTH;
      }
      if (height < MIN_HEIGHT) {
        if (edge.includes('n')) top = start.bottom - MIN_HEIGHT;
        height = MIN_HEIGHT;
      }

      width = Math.min(width, window.innerWidth);
      height = Math.min(height, window.innerHeight);
      left = clamp(left, 0, Math.max(0, window.innerWidth - width));
      top = clamp(top, 0, Math.max(0, window.innerHeight - height));

      layout = { x: left, y: top, w: width, h: height };
      placed = true;
      apply();
    };

    const onUp = (ev: PointerEvent): void => {
      if (ev.pointerId !== activePointerId) return;
      if (handle.hasPointerCapture(ev.pointerId)) {
        handle.releasePointerCapture(ev.pointerId);
      }
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      syncLayoutFromDom(false);
      persist();
      endPointer();
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  function mountHandles(): void {
    const specs: Array<{ edge: ResizeEdge; css: string }> = [
      { edge: 'n', css: `top:0;left:${CORNER}px;right:${CORNER}px;height:${EDGE}px;` },
      { edge: 's', css: `bottom:0;left:${CORNER}px;right:${CORNER}px;height:${EDGE}px;` },
      { edge: 'e', css: `top:${CORNER}px;right:0;bottom:${CORNER}px;width:${EDGE}px;` },
      { edge: 'w', css: `top:${CORNER}px;left:0;bottom:${CORNER}px;width:${EDGE}px;` },
      { edge: 'ne', css: `top:0;right:0;width:${CORNER}px;height:${CORNER}px;` },
      { edge: 'nw', css: `top:0;left:0;width:${CORNER}px;height:${CORNER}px;` },
      { edge: 'se', css: `bottom:0;right:0;width:${CORNER}px;height:${CORNER}px;` },
      { edge: 'sw', css: `bottom:0;left:0;width:${CORNER}px;height:${CORNER}px;` },
    ];

    for (const spec of specs) {
      const el = document.createElement('div');
      el.className = `inspector-resize inspector-resize-${spec.edge}`;
      el.style.cssText = `
        position:absolute;${spec.css}z-index:3;
        cursor:${RESIZE_CURSORS[spec.edge]};
        touch-action:none;user-select:none;
      `;
      el.addEventListener('pointerdown', (e) => onResizePointerDown(spec.edge, e));
      panel.appendChild(el);
      handles.set(spec.edge, el);
    }

    grip.style.cssText = `
      position:absolute;right:4px;bottom:4px;width:8px;height:8px;z-index:2;
      pointer-events:none;
      border-right:2px solid ${RETRO_COLORS.neonCyan};
      border-bottom:2px solid ${RETRO_COLORS.neonCyan};
      opacity:0.55;
    `;
    panel.appendChild(grip);
  }

  function onWindowResize(): void {
    apply();
  }

  function getResolvedLayout(): ResolvedPanelLayout {
    const rect = panel.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(collapsed ? layout.w : rect.width),
      h: Math.round(
        collapsed ? (layout.h ?? Math.max(MIN_HEIGHT, rect.height)) : rect.height,
      ),
    };
  }

  opts.dragHandle.style.cursor = 'grab';
  opts.dragHandle.style.touchAction = 'none';
  opts.dragHandle.addEventListener('pointerdown', onHeaderPointerDown);
  window.addEventListener('resize', onWindowResize);
  mountHandles();
  apply();

  return {
    setCollapsed(next: boolean): void {
      collapsed = next;
      apply();
    },
    consumeDragClick(): boolean {
      const pending = dragClickPending;
      dragClickPending = false;
      return pending;
    },
    getLayout(): ResolvedPanelLayout {
      return getResolvedLayout();
    },
    setLayout(partial: Partial<ResolvedPanelLayout>): void {
      const current = getResolvedLayout();
      const next = { ...current, ...partial };
      placed = true;
      layout = { x: next.x, y: next.y, w: next.w, h: next.h };
      apply();
      persist();
    },
    resetLayout(): void {
      placed = false;
      layout = defaultLayout();
      localStorage.removeItem(opts.storageKey);
      apply();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose(): void {
      window.removeEventListener('resize', onWindowResize);
      opts.dragHandle.removeEventListener('pointerdown', onHeaderPointerDown);
      listeners.clear();
    },
  };
}
