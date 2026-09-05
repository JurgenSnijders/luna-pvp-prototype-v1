import type { CardRarity } from '../types/cards';
import type { SpellArchetype } from '../types/schema';

export type SfxPriority = 1 | 2 | 3 | 4;

export const SFX_PRIORITY = {
  LOW: 1 as SfxPriority,
  MED: 2 as SfxPriority,
  HIGH: 3 as SfxPriority,
  CRITICAL: 4 as SfxPriority,
} as const;

export type SfxEvent =
  | {
      kind: 'IMPACT';
      x: number;
      y: number;
      speed: number;
      heavy: boolean;
      archetype?: SpellArchetype;
    }
  | {
      kind: 'GROUND_SLAM';
      x: number;
      y: number;
      vz: number;
      blastRadius: number;
      archetype?: SpellArchetype;
    }
  | {
      kind: 'BOUNCE';
      x: number;
      y: number;
      speed: number;
      index: number;
      archetype?: SpellArchetype;
    }
  | {
      kind: 'DEBRIS_CLINK';
      x: number;
      y: number;
      vz: number;
      radius: number;
      bounceIndex: number;
    }
  | {
      kind: 'CAST';
      x: number;
      y: number;
      speed: number;
      size: number;
      count: number;
      archetype?: SpellArchetype;
    }
  | {
      kind: 'LAUNCH_VERTICAL';
      x: number;
      y: number;
      vz: number;
    }
  | {
      kind: 'UI';
      action: 'EQUIP' | 'TAB' | 'SYNTH_DONE' | 'CARD_REVEAL';
      rarity?: CardRarity;
    }
  | {
      kind: 'LAVA_SURFACE';
      immersion: number;
    };

export interface SfxSink {
  emit(event: SfxEvent): void;
}

export const NULL_SFX: SfxSink = {
  emit() {
    // No-op for headless or disabled audio
  },
};
