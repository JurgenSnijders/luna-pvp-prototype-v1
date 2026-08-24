import { synthesizeAbility } from '../ai/Synthesizer';
import type {
  ActionSlotKey,
  CardRarity,
  DraftCard,
  DraftSelection,
  EvolutionContext,
  PlayerLoadout,
  SkillCategory,
} from '../types/cards';
import {
  ACTION_SLOT_INDEX,
  ACTION_SLOT_KEYS,
  CATEGORY_SLOT_MAP,
  getCategoryLabel,
  SKILL_CATEGORIES,
  SLOT_CATEGORY_MAP,
} from '../types/cards';
import type { AbilitySchema } from '../types/schema';

export interface DraftModalCallbacks {
  getLoadout: () => PlayerLoadout;
  onEquip: (selection: DraftSelection) => void;
  onOpenChange: (open: boolean) => void;
}

type WorkshopMode = 'FORGE_NEW' | 'EVOLVE_EXISTING' | 'PASSIVE_UPGRADES';

const RARITY_COLORS: Record<CardRarity, string> = {
  COMMON: '#888888',
  RARE: '#00ccff',
  EPIC: '#aa44ff',
  CHAOTIC: '#ff8800',
};

const SUGGEST_CHIPS = [
  '+ Bouncing',
  '+ Black Hole on Hit',
  '+ Ice Slipstream',
  '+ Cluster Bomblets',
];

function extractMechanicBadgesFromAbility(s: AbilitySchema): string[] {
  const badges: string[] = [];
  if (s.trajectory) badges.push(`[${s.trajectory.type.replace(/_/g, ' ')}]`);
  badges.push(`[CD ${s.cooldownMs}ms]`);
  if (s.recoilKick > 0) badges.push(`[Recoil ${s.recoilKick}]`);

  for (const node of s.triggers) {
    for (const action of node.actions) {
      if (action.type === 'SPAWN_FIELD') {
        badges.push(`[${action.field.fieldType.replace(/_/g, ' ')}]`);
      }
      if (action.type === 'TELEPORT') badges.push('[TELEPORT]');
      if (action.type === 'APPLY_IMPULSE') badges.push('[IMPULSE]');
      if (action.type === 'SPAWN_CHILD_PROJECTILE') badges.push('[CLUSTER]');
    }
  }
  return badges;
}

function extractMechanicBadges(card: DraftCard): string[] {
  const badges: string[] = [];

  if (card.type === 'ACTIVE_ABILITY' && card.abilityPayload) {
    badges.push(...extractMechanicBadgesFromAbility(card.abilityPayload));
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
  private panel: HTMLElement;
  private loadoutBar: HTMLElement;
  private modeRow: HTMLElement;
  private categoryRow: HTMLElement;
  private evolutionBanner: HTMLElement;
  private promptInput: HTMLInputElement;
  private chipsRow: HTMLElement;
  private cardsContainer: HTMLElement;
  private loadingEl: HTMLElement;
  private open_ = false;
  private cards: DraftCard[] = [];
  private intermissionMode = false;

  private mode: WorkshopMode = 'FORGE_NEW';
  private selectedCategory: SkillCategory = 'SECONDARY';
  private evolutionContext: EvolutionContext | null = null;
  private presetSlot: ActionSlotKey | null = null;

  constructor(private callbacks: DraftModalCallbacks) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: none; align-items: stretch; justify-content: center;
      background: rgba(4,6,14,0.72); backdrop-filter: blur(12px);
      opacity: 0; transition: opacity 0.2s ease;
      pointer-events: auto; padding: 20px;
    `;

    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      width: min(1180px, 100%); max-height: 100%; overflow-y: auto;
      padding: 22px 24px 28px; border-radius: 18px;
      background: linear-gradient(160deg, rgba(16,18,32,0.92), rgba(10,12,24,0.88));
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 24px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
      transform: scale(0.97); transition: transform 0.2s ease;
      color: #e0e0e8; font-family: system-ui, sans-serif;
    `;
    this.panel.dataset.panel = 'true';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
    const title = document.createElement('h2');
    title.textContent = 'Synthesizer Workshop';
    title.style.cssText = 'margin:0;font-size:20px;letter-spacing:0.02em;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = this.btnStyle();
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(closeBtn);

    const overviewLabel = document.createElement('div');
    overviewLabel.textContent = 'LOADOUT OVERVIEW';
    overviewLabel.style.cssText =
      'font-size:11px;letter-spacing:0.08em;color:#889;margin-bottom:8px;font-weight:600;';

    this.loadoutBar = document.createElement('div');
    this.loadoutBar.style.cssText =
      'display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px;';

    this.modeRow = document.createElement('div');
    this.modeRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;';

    this.categoryRow = document.createElement('div');
    this.categoryRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;';

    this.evolutionBanner = document.createElement('div');
    this.evolutionBanner.style.cssText = `
      display:none;margin-bottom:12px;padding:12px 14px;border-radius:10px;
      background:rgba(0,200,255,0.08);border:1px solid rgba(0,200,255,0.25);
    `;

    const promptRow = document.createElement('div');
    promptRow.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;';
    this.promptInput = document.createElement('input');
    this.promptInput.type = 'text';
    this.promptInput.placeholder = 'Describe your ability... (e.g. "ice vortex boomerang")';
    this.promptInput.style.cssText = `
      flex:1;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);
      background:rgba(8,10,20,0.9);color:#e0e0e8;font-size:14px;
    `;
    this.promptInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.synthesize();
    });

    const synthBtn = document.createElement('button');
    synthBtn.textContent = 'Synthesize';
    synthBtn.style.cssText = this.btnStyle(true);
    synthBtn.onclick = () => void this.synthesize();

    promptRow.appendChild(this.promptInput);
    promptRow.appendChild(synthBtn);

    this.chipsRow = document.createElement('div');
    this.chipsRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;';
    for (const chip of SUGGEST_CHIPS) {
      const btn = document.createElement('button');
      btn.textContent = chip;
      btn.style.cssText = this.chipStyle();
      btn.onclick = () => {
        const cur = this.promptInput.value.trim();
        this.promptInput.value = cur ? `${cur} ${chip.replace(/^\+\s*/, '')}` : chip.replace(/^\+\s*/, '');
        this.promptInput.focus();
      };
      this.chipsRow.appendChild(btn);
    }

    this.loadingEl = document.createElement('div');
    this.loadingEl.textContent = 'Synthesizing...';
    this.loadingEl.style.cssText = 'display:none;text-align:center;color:#888;margin-bottom:12px;';

    this.cardsContainer = document.createElement('div');
    this.cardsContainer.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;';

    this.panel.appendChild(header);
    this.panel.appendChild(overviewLabel);
    this.panel.appendChild(this.loadoutBar);
    this.panel.appendChild(this.modeRow);
    this.panel.appendChild(this.categoryRow);
    this.panel.appendChild(this.evolutionBanner);
    this.panel.appendChild(promptRow);
    this.panel.appendChild(this.chipsRow);
    this.panel.appendChild(this.loadingEl);
    this.panel.appendChild(this.cardsContainer);
    this.overlay.appendChild(this.panel);
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

  private chipStyle(active = false): string {
    return `
      padding:4px 10px;border-radius:999px;cursor:pointer;font-size:11px;
      border:1px solid ${active ? '#00ccff' : 'rgba(255,255,255,0.14)'};
      background:${active ? 'rgba(0,200,255,0.22)' : 'rgba(255,255,255,0.04)'};
      color:${active ? '#dff' : '#bbb'};
    `;
  }

  isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.intermissionMode = false;
    this.mode = 'FORGE_NEW';
    this.evolutionContext = null;
    this.presetSlot = null;
    this.cards = [];
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    this.refreshUI();
    this.promptInput.focus();
  }

  close(): void {
    this.open_ = false;
    this.overlay.style.opacity = '0';
    this.panel.style.transform = 'scale(0.97)';
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
    this.intermissionMode = true;
    this.mode = 'FORGE_NEW';
    this.evolutionContext = null;
    this.presetSlot = null;
    this.cards = cards;
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    this.refreshUI();
  }

  private setMode(mode: WorkshopMode): void {
    this.mode = mode;
    if (mode !== 'EVOLVE_EXISTING') {
      // Keep evolution context only in evolve mode
      if (mode === 'FORGE_NEW' && !this.presetSlot) {
        this.evolutionContext = null;
      }
    }
    if (mode === 'EVOLVE_EXISTING' && !this.evolutionContext) {
      // Auto-pick first filled slot
      const loadout = this.callbacks.getLoadout();
      for (const key of ACTION_SLOT_KEYS) {
        const idx = ACTION_SLOT_INDEX[key];
        const ability = loadout.abilities[idx];
        if (ability) {
          this.evolutionContext = {
            baseAbility: structuredClone(ability),
            slotKey: key,
            category: SLOT_CATEGORY_MAP[key],
          };
          this.presetSlot = key;
          this.selectedCategory = SLOT_CATEGORY_MAP[key];
          break;
        }
      }
    }
    this.refreshUI();
  }

  private refreshUI(): void {
    this.renderLoadoutOverview();
    this.renderSynthesisControls();
    this.renderResultCards();
  }

  private renderLoadoutOverview(): void {
    this.loadoutBar.innerHTML = '';
    const loadout = this.callbacks.getLoadout();

    for (const key of ACTION_SLOT_KEYS) {
      const idx = ACTION_SLOT_INDEX[key];
      const ability = loadout.abilities[idx];
      const category = SLOT_CATEGORY_MAP[key];
      const selected =
        this.presetSlot === key ||
        (this.evolutionContext?.slotKey === key && this.mode === 'EVOLVE_EXISTING');

      const panel = document.createElement('div');
      panel.style.cssText = `
        padding:12px;border-radius:12px;min-height:130px;
        background:rgba(255,255,255,${selected ? '0.08' : '0.04'});
        border:1px solid ${selected ? 'rgba(0,200,255,0.45)' : 'rgba(255,255,255,0.1)'};
        display:flex;flex-direction:column;gap:6px;
      `;

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      const slotLabel = document.createElement('div');
      slotLabel.textContent = `${key} · ${getCategoryLabel(category)}`;
      slotLabel.style.cssText = 'font-size:11px;color:#8ab;font-weight:600;';
      header.appendChild(slotLabel);

      const name = document.createElement('div');
      name.textContent = ability?.name ?? 'Empty';
      name.style.cssText = `font-size:13px;font-weight:bold;color:${ability ? '#eee' : '#666'};`;

      const stats = document.createElement('div');
      if (ability) {
        stats.textContent = `CD ${ability.cooldownMs}ms · Recoil ${ability.recoilKick}`;
        stats.style.cssText = 'font-size:10px;color:#888;';
      } else {
        stats.textContent = 'No ability equipped';
        stats.style.cssText = 'font-size:10px;color:#555;';
      }

      const badges = document.createElement('div');
      badges.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;';
      if (ability) {
        for (const b of extractMechanicBadgesFromAbility(ability).slice(0, 4)) {
          const span = document.createElement('span');
          span.textContent = b;
          span.style.cssText =
            'font-size:8px;padding:2px 5px;border-radius:4px;background:rgba(255,255,255,0.07);color:#bbb;';
          badges.appendChild(span);
        }
      }

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:6px;margin-top:auto;';

      const evolveBtn = document.createElement('button');
      evolveBtn.textContent = 'Evolve';
      evolveBtn.disabled = !ability;
      evolveBtn.style.cssText = this.btnStyle(true) + 'flex:1;font-size:11px;padding:6px 8px;';
      if (!ability) evolveBtn.style.opacity = '0.4';
      evolveBtn.onclick = () => {
        if (!ability) return;
        this.evolutionContext = {
          baseAbility: structuredClone(ability),
          slotKey: key,
          category,
        };
        this.presetSlot = key;
        this.selectedCategory = category;
        this.mode = 'EVOLVE_EXISTING';
        this.refreshUI();
        this.promptInput.focus();
      };

      const replaceBtn = document.createElement('button');
      replaceBtn.textContent = 'Replace';
      replaceBtn.style.cssText = this.btnStyle(false) + 'flex:1;font-size:11px;padding:6px 8px;';
      replaceBtn.onclick = () => {
        this.presetSlot = key;
        this.selectedCategory = category;
        this.evolutionContext = null;
        this.mode = 'FORGE_NEW';
        this.refreshUI();
        this.promptInput.focus();
      };

      actions.appendChild(evolveBtn);
      actions.appendChild(replaceBtn);

      panel.appendChild(header);
      panel.appendChild(name);
      panel.appendChild(stats);
      panel.appendChild(badges);
      panel.appendChild(actions);
      this.loadoutBar.appendChild(panel);
    }
  }

  private renderSynthesisControls(): void {
    this.modeRow.innerHTML = '';
    const modes: { id: WorkshopMode; label: string }[] = [
      { id: 'FORGE_NEW', label: 'Forge New Spell' },
      { id: 'EVOLVE_EXISTING', label: 'Evolve Existing' },
      { id: 'PASSIVE_UPGRADES', label: 'Passive Upgrades' },
    ];
    for (const m of modes) {
      const btn = document.createElement('button');
      btn.textContent = m.label;
      btn.style.cssText = this.chipStyle(this.mode === m.id);
      btn.onclick = () => this.setMode(m.id);
      this.modeRow.appendChild(btn);
    }

    this.categoryRow.innerHTML = '';
    this.categoryRow.style.display = this.mode === 'FORGE_NEW' ? 'flex' : 'none';
    if (this.mode === 'FORGE_NEW') {
      for (const cat of SKILL_CATEGORIES) {
        const btn = document.createElement('button');
        btn.textContent = getCategoryLabel(cat);
        btn.style.cssText = this.chipStyle(this.selectedCategory === cat);
        btn.onclick = () => {
          this.selectedCategory = cat;
          this.presetSlot = CATEGORY_SLOT_MAP[cat];
          this.refreshUI();
        };
        this.categoryRow.appendChild(btn);
      }
    }

    if (this.mode === 'EVOLVE_EXISTING' && this.evolutionContext) {
      this.evolutionBanner.style.display = 'block';
      this.evolutionBanner.innerHTML = '';
      const text = document.createElement('div');
      text.style.cssText = 'font-size:13px;';
      text.innerHTML = `Evolving <strong>${this.evolutionContext.baseAbility.name}</strong> · ${this.evolutionContext.slotKey} (${getCategoryLabel(this.evolutionContext.category)})`;
      const change = document.createElement('button');
      change.textContent = 'Change Base';
      change.style.cssText = this.btnStyle(false) + 'margin-top:8px;font-size:11px;';
      change.onclick = () => {
        this.evolutionContext = null;
        this.refreshUI();
      };
      this.evolutionBanner.appendChild(text);
      const badgeRow = document.createElement('div');
      badgeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;';
      for (const b of extractMechanicBadgesFromAbility(this.evolutionContext.baseAbility).slice(0, 5)) {
        const span = document.createElement('span');
        span.textContent = b;
        span.style.cssText =
          'font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:#ccc;';
        badgeRow.appendChild(span);
      }
      this.evolutionBanner.appendChild(badgeRow);
      this.evolutionBanner.appendChild(change);
    } else if (this.mode === 'EVOLVE_EXISTING' && !this.evolutionContext) {
      this.evolutionBanner.style.display = 'block';
      this.evolutionBanner.innerHTML = '';
      const text = document.createElement('div');
      text.textContent = 'Select a filled slot above and click Evolve to choose a base spell.';
      text.style.cssText = 'font-size:13px;color:#aaa;';
      this.evolutionBanner.appendChild(text);
    } else {
      this.evolutionBanner.style.display = 'none';
      this.evolutionBanner.innerHTML = '';
    }

    if (this.mode === 'PASSIVE_UPGRADES') {
      this.promptInput.placeholder = 'Describe a passive upgrade... (e.g. "faster movement")';
    } else if (this.mode === 'EVOLVE_EXISTING') {
      this.promptInput.placeholder = 'Describe the mutation... (e.g. "split into 3 gravity bomblets")';
    } else {
      this.promptInput.placeholder = 'Describe your ability... (e.g. "ice vortex boomerang")';
    }
  }

  private async synthesize(): Promise<void> {
    if (this.mode === 'EVOLVE_EXISTING' && !this.evolutionContext) {
      this.loadingEl.style.display = 'block';
      this.loadingEl.textContent = 'Select a base ability to evolve first.';
      setTimeout(() => {
        this.loadingEl.style.display = 'none';
        this.loadingEl.textContent = 'Synthesizing...';
      }, 1600);
      return;
    }

    const prompt = this.promptInput.value.trim() ||
      (this.mode === 'PASSIVE_UPGRADES'
        ? 'kinetic conditioning'
        : this.mode === 'EVOLVE_EXISTING'
          ? 'cluster bomblets on impact'
          : 'kinetic combat ability');

    this.loadingEl.style.display = 'block';
    this.loadingEl.textContent = 'Synthesizing...';
    this.cardsContainer.innerHTML = '';

    try {
      const loadout = this.callbacks.getLoadout();
      const category =
        this.mode === 'EVOLVE_EXISTING' && this.evolutionContext
          ? this.evolutionContext.category
          : this.selectedCategory;

      this.cards = await synthesizeAbility(
        prompt,
        category,
        loadout,
        this.mode === 'EVOLVE_EXISTING' ? this.evolutionContext ?? undefined : undefined,
        this.mode === 'PASSIVE_UPGRADES',
      );
      this.renderResultCards();
    } finally {
      this.loadingEl.style.display = 'none';
    }
  }

  private renderResultCards(): void {
    this.cardsContainer.innerHTML = '';
    const loadout = this.callbacks.getLoadout();

    for (const card of this.cards) {
      const el = document.createElement('div');
      const color = RARITY_COLORS[card.rarity];
      el.style.cssText = `
        flex:1;min-width:260px;max-width:320px;padding:16px;border-radius:12px;
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
      badges.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;';
      for (const b of extractMechanicBadges(card)) {
        const span = document.createElement('span');
        span.textContent = b;
        span.style.cssText =
          'font-size:9px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.08);color:#ccc;';
        badges.appendChild(span);
      }

      el.appendChild(rarityBadge);
      el.appendChild(cardTitle);
      el.appendChild(tagline);
      el.appendChild(desc);
      el.appendChild(badges);

      if (card.evolutionDiff && card.evolutionDiff.length > 0) {
        const diffList = document.createElement('div');
        diffList.style.cssText = 'font-size:10px;color:#6cf;margin-bottom:8px;line-height:1.4;';
        diffList.textContent = card.evolutionDiff.join(' · ');
        el.appendChild(diffList);
      }

      const cost = document.createElement('div');
      cost.textContent = `Budget: ${Math.round(card.budgetCost)}`;
      cost.style.cssText = 'font-size:10px;color:#666;margin-bottom:10px;';
      el.appendChild(cost);

      if (card.type === 'ACTIVE_ABILITY') {
        const compareAgainst = this.getCompareAbility(loadout);
        const diff = this.statDiff(compareAgainst, card.abilityPayload);
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.textContent = diff;
          diffEl.style.cssText = 'font-size:10px;color:#4f8;margin-bottom:8px;';
          el.appendChild(diffEl);
        }

        const targetSlot =
          this.evolutionContext?.slotKey ??
          this.presetSlot ??
          (card.category ? CATEGORY_SLOT_MAP[card.category] : null);

        if (targetSlot && !this.intermissionMode) {
          const equipBtn = document.createElement('button');
          equipBtn.textContent = `Equip to ${targetSlot}`;
          equipBtn.style.cssText = this.btnStyle(true) + 'width:100%;';
          equipBtn.onclick = () => this.equip(card, targetSlot);
          el.appendChild(equipBtn);
        } else {
          const btnContainer = document.createElement('div');
          btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
          for (const key of ACTION_SLOT_KEYS) {
            const slotBtn = document.createElement('button');
            slotBtn.textContent = `[${key}]`;
            slotBtn.style.cssText = this.btnStyle(key === 'LMB') + 'flex:1;min-width:48px;';
            slotBtn.onclick = () => this.equip(card, key);
            btnContainer.appendChild(slotBtn);
          }
          el.appendChild(btnContainer);
        }
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

  private getCompareAbility(loadout: PlayerLoadout): AbilitySchema | null {
    if (this.evolutionContext) return this.evolutionContext.baseAbility;
    if (this.presetSlot) {
      return loadout.abilities[ACTION_SLOT_INDEX[this.presetSlot]] ?? null;
    }
    return loadout.abilities[0];
  }

  private statDiff(current: AbilitySchema | null, incoming?: AbilitySchema): string | null {
    if (!incoming) return null;
    const parts: string[] = [];
    if (current) {
      const cdDelta = incoming.cooldownMs - current.cooldownMs;
      if (cdDelta !== 0) parts.push(`CD ${cdDelta > 0 ? '+' : ''}${cdDelta}ms`);
      const recoilDelta = incoming.recoilKick - current.recoilKick;
      if (recoilDelta !== 0) parts.push(`Recoil ${recoilDelta > 0 ? '+' : ''}${recoilDelta}`);
    } else {
      if (incoming.recoilKick > 0) parts.push(`Recoil ${incoming.recoilKick}`);
      parts.push(`CD ${incoming.cooldownMs}ms`);
    }
    return parts.length ? parts.join(' · ') : null;
  }

  private equip(card: DraftCard, slot: DraftSelection['slot']): void {
    this.callbacks.onEquip({ card, slot });
    this.close();
  }
}
