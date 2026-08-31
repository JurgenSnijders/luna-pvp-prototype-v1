import {
  DEFAULT_MODEL,
  getAiSettings,
  getApiConnectionStatus,
  getLastSynthesisMeta,
  synthesizeAbility,
} from '../ai/Synthesizer';
import type {
  ActionSlotKey,
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
import {
  extractMechanicBadges,
  extractMechanicBadgesFromAbility,
  renderBadge,
} from './mechanicBadges';
import {
  buildCurrentPrefetchKey,
  formatDuration,
  invalidatePrefetch,
  startPrefetch,
  type PrefetchCacheEntry,
  type WorkshopMode,
} from './synthesisPrefetch';
import {
  RARITY_COLORS,
  SLOT_ACCENT,
  SUGGEST_CHIPS,
  btnStyle,
  btnStyleRarity,
  chipStyle,
  hexToRgba,
  injectStyles,
  renderPowerBar,
} from './workshopStyles';

export interface DraftModalCallbacks {
  getLoadout: () => PlayerLoadout;
  onEquip: (selection: DraftSelection) => void;
  onOpenChange: (open: boolean) => void;
}

export class DraftModal {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private loadoutBar: HTMLElement;
  private modeRow: HTMLElement;
  private categoryRow: HTMLElement;
  private evolutionBanner: HTMLElement;
  private apiStatusPill: HTMLElement;
  private apiWarningBanner: HTMLElement;
  private promptInput: HTMLInputElement;
  private chipsRow: HTMLElement;
  private cardsContainer: HTMLElement;
  private loadingEl: HTMLElement;
  private synthesizeBtn!: HTMLButtonElement;
  private latencyBadgeEl!: HTMLElement;
  private open_ = false;
  private cards: DraftCard[] = [];
  private intermissionMode = false;

  private synthesisStartTime = 0;
  private timerIntervalId: number | null = null;
  private lastDurationMs: number | null = null;

  private prefetchCache: PrefetchCacheEntry | null = null;

  private mode: WorkshopMode = 'FORGE_NEW';
  private selectedCategory: SkillCategory = 'SECONDARY';
  private evolutionContext: EvolutionContext | null = null;
  private presetSlot: ActionSlotKey | null = null;

  constructor(private callbacks: DraftModalCallbacks) {
    injectStyles();

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      display: none; align-items: center; justify-content: center;
      background: rgba(4,6,14,0.72); backdrop-filter: blur(12px);
      opacity: 0; transition: opacity 0.2s ease;
      pointer-events: auto; padding: 16px;
    `;

    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      width: min(1180px, 100%); height: min(92vh, 880px); overflow: hidden;
      display: flex; flex-direction: column;
      padding: 16px 20px 18px; border-radius: 18px;
      background: linear-gradient(160deg, rgba(16,18,32,0.92), rgba(10,12,24,0.88));
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 24px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
      transform: scale(0.97); transition: transform 0.2s ease;
      color: #e0e0e8; font-family: system-ui, sans-serif;
    `;
    this.panel.dataset.panel = 'true';

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;gap:10px;';
    const title = document.createElement('h2');
    title.textContent = 'Synthesizer Workshop';
    title.style.cssText = 'margin:0;font-size:18px;letter-spacing:0.02em;flex-shrink:0;';

    this.apiStatusPill = document.createElement('div');
    this.apiStatusPill.style.cssText = `
      margin-left:auto;margin-right:8px;padding:4px 10px;border-radius:999px;font-size:11px;
      border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);color:#aaa;
      white-space:nowrap;flex-shrink:1;overflow:hidden;text-overflow:ellipsis;max-width:280px;
    `;

    this.latencyBadgeEl = document.createElement('span');
    this.latencyBadgeEl.style.cssText = `
      font-size:11px;font-family:monospace;color:#94a3b8;background:rgba(255,255,255,0.05);
      padding:2px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);
      display:none;flex-shrink:0;margin-right:8px;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = btnStyle();
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(this.apiStatusPill);
    header.appendChild(this.latencyBadgeEl);
    header.appendChild(closeBtn);

    this.apiWarningBanner = document.createElement('div');
    this.apiWarningBanner.style.cssText = `
      display:none;margin-bottom:8px;padding:8px 12px;border-radius:8px;flex-shrink:0;
      background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);
      color:#fcd34d;font-size:12px;line-height:1.35;
    `;

    const overviewLabel = document.createElement('div');
    overviewLabel.textContent = 'ARSENAL DOCK';
    overviewLabel.style.cssText =
      'font-size:10px;letter-spacing:0.08em;color:#889;margin-bottom:6px;font-weight:600;flex-shrink:0;';

    this.loadoutBar = document.createElement('div');
    this.loadoutBar.style.cssText =
      'display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px;flex-shrink:0;';

    this.modeRow = document.createElement('div');
    this.modeRow.style.cssText =
      'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0;';

    this.categoryRow = document.createElement('div');
    this.categoryRow.style.cssText =
      'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0;';

    this.evolutionBanner = document.createElement('div');
    this.evolutionBanner.style.cssText = `
      display:none;margin-bottom:8px;padding:8px 12px;border-radius:8px;flex-shrink:0;
      background:rgba(0,200,255,0.08);border:1px solid rgba(0,200,255,0.25);
    `;

    const promptRow = document.createElement('div');
    promptRow.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;flex-shrink:0;';
    this.promptInput = document.createElement('input');
    this.promptInput.type = 'text';
    this.promptInput.placeholder = 'Describe your ability... (e.g. "ice vortex boomerang")';
    this.promptInput.style.cssText = `
      flex:1;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);
      background:rgba(8,10,20,0.9);color:#e0e0e8;font-size:13px;
    `;
    this.promptInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.synthesize();
    });
    this.promptInput.addEventListener('input', () => {
      this.invalidatePrefetch();
    });

    this.synthesizeBtn = document.createElement('button');
    this.synthesizeBtn.textContent = 'Synthesize';
    this.synthesizeBtn.style.cssText = btnStyle(true);
    this.synthesizeBtn.onclick = () => void this.synthesize();

    promptRow.appendChild(this.promptInput);
    promptRow.appendChild(this.synthesizeBtn);

    this.chipsRow = document.createElement('div');
    this.chipsRow.style.cssText =
      'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;flex-shrink:0;';
    for (const chip of SUGGEST_CHIPS) {
      const btn = document.createElement('button');
      btn.textContent = chip;
      btn.style.cssText = chipStyle();
      btn.onclick = () => {
        this.invalidatePrefetch();
        const cur = this.promptInput.value.trim();
        this.promptInput.value = cur
          ? `${cur} ${chip.replace(/^\+\s*/, '')}`
          : chip.replace(/^\+\s*/, '');
        this.promptInput.focus();
      };
      this.chipsRow.appendChild(btn);
    }

    this.loadingEl = document.createElement('div');
    this.loadingEl.textContent = 'Synthesizing...';
    this.loadingEl.style.cssText =
      'display:none;text-align:center;color:#888;margin-bottom:6px;flex-shrink:0;font-size:12px;';

    this.cardsContainer = document.createElement('div');
    this.cardsContainer.style.cssText = `
      flex:1;min-height:0;overflow:hidden;
      display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:stretch;
    `;

    this.panel.appendChild(header);
    this.panel.appendChild(this.apiWarningBanner);
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

  isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.intermissionMode = false;
    this.mode = 'FORGE_NEW';
    this.evolutionContext = null;
    this.presetSlot = null;
    this.cards = [];
    this.clearSynthesisWarning();
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    this.refreshUI();
    this.promptInput.focus();
    this.startPrefetch();
  }

  close(): void {
    this.invalidatePrefetch();
    this.clearSynthesisTimer();
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
    this.clearSynthesisWarning();
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
    this.invalidatePrefetch();
    this.mode = mode;
    if (mode === 'FORGE_NEW' && !this.presetSlot) {
      this.evolutionContext = null;
    }
    if (mode === 'EVOLVE_EXISTING' && !this.evolutionContext) {
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
    this.startPrefetch();
  }

  private refreshUI(): void {
    this.renderApiStatusPill();
    this.renderLoadoutOverview();
    this.renderSynthesisControls();
    this.renderResultCards();
  }

  private renderApiStatusPill(): void {
    const status = getApiConnectionStatus();
    const settings = getAiSettings();
    const model = status.model || settings.model || DEFAULT_MODEL;
    const hasKey = settings.apiKey.trim().length > 0;

    if (status.online) {
      this.apiStatusPill.textContent = `● ${model} (Active)`;
      this.apiStatusPill.style.color = '#6ee7b7';
      this.apiStatusPill.style.borderColor = 'rgba(52,211,153,0.45)';
      this.apiStatusPill.style.background = 'rgba(52,211,153,0.12)';
      this.apiStatusPill.title = 'AI online — last synthesis succeeded';
    } else if (!hasKey) {
      this.apiStatusPill.textContent = '○ Heuristic Mode';
      this.apiStatusPill.style.color = '#fcd34d';
      this.apiStatusPill.style.borderColor = 'rgba(245,158,11,0.4)';
      this.apiStatusPill.style.background = 'rgba(245,158,11,0.1)';
      this.apiStatusPill.title = 'No API key configured — using offline heuristics';
    } else {
      this.apiStatusPill.textContent = '○ Heuristic Fallback';
      this.apiStatusPill.style.color = '#fcd34d';
      this.apiStatusPill.style.borderColor = 'rgba(245,158,11,0.4)';
      this.apiStatusPill.style.background = 'rgba(245,158,11,0.1)';
      this.apiStatusPill.title = status.lastError
        ? `Last error: ${status.lastError}`
        : 'API key set — awaiting successful call';
    }
  }

  private showSynthesisWarning(message: string): void {
    this.apiWarningBanner.style.display = 'block';
    this.apiWarningBanner.textContent = message;
  }

  private clearSynthesisWarning(): void {
    this.apiWarningBanner.style.display = 'none';
    this.apiWarningBanner.textContent = '';
  }

  private clearSynthesisTimer(resetButton = true): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
    if (resetButton) {
      this.synthesizeBtn.textContent = 'Synthesize';
      this.synthesizeBtn.disabled = false;
    }
  }

  private renderLoadoutOverview(): void {
    this.loadoutBar.innerHTML = '';
    const loadout = this.callbacks.getLoadout();

    for (const key of ACTION_SLOT_KEYS) {
      const idx = ACTION_SLOT_INDEX[key];
      const ability = loadout.abilities[idx];
      const category = SLOT_CATEGORY_MAP[key];
      const accent = SLOT_ACCENT[key];
      const isEvolveSource =
        this.mode === 'EVOLVE_EXISTING' && this.evolutionContext?.slotKey === key;
      const isPreset =
        !isEvolveSource && this.presetSlot === key && this.mode === 'FORGE_NEW';

      const panel = document.createElement('div');
      panel.style.cssText = `
        display:flex;flex-direction:column;justify-content:space-between;
        height:100px;padding:8px 10px;border-radius:10px;overflow:hidden;
        background:${hexToRgba(accent, 0.06)};
        border:1px solid ${hexToRgba(accent, 0.22)};
        border-left:3px solid ${accent};
        ${isPreset ? `box-shadow:inset 0 0 0 1px ${accent};` : ''}
      `;
      if (isEvolveSource) {
        panel.classList.add('evolve-source');
        panel.dataset.evolveActive = 'true';
      }

      const topRow = document.createElement('div');
      topRow.style.cssText =
        'display:flex;justify-content:space-between;align-items:flex-start;gap:4px;';

      const slotLabel = document.createElement('div');
      slotLabel.textContent = `${key} · ${getCategoryLabel(category)}`;
      slotLabel.style.cssText = `font-size:10px;color:${accent};font-weight:600;flex-shrink:0;`;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

      const evolveBtn = document.createElement('button');
      evolveBtn.textContent = 'Evolve';
      evolveBtn.disabled = !ability;
      evolveBtn.style.cssText =
        btnStyle(true) + 'font-size:10px;padding:3px 6px;line-height:1.2;';
      if (!ability) evolveBtn.style.opacity = '0.4';
      evolveBtn.onclick = () => {
        if (!ability) return;
        this.invalidatePrefetch();
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
        this.startPrefetch();
      };

      const replaceBtn = document.createElement('button');
      replaceBtn.textContent = 'Replace';
      replaceBtn.style.cssText =
        btnStyle(false) + 'font-size:10px;padding:3px 6px;line-height:1.2;';
      replaceBtn.onclick = () => {
        this.invalidatePrefetch();
        this.presetSlot = key;
        this.selectedCategory = category;
        this.evolutionContext = null;
        this.mode = 'FORGE_NEW';
        this.refreshUI();
        this.promptInput.focus();
        this.startPrefetch();
      };

      actions.appendChild(evolveBtn);
      actions.appendChild(replaceBtn);
      topRow.appendChild(slotLabel);
      topRow.appendChild(actions);

      const name = document.createElement('div');
      name.textContent = ability?.name ?? 'Empty';
      name.style.cssText = `
        font-size:12px;font-weight:bold;color:${ability ? '#eee' : '#666'};
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      `;

      const bottom = document.createElement('div');
      bottom.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-height:0;';

      const stats = document.createElement('div');
      if (ability) {
        stats.textContent = `CD ${ability.cooldownMs}ms · Recoil ${ability.recoilKick}`;
        stats.style.cssText = 'font-size:9px;color:#888;';
      } else {
        stats.textContent = 'No ability equipped';
        stats.style.cssText = 'font-size:9px;color:#555;';
      }

      const badges = document.createElement('div');
      badges.style.cssText =
        'display:flex;flex-wrap:nowrap;gap:3px;overflow:hidden;';
      if (ability) {
        for (const b of extractMechanicBadgesFromAbility(ability).slice(0, 3)) {
          badges.appendChild(renderBadge(b.label, b.kind));
        }
      }

      bottom.appendChild(stats);
      bottom.appendChild(badges);

      panel.appendChild(topRow);
      panel.appendChild(name);
      panel.appendChild(bottom);
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
      btn.style.cssText = chipStyle(this.mode === m.id);
      btn.onclick = () => this.setMode(m.id);
      this.modeRow.appendChild(btn);
    }

    this.categoryRow.innerHTML = '';
    this.categoryRow.style.display = this.mode === 'FORGE_NEW' ? 'flex' : 'none';
    if (this.mode === 'FORGE_NEW') {
      for (const cat of SKILL_CATEGORIES) {
        const btn = document.createElement('button');
        btn.textContent = getCategoryLabel(cat);
        btn.style.cssText = chipStyle(this.selectedCategory === cat);
        btn.onclick = () => {
          this.invalidatePrefetch();
          this.selectedCategory = cat;
          this.presetSlot = CATEGORY_SLOT_MAP[cat];
          this.refreshUI();
          this.startPrefetch();
        };
        this.categoryRow.appendChild(btn);
      }
    }

    if (this.mode === 'EVOLVE_EXISTING' && this.evolutionContext) {
      this.evolutionBanner.style.display = 'flex';
      this.evolutionBanner.style.alignItems = 'center';
      this.evolutionBanner.style.gap = '10px';
      this.evolutionBanner.style.flexWrap = 'wrap';
      this.evolutionBanner.innerHTML = '';

      const text = document.createElement('div');
      text.style.cssText = 'font-size:12px;flex-shrink:0;';
      text.innerHTML = `Evolving <strong>${this.evolutionContext.baseAbility.name}</strong> · ${this.evolutionContext.slotKey} (${getCategoryLabel(this.evolutionContext.category)})`;

      const badgeRow = document.createElement('div');
      badgeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;flex:1;';
      for (const b of extractMechanicBadgesFromAbility(this.evolutionContext.baseAbility).slice(0, 5)) {
        badgeRow.appendChild(renderBadge(b.label, b.kind));
      }

      const change = document.createElement('button');
      change.textContent = 'Change Base';
      change.style.cssText = btnStyle(false) + 'font-size:10px;padding:4px 8px;flex-shrink:0;';
      change.onclick = () => {
        this.invalidatePrefetch();
        this.evolutionContext = null;
        this.refreshUI();
      };

      this.evolutionBanner.appendChild(text);
      this.evolutionBanner.appendChild(badgeRow);
      this.evolutionBanner.appendChild(change);
    } else if (this.mode === 'EVOLVE_EXISTING' && !this.evolutionContext) {
      this.evolutionBanner.style.display = 'block';
      this.evolutionBanner.innerHTML = '';
      const text = document.createElement('div');
      text.textContent = 'Select a filled slot above and click Evolve to choose a base spell.';
      text.style.cssText = 'font-size:12px;color:#aaa;';
      this.evolutionBanner.appendChild(text);
    } else {
      this.evolutionBanner.style.display = 'none';
      this.evolutionBanner.innerHTML = '';
    }

    if (this.mode === 'PASSIVE_UPGRADES') {
      this.promptInput.placeholder = 'Describe a passive upgrade... (e.g. "faster movement")';
    } else if (this.mode === 'EVOLVE_EXISTING') {
      this.promptInput.placeholder =
        'Describe the mutation... (e.g. "split into 3 gravity bomblets")';
    } else {
      this.promptInput.placeholder = 'Describe your ability... (e.g. "ice vortex boomerang")';
    }
  }

  private resolveEffectivePrompt(): string {
    return (
      this.promptInput.value.trim() ||
      (this.mode === 'PASSIVE_UPGRADES'
        ? 'kinetic conditioning'
        : this.mode === 'EVOLVE_EXISTING'
          ? 'cluster bomblets on impact'
          : 'kinetic combat ability')
    );
  }

  private resolveSynthesisCategory(): SkillCategory {
    return this.mode === 'EVOLVE_EXISTING' && this.evolutionContext
      ? this.evolutionContext.category
      : this.selectedCategory;
  }

  private invalidatePrefetch(): void {
    this.prefetchCache = invalidatePrefetch(this.prefetchCache);
  }

  private startPrefetch(): void {
    this.prefetchCache = startPrefetch(
      this.prefetchCache,
      this.intermissionMode,
      this.mode,
      this.resolveSynthesisCategory(),
      this.resolveEffectivePrompt(),
      this.evolutionContext,
      () => this.callbacks.getLoadout(),
    );
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

    const prompt = this.resolveEffectivePrompt();
    const category = this.resolveSynthesisCategory();
    const key = buildCurrentPrefetchKey(
      this.mode,
      category,
      prompt,
      this.evolutionContext,
    );
    const cachedEntry = this.prefetchCache?.key === key ? this.prefetchCache : null;
    if (cachedEntry) {
      // Claim the entry now so it can never be replayed on a later click, regardless
      // of whether the consumption below succeeds or throws.
      this.prefetchCache = null;
    } else {
      this.invalidatePrefetch();
    }

    this.clearSynthesisWarning();
    this.loadingEl.style.display = 'block';
    this.loadingEl.textContent = 'Synthesizing...';
    this.cardsContainer.innerHTML = '';

    // In-flight hits measure total wait since the prefetch was dispatched (it may have
    // started while the user was still reading the modal); everything else — fresh
    // requests and already-resolved cache hits — starts the stopwatch now.
    this.synthesisStartTime =
      cachedEntry && !cachedEntry.cards ? cachedEntry.startedAt : performance.now();
    this.latencyBadgeEl.style.display = 'none';
    this.synthesizeBtn.disabled = true;
    this.clearSynthesisTimer(false);
    this.timerIntervalId = window.setInterval(() => {
      const elapsedSec = ((performance.now() - this.synthesisStartTime) / 1000).toFixed(1);
      this.synthesizeBtn.textContent = `Synthesizing... (${elapsedSec}s)`;
    }, 50);

    try {
      if (cachedEntry?.cards) {
        this.cards = cachedEntry.cards;
      } else if (cachedEntry) {
        this.cards = await cachedEntry.promise;
      } else {
        const loadout = this.callbacks.getLoadout();
        this.cards = await synthesizeAbility(
          prompt,
          category,
          loadout,
          this.mode === 'EVOLVE_EXISTING' ? this.evolutionContext ?? undefined : undefined,
          this.mode === 'PASSIVE_UPGRADES',
        );
      }

      const meta = getLastSynthesisMeta();
      if (meta.source === 'heuristic' && meta.error) {
        if (meta.error === 'No API key configured') {
          this.showSynthesisWarning(
            'Heuristic Mode (no API key). Displaying offline cards.',
          );
        } else {
          this.showSynthesisWarning(
            `API call failed: ${meta.error}. Displaying heuristic cards.`,
          );
        }
      }

      this.renderApiStatusPill();
      this.renderResultCards();
    } finally {
      this.clearSynthesisTimer();
      const duration = Math.round(performance.now() - this.synthesisStartTime);
      this.lastDurationMs = duration;
      if (this.open_) {
        this.latencyBadgeEl.textContent = `⏱ ${formatDuration(duration)}`;
        this.latencyBadgeEl.style.display = 'inline-block';
      }
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
        display:flex;flex-direction:column;min-height:0;overflow:hidden;
        padding:12px 14px;border-radius:12px;
        background:rgba(20,20,35,0.9);border:2px solid ${color};
        box-shadow:0 0 24px ${color}55, inset 0 1px 0 ${color}22;
      `;

      const rarityBadge = document.createElement('div');
      rarityBadge.textContent = card.rarity;
      rarityBadge.style.cssText = `font-size:10px;color:${color};font-weight:bold;margin-bottom:2px;flex-shrink:0;`;

      const cardTitle = document.createElement('div');
      cardTitle.textContent = card.title;
      cardTitle.style.cssText =
        'font-size:15px;font-weight:bold;margin-bottom:2px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

      const tagline = document.createElement('div');
      tagline.textContent = card.tagline;
      tagline.style.cssText = 'font-size:11px;color:#888;margin-bottom:6px;flex-shrink:0;';

      const desc = document.createElement('div');
      desc.textContent = card.description;
      desc.style.cssText = `
        font-size:12px;color:#aaa;margin-bottom:8px;line-height:1.35;flex-shrink:0;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
      `;

      const badges = document.createElement('div');
      badges.style.cssText =
        'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;flex-shrink:0;';
      for (const b of extractMechanicBadges(card).slice(0, 6)) {
        badges.appendChild(renderBadge(b.label, b.kind));
      }

      el.appendChild(rarityBadge);
      el.appendChild(cardTitle);
      el.appendChild(tagline);
      el.appendChild(desc);
      el.appendChild(badges);

      if (card.evolutionDiff && card.evolutionDiff.length > 0) {
        const diffList = document.createElement('div');
        diffList.style.cssText =
          'font-size:10px;color:#6cf;margin-bottom:6px;line-height:1.35;flex-shrink:0;';
        diffList.textContent = card.evolutionDiff.join(' · ');
        el.appendChild(diffList);
      }

      el.appendChild(
        renderPowerBar(
          card.budgetCost,
          card.rarity,
          card.type === 'PASSIVE_UPGRADE',
        ),
      );

      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:auto;flex-shrink:0;';

      if (card.type === 'ACTIVE_ABILITY') {
        const compareAgainst = this.getCompareAbility(loadout);
        const diff = this.statDiff(compareAgainst, card.abilityPayload);
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.textContent = diff;
          diffEl.style.cssText = 'font-size:10px;color:#4f8;margin-bottom:8px;';
          footer.appendChild(diffEl);
        }

        const targetSlot =
          this.evolutionContext?.slotKey ??
          this.presetSlot ??
          (card.category ? CATEGORY_SLOT_MAP[card.category] : null);

        if (targetSlot && !this.intermissionMode) {
          const equipBtn = document.createElement('button');
          equipBtn.textContent = `Equip to ${targetSlot}`;
          equipBtn.style.cssText = btnStyleRarity(card.rarity) + 'width:100%;';
          equipBtn.onclick = () => this.equip(card, targetSlot);
          footer.appendChild(equipBtn);
        } else {
          const btnContainer = document.createElement('div');
          btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
          for (const key of ACTION_SLOT_KEYS) {
            const slotBtn = document.createElement('button');
            slotBtn.textContent = `[${key}]`;
            slotBtn.style.cssText =
              btnStyleRarity(card.rarity) + 'flex:1;min-width:44px;padding:6px 8px;';
            slotBtn.onclick = () => this.equip(card, key);
            btnContainer.appendChild(slotBtn);
          }
          footer.appendChild(btnContainer);
        }
      } else {
        const passiveBtn = document.createElement('button');
        passiveBtn.textContent = 'Equip Passive';
        passiveBtn.style.cssText = btnStyleRarity(card.rarity) + 'width:100%;';
        passiveBtn.onclick = () => this.equip(card, 'PASSIVE');
        footer.appendChild(passiveBtn);
      }

      el.appendChild(footer);
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
