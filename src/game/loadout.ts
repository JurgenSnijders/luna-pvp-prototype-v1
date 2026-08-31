import { compileAbilityPayload } from '../ai/Synthesizer';
import { balanceAbilitySchema, sanitizeAbilitySchema } from '../ai/BudgetEngine';
import { PRESETS } from '../devtools/Presets';
import { Player } from '../entities/Player';
import { ACTION_SLOT_INDEX, type DraftSelection } from '../types/cards';
import type { AbilitySchema } from '../types/schema';
import type { GameApp } from './GameApp';

// Phase 2 lazy compilation: per-slot generation counter (module-level, not per-target — the
// bot draft path always carries a full abilityPayload today, so it never reaches the async
// branch below). A newer equip on the same slot bumps this, so a slower in-flight compile
// that resolves later is detected as stale and discarded instead of clobbering the new pick.
const compileGen: number[] = [0, 0, 0, 0, 0];
// Applied instead of the ability's real cooldown right after a lazy compile resolves, so the
// slot has a brief, deliberate "arming" beat rather than snapping instantly to ready.
const COMPILE_READY_DELAY_MS = 500;

export function assignDefaultLoadout(target: Player): void {
  target.setAbility(0, structuredClone(PRESETS['Kinetic Railgun']));
  target.setAbility(1, structuredClone(PRESETS['Graviton Boomerang']));
  target.setAbility(2, structuredClone(PRESETS['Cryo Ice Trail']));
  target.setAbility(3, structuredClone(PRESETS['Singularity Scatter']));
  target.setAbility(4, structuredClone(PRESETS['Phase Nova']));
}

export function applyDraftSelection(app: GameApp, target: Player, selection: DraftSelection): void {
  const { card, slot } = selection;

  if (slot === 'PASSIVE' && card.passivePayload) {
    for (const mod of card.passivePayload) {
      target.applyPassiveModifier(mod);
    }
    return;
  }

  if (card.type !== 'ACTIVE_ABILITY') return;

  const slotIndex = ACTION_SLOT_INDEX[slot as keyof typeof ACTION_SLOT_INDEX];
  if (slotIndex === undefined) return;
  const category = card.category ?? 'SECONDARY';

  if (card.abilityPayload) {
    const ability = sanitizeAbilitySchema(structuredClone(card.abilityPayload), category);
    target.setAbility(slotIndex, ability);
    if (target === app.player) {
      app.spellLibrary.addSpell(ability);
    }
    return;
  }

  // Token-diet metadata card (no abilityPayload yet): mark the slot compiling, close the
  // modal instantly (already done by DraftModal.equip), and synthesize the physics schema
  // in the background so the player can keep moving/casting other slots meanwhile.
  target.setSlotCompiling(slotIndex, true);
  const gen = ++compileGen[slotIndex];
  const baseAbility = target.getAbility(slotIndex) ?? undefined;

  const resolveCompiled = (schema: AbilitySchema): void => {
    if (compileGen[slotIndex] !== gen) return; // superseded by a newer equip on this slot
    const ability = balanceAbilitySchema(sanitizeAbilitySchema(schema, category), category);
    target.setAbility(slotIndex, ability);
    target.setSlotCompiling(slotIndex, false);
    target.cooldownTimersMs[slotIndex] = COMPILE_READY_DELAY_MS;
    target.slotCooldownTotalsMs[slotIndex] = COMPILE_READY_DELAY_MS;
    if (target === app.player) {
      app.spellLibrary.addSpell(ability);
    }
  };

  compileAbilityPayload(card, baseAbility)
    .then(resolveCompiled)
    .catch(() => {
      // compileAbilityPayload already falls back internally and should never reject — this
      // only guards against the compiling flag getting stuck if it somehow does.
      if (compileGen[slotIndex] !== gen) return;
      resolveCompiled(sanitizeAbilitySchema(structuredClone(baseAbility ?? {}), category));
    });
}
