import type { SpriteCache } from './SpriteCache';
import { Vector2D } from '../../math/Vector2D';

export interface CanvasRenderCtx {
  ringRotation: number;
  spriteCache: SpriteCache;
  cachedHexRadius: number;
  cachedHexCenterX: number;
  cachedHexCenterY: number;
  cachedHexVertices: Vector2D[];
}
