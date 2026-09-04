export type ViewportProfile = 'normal' | 'compact' | 'tiny';

const COMPACT_WIDTH = 1100;
const COMPACT_HEIGHT = 720;
const TINY_WIDTH = 800;
const TINY_HEIGHT = 600;

export function getViewportProfile(
  width = typeof window !== 'undefined' ? window.innerWidth : 1920,
  height = typeof window !== 'undefined' ? window.innerHeight : 1080,
): ViewportProfile {
  if (width < TINY_WIDTH || height < TINY_HEIGHT) return 'tiny';
  if (width < COMPACT_WIDTH || height < COMPACT_HEIGHT) return 'compact';
  return 'normal';
}

export function getUiScale(profile = getViewportProfile()): number {
  switch (profile) {
    case 'tiny':
      return 0.68;
    case 'compact':
      return 0.82;
    default:
      return 1;
  }
}

export function isCompactViewport(
  width = typeof window !== 'undefined' ? window.innerWidth : 1920,
  height = typeof window !== 'undefined' ? window.innerHeight : 1080,
): boolean {
  return getViewportProfile(width, height) !== 'normal';
}

export interface SafeViewInsets {
  top: number;
  bottom: number;
  right: number;
}

export function getSafeViewInsets(
  profile = getViewportProfile(),
  inspectorExpanded = false,
): SafeViewInsets {
  const scale = getUiScale(profile);
  const slotSize = Math.round(80 * scale);
  const actionBarHeight = slotSize + 40;
  const top = profile === 'normal' ? 72 : Math.round(56 * scale);
  const bottom = actionBarHeight + (profile === 'normal' ? 12 : 8);
  const right = inspectorExpanded && profile !== 'normal' ? 200 : 0;
  return { top, bottom, right };
}

export function applyViewportLayout(cheapUi: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const profile = getViewportProfile();
  const scale = getUiScale(profile);
  const slotSize = Math.round(80 * scale);
  const gap = Math.round(12 * scale);
  const actionBarHeight = slotSize + 40;

  root.style.setProperty('--ui-scale', String(scale));
  root.style.setProperty('--action-bar-slot-size', `${slotSize}px`);
  root.style.setProperty('--action-bar-gap', `${gap}px`);
  root.style.setProperty('--action-bar-height', `${actionBarHeight}px`);
  root.style.setProperty('--match-countdown-size', `${Math.round(72 * scale)}px`);
  root.dataset.viewportProfile = profile;

  if (cheapUi) {
    root.dataset.cheapUi = '1';
  } else {
    delete root.dataset.cheapUi;
  }
}
