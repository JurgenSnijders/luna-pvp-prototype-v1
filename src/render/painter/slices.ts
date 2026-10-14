import type { GlWorldSlice } from '../../devtools/graphicsSettings';

/** World draw modules in CanvasRenderer draw order (bottom to top). */
export const WORLD_MODULES = [
  'background',
  'hexPlatform',
  'decals',
  'debris',
  'terrainPatches',
  'zones',
  'obstacles',
  'combatants',
  'summons',
  'constraints',
  'projectiles',
  'aiming',
  'overheadHud',
  'floatingText',
  'debugOverlay',
  'verticalTelemetry',
] as const;

export type WorldModuleId = (typeof WORLD_MODULES)[number];

export type ModuleRoute = 'gl' | 'canvas';

/**
 * Number of modules (a bottom prefix of `WORLD_MODULES`) the GL painter owns
 * per slice. A prefix keeps depth order intact: everything the Canvas2D
 * remainder draws sits above everything GL draws.
 */
const SLICE_PREFIX: Record<GlWorldSlice, number> = {
  off: 0,
  floor: WORLD_MODULES.indexOf('debris') + 1,
  bodies: WORLD_MODULES.indexOf('constraints') + 1,
  projectiles: WORLD_MODULES.indexOf('aiming') + 1,
  all: WORLD_MODULES.indexOf('aiming') + 1,
};

export function routeModule(slice: GlWorldSlice, id: WorldModuleId): ModuleRoute {
  return WORLD_MODULES.indexOf(id) < SLICE_PREFIX[slice] ? 'gl' : 'canvas';
}

/**
 * What the Canvas2D remainder is composited as. Up to `projectiles` it holds
 * world content and is lit with the GL world. At `all` only HUD, text and
 * debug remain, so it becomes an unlit overlay placed before CRT.
 */
export function canvasRemainderRole(slice: GlWorldSlice): 'lit' | 'overlay' {
  return slice === 'all' ? 'overlay' : 'lit';
}
