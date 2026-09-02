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
  renderStreamBadges,
} from './mechanicBadges';
import { STREAM_BADGE_KINDS } from '../ai/synthesizer/partialJson';
import type { PartialCardStream } from '../ai/synthesizer/partialJson';
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
  roleBadgeStyle,
  showQuickEquipMenu,
} from './workshopStyles';
import { SpellInventoryManager } from '../game/SpellInventory';
import {
  getSpellRoleLabel,
  getSpellRoles,
  SPELL_ROLES,
  spellMatchesMetaFilter,
  spellMatchesRoleFilter,
  type SpellRole,
  type VaultMetaFilter,
} from '../game/spellRoles';
import {
  attachDockSlotDrag,
  attachInventoryDropZone,
  attachVaultCardDrag,
} from '../game/spellDragDrop';
import { generateSpellIcon, getArchetypeColor } from '../render/canvas/SpellIconGenerator';
import { FONTS, RETRO_COLORS, retroPanelStyle } from '../ui/tokens';

type WorkshopTab = 'VAULT' | 'FORGE';

export interface DraftModalCallbacks {
  getLoadout: () => PlayerLoadout;
  onEquip: (selection: DraftSelection) => void;
  onOpenChange: (open: boolean) => void;
}

export class DraftModal {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private loadoutBar: HTMLElement;
  private workshopContainer!: HTMLElement;
  private dockSection!: HTMLElement;
  private workspaceTabs!: HTMLElement;
  private workspaceContent!: HTMLElement;
  private vaultRoot!: HTMLElement;
  private forgeRoot!: HTMLElement;
  private vaultTabBtn!: HTMLButtonElement;
  private forgeTabBtn!: HTMLButtonElement;
  private vaultSearchInput!: HTMLInputElement;
  private vaultRoleFilterRow!: HTMLElement;
  private vaultMetaFilterRow!: HTMLElement;
  private spellGrid!: HTMLElement;
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

  private streamingSlots: Array<{
    root: HTMLElement;
    rarityBadge: HTMLElement;
    title: HTMLElement;
    tagline: HTMLElement;
    desc: HTMLElement;
    badges: HTMLElement;
    power: HTMLElement;
    equipBtn: HTMLButtonElement;
    card: DraftCard | null;
    finalized: boolean;
  }> | null = null;

  private mode: WorkshopMode = 'FORGE_NEW';
  private selectedCategory: SkillCategory = 'SECONDARY';
  private evolutionContext: EvolutionContext | null = null;
  private presetSlot: ActionSlotKey | null = null;
  private activeTab: WorkshopTab = 'VAULT';
  private vaultSearchQuery = '';
  private vaultRoleFilters = new Set<SpellRole>();
  private vaultMetaFilters = new Set<VaultMetaFilter>();
  private vaultBuilt = false;
  private readonly onInventoryUpdated = (): void => {
    if (this.open_ && this.activeTab === 'VAULT') {
      this.renderVaultGrid();
    }
  };
  private readonly onLoadoutChanged = (): void => {
    if (this.open_) {
      this.renderLoadoutOverview();
    }
  };

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
      padding: 16px 20px 18px; border-radius: 4px;
      ${retroPanelStyle('cyan')}
      box-shadow: 0 24px 80px rgba(0,0,0,0.55);
      transform: scale(0.97); transition: transform 0.2s ease;
      color: ${RETRO_COLORS.textPrimary}; font-family: ${FONTS.mono};
    `;
    this.panel.dataset.panel = 'true';

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;gap:10px;';
    const title = document.createElement('h2');
    title.textContent = 'Synthesizer Workshop';
    title.style.cssText = `margin:0;font-size:${FONTS.size.title};letter-spacing:0.02em;flex-shrink:0;`;

    this.apiStatusPill = document.createElement('div');
    this.apiStatusPill.style.cssText = `
      margin-left:auto;margin-right:8px;padding:4px 10px;border-radius:999px;font-size:${FONTS.size.sm};
      border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);color:#aaa;
      white-space:nowrap;flex-shrink:1;overflow:hidden;text-overflow:ellipsis;max-width:280px;
    `;

    this.latencyBadgeEl = document.createElement('span');
    this.latencyBadgeEl.style.cssText = `
      font-size:${FONTS.size.sm};font-family:${FONTS.mono};color:${RETRO_COLORS.textMuted};background:rgba(255,255,255,0.05);
      padding:2px 8px;border-radius:4px;border:1px solid ${RETRO_COLORS.borderSubtle};
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
      color:#fcd34d;font-size:${FONTS.size.body};line-height:1.35;
    `;

    const overviewLabel = document.createElement('div');
    overviewLabel.textContent = 'ARSENAL DOCK';
    overviewLabel.style.cssText =
      `font-size:${FONTS.size.badge};letter-spacing:0.08em;color:#889;font-weight:600;flex-shrink:0;`;

    this.loadoutBar = document.createElement('div');
    this.loadoutBar.className = 'loadout-grid';

    this.dockSection = document.createElement('div');
    this.dockSection.className = 'arsenal-dock-section';
    this.dockSection.appendChild(overviewLabel);
    this.dockSection.appendChild(this.loadoutBar);

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
      flex:1;padding:8px 12px;border-radius:4px;border:1px solid ${RETRO_COLORS.borderSubtle};
      background:${RETRO_COLORS.panelBgOpaque};color:${RETRO_COLORS.textPrimary};font-size:${FONTS.size.body};
      font-family:${FONTS.mono};
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
      `display:none;text-align:center;color:#888;margin-bottom:6px;flex-shrink:0;font-size:${FONTS.size.body};`;

    this.cardsContainer = document.createElement('div');
    this.cardsContainer.className = 'forge-cards';

    this.forgeRoot = document.createElement('div');
    this.forgeRoot.className = 'forge-root';
    this.forgeRoot.style.display = 'none';
    this.forgeRoot.appendChild(this.modeRow);
    this.forgeRoot.appendChild(this.categoryRow);
    this.forgeRoot.appendChild(this.evolutionBanner);
    this.forgeRoot.appendChild(promptRow);
    this.forgeRoot.appendChild(this.chipsRow);
    this.forgeRoot.appendChild(this.loadingEl);
    this.forgeRoot.appendChild(this.cardsContainer);

    this.vaultRoot = document.createElement('div');
    this.vaultRoot.className = 'vault-root';

    this.workspaceContent = document.createElement('div');
    this.workspaceContent.className = 'workspace-content';
    this.workspaceContent.appendChild(this.vaultRoot);
    this.workspaceContent.appendChild(this.forgeRoot);

    this.vaultTabBtn = document.createElement('button');
    this.vaultTabBtn.type = 'button';
    this.vaultTabBtn.className = 'workspace-tab active';
    this.vaultTabBtn.textContent = 'SPELL VAULT';
    this.vaultTabBtn.onclick = () => this.setActiveTab('VAULT');

    this.forgeTabBtn = document.createElement('button');
    this.forgeTabBtn.type = 'button';
    this.forgeTabBtn.className = 'workspace-tab';
    this.forgeTabBtn.textContent = 'FORGE';
    this.forgeTabBtn.onclick = () => this.setActiveTab('FORGE');

    this.workspaceTabs = document.createElement('div');
    this.workspaceTabs.className = 'workspace-tabs';
    this.workspaceTabs.appendChild(this.vaultTabBtn);
    this.workspaceTabs.appendChild(this.forgeTabBtn);

    this.workshopContainer = document.createElement('div');
    this.workshopContainer.className = 'workshop-container';
    this.workshopContainer.appendChild(this.dockSection);
    this.workshopContainer.appendChild(this.workspaceTabs);
    this.workshopContainer.appendChild(this.workspaceContent);

    this.panel.appendChild(header);
    this.panel.appendChild(this.apiWarningBanner);
    this.panel.appendChild(this.workshopContainer);
    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);

    window.addEventListener('inventoryupdated', this.onInventoryUpdated);
    window.addEventListener('loadoutchanged', this.onLoadoutChanged);
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
    this.setActiveTab('VAULT');
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
    this.setActiveTab('FORGE');
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
    this.syncTabChrome();
    this.renderApiStatusPill();
    this.renderLoadoutOverview();
    this.renderWorkspace();
  }

  private syncTabChrome(): void {
    this.vaultTabBtn.classList.toggle('active', this.activeTab === 'VAULT');
    this.forgeTabBtn.classList.toggle('active', this.activeTab === 'FORGE');
    this.vaultRoot.style.display = this.activeTab === 'VAULT' ? 'block' : 'none';
    this.forgeRoot.style.display = this.activeTab === 'FORGE' ? 'flex' : 'none';
  }

  private setActiveTab(tab: WorkshopTab): void {
    this.activeTab = tab;
    this.refreshUI();
    if (tab === 'FORGE') {
      this.promptInput.focus();
    }
  }

  private renderWorkspace(): void {
    if (this.activeTab === 'VAULT') {
      this.renderVaultGrid();
      return;
    }
    this.renderForge();
  }

  private buildVault(): void {
    if (this.vaultBuilt) return;
    this.vaultBuilt = true;

    const toolbar = document.createElement('div');
    toolbar.className = 'vault-toolbar';

    this.vaultSearchInput = document.createElement('input');
    this.vaultSearchInput.type = 'search';
    this.vaultSearchInput.placeholder = 'Search spells...';
    this.vaultSearchInput.className = 'vault-search';
    this.vaultSearchInput.addEventListener('input', () => {
      this.vaultSearchQuery = this.vaultSearchInput.value;
      this.renderVaultGrid();
    });
    toolbar.appendChild(this.vaultSearchInput);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'vault-btn-reset';
    resetBtn.textContent = 'Reset Loadout';
    resetBtn.addEventListener('click', () => {
      if (
        !window.confirm(
          'Reset your equipped loadout to the default demo spells? This will replace all five action slots.',
        )
      ) {
        return;
      }
      SpellInventoryManager.resetToDefaultLoadout();
    });
    toolbar.appendChild(resetBtn);

    this.vaultRoot.appendChild(toolbar);

    this.vaultRoleFilterRow = document.createElement('div');
    this.vaultRoleFilterRow.className = 'vault-filter-row';
    this.vaultRoot.appendChild(this.vaultRoleFilterRow);

    this.vaultMetaFilterRow = document.createElement('div');
    this.vaultMetaFilterRow.className = 'vault-filter-row';
    this.vaultRoot.appendChild(this.vaultMetaFilterRow);

    this.buildVaultFilterChips();

    this.spellGrid = document.createElement('div');
    this.spellGrid.className = 'spell-grid';
    this.vaultRoot.appendChild(this.spellGrid);
  }

  private buildVaultFilterChips(): void {
    this.vaultRoleFilterRow.innerHTML = '';
    this.vaultMetaFilterRow.innerHTML = '';

    const allRolesBtn = document.createElement('button');
    allRolesBtn.type = 'button';
    allRolesBtn.textContent = 'All';
    allRolesBtn.style.cssText = chipStyle(this.vaultRoleFilters.size === 0);
    allRolesBtn.addEventListener('click', () => {
      this.vaultRoleFilters.clear();
      this.refreshVaultFilterChips();
      this.renderVaultGrid();
    });
    this.vaultRoleFilterRow.appendChild(allRolesBtn);

    for (const role of SPELL_ROLES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = getSpellRoleLabel(role);
      btn.style.cssText = chipStyle(this.vaultRoleFilters.has(role));
      btn.addEventListener('click', () => {
        if (this.vaultRoleFilters.has(role)) {
          this.vaultRoleFilters.delete(role);
        } else {
          this.vaultRoleFilters.add(role);
        }
        this.refreshVaultFilterChips();
        this.renderVaultGrid();
      });
      this.vaultRoleFilterRow.appendChild(btn);
    }

    const metaFilters: { id: VaultMetaFilter; label: string }[] = [
      { id: 'EQUIPPED', label: 'Equipped' },
      { id: 'NEW', label: 'New' },
      { id: 'CUSTOM', label: 'Custom' },
    ];

    for (const meta of metaFilters) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = meta.label;
      btn.style.cssText = chipStyle(this.vaultMetaFilters.has(meta.id));
      btn.addEventListener('click', () => {
        if (this.vaultMetaFilters.has(meta.id)) {
          this.vaultMetaFilters.delete(meta.id);
        } else {
          this.vaultMetaFilters.add(meta.id);
        }
        this.refreshVaultFilterChips();
        this.renderVaultGrid();
      });
      this.vaultMetaFilterRow.appendChild(btn);
    }
  }

  private refreshVaultFilterChips(): void {
    const roleButtons = [...this.vaultRoleFilterRow.querySelectorAll('button')];
    const allRolesBtn = roleButtons[0];
    if (allRolesBtn) {
      allRolesBtn.style.cssText = chipStyle(this.vaultRoleFilters.size === 0);
    }
    for (let i = 0; i < SPELL_ROLES.length; i++) {
      const btn = roleButtons[i + 1];
      if (btn) {
        btn.style.cssText = chipStyle(this.vaultRoleFilters.has(SPELL_ROLES[i]));
      }
    }

    const metaButtons = [...this.vaultMetaFilterRow.querySelectorAll('button')];
    const metaIds: VaultMetaFilter[] = ['EQUIPPED', 'NEW', 'CUSTOM'];
    for (let i = 0; i < metaIds.length; i++) {
      const btn = metaButtons[i];
      if (btn) {
        btn.style.cssText = chipStyle(this.vaultMetaFilters.has(metaIds[i]));
      }
    }
  }

  private hasVaultFiltersActive(): boolean {
    return (
      this.vaultSearchQuery.trim().length > 0 ||
      this.vaultRoleFilters.size > 0 ||
      this.vaultMetaFilters.size > 0
    );
  }

  private renderVaultGrid(): void {
    this.buildVault();
    this.spellGrid.innerHTML = '';

    const q = this.vaultSearchQuery.trim().toLowerCase();
    const loadout = SpellInventoryManager.getLoadout();
    const loadoutSpellIds = new Set(
      Object.values(loadout).filter((id): id is string => id !== null),
    );
    const metaContext = {
      loadoutSpellIds,
      isNewSpell: (id: string) => SpellInventoryManager.isNewSpell(id),
      isPresetSpell: (id: string) => SpellInventoryManager.isPresetSpell(id),
    };

    const spells = SpellInventoryManager.getAllSpells().filter((spell) => {
      if (q) {
        const archetype = (spell.archetype ?? '').toLowerCase();
        const tagline = (spell.tagline ?? '').toLowerCase();
        const matchesText =
          spell.name.toLowerCase().includes(q) ||
          archetype.includes(q) ||
          tagline.includes(q);
        if (!matchesText) return false;
      }
      if (!spellMatchesRoleFilter(spell, this.vaultRoleFilters)) return false;
      if (!spellMatchesMetaFilter(spell, this.vaultMetaFilters, metaContext)) return false;
      return true;
    });

    if (spells.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = this.hasVaultFiltersActive()
        ? 'No spells match your filters.'
        : 'No spells in inventory.';
      empty.style.cssText = `padding:24px;text-align:center;color:${RETRO_COLORS.textMuted};font-size:${FONTS.size.body};`;
      this.spellGrid.appendChild(empty);
      return;
    }

    for (const spell of spells) {
      this.spellGrid.appendChild(this.createInventoryCard(spell));
    }
  }

  private createInventoryCard(spell: AbilitySchema): HTMLElement {
    const archetypeColor = getArchetypeColor(spell.archetype, spell.visuals?.color);
    const card = document.createElement('div');
    card.className = 'inventory-card';
    card.style.borderLeftColor = archetypeColor;

    const iconContainer = document.createElement('div');
    iconContainer.className = 'card-icon-container';
    iconContainer.appendChild(generateSpellIcon(spell, 48));

    const details = document.createElement('div');
    details.className = 'card-details';

    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = spell.name;

    const archetype = document.createElement('span');
    archetype.className = 'card-archetype';
    archetype.textContent = spell.archetype ?? 'UNKNOWN';
    archetype.style.color = archetypeColor;

    const stats = document.createElement('span');
    stats.className = 'card-stats';
    stats.textContent = `CD ${spell.cooldownMs}ms`;

    const roles = getSpellRoles(spell);
    const roleRow = document.createElement('div');
    roleRow.className = 'card-role-row';
    roleRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;';
    const visibleRoles = roles.slice(0, 3);
    for (const role of visibleRoles) {
      const pill = document.createElement('span');
      pill.textContent = getSpellRoleLabel(role);
      pill.style.cssText = roleBadgeStyle(role);
      roleRow.appendChild(pill);
    }
    if (roles.length > 3) {
      const more = document.createElement('span');
      more.textContent = `+${roles.length - 3}`;
      more.style.cssText = `font-size:${FONTS.size.badge};color:${RETRO_COLORS.textMuted};`;
      roleRow.appendChild(more);
    }

    details.appendChild(title);
    details.appendChild(archetype);
    details.appendChild(stats);
    if (roles.length > 0) {
      details.appendChild(roleRow);
    }

    card.appendChild(iconContainer);
    card.appendChild(details);

    if (SpellInventoryManager.isNewSpell(spell.id)) {
      const newBadge = document.createElement('span');
      newBadge.className = 'card-new-badge';
      newBadge.textContent = 'NEW';
      card.appendChild(newBadge);
    }

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const items = ACTION_SLOT_KEYS.map((slotKey) => ({
        label: `[${slotKey}] ${getCategoryLabel(SLOT_CATEGORY_MAP[slotKey])}`,
        onSelect: () => {
          SpellInventoryManager.equipSpell(slotKey, spell.id);
          SpellInventoryManager.clearNewSpellTag(spell.id);
        },
      }));
      showQuickEquipMenu(e.clientX, e.clientY, items);
    });

    attachVaultCardDrag(card, spell.id);
    return card;
  }

  private renderForge(): void {
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
      slotLabel.style.cssText = `font-size:${FONTS.size.badge};color:${accent};font-weight:600;flex-shrink:0;`;

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:4px;flex-shrink:0;';

      const evolveBtn = document.createElement('button');
      evolveBtn.textContent = 'Evolve';
      evolveBtn.draggable = false;
      evolveBtn.disabled = !ability;
      evolveBtn.style.cssText =
        btnStyle(true) + 'padding:3px 6px;line-height:1.2;';
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
        this.setActiveTab('FORGE');
        this.startPrefetch();
      };

      const replaceBtn = document.createElement('button');
      replaceBtn.textContent = 'Replace';
      replaceBtn.draggable = false;
      replaceBtn.style.cssText =
        btnStyle(false) + 'padding:3px 6px;line-height:1.2;';
      replaceBtn.onclick = () => {
        this.invalidatePrefetch();
        this.presetSlot = key;
        this.selectedCategory = category;
        this.evolutionContext = null;
        this.mode = 'FORGE_NEW';
        this.setActiveTab('FORGE');
        this.startPrefetch();
      };

      actions.appendChild(evolveBtn);
      actions.appendChild(replaceBtn);
      topRow.appendChild(slotLabel);
      topRow.appendChild(actions);

      const nameRow = document.createElement('div');
      nameRow.className = 'dock-icon-row';

      if (ability) {
        const iconWrap = document.createElement('div');
        iconWrap.className = 'dock-icon';
        iconWrap.appendChild(generateSpellIcon(ability, 36));
        nameRow.appendChild(iconWrap);
      }

      const name = document.createElement('div');
      name.textContent = ability?.name ?? 'Empty';
      name.style.cssText = `
        font-size:${FONTS.size.sm};font-weight:bold;color:${ability ? '#eee' : '#666'};
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;
      `;
      nameRow.appendChild(name);

      const bottom = document.createElement('div');
      bottom.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-height:0;';

      const stats = document.createElement('div');
      if (ability) {
        stats.textContent = `CD ${ability.cooldownMs}ms · Recoil ${ability.recoilKick}`;
        stats.style.cssText = `font-size:${FONTS.size.badge};color:#888;`;
      } else {
        stats.textContent = 'No ability equipped';
        stats.style.cssText = `font-size:${FONTS.size.badge};color:#555;`;
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
      panel.appendChild(nameRow);
      panel.appendChild(bottom);

      panel.classList.add('drop-zone');
      panel.dataset.slotKey = key;
      attachInventoryDropZone(panel, key);
      panel.draggable = !!ability;
      if (ability) {
        attachDockSlotDrag(panel, ability.id, key);
        panel.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showQuickEquipMenu(e.clientX, e.clientY, [
            {
              label: 'Unequip Slot',
              onSelect: () => SpellInventoryManager.unequipSlot(key),
            },
          ]);
        });
      }

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
      text.style.cssText = `font-size:${FONTS.size.body};flex-shrink:0;`;
      text.innerHTML = `Evolving <strong>${this.evolutionContext.baseAbility.name}</strong> · ${this.evolutionContext.slotKey} (${getCategoryLabel(this.evolutionContext.category)})`;

      const badgeRow = document.createElement('div');
      badgeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;flex:1;';
      for (const b of extractMechanicBadgesFromAbility(this.evolutionContext.baseAbility).slice(0, 5)) {
        badgeRow.appendChild(renderBadge(b.label, b.kind));
      }

      const change = document.createElement('button');
      change.textContent = 'Change Base';
      change.style.cssText = btnStyle(false) + 'padding:4px 8px;flex-shrink:0;';
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
      text.style.cssText = `font-size:${FONTS.size.body};color:#aaa;`;
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
    const prefetchCards = cachedEntry?.cards ?? null;
    let prefetchPromise: Promise<DraftCard[]> | null =
      cachedEntry && !cachedEntry.cards ? cachedEntry.promise : null;

    if (cachedEntry) {
      this.prefetchCache = null;
    } else {
      this.invalidatePrefetch();
    }

    this.clearSynthesisWarning();
    const useStreaming =
      this.mode !== 'PASSIVE_UPGRADES' &&
      getAiSettings().apiKey.trim().length > 0 &&
      !prefetchCards;

    if (useStreaming && prefetchPromise && cachedEntry) {
      cachedEntry.abortController.abort();
      cachedEntry.promise.catch(() => {});
      prefetchPromise = null;
    }

    if (useStreaming) {
      this.loadingEl.style.display = 'none';
      this.renderStreamingSkeletons();
    } else {
      this.loadingEl.style.display = 'block';
      this.loadingEl.textContent = 'Synthesizing...';
      this.cardsContainer.innerHTML = '';
    }

    // In-flight prefetch (non-streaming) measures from prefetch dispatch; fresh requests start now.
    this.synthesisStartTime =
      prefetchPromise && !useStreaming && cachedEntry
        ? cachedEntry.startedAt
        : performance.now();
    this.latencyBadgeEl.style.display = 'none';
    this.synthesizeBtn.disabled = true;
    this.clearSynthesisTimer(false);
    this.timerIntervalId = window.setInterval(() => {
      const elapsedSec = ((performance.now() - this.synthesisStartTime) / 1000).toFixed(1);
      this.synthesizeBtn.textContent = `Synthesizing... (${elapsedSec}s)`;
    }, 50);

    try {
      if (prefetchCards) {
        this.cards = prefetchCards;
      } else if (prefetchPromise) {
        this.cards = await prefetchPromise;
      } else {
        const loadout = this.callbacks.getLoadout();
        this.cards = await synthesizeAbility(
          prompt,
          category,
          loadout,
          this.mode === 'EVOLVE_EXISTING' ? this.evolutionContext ?? undefined : undefined,
          this.mode === 'PASSIVE_UPGRADES',
          {
            onCardChunk: useStreaming
              ? (index, partial) => this.updateStreamingCard(index, partial)
              : undefined,
          },
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
      if (useStreaming && this.streamingSlots) {
        this.finalizeStreamingCards();
      } else {
        this.renderResultCards();
      }
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

  private resolveEquipTarget(card?: DraftCard): DraftSelection['slot'] | null {
    if (this.intermissionMode) return null;
    const targetSlot =
      this.evolutionContext?.slotKey ??
      this.presetSlot ??
      (card?.category ? CATEGORY_SLOT_MAP[card.category] : null);
    return targetSlot;
  }

  private renderStreamingSkeletons(): void {
    this.cardsContainer.innerHTML = '';
    this.streamingSlots = [];
    const color = RARITY_COLORS.COMMON;

    for (let index = 0; index < 3; index++) {
      const root = document.createElement('div');
      root.style.cssText = `
        display:flex;flex-direction:column;min-height:0;overflow:hidden;
        padding:12px 14px;border-radius:4px;
        ${retroPanelStyle('cyan')}
        border:2px solid ${color};
        box-shadow:0 0 24px ${color}55, inset 0 1px 0 ${color}22;
      `;

      const rarityBadge = document.createElement('div');
      rarityBadge.textContent = 'FORGING...';
      rarityBadge.style.cssText = `font-size:${FONTS.size.badge};color:${color};font-weight:bold;margin-bottom:2px;flex-shrink:0;`;

      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = 'Forging Spell...';
      title.style.cssText =
        `font-size:${FONTS.size.lg};font-weight:bold;margin-bottom:2px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:forgePulse 1.4s ease-in-out infinite;`;

      const tagline = document.createElement('div');
      tagline.className = 'card-tagline';
      tagline.textContent = 'Synthesizing concept...';
      tagline.style.cssText = `font-size:${FONTS.size.sm};color:#666;margin-bottom:6px;flex-shrink:0;`;

      const desc = document.createElement('div');
      desc.className = 'card-desc';
      desc.textContent = '';
      desc.style.cssText = `
        font-size:${FONTS.size.body};color:#aaa;margin-bottom:8px;line-height:1.35;flex-shrink:0;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
      `;

      const badges = document.createElement('div');
      badges.className = 'card-badges';
      badges.style.cssText =
        'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;flex-shrink:0;min-height:18px;';

      const power = renderPowerBar(0, 'COMMON', false);
      power.className = 'card-power';
      const fill = power.querySelector('div > div');
      if (fill instanceof HTMLElement) {
        fill.style.animation = 'forgePulse 1.4s ease-in-out infinite';
      }

      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:auto;flex-shrink:0;';

      const equipBtn = document.createElement('button');
      equipBtn.className = 'card-equip-btn';
      equipBtn.textContent = 'Synthesizing...';
      equipBtn.disabled = true;
      equipBtn.style.cssText = btnStyle(false) + 'width:100%;opacity:0.6;cursor:not-allowed;';
      const slotIndex = index;
      equipBtn.onclick = () => {
        const card = this.streamingSlots?.[slotIndex]?.card;
        const targetSlot = this.resolveEquipTarget(card ?? undefined);
        if (!card || !targetSlot) return;
        this.equip(card, targetSlot);
      };
      footer.appendChild(equipBtn);

      root.appendChild(rarityBadge);
      root.appendChild(title);
      root.appendChild(tagline);
      root.appendChild(desc);
      root.appendChild(badges);
      root.appendChild(power);
      root.appendChild(footer);
      this.cardsContainer.appendChild(root);

      this.streamingSlots.push({
        root,
        rarityBadge,
        title,
        tagline,
        desc,
        badges,
        power,
        equipBtn,
        card: null,
        finalized: false,
      });
    }
  }

  private updateStreamingCard(index: number, partial: PartialCardStream): void {
    const slot = this.streamingSlots?.[index];
    if (!slot || slot.finalized) return;

    if (partial.name) {
      slot.title.textContent = partial.name;
      slot.title.style.animation = '';
    }
    if (partial.tagline) slot.tagline.textContent = partial.tagline;
    if (partial.description) slot.desc.textContent = partial.description;
    renderStreamBadges(slot.badges, partial.detectedBadges, STREAM_BADGE_KINDS);

    if (partial.isComplete && partial.validatedCard) {
      slot.card = partial.validatedCard;
      const targetSlot = this.resolveEquipTarget(partial.validatedCard);
      const newPower = renderPowerBar(
        partial.validatedCard.budgetCost,
        partial.validatedCard.rarity,
        false,
      );
      slot.power.replaceWith(newPower);
      slot.power = newPower;
      slot.equipBtn.disabled = false;
      slot.equipBtn.style.cssText =
        btnStyleRarity(partial.validatedCard.rarity) + 'width:100%;cursor:pointer;opacity:1;';
      slot.equipBtn.textContent = targetSlot ? `Equip to ${targetSlot}` : 'Equip';
    }
  }

  private finalizeStreamingCards(): void {
    if (!this.streamingSlots) return;
    const loadout = this.callbacks.getLoadout();

    for (let i = 0; i < this.streamingSlots.length; i++) {
      const slot = this.streamingSlots[i];
      const card = this.cards[i];
      if (!card) continue;

      slot.card = card;
      slot.finalized = true;
      const color = RARITY_COLORS[card.rarity];
      slot.root.style.border = `2px solid ${color}`;
      slot.root.style.boxShadow = `0 0 24px ${color}55, inset 0 1px 0 ${color}22`;
      slot.rarityBadge.textContent = card.rarity;
      slot.rarityBadge.style.color = color;

      slot.title.textContent = card.title;
      slot.tagline.textContent = card.tagline;
      slot.desc.textContent = card.description;

      slot.badges.innerHTML = '';
      for (const b of extractMechanicBadges(card).slice(0, 6)) {
        const badge = renderBadge(b.label, b.kind);
        badge.setAttribute('data-badge', b.label);
        slot.badges.appendChild(badge);
      }

      const newPower = renderPowerBar(
        card.budgetCost,
        card.rarity,
        card.type === 'PASSIVE_UPGRADE',
      );
      slot.power.replaceWith(newPower);
      slot.power = newPower;

      if (card.type === 'ACTIVE_ABILITY') {
        const compareAgainst = this.getCompareAbility(loadout);
        const diff = this.statDiff(compareAgainst, card.abilityPayload);
        const existingDiff = slot.root.querySelector('.card-stat-diff');
        existingDiff?.remove();
        if (diff) {
          const diffEl = document.createElement('div');
          diffEl.className = 'card-stat-diff';
          diffEl.textContent = diff;
          diffEl.style.cssText = `font-size:${FONTS.size.sm};color:#4f8;margin-bottom:8px;`;
          slot.power.before(diffEl);
        }
      }

      const targetSlot = this.resolveEquipTarget(card);
      slot.equipBtn.disabled = false;
      slot.equipBtn.style.cssText = btnStyleRarity(card.rarity) + 'width:100%;cursor:pointer;opacity:1;';
      if (targetSlot) {
        slot.equipBtn.textContent = `Equip to ${targetSlot}`;
        slot.equipBtn.onclick = () => this.equip(card, targetSlot);
      } else if (card.type === 'ACTIVE_ABILITY' && !this.intermissionMode) {
        slot.equipBtn.replaceWith(this.buildSlotPickerFooter(card));
      } else if (card.type === 'PASSIVE_UPGRADE') {
        slot.equipBtn.textContent = 'Equip Passive';
        slot.equipBtn.onclick = () => this.equip(card, 'PASSIVE');
      }
    }

    this.streamingSlots = null;
  }

  private buildSlotPickerFooter(card: DraftCard): HTMLElement {
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    for (const key of ACTION_SLOT_KEYS) {
      const slotBtn = document.createElement('button');
      slotBtn.textContent = `[${key}]`;
      slotBtn.style.cssText = btnStyleRarity(card.rarity) + 'flex:1;min-width:44px;padding:6px 8px;';
      slotBtn.onclick = () => this.equip(card, key);
      btnContainer.appendChild(slotBtn);
    }
    return btnContainer;
  }

  private renderResultCards(): void {
    this.cardsContainer.innerHTML = '';
    const loadout = this.callbacks.getLoadout();

    for (const card of this.cards) {
      const el = document.createElement('div');
      const color = RARITY_COLORS[card.rarity];
      el.style.cssText = `
        display:flex;flex-direction:column;min-height:0;overflow:hidden;
        padding:12px 14px;border-radius:4px;
        ${retroPanelStyle('cyan')}
        border:2px solid ${color};
        box-shadow:0 0 24px ${color}55, inset 0 1px 0 ${color}22;
      `;

      const rarityBadge = document.createElement('div');
      rarityBadge.textContent = card.rarity;
      rarityBadge.style.cssText = `font-size:${FONTS.size.badge};color:${color};font-weight:bold;margin-bottom:2px;flex-shrink:0;`;

      const cardTitle = document.createElement('div');
      cardTitle.textContent = card.title;
      cardTitle.style.cssText =
        `font-size:${FONTS.size.lg};font-weight:bold;margin-bottom:2px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;

      const tagline = document.createElement('div');
      tagline.textContent = card.tagline;
      tagline.style.cssText = `font-size:${FONTS.size.sm};color:#888;margin-bottom:6px;flex-shrink:0;`;

      const desc = document.createElement('div');
      desc.textContent = card.description;
      desc.style.cssText = `
        font-size:${FONTS.size.body};color:#aaa;margin-bottom:8px;line-height:1.35;flex-shrink:0;
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
          `font-size:${FONTS.size.sm};color:#6cf;margin-bottom:6px;line-height:1.35;flex-shrink:0;`;
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
          diffEl.style.cssText = `font-size:${FONTS.size.sm};color:#4f8;margin-bottom:8px;`;
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
    if (card.abilityPayload) {
      card.abilityPayload.id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `spell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    this.callbacks.onEquip({ card, slot });
    this.close();
  }
}
