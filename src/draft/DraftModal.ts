import { synthesizeCards } from '../ai/Synthesizer';
import type { CardRarity, DraftCard, DraftSelection, PlayerLoadout } from '../types/cards';
import { ACTION_SLOT_KEYS } from '../types/cards';
import type { AbilitySchema } from '../types/schema';

export interface DraftModalCallbacks {
  getLoadout: () => PlayerLoadout;
  onEquip: (selection: DraftSelection) => void;
  onOpenChange: (open: boolean) => void;
}

const RARITY_COLORS: Record<CardRarity, string> = {
  COMMON: '#888888',
  RARE: '#00ccff',
  EPIC: '#aa44ff',
  CHAOTIC: '#ff8800',
};

function extractMechanicBadges(card: DraftCard): string[] {
  const badges: string[] = [];

  if (card.type === 'ACTIVE_ABILITY' && card.abilityPayload) {
    const s = card.abilityPayload;
    if (s.trajectory) badges.push(`[${s.trajectory.type.replace(/_/g, ' ')}]`);
    badges.push(`[CD ${s.cooldownMs}ms]`);
    if (s.recoilKick > 0) badges.push(`[Recoil ${s.recoilKick}]`);

    for (const node of s.triggers) {
      for (const action of node.actions) {
        if (action.type === 'SPAWN_FIELD') badges.push(`[${action.field.fieldType.replace(/_/g, ' ')}]`);
        if (action.type === 'TELEPORT') badges.push('[TELEPORT]');
        if (action.type === 'APPLY_IMPULSE') badges.push('[IMPULSE]');
      }
    }
  }

  if (card.type === 'PASSIVE_UPGRADE' && card.passivePayload) {
    for (const mod of card.passivePayload) {
      const sign = mod.op === 'MULTIPLY' ? `${Math.round((mod.value - 1) * 100)}%` : `+${mod.value}`;
      badges.push(`[${mod.stat} ${sign}]`);
    }
  }

  return badges;
}

export class DraftModal {
  private overlay: HTMLElement;
  private promptInput: HTMLInputElement;
  private cardsContainer: HTMLElement;
  private loadingEl: HTMLElement;
  private open_ = false;
  private cards: DraftCard[] = [];

  constructor(private callbacks: DraftModalCallbacks) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: none; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
      opacity: 0; transition: opacity 0.2s ease;
      pointer-events: auto;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      width: min(960px, 95vw); max-height: 90vh; overflow-y: auto;
      padding: 24px; border-radius: 16px;
      background: rgba(10,10,20,0.92); border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      transform: scale(0.95); transition: transform 0.2s ease;
      color: #e0e0e8; font-family: system-ui, sans-serif;
    `;
    panel.dataset.panel = 'true';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    const title = document.createElement('h2');
    title.textContent = 'Ability Draft Synthesizer';
    title.style.cssText = 'margin:0;font-size:18px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = this.btnStyle();
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(closeBtn);

    const promptRow = document.createElement('div');
    promptRow.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;';
    this.promptInput = document.createElement('input');
    this.promptInput.type = 'text';
    this.promptInput.placeholder = 'Describe your ability... (e.g. "ice vortex boomerang")';
    this.promptInput.style.cssText = `
      flex:1;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
      background:#0a0a14;color:#e0e0e8;font-size:14px;
    `;
    this.promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.synthesize();
    });

    const synthBtn = document.createElement('button');
    synthBtn.textContent = 'Synthesize';
    synthBtn.style.cssText = this.btnStyle(true);
    synthBtn.onclick = () => void this.synthesize();

    this.loadingEl = document.createElement('div');
    this.loadingEl.textContent = 'Synthesizing...';
    this.loadingEl.style.cssText = 'display:none;text-align:center;color:#888;margin-bottom:12px;';

    promptRow.appendChild(this.promptInput);
    promptRow.appendChild(synthBtn);

    this.cardsContainer = document.createElement('div');
    this.cardsContainer.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;';

    panel.appendChild(header);
    panel.appendChild(promptRow);
    panel.appendChild(this.loadingEl);
    panel.appendChild(this.cardsContainer);
    this.overlay.appendChild(panel);
    document.body.appendChild(this.overlay);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open_) this.close();
    });
  }

  private btnStyle(primary = false): string {
    return `
      padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;
      border:1px solid ${primary ? '#00ccff' : 'rgba(255,255,255,0.15)'};
      background:${primary ? 'rgba(0,200,255,0.2)' : 'rgba(255,255,255,0.05)'};
      color:#e0e0e8;
    `;
  }

  isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      const panel = this.overlay.querySelector('[data-panel]') as HTMLElement;
      if (panel) panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    this.promptInput.focus();
    if (this.cards.length === 0) {
      void this.synthesize();
    }
  }

  close(): void {
    this.open_ = false;
    this.overlay.style.opacity = '0';
    const panel = this.overlay.querySelector('[data-panel]') as HTMLElement;
    if (panel) panel.style.transform = 'scale(0.95)';
    setTimeout(() => {
      if (!this.open_) this.overlay.style.display = 'none';
    }, 200);
    this.callbacks.onOpenChange(false);
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  openIntermission(cards: DraftCard[]): void {
    this.cards = cards;
    this.renderCards();
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      const panel = this.overlay.querySelector('[data-panel]') as HTMLElement;
      if (panel) panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
  }

  private async synthesize(): Promise<void> {
    const prompt = this.promptInput.value.trim() || 'kinetic combat ability';
    this.loadingEl.style.display = 'block';
    this.cardsContainer.innerHTML = '';

    try {
      this.cards = await synthesizeCards(prompt, this.callbacks.getLoadout());
      this.renderCards();
    } finally {
      this.loadingEl.style.display = 'none';
    }
  }

  private renderCards(): void {
    this.cardsContainer.innerHTML = '';
    const loadout = this.callbacks.getLoadout();

    for (const card of this.cards) {
      const el = document.createElement('div');
      const color = RARITY_COLORS[card.rarity];
      el.style.cssText = `
        flex:1;min-width:260px;max-width:300px;padding:16px;border-radius:12px;
        background:rgba(20,20,35,0.9);border:2px solid ${color};
        box-shadow:0 0 20px ${color}44;
      `;

      const rarityBadge = document.createElement('div');
      rarityBadge.textContent = card.rarity;
      rarityBadge.style.cssText = `font-size:10px;color:${color};font-weight:bold;margin-bottom:4px;`;

      const cardTitle = document.createElement('div');
      cardTitle.textContent = card.title;
      cardTitle.style.cssText = 'font-size:16px;font-weight:bold;margin-bottom:2px;';

      const tagline = document.createElement('div');
      tagline.textContent = card.tagline;
      tagline.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;';

      const desc = document.createElement('div');
      desc.textContent = card.description;
      desc.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:10px;line-height:1.4;';

      const badges = document.createElement('div');
      badges.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;';
      for (const b of extractMechanicBadges(card)) {
        const span = document.createElement('span');
        span.textContent = b;
        span.style.cssText = 'font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:#ccc;';
        badges.appendChild(span);
      }

      const cost = document.createElement('div');
      cost.textContent = `Budget: ${Math.round(card.budgetCost)}`;
      cost.style.cssText = 'font-size:10px;color:#666;margin-bottom:10px;';

      el.appendChild(rarityBadge);
      el.appendChild(cardTitle);
      el.appendChild(tagline);
      el.appendChild(desc);
      el.appendChild(badges);
      el.appendChild(cost);

      if (card.type === 'ACTIVE_ABILITY') {
        const diff = this.statDiff(loadout.abilities[0], card.abilityPayload);
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.textContent = diff;
          diffEl.style.cssText = 'font-size:10px;color:#4f8;margin-bottom:8px;';
          el.appendChild(diffEl);
        }

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

        for (const key of ACTION_SLOT_KEYS) {
          const slotBtn = document.createElement('button');
          slotBtn.textContent = `[${key}]`;
          slotBtn.style.cssText = this.btnStyle(key === 'Q') + 'flex:1;min-width:48px;';
          slotBtn.onclick = () => this.equip(card, key);
          btnContainer.appendChild(slotBtn);
        }

        el.appendChild(btnContainer);
      } else {
        const passiveBtn = document.createElement('button');
        passiveBtn.textContent = 'Equip Passive';
        passiveBtn.style.cssText = this.btnStyle(true) + 'width:100%;';
        passiveBtn.onclick = () => this.equip(card, 'PASSIVE');
        el.appendChild(passiveBtn);
      }

      this.cardsContainer.appendChild(el);
    }
  }

  private statDiff(current: AbilitySchema | null, incoming?: AbilitySchema): string | null {
    if (!incoming) return null;
    const parts: string[] = [];
    if (current) {
      const cdDelta = incoming.cooldownMs - current.cooldownMs;
      if (cdDelta !== 0) parts.push(`CD ${cdDelta > 0 ? '+' : ''}${cdDelta}ms`);
    }
    if (incoming.recoilKick > 0) parts.push(`Recoil ${incoming.recoilKick}`);
    return parts.length ? parts.join(' · ') : null;
  }

  private equip(card: DraftCard, slot: DraftSelection['slot']): void {
    this.callbacks.onEquip({ card, slot });
    this.close();
  }
}
