import { getOuterWallRadius } from '../math/HexMath';
import type { Camera2D } from './Camera2D';
import { isCompactViewport, type SafeViewInsets } from '../ui/viewportLayout';

const FIT_ZOOM_EPSILON = 0.02;
const FIT_PADDING = 1.08;
const SQRT3 = Math.sqrt(3);

let lastFitZoom: number | null = null;
let userZoomOverride = false;

export function markUserZoomOverride(): void {
  userZoomOverride = true;
}

export function clearUserZoomOverride(): void {
  userZoomOverride = false;
  lastFitZoom = null;
}

export function hasUserZoomOverride(): boolean {
  return userZoomOverride;
}

export function getLastFitZoom(): number | null {
  return lastFitZoom;
}

export function computeArenaFitZoom(
  viewportWidth: number,
  viewportHeight: number,
  hexRadius: number,
  minZoom: number,
  maxZoom: number,
  insets: SafeViewInsets = { top: 0, bottom: 0, right: 0 },
): number {
  const wallR = getOuterWallRadius(hexRadius);
  const worldW = wallR * 2;
  const worldH = wallR * SQRT3;
  const safeW = Math.max(1, viewportWidth - insets.right);
  const safeH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const raw = Math.min(safeW / (worldW * FIT_PADDING), safeH / (worldH * FIT_PADDING));
  return Math.max(minZoom, Math.min(maxZoom, raw));
}

export function fitArenaToSafeView(
  camera: Camera2D,
  hexRadius: number,
  insets: SafeViewInsets,
  opts?: { force?: boolean },
): void {
  const compact = isCompactViewport(camera.viewportWidth, camera.viewportHeight);
  if (!compact && !opts?.force) return;
  if (userZoomOverride && !opts?.force) return;

  if (
    !opts?.force &&
    lastFitZoom !== null &&
    Math.abs(camera.targetZoom - lastFitZoom) > FIT_ZOOM_EPSILON
  ) {
    return;
  }

  const zoom = computeArenaFitZoom(
    camera.viewportWidth,
    camera.viewportHeight,
    hexRadius,
    camera.getMinZoom(),
    camera.getMaxZoom(),
    insets,
  );
  camera.setZoom(zoom);
  lastFitZoom = zoom;
}
