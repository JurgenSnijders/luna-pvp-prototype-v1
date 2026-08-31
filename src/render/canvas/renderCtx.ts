import { Vector2D } from '../../math/Vector2D';
import type { SpriteCache } from './SpriteCache';

export interface CanvasRenderCtx {
  ringRotation: number;
  spriteCache: SpriteCache;
  cachedHexRadius: number;
  cachedHexCenterX: number;
  cachedHexCenterY: number;
  cachedHexVertices: Vector2D[];
  bgCacheCanvas: HTMLCanvasElement | null;
  bgCacheKey: string;
}
