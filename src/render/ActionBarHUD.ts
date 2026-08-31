import type { Player } from '../entities/Player';
import { ACTION_SLOT_KEYS, type ActionSlotKey } from '../types/cards';
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
  compileOverlay: HTMLElement;
  countdown: HTMLElement;
  accent: string;
}

const BADGE_STYLES: Record<ActionSlotKey, { color: string; bg: string }> = {
  LMB: { color: '#00e5ff', bg: 'rgba(0, 229, 255, 0.12)' },
  RMB: { color: '#00e5ff', bg: 'rgba(0, 229, 255, 0.12)' },
  Q: { color: '#ffd700', bg: 'rgba(255, 215, 0, 0.12)' },
  E: { color: '#aa44ff', bg: 'rgba(170, 68, 255, 0.12)' },
  SPACE: { color: '#44ff88', bg: 'rgba(68, 255, 136, 0.12)' },
};

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

      // Visual gap between weapons (E) and mobility (SPACE)
      if (i === 3) {
        const spacer = document.createElement('div');
        spacer.style.cssText = 'width: 16px; flex-shrink: 0;';
        this.root.appendChild(spacer);
      }
    }

    document.body.appendChild(this.root);
  }

  private createSlot(slotIndex: number, key: ActionSlotKey): SlotElements {
    const accent = BADGE_STYLES[key];
    const root = document.createElement('div');
    root.style.cssText = `
      width: 60px; height: 60px; position: relative; overflow: hidden;
      backdrop-filter: blur(8px); background: rgba(18, 18, 30, 0.85);
      border: 1px dashed ${accent.color}40; border-radius: 8px;
      cursor: pointer; transition: border-color 0.15s ease, box-shadow 0.15s ease;
    `;

    const badge = document.createElement('div');
    badge.textContent = key;
    badge.style.cssText = `
      position: absolute; top: 3px; left: 3px;
      font-size: ${key === 'SPACE' ? '8px' : '9px'}; font-weight: 700; color: ${accent.color};
      background: ${accent.bg}; padding: 1px 4px; border-radius: 4px;
    `;

    const label = document.createElement('div');
    label.textContent = '+ Assign';
    label.style.cssText = `
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      padding: 14px 3px 3px; font-size: 8px; color: #666; text-align: center;
      line-height: 1.2; word-break: break-word;
    `;

    const cooldownOverlay = document.createElement('div');
    cooldownOverlay.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 0%;
      background: rgba(0, 0, 0, 0.7); pointer-events: none;
      transition: height 0.05s linear;
    `;

    const compileOverlay = document.createElement('div');
    compileOverlay.style.cssText = `
      position: absolute; inset: 0; display: none; pointer-events: none;
    `;

    const countdown = document.createElement('div');
    countdown.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700; color: #fff; text-shadow: 0 0 8px rgba(0,0,0,0.8);
      pointer-events: none;
    `;

    root.appendChild(badge);
    root.appendChild(label);
    root.appendChild(cooldownOverlay);
    root.appendChild(compileOverlay);
    root.appendChild(countdown);

    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      root.style.borderColor = accent.color;
      root.style.boxShadow = `0 0 12px ${accent.color}66`;
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

    return { root, badge, label, cooldownOverlay, compileOverlay, countdown, accent: accent.color };
  }

  update(player: Player): void {
    const now = performance.now();
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const ability = player.getAbility(i);
      const ratio = player.getSlotCooldownRatio(i);
      const remaining = player.getSlotCooldownRemainingMs(i);
      const ready = player.isSlotReady(i);
      const compiling = player.isSlotCompiling(i);
      const accent = slot.accent;

      if (ability) {
        slot.root.dataset.hasAbility = 'true';
        slot.label.textContent = ability.name.length > 10
          ? `${ability.name.slice(0, 9)}…`
          : ability.name;
        slot.label.style.color = '#ccc';
        slot.label.style.fontSize = '8px';
        slot.root.style.borderStyle = 'solid';
      } else {
        slot.root.dataset.hasAbility = 'false';
        slot.label.textContent = '+ Assign';
        slot.label.style.color = '#666';
        slot.root.style.borderStyle = 'dashed';
      }

      if (compiling) {
        // Background synthesis in flight — suppress the real cooldown fill/ready-glow and
        // show an animated pulse instead so the player can see the slot isn't just idle.
        slot.cooldownOverlay.style.height = '0%';

        const pulse = (Math.sin(now / 200) + 1) / 2; // 0..1
        slot.compileOverlay.style.display = 'block';
        slot.compileOverlay.style.background = `rgba(255, 191, 0, ${0.2 + pulse * 0.3})`;
        slot.root.style.borderColor = `rgba(255, 191, 0, ${0.55 + pulse * 0.45})`;
        slot.root.style.boxShadow = `0 0 ${8 + pulse * 8}px rgba(255, 191, 0, ${0.35 + pulse * 0.35})`;

        slot.countdown.style.display = 'flex';
        slot.countdown.style.fontSize = '8px';
        slot.countdown.textContent = 'COMPILING…';
        continue;
      }

      slot.compileOverlay.style.display = 'none';
      slot.countdown.style.fontSize = '13px';
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
        slot.root.style.borderColor = accent;
        slot.root.style.boxShadow = `0 0 10px ${accent}59`;
      } else if (!slot.root.matches(':hover')) {
        slot.root.style.borderColor = ability ? `${accent}4d` : `${accent}40`;
        slot.root.style.boxShadow = '';
      }
    }
  }
}
