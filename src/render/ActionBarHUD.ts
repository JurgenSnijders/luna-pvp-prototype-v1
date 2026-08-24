import type { Player } from '../entities/Player';
import { ACTION_SLOT_KEYS } from '../types/cards';
import { validateAbilitySchema } from '../types/schema';
import type { AbilitySchema } from '../types/schema';

export interface ActionBarHUDCallbacks {
  onSlotAssign: (slotIndex: number, schema: AbilitySchema) => void;
  onEmptySlotClick: (slotIndex: number) => void;
}

interface SlotElements {
  root: HTMLElement;
  badge: HTMLElement;
  label: HTMLElement;
  cooldownOverlay: HTMLElement;
  countdown: HTMLElement;
}

export class ActionBarHUD {
  private root: HTMLElement;
  private slots: SlotElements[] = [];

  constructor(private callbacks: ActionBarHUDCallbacks) {
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      z-index: 9500; display: flex; gap: 12px; pointer-events: auto;
      font-family: system-ui, sans-serif;
    `;

    for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
      const key = ACTION_SLOT_KEYS[i];
      const slotEl = this.createSlot(i, key);
      this.slots.push(slotEl);
      this.root.appendChild(slotEl.root);
    }

    document.body.appendChild(this.root);
  }

  private createSlot(slotIndex: number, key: string): SlotElements {
    const root = document.createElement('div');
    root.style.cssText = `
      width: 64px; height: 64px; position: relative; overflow: hidden;
      backdrop-filter: blur(8px); background: rgba(18, 18, 30, 0.85);
      border: 1px dashed rgba(0, 229, 255, 0.25); border-radius: 8px;
      cursor: pointer; transition: border-color 0.15s ease, box-shadow 0.15s ease;
    `;

    const badge = document.createElement('div');
    badge.textContent = key;
    badge.style.cssText = `
      position: absolute; top: 4px; left: 4px;
      font-size: 10px; font-weight: 700; color: #00e5ff;
      background: rgba(0, 229, 255, 0.12); padding: 1px 5px; border-radius: 4px;
    `;

    const label = document.createElement('div');
    label.textContent = '+ Assign';
    label.style.cssText = `
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      padding: 14px 4px 4px; font-size: 9px; color: #666; text-align: center;
      line-height: 1.2; word-break: break-word;
    `;

    const cooldownOverlay = document.createElement('div');
    cooldownOverlay.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 0%;
      background: rgba(0, 0, 0, 0.7); pointer-events: none;
      transition: height 0.05s linear;
    `;

    const countdown = document.createElement('div');
    countdown.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700; color: #fff; text-shadow: 0 0 8px rgba(0,0,0,0.8);
      pointer-events: none;
    `;

    root.appendChild(badge);
    root.appendChild(label);
    root.appendChild(cooldownOverlay);
    root.appendChild(countdown);

    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      root.style.borderColor = 'rgba(0, 229, 255, 0.8)';
      root.style.boxShadow = '0 0 12px rgba(0, 229, 255, 0.4)';
    });

    root.addEventListener('dragleave', () => {
      root.style.borderColor = '';
      root.style.boxShadow = '';
    });

    root.addEventListener('drop', (e) => {
      e.preventDefault();
      root.style.borderColor = '';
      root.style.boxShadow = '';
      const raw = e.dataTransfer?.getData('application/json');
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const schema = validateAbilitySchema(parsed);
        if (schema) this.callbacks.onSlotAssign(slotIndex, schema);
      } catch {
        // ignore invalid drop payload
      }
    });

    root.addEventListener('click', () => {
      const ability = root.dataset.hasAbility === 'true';
      if (!ability) this.callbacks.onEmptySlotClick(slotIndex);
    });

    return { root, badge, label, cooldownOverlay, countdown };
  }

  update(player: Player): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const ability = player.getAbility(i);
      const ratio = player.getSlotCooldownRatio(i);
      const remaining = player.getSlotCooldownRemainingMs(i);
      const ready = player.isSlotReady(i);

      if (ability) {
        slot.root.dataset.hasAbility = 'true';
        slot.label.textContent = ability.name.length > 10
          ? `${ability.name.slice(0, 9)}…`
          : ability.name;
        slot.label.style.color = '#ccc';
        slot.label.style.fontSize = '9px';
        slot.root.style.borderStyle = 'solid';
      } else {
        slot.root.dataset.hasAbility = 'false';
        slot.label.textContent = '+ Assign';
        slot.label.style.color = '#666';
        slot.root.style.borderStyle = 'dashed';
      }

      slot.cooldownOverlay.style.height = `${ratio * 100}%`;

      if (remaining > 0) {
        slot.countdown.style.display = 'flex';
        slot.countdown.textContent = remaining >= 1000
          ? `${(remaining / 1000).toFixed(1)}s`
          : `${Math.ceil(remaining)}ms`;
      } else {
        slot.countdown.style.display = 'none';
      }

      if (ready && ability) {
        slot.root.style.borderColor = 'rgba(0, 229, 255, 0.7)';
        slot.root.style.boxShadow = '0 0 10px rgba(0, 229, 255, 0.35)';
      } else if (!slot.root.matches(':hover')) {
        slot.root.style.borderColor = ability
          ? 'rgba(0, 229, 255, 0.3)'
          : 'rgba(0, 229, 255, 0.25)';
        slot.root.style.boxShadow = '';
      }
    }
  }
}
