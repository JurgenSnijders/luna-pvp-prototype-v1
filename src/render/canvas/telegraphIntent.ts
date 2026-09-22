import { isAlliedTo } from '../../engine/allegiance';
import type { Entity } from '../../entities/Entity';
import type { SpatialZone } from '../../entities/SpatialZone';

export type TelegraphIntent = 'HOSTILE' | 'FRIENDLY' | 'NEUTRAL';

let intentOverride: TelegraphIntent | null = null;

const isDev = Boolean(
  (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV,
);

if (isDev && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__lunaTelegraphIntent = (
    v: TelegraphIntent | null,
  ) => {
    intentOverride = v;
  };
}

function withOverride(intent: TelegraphIntent): TelegraphIntent {
  return intentOverride ?? intent;
}

export function resolveZoneIntent(
  zone: SpatialZone,
  localEntity: Entity | null,
): TelegraphIntent {
  if (!localEntity) return withOverride('NEUTRAL');

  const allied = isAlliedTo(zone.ownerId, localEntity);
  const isOwner = localEntity.id === zone.ownerId;

  switch (zone.affects) {
    case 'CASTER_ONLY':
      return withOverride('NEUTRAL');
    case 'ALLIES':
      return withOverride(allied && !isOwner ? 'FRIENDLY' : 'NEUTRAL');
    case 'ALL':
      return withOverride('NEUTRAL');
    case 'ENEMIES':
    default:
      return withOverride(allied ? 'NEUTRAL' : 'HOSTILE');
  }
}

export function resolveParryIntent(
  overlay: { casterId: string },
  localEntity: Entity | null,
): TelegraphIntent {
  if (!localEntity) return withOverride('NEUTRAL');
  if (localEntity.id === overlay.casterId) return withOverride('FRIENDLY');
  if (isAlliedTo(overlay.casterId, localEntity)) return withOverride('FRIENDLY');
  return withOverride('NEUTRAL');
}
