import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Camera2D } from '../../camera/Camera2D';

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

/** Cached Canvas2D fallback when WebGL background is unavailable. */
export function drawLavaSeaFallback(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  camera: Camera2D,
): void {
  const rect = camera.getVisibleWorldRect();
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
    gradient.addColorStop(0, 'rgba(210, 50, 0, 1.0)');
    gradient.addColorStop(0.45, 'rgba(130, 20, 0, 1.0)');
    gradient.addColorStop(1, 'rgba(40, 5, 0, 1.0)');
    bctx.fillStyle = gradient;
    bctx.fillRect(0, 0, rect.width, rect.height);
  }

  ctx.drawImage(fallbackCanvas!, rect.minX, rect.minY, rect.width, rect.height);
}
