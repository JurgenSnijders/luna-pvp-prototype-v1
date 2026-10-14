import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Camera2D } from '../../camera/Camera2D';
import { isGlPainter, type Painter2D } from '../painter/Painter2D';

let fallbackCanvas: HTMLCanvasElement | null = null;
let fallbackCtx: CanvasRenderingContext2D | null = null;
let cacheKey = '';

function zoomBucket(zoom: number): number {
  return Math.round(zoom * 20) / 20;
}

function ensureFallbackCanvas(width: number, height: number): CanvasRenderingContext2D {
  if (!fallbackCanvas) {
    fallbackCanvas = document.createElement('canvas');
    fallbackCtx = fallbackCanvas.getContext('2d');
  }
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (fallbackCanvas!.width !== w || fallbackCanvas!.height !== h) {
    fallbackCanvas!.width = w;
    fallbackCanvas!.height = h;
  }
  return fallbackCtx!;
}

const LAVA_STOPS: [number, string][] = [
  [0, 'rgba(210, 50, 0, 1.0)'],
  [0.45, 'rgba(130, 20, 0, 1.0)'],
  [1, 'rgba(40, 5, 0, 1.0)'],
];

/** Cached Canvas2D fallback when WebGL background is unavailable. */
export function drawLavaSeaFallback(
  ctx: Painter2D,
  world: PhysicsWorld,
  camera: Camera2D,
): void {
  const rect = camera.getVisibleWorldRect();
  if (isGlPainter(ctx)) {
    // GL paints the gradient directly instead of sampling a screen-sized canvas.
    const gradRadius = Math.hypot(rect.width, rect.height) * 0.55;
    const cx = rect.minX + rect.width * 0.5;
    const cy = rect.minY + rect.height * 0.5;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, gradRadius);
    for (const [offset, color] of LAVA_STOPS) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.fillRect(rect.minX, rect.minY, rect.width, rect.height);
    return;
  }
  const { hexCenter: center } = world;
  const key = [
    zoomBucket(camera.zoom),
    Math.round(center.x),
    Math.round(center.y),
    Math.round(rect.width),
    Math.round(rect.height),
  ].join('|');

  if (key !== cacheKey) {
    cacheKey = key;
    const bctx = ensureFallbackCanvas(rect.width, rect.height);
    const gradRadius = Math.hypot(rect.width, rect.height) * 0.55;
    const gradient = bctx.createRadialGradient(
      rect.width * 0.5,
      rect.height * 0.5,
      0,
      rect.width * 0.5,
      rect.height * 0.5,
      gradRadius,
    );
    for (const [offset, color] of LAVA_STOPS) gradient.addColorStop(offset, color);
    bctx.fillStyle = gradient;
    bctx.fillRect(0, 0, rect.width, rect.height);
  }

  ctx.drawImage(fallbackCanvas!, rect.minX, rect.minY, rect.width, rect.height);
}
