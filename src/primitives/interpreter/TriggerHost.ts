import type { Vector2D } from '../../math/Vector2D';
import type { SpellArchetype, TriggerNode, VisualDescriptor } from '../../types/schema';

export interface TriggerHost {
  id: string;
  pos: Vector2D;
  isDead: boolean;
  depth: number;
  visuals: VisualDescriptor | null;
  spellArchetype?: SpellArchetype;
  tickAccumulatorsMs: Map<number, number>;
  getTriggers(trigger: string): TriggerNode[];
}
