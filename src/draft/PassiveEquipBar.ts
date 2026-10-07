import type { PassiveModifierPayload, PassiveSlotLabel, PassiveSlotTuple } from '../types/cards';
import { PASSIVE_SLOT_COUNT } from '../types/cards';
import { attachPassiveSlotDrop, type PassiveEquipCallbacks } from './passiveDragDrop';

function summarizePassive(mod: PassiveModifierPayload): string {
  if (mod.stat !== undefined && mod.op !== undefined && mod.value !== undefined) {
    return `${mod.stat} ${mod.op} ${mod.value}`;
  }
  const hookCount = mod.hooks?.length ?? 0;
  const spliceCount = mod.splices?.length ?? 0;
  const parts: string[] = [];
  if (hookCount > 0) parts.push(`${hookCount} hook${hookCount === 1 ? '' : 's'}`);
  if (spliceCount > 0) parts.push(`${spliceCount} splice${spliceCount === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'Passive augment';
}

export interface PassiveEquipBarState {
  passives: PassiveSlotTuple;
  labels: Array<PassiveSlotLabel | null>;
}

export function renderPassiveEquipBar(
  container: HTMLElement,
  state: PassiveEquipBarState,
  callbacks: PassiveEquipCallbacks,
): void {
  container.innerHTML = '';
  container.className = 'bottom-loadout-bay passive-equip-bay';

  for (let index = 0; index < PASSIVE_SLOT_COUNT; index++) {
    const mod = state.passives[index];
    const label = state.labels[index];

    const slot = document.createElement('div');
    slot.className = 'passive-slot drop-zone';
    slot.dataset.passiveIndex = String(index);

    const badge = document.createElement('span');
    badge.className = 'passive-slot-badge';
    badge.textContent = `P${index + 1}`;
    slot.appendChild(badge);

    if (mod) {
      slot.classList.add('passive-slot-filled');

      const title = document.createElement('span');
      title.className = 'passive-slot-title';
      title.textContent = label?.title ?? summarizePassive(mod);
      slot.appendChild(title);

      const detail = document.createElement('span');
      detail.className = 'passive-slot-detail';
      detail.textContent = label?.tagline ?? summarizePassive(mod);
      slot.appendChild(detail);

      slot.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        callbacks.unequipPassive(index);
      });
    }

    attachPassiveSlotDrop(slot, index, callbacks);
    container.appendChild(slot);
  }
}
