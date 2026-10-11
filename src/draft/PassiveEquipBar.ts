import type { PassiveModifierPayload, PassiveSlotLabel, PassiveSlotTuple } from '../types/cards';
import { PASSIVE_SLOT_COUNT } from '../types/cards';
import { PassiveInventoryManager } from '../game/PassiveInventory';
import {
  attachPassiveSlotDrag,
  attachPassiveSlotDrop,
  type PassiveEquipCallbacks,
} from './passiveDragDrop';

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

function summarizePassiveSlot(mods: PassiveModifierPayload[]): string {
  const parts = mods.map((mod) => summarizePassive(mod)).filter((line) => line !== 'Passive augment');
  if (parts.length === 0) return 'Passive augment';
  if (parts.length <= 2) return parts.join(', ');
  return `${mods.length} modifiers`;
}

function resolvePassiveIconData(
  mods: PassiveModifierPayload[],
  label: PassiveSlotLabel | null,
): string | undefined {
  const fromMods = mods.find((mod) => mod.iconData)?.iconData;
  if (fromMods) return fromMods;
  if (!label?.title) return undefined;
  const inventoryCard = PassiveInventoryManager.getAll().find((card) => card.title === label.title);
  return inventoryCard?.passivePayload?.find((entry) => entry.iconData)?.iconData;
}

function appendPassiveSlotClearButton(
  slot: HTMLElement,
  slotIndex: number,
  callbacks: PassiveEquipCallbacks,
): void {
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'passive-slot-clear-btn';
  clearBtn.setAttribute('aria-label', 'Unequip passive');
  clearBtn.textContent = '×';
  clearBtn.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  clearBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    callbacks.unequipPassive(slotIndex);
  });
  slot.appendChild(clearBtn);
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

  const barState = { passives: state.passives, labels: state.labels };

  for (let index = 0; index < PASSIVE_SLOT_COUNT; index++) {
    const slotMods = state.passives[index];
    const label = state.labels[index];

    const slot = document.createElement('div');
    slot.className = 'passive-slot drop-zone';
    slot.dataset.passiveIndex = String(index);

    const badge = document.createElement('span');
    badge.className = 'passive-slot-badge';
    badge.textContent = `P${index + 1}`;
    slot.appendChild(badge);

    if (slotMods && slotMods.length > 0) {
      slot.classList.add('passive-slot-filled');

      const iconData = resolvePassiveIconData(slotMods, label);
      if (iconData) {
        slot.classList.add('passive-slot-art');
        const bg = document.createElement('div');
        bg.className = 'passive-slot-art-bg';
        bg.style.backgroundImage = `url("${iconData}")`;
        slot.appendChild(bg);
      } else {
        const title = document.createElement('span');
        title.className = 'passive-slot-title';
        title.textContent = label?.title ?? summarizePassiveSlot(slotMods);
        slot.appendChild(title);

        const detail = document.createElement('span');
        detail.className = 'passive-slot-detail';
        detail.textContent = label?.tagline ?? summarizePassiveSlot(slotMods);
        slot.appendChild(detail);
      }

      appendPassiveSlotClearButton(slot, index, callbacks);
      attachPassiveSlotDrag(slot, index);

      slot.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        callbacks.unequipPassive(index);
      });
    }

    attachPassiveSlotDrop(slot, index, barState, callbacks);
    container.appendChild(slot);
  }
}
