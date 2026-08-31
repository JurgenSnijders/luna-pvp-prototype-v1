import { Vector2D } from '../../math/Vector2D';
import type { ActionPayload, TriggerNode, VisualDescriptor } from '../../types/schema';
import { FALLBACK_DIR } from './constants';

export function getActionPriority(type: ActionPayload['type']): number {
  if (type === 'ADD_INSTABILITY' || type === 'MODIFY_STAT' || type === 'APPLY_STASIS') return 1;
  if (type === 'SPAWN_CONSTRAINT' || type === 'MUTATE_TERRAIN' || type === 'SPAWN_OBSTACLE') return 2;
  if (type === 'APPLY_IMPULSE') return 3;
  return 4;
}

export function safeNormalize(v: Vector2D, fallback: Vector2D = FALLBACK_DIR): Vector2D {
  return v.magSq() > 0 ? v.normalize() : fallback;
}

export function buildTriggerMap(triggers: TriggerNode[]): Map<string, TriggerNode[]> {
  const map = new Map<string, TriggerNode[]>();
  for (const node of triggers) {
    const existing = map.get(node.trigger) ?? [];
    existing.push(node);
    map.set(node.trigger, existing);
  }
  return map;
}

export function trailColor(visuals: VisualDescriptor | null | undefined): string | null {
  if (!visuals || visuals.trailType === 'NONE') return null;
  switch (visuals.trailType) {
    case 'SMOKE':
      return visuals.vfx?.secondaryColor ?? '#8899aa';
    case 'ICE_GLOW':
    case 'FROST_CRYSTALS':
      return visuals.vfx?.secondaryColor ?? '#88ddff';
    case 'MAGMA_SPARKS':
    case 'EMBER_SPIRAL':
      return visuals.vfx?.secondaryColor ?? '#ff6622';
    case 'NEON_RIBBON':
    case 'VOID_TENDRIL':
    case 'PLASMA_ARC':
    case 'DUST_PUFF':
      return visuals.color;
    default:
      return visuals.color;
  }
}

export function secondaryColor(visuals: VisualDescriptor | null | undefined, fallback: string): string {
  return visuals?.vfx?.secondaryColor ?? visuals?.color ?? fallback;
}
