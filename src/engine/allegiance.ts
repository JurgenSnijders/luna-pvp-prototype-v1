import type { Entity } from '../entities/Entity';

function summonOwnerId(entity: Entity): string | undefined {
  if (!entity.tags.has('summon')) return undefined;
  const ownerId = (entity as { ownerId?: unknown }).ownerId;
  return typeof ownerId === 'string' ? ownerId : undefined;
}

/** True when `target` is the source itself or a summon owned by that source. */
export function isAlliedTo(sourceEntityId: string, target: Entity): boolean {
  if (target.id === sourceEntityId) return true;
  return summonOwnerId(target) === sourceEntityId;
}

/** True when one entity is a summon and the other is its owner. */
export function isOwnerSummonPair(a: Entity, b: Entity): boolean {
  const aOwner = summonOwnerId(a);
  const bOwner = summonOwnerId(b);
  if (aOwner && aOwner === b.id) return true;
  if (bOwner && bOwner === a.id) return true;
  return false;
}
