import {
  DEFAULT_MODEL,
  compileAbilityPayload,
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
  ACTION_SLOT_KEYS,
  CATEGORY_SLOT_MAP,
  getCategoryLabel,
  SLOT_CATEGORY_MAP,
} from '../types/cards';
import type {
  AbilitySchema,
  ActionPayload,
  EmitterConfig,
  SpellArchetype,
  TrajectoryConfig,
  TriggerNode,
} from '../types/schema';
import {
  extractMechanicBadges,
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
  SUGGEST_CHIPS,
  btnStyle,
  btnStyleRarity,
  chipStyle,
  injectStyles,
  renderPowerBar,
  showQuickEquipMenu,
} from './workshopStyles';
import { SpellInventoryManager } from '../game/SpellInventory';
import {
  getSpellRoleLabel,
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
import { ActionBarHUD } from '../render/ActionBarHUD';
import { FONTS, RETRO_COLORS, retroPanelStyle } from '../ui/tokens';

type WorkshopTab = 'VAULT' | 'FORGE';

interface DisplayTrajectory {
  trajectory?: TrajectoryConfig;
  emitter?: EmitterConfig;
}

const ARCHETYPE_DESCRIPTIONS: Partial<Record<SpellArchetype, string>> = {
  KINETIC: 'Reduces target linear drag by 80%. Hits cause extreme sliding across arena and lava.',
  FROST: 'Chills target movement. Reduces active running acceleration and maximum speed by 50%.',
  EARTH: 'Triples target mass and increases friction. Harder to launch, anchors firmly.',
  GRAVITY: 'Reduces target mass to 20%. Target becomes weightless and highly susceptible to knockback.',
  FIRE: 'Applies thermal instability. Targets moving at high speed rapidly build additional instability.',
  PLASMA: 'Volatile energy. Reaching 100% instability triggers an immediate violent detonation.',
  VOID: 'Gravitational singularity. Scales vortex pull strength and field disruption.',
  CHAOS: 'Erratic physics trajectories with random velocity vectors and impulse redirects.',
};

const ARCHETYPE_FALLBACK = 'Elemental physics modifier active on hit.';

function formatEnumLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function walkTriggers(
  nodes: TriggerNode[],
  visit: (node: TriggerNode, action: ActionPayload) => void,
): void {
  for (const node of nodes) {
    for (const action of node.actions) {
      visit(node, action);
      if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
        walkTriggers(action.triggers, visit);
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.triggers) {
        walkTriggers(action.payload.triggers, visit);
      }
    }
    if (node.children) walkTriggers(node.children, visit);
  }
}

function resolveDisplayTrajectory(ability: AbilitySchema): DisplayTrajectory {
  if (ability.trajectory) {
    return { trajectory: ability.trajectory };
  }
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        return {
          trajectory: action.projectileTrajectory,
          emitter: action.emitter,
        };
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.trajectory) {
        return { trajectory: action.payload.trajectory };
      }
    }
  }
  return {};
}

function collectActionTypes(ability: AbilitySchema): string[] {
  const actions = new Set<string>();
  walkTriggers(ability.triggers ?? [], (_node, action) => {
    actions.add(action.type);
  });
  return [...actions];
}

function formatCooldown(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export interface DraftModalCallbacks {
  getLoadout: () => PlayerLoadout;
  onEquip: (selection: DraftSelection) => void;
  onStoreSpell: (ability: AbilitySchema) => AbilitySchema;
  onOpenChange: (open: boolean) => void;
}

export class DraftModal {
  private overlay: HTMLElement;
  private panel: HTMLElement;
  private workshopContainer!: HTMLElement;
  private workspaceSplit!: HTMLElement;
  private workspaceMain!: HTMLElement;
  private inspectorPane!: HTMLElement;
  private bottomLoadoutBay!: HTMLElement;
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
  private evolvingBaseSpellId: string | null = null;
  private activeTab: WorkshopTab = 'VAULT';
  private vaultSearchQuery = '';
  private vaultRoleFilters = new Set<SpellRole>();
  private vaultMetaFilters = new Set<VaultMetaFilter>();
  private vaultBuilt = false;
  private selectedSpellId: string | null = null;
  private hoveredSpellId: string | null = null;
  private readonly onInventoryUpdated = (): void => {
    if (this.open_ && this.activeTab === 'VAULT') {
      this.renderVaultGrid();
    }
  };
  private readonly onLoadoutChanged = (): void => {
    if (!this.open_) return;
    this.renderBottomLoadoutBay();
    if (this.activeTab === 'VAULT') {
      this.renderVaultGrid();
      this.renderTacticalInspector();
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

    const tabGroup = document.createElement('div');
    tabGroup.className = 'workspace-tabs';
    tabGroup.style.cssText = 'margin-bottom:0;border-bottom:none;padding-bottom:0;flex-shrink:0;';
    tabGroup.appendChild(this.vaultTabBtn);
    tabGroup.appendChild(this.forgeTabBtn);

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
    header.appendChild(tabGroup);
    header.appendChild(this.apiStatusPill);
    header.appendChild(this.latencyBadgeEl);
    header.appendChild(closeBtn);

    this.apiWarningBanner = document.createElement('div');
    this.apiWarningBanner.style.cssText = `
      display:none;margin-bottom:8px;padding:8px 12px;border-radius:8px;flex-shrink:0;
      background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.4);
      color:#fcd34d;font-size:${FONTS.size.body};line-height:1.35;
    `;

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

    this.workspaceMain = document.createElement('div');
    this.workspaceMain.className = 'workspace-main';
    this.workspaceMain.appendChild(this.workspaceContent);

    this.inspectorPane = document.createElement('div');
    this.inspectorPane.className = 'workspace-inspector-pane';

    this.workspaceSplit = document.createElement('div');
    this.workspaceSplit.className = 'workspace-split';
    this.workspaceSplit.appendChild(this.workspaceMain);
    this.workspaceSplit.appendChild(this.inspectorPane);

    this.bottomLoadoutBay = document.createElement('div');
    this.bottomLoadoutBay.className = 'bottom-loadout-bay';

    this.workshopContainer = document.createElement('div');
    this.workshopContainer.className = 'workshop-container';
    this.workshopContainer.appendChild(this.workspaceSplit);
    this.workshopContainer.appendChild(this.bottomLoadoutBay);

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
    this.evolvingBaseSpellId = null;
    this.cards = [];
    this.clearSynthesisWarning();
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    ActionBarHUD.suppress();
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
    ActionBarHUD.restore();
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  openIntermission(cards: DraftCard[]): void {
    this.intermissionMode = true;
    this.mode = 'FORGE_NEW';
    this.evolutionContext = null;
    this.evolvingBaseSpellId = null;
    this.cards = cards;
    this.clearSynthesisWarning();
    this.open_ = true;
    this.overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      this.overlay.style.opacity = '1';
      this.panel.style.transform = 'scale(1)';
    });
    this.callbacks.onOpenChange(true);
    ActionBarHUD.suppress();
    this.setActiveTab('FORGE');
  }

  private setMode(mode: WorkshopMode): void {
    this.invalidatePrefetch();
    this.mode = mode;
    if (mode === 'FORGE_NEW' || mode === 'PASSIVE_UPGRADES') {
      this.evolutionContext = null;
      this.evolvingBaseSpellId = null;
    }
    this.refreshUI();
    this.startPrefetch();
  }

  private startEvolution(spellId: string): void {
    const baseSpell = SpellInventoryManager.getSpell(spellId);
    if (!baseSpell) return;

    this.invalidatePrefetch();
    this.evolvingBaseSpellId = spellId;

    const loadout = SpellInventoryManager.getLoadout();
    let slotKey: ActionSlotKey = 'RMB';
    let category: SkillCategory = 'SECONDARY';
    for (const key of ACTION_SLOT_KEYS) {
      if (loadout[key] === spellId) {
        slotKey = key;
        category = SLOT_CATEGORY_MAP[key];
        break;
      }
    }

    this.evolutionContext = {
      baseAbility: structuredClone(baseSpell),
      slotKey,
      category,
    };
    this.mode = 'EVOLVE_EXISTING';
    this.selectedCategory = category;
    this.setActiveTab('FORGE');
    this.startPrefetch();
  }

  private cancelEvolution(): void {
    this.invalidatePrefetch();
    this.evolvingBaseSpellId = null;
    this.evolutionContext = null;
    this.mode = 'FORGE_NEW';
    this.refreshUI();
    this.startPrefetch();
  }

  private refreshUI(): void {
    this.syncTabChrome();
    this.renderApiStatusPill();
    this.renderBottomLoadoutBay();
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
    this.spellGrid.className = 'spell-grid-square';
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
    const equippedSlotBySpellId = new Map<string, ActionSlotKey>();
    for (const [slot, id] of Object.entries(loadout)) {
      if (id) equippedSlotBySpellId.set(id, slot as ActionSlotKey);
    }
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

    const spellIds = new Set(spells.map((s) => s.id));
    if (
      this.selectedSpellId === null ||
      !spellIds.has(this.selectedSpellId)
    ) {
      const defaultId = loadout.LMB ?? spells[0]?.id ?? null;
      this.selectedSpellId = defaultId;
    }

    if (spells.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = this.hasVaultFiltersActive()
        ? 'No spells match your filters.'
        : 'No spells in inventory.';
      empty.style.cssText = `padding:24px;text-align:center;color:${RETRO_COLORS.textMuted};font-size:${FONTS.size.body};grid-column:1/-1;`;
      this.spellGrid.appendChild(empty);
      this.renderTacticalInspector();
      return;
    }

    for (const spell of spells) {
      this.spellGrid.appendChild(this.createSpellTile(spell, equippedSlotBySpellId));
    }

    this.renderTacticalInspector();
  }

  private renderTacticalInspector(): void {
    this.inspectorPane.innerHTML = '';

    const activeId = this.hoveredSpellId ?? this.selectedSpellId;
    const spell = activeId ? (SpellInventoryManager.getSpell(activeId) ?? null) : null;

    if (!spell) {
      const empty = document.createElement('div');
      empty.className = 'inspector-empty';
      empty.textContent = 'Select or hover a spell to inspect telemetry';
      this.inspectorPane.appendChild(empty);
      return;
    }

    const archetypeColor = getArchetypeColor(spell.archetype, spell.visuals?.color);
    const { trajectory } = resolveDisplayTrajectory(spell);
    const actionTypes = collectActionTypes(spell);
    const loadout = SpellInventoryManager.getLoadout();

    const panel = document.createElement('div');
    panel.className = 'inspector-panel';

    const heroWrap = document.createElement('div');
    heroWrap.className = 'inspector-hero-wrap';
    heroWrap.style.borderColor = archetypeColor;
    heroWrap.style.boxShadow = `inset 0 0 16px rgba(0, 0, 0, 0.8), 0 0 12px ${archetypeColor}44`;
    heroWrap.appendChild(generateSpellIcon(spell, 112));

    const header = document.createElement('div');
    header.className = 'inspector-header';

    const title = document.createElement('div');
    title.className = 'inspector-title';
    title.textContent = spell.name;

    const archetypeTag = document.createElement('span');
    archetypeTag.className = 'inspector-archetype-tag';
    archetypeTag.textContent = spell.archetype ?? 'UNKNOWN';
    archetypeTag.style.color = archetypeColor;
    archetypeTag.style.borderColor = archetypeColor;
    archetypeTag.style.background = `${archetypeColor}18`;

    header.appendChild(title);
    header.appendChild(archetypeTag);

    const telemetryGrid = document.createElement('div');
    telemetryGrid.className = 'inspector-telemetry-grid';

    const telemetryCells: { label: string; value: string }[] = [
      { label: 'Cooldown', value: formatCooldown(spell.cooldownMs) },
      { label: 'Recoil', value: `${spell.recoilKick}` },
      {
        label: 'Trajectory',
        value: trajectory ? formatEnumLabel(trajectory.type) : 'INSTANT',
      },
      {
        label: 'Range / Speed',
        value: trajectory
          ? `${trajectory.maxRange ?? 0}px / ${trajectory.speed ?? 0}px/s`
          : '—',
      },
    ];

    for (const cell of telemetryCells) {
      const cellEl = document.createElement('div');
      cellEl.className = 'telemetry-cell';

      const label = document.createElement('span');
      label.className = 'telemetry-label';
      label.textContent = cell.label;

      const value = document.createElement('span');
      value.className = 'telemetry-value';
      value.textContent = cell.value;

      cellEl.appendChild(label);
      cellEl.appendChild(value);
      telemetryGrid.appendChild(cellEl);
    }

    const tagsRow = document.createElement('div');
    tagsRow.className = 'inspector-tags-row';
    if (actionTypes.length === 0) {
      const pill = document.createElement('span');
      pill.className = 'inspector-action-pill';
      pill.textContent = 'INSTANT';
      tagsRow.appendChild(pill);
    } else {
      for (const actionType of actionTypes) {
        const pill = document.createElement('span');
        pill.className = 'inspector-action-pill';
        pill.textContent = formatEnumLabel(actionType);
        tagsRow.appendChild(pill);
      }
    }

    const desc = document.createElement('div');
    desc.className = 'inspector-desc';
    const archetypeNote =
      (spell.archetype && ARCHETYPE_DESCRIPTIONS[spell.archetype]) || ARCHETYPE_FALLBACK;
    const flavor = spell.tagline || spell.description || '';
    desc.textContent = flavor ? `${archetypeNote}\n\n${flavor}` : archetypeNote;

    const actionsSection = document.createElement('div');
    actionsSection.className = 'inspector-actions-section';
    const upgradeBtn = document.createElement('button');
    upgradeBtn.type = 'button';
    upgradeBtn.className = 'inspector-upgrade-btn';
    upgradeBtn.innerHTML = '<span>✦</span> UPGRADE / EVOLVE SPELL';
    upgradeBtn.addEventListener('click', () => {
      this.startEvolution(spell.id);
    });
    actionsSection.appendChild(upgradeBtn);

    const equipSection = document.createElement('div');
    equipSection.className = 'inspector-equip-section';

    const equipLabel = document.createElement('div');
    equipLabel.className = 'inspector-equip-label';
    equipLabel.textContent = 'EQUIP TO SLOT';

    const equipButtons = document.createElement('div');
    equipButtons.className = 'inspector-equip-buttons';

    for (const slotKey of ACTION_SLOT_KEYS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inspector-equip-btn';
      btn.textContent = slotKey;
      if (loadout[slotKey] === spell.id) {
        btn.classList.add('is-active-slot');
      }
      btn.addEventListener('click', () => {
        SpellInventoryManager.equipSpell(slotKey, spell.id);
        SpellInventoryManager.clearNewSpellTag(spell.id);
      });
      equipButtons.appendChild(btn);
    }

    equipSection.appendChild(equipLabel);
    equipSection.appendChild(equipButtons);

    panel.appendChild(heroWrap);
    panel.appendChild(header);
    panel.appendChild(telemetryGrid);
    panel.appendChild(tagsRow);
    panel.appendChild(desc);
    panel.appendChild(actionsSection);
    panel.appendChild(equipSection);
    this.inspectorPane.appendChild(panel);
  }

  private createSpellTile(
    spell: AbilitySchema,
    equippedSlotBySpellId: Map<string, ActionSlotKey>,
  ): HTMLElement {
    const archetypeColor = getArchetypeColor(spell.archetype, spell.visuals?.color);
    const tile = document.createElement('div');
    tile.className = 'spell-tile';
    tile.dataset.spellId = spell.id;
    tile.style.borderColor = archetypeColor;

    if (this.selectedSpellId === spell.id) {
      tile.classList.add('tile-selected');
    }

    const equippedSlot = equippedSlotBySpellId.get(spell.id);
    if (equippedSlot) {
      const badge = document.createElement('div');
      badge.className = 'tile-equipped-badge';
      badge.textContent = equippedSlot;
      tile.appendChild(badge);
    }

    if (SpellInventoryManager.isNewSpell(spell.id)) {
      const dot = document.createElement('div');
      dot.className = 'tile-new-dot';
      tile.appendChild(dot);
    }

    const iconWrap = document.createElement('div');
    iconWrap.className = 'tile-icon-wrap';
    iconWrap.appendChild(generateSpellIcon(spell, 56));
    tile.appendChild(iconWrap);

    tile.addEventListener('mouseenter', () => {
      this.hoveredSpellId = spell.id;
      if (!tile.classList.contains('tile-selected')) {
        tile.style.boxShadow = `0 0 8px ${archetypeColor}66`;
      }
      this.renderTacticalInspector();
    });

    tile.addEventListener('mouseleave', () => {
      this.hoveredSpellId = null;
      if (!tile.classList.contains('tile-selected')) {
        tile.style.boxShadow = '';
      }
      this.renderTacticalInspector();
    });

    tile.addEventListener('click', () => {
      this.selectedSpellId = spell.id;
      for (const sibling of this.spellGrid.querySelectorAll('.spell-tile')) {
        sibling.classList.remove('tile-selected');
        (sibling as HTMLElement).style.boxShadow = '';
      }
      tile.classList.add('tile-selected');
      tile.style.boxShadow = '';
      this.renderTacticalInspector();
    });

    tile.addEventListener('contextmenu', (e) => {
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

    attachVaultCardDrag(tile, spell.id);
    return tile;
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

  private renderBottomLoadoutBay(): void {
    this.bottomLoadoutBay.innerHTML = '';
    const equipped = SpellInventoryManager.getEquippedAbilities();
    const loadout = SpellInventoryManager.getLoadout();

    for (const key of ACTION_SLOT_KEYS) {
      const spell = equipped[key];
      const isEvolveSource =
        this.evolvingBaseSpellId !== null && loadout[key] === this.evolvingBaseSpellId;

      const slot = document.createElement('div');
      slot.className = 'bottom-slot drop-zone';
      slot.dataset.slotKey = key;
      if (isEvolveSource) {
        slot.classList.add('evolve-source');
      }

      const badge = document.createElement('span');
      badge.className = 'bottom-slot-badge';
      badge.textContent = key;
      slot.appendChild(badge);

      if (spell) {
        slot.appendChild(generateSpellIcon(spell, 48));

        const name = document.createElement('span');
        name.className = 'bottom-slot-name';
        name.textContent = spell.name;
        slot.appendChild(name);

        attachDockSlotDrag(slot, spell.id, key);
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showQuickEquipMenu(e.clientX, e.clientY, [
            {
              label: 'Unequip',
              onSelect: () => SpellInventoryManager.unequipSlot(key),
            },
          ]);
        });
      }

      attachInventoryDropZone(slot, key);
      this.bottomLoadoutBay.appendChild(slot);
    }
  }

  private renderSynthesisControls(): void {
    this.modeRow.innerHTML = '';
    this.modeRow.style.display = this.evolvingBaseSpellId ? 'none' : 'flex';
    const modes: { id: WorkshopMode; label: string }[] = [
      { id: 'FORGE_NEW', label: 'Forge New Spell' },
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
    this.categoryRow.style.display = 'none';

    if (this.evolvingBaseSpellId) {
      const baseSpell = SpellInventoryManager.getSpell(this.evolvingBaseSpellId);
      this.evolutionBanner.className = 'forge-evolving-banner';
      this.evolutionBanner.style.display = 'flex';
      this.evolutionBanner.innerHTML = '';

      const text = document.createElement('span');
      text.textContent = `UPGRADING BASE: [${baseSpell?.name ?? 'Unknown'}]`;

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'forge-evolving-cancel';
      cancel.textContent = 'Cancel';
      cancel.onclick = () => this.cancelEvolution();

      this.evolutionBanner.appendChild(text);
      this.evolutionBanner.appendChild(cancel);
    } else {
      this.evolutionBanner.className = '';
      this.evolutionBanner.style.display = 'none';
      this.evolutionBanner.innerHTML = '';
    }

    this.chipsRow.style.display =
      this.evolvingBaseSpellId || this.mode === 'PASSIVE_UPGRADES' ? 'none' : 'flex';

    if (this.mode === 'PASSIVE_UPGRADES') {
      this.promptInput.placeholder = 'Describe a passive upgrade... (e.g. "faster movement")';
    } else if (this.evolvingBaseSpellId) {
      this.promptInput.placeholder =
        "Describe mutation or upgrade (e.g. 'Add cluster bomblets on impact and reduce cooldown')...";
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
      if (this.shouldAutoStoreToVault()) {
        await this.storeSynthesizedCardsToVault();
      } else if (useStreaming && this.streamingSlots) {
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

  private shouldAutoStoreToVault(): boolean {
    return !this.intermissionMode && this.mode !== 'PASSIVE_UPGRADES';
  }

  private mintSpellId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `spell_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private clearVaultFilters(): void {
    this.vaultSearchQuery = '';
    if (this.vaultBuilt) {
      this.vaultSearchInput.value = '';
    }
    this.vaultRoleFilters.clear();
    this.vaultMetaFilters.clear();
    this.refreshVaultFilterChips();
  }

  private async storeSynthesizedCardsToVault(): Promise<void> {
    const storedSpells: AbilitySchema[] = [];
    const category = this.resolveSynthesisCategory();

    for (const card of this.cards) {
      if (card.type !== 'ACTIVE_ABILITY') continue;

      let ability: AbilitySchema;
      if (card.abilityPayload) {
        ability = structuredClone(card.abilityPayload);
      } else {
        ability = await compileAbilityPayload(card, this.evolutionContext?.baseAbility);
      }

      ability.id = this.mintSpellId();
      ability.name = card.title || ability.name;
      ability.tagline = card.tagline;
      ability.description = card.description;

      storedSpells.push(this.callbacks.onStoreSpell(ability));
    }

    this.cards = [];
    this.cardsContainer.innerHTML = '';
    this.streamingSlots = null;
    this.evolvingBaseSpellId = null;
    this.evolutionContext = null;
    this.mode = 'FORGE_NEW';
    this.selectedCategory = category;
    this.hoveredSpellId = null;
    this.clearVaultFilters();
    this.selectedSpellId = storedSpells[0]?.id ?? null;
    this.showSynthesisWarning('SPELL SYNTHESIZED AND STORED IN VAULT');
    this.setActiveTab('VAULT');
  }

  private resolveEquipTarget(card?: DraftCard): DraftSelection['slot'] | null {
    if (this.intermissionMode) return null;
    return card?.category ? CATEGORY_SLOT_MAP[card.category] : null;
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

        const targetSlot = card.category ? CATEGORY_SLOT_MAP[card.category] : null;

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
