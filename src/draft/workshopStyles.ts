import type { SpellRole } from '../game/spellRoles';
import type { ActionSlotKey, CardRarity } from '../types/cards';
import { FONTS, RETRO_COLORS, RETRO_GLOW } from '../ui/tokens';

export type BadgeKind = 'trajectory' | 'field' | 'trigger' | 'cast';

export const RARITY_COLORS: Record<CardRarity, string> = {
  COMMON: '#888888',
  RARE: '#00ccff',
  EPIC: '#aa44ff',
  CHAOTIC: '#ff8800',
};

export const RARITY_BTN: Record<CardRarity, { border: string; bg: string }> = {
  COMMON: { border: '#64748b', bg: 'rgba(100,116,139,0.25)' },
  RARE: { border: '#00ccff', bg: 'rgba(0,200,255,0.22)' },
  EPIC: { border: '#aa44ff', bg: 'rgba(170,68,255,0.22)' },
  CHAOTIC: { border: '#ff8800', bg: 'rgba(255,136,0,0.22)' },
};

export const SLOT_ACCENT: Record<ActionSlotKey, string> = {
  LMB: '#00ccff',
  RMB: '#00ccff',
  Q: '#f0c040',
  E: '#aa44ff',
  SPACE: '#34d399',
};

export const POWER_MAX = 300;
export const PASSIVE_POWER_MAX = 45;
export const STYLE_ID = 'luna-workshop-styles-v4';

export const SUGGEST_CHIPS = [
  '+ Bouncing',
  '+ Black Hole on Hit',
  '+ Ice Slipstream',
  '+ Cluster Bomblets',
];

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes evolvePulse {
      0%, 100% { box-shadow: 0 0 0 1px rgba(0,200,255,0.5), 0 0 12px rgba(0,200,255,0.25); }
      50% { box-shadow: 0 0 0 2px rgba(0,200,255,0.9), 0 0 20px rgba(0,200,255,0.45); }
    }
    @keyframes forgePulse {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 1; }
    }
    .evolve-source { animation: evolvePulse 1.6s ease-in-out infinite; }

    .workshop-container {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      gap: 16px;
    }

    .arsenal-dock-section {
      flex: 0 0 auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .arsenal-dock-section .loadout-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
    }

    .workspace-tabs {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      padding-bottom: 8px;
    }

    .workspace-tab {
      padding: 8px 16px;
      border-radius: 4px 4px 0 0;
      cursor: pointer;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.06em;
      border: 1px solid transparent;
      border-bottom: none;
      background: rgba(255, 255, 255, 0.03);
      color: var(--retro-text-muted, #6d8896);
      transition: color 0.15s, border-color 0.15s, box-shadow 0.15s;
    }

    .workspace-tab:hover {
      color: var(--retro-text-primary, #e0f8ff);
      background: rgba(0, 200, 255, 0.06);
    }

    .workspace-tab.active {
      color: var(--retro-neon-cyan, #00e5ff);
      border-color: var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      background: rgba(0, 200, 255, 0.1);
      box-shadow: var(--retro-glow-cyan, 0 0 8px rgba(0, 229, 255, 0.6));
    }

    .workspace-content {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }

    .forge-root {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      gap: 0;
    }

    .forge-cards {
      flex: 1 1 auto;
      min-height: 280px;
      overflow: hidden;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      align-items: stretch;
    }

    .vault-toolbar {
      margin-bottom: 12px;
      flex-shrink: 0;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .vault-filter-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
      flex-shrink: 0;
    }

    .vault-search {
      flex: 1;
      width: auto;
      padding: 10px 12px;
      border-radius: 4px;
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      background: var(--retro-panel-bg-opaque, #0a0d18);
      color: var(--retro-text-primary, #e0f8ff);
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 14px;
      box-sizing: border-box;
      outline: none;
    }

    .vault-search:focus {
      border-color: var(--retro-neon-cyan, #00e5ff);
      box-shadow: var(--retro-glow-cyan, 0 0 8px rgba(0, 229, 255, 0.6));
    }

    .spell-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
    }

    .inventory-card {
      position: relative;
      display: flex;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      border-left-width: 3px;
      background: var(--retro-panel-bg, rgba(8, 10, 20, 0.85));
      border-radius: 4px;
      cursor: grab;
      transition: transform 0.1s, border-color 0.15s, box-shadow 0.15s, opacity 0.1s;
      align-items: center;
    }

    .inventory-card:hover {
      border-color: var(--retro-neon-cyan, #00e5ff);
      box-shadow: var(--retro-glow-cyan, 0 0 8px rgba(0, 229, 255, 0.6));
      transform: translateY(-1px);
    }

    .inventory-card.is-dragging {
      opacity: 0.4;
      transform: scale(0.98);
      cursor: grabbing;
    }

    .is-dragging {
      opacity: 0.4;
      transform: scale(0.98);
      cursor: grabbing;
    }

    .drop-zone {
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, transform 0.15s ease;
    }

    .drop-zone.drag-over {
      border-color: var(--retro-neon-cyan, #00e5ff) !important;
      box-shadow: var(--retro-glow-cyan, 0 0 8px rgba(0, 229, 255, 0.6)) !important;
      background: rgba(0, 229, 255, 0.1) !important;
      transform: scale(1.05);
    }

    .card-icon-container {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }

    .card-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--retro-text-primary, #e0f8ff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-archetype {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .card-stats {
      font-size: 12px;
      color: var(--retro-text-muted, #6d8896);
    }

    .dock-icon-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 0;
    }

    .dock-icon {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .action-slot.drop-zone {
      cursor: pointer;
    }

    .action-slot.drop-zone[draggable='true'] {
      cursor: grab;
    }

    .action-slot.is-dragging {
      cursor: grabbing;
    }

    @keyframes newBadgePulse {
      0%, 100% {
        box-shadow: 0 0 6px rgba(255, 0, 127, 0.4);
        opacity: 0.85;
      }
      50% {
        box-shadow: 0 0 12px rgba(255, 0, 127, 0.85);
        opacity: 1;
      }
    }

    .card-new-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      font-size: 10px;
      border: 1px solid var(--retro-neon-magenta, #ff007f);
      color: var(--retro-neon-magenta, #ff007f);
      text-shadow: var(--retro-glow-magenta, 0 0 8px rgba(255, 0, 127, 0.6));
      background: rgba(255, 0, 127, 0.15);
      padding: 2px 5px;
      border-radius: 2px;
      text-transform: uppercase;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-weight: 700;
      letter-spacing: 0.06em;
      pointer-events: none;
      animation: newBadgePulse 1.4s ease-in-out infinite;
      z-index: 2;
    }

    .quick-equip-menu {
      position: fixed;
      z-index: 10100;
      background: var(--retro-panel-bg, rgba(8, 10, 20, 0.85));
      border: 1px solid var(--retro-neon-cyan, #00e5ff);
      box-shadow: var(--retro-glow-cyan, 0 0 8px rgba(0, 229, 255, 0.6));
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      border-radius: 3px;
      min-width: 140px;
    }

    .quick-equip-item {
      font-size: 12px;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      padding: 4px 8px;
      color: var(--retro-text-primary, #e0f8ff);
      cursor: pointer;
      background: transparent;
      border: none;
      text-align: left;
      transition: background 0.1s;
      border-radius: 2px;
    }

    .quick-equip-item:hover {
      background: rgba(0, 229, 255, 0.2);
      color: #ffffff;
    }

    .vault-btn-reset {
      flex-shrink: 0;
      font-size: 12px;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      padding: 10px 12px;
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      border-radius: 4px;
      background: rgba(255, 68, 68, 0.1);
      color: #ff6666;
      cursor: pointer;
      white-space: nowrap;
    }

    .vault-btn-reset:hover {
      border-color: #ff4444;
      background: rgba(255, 68, 68, 0.2);
    }
  `;
  document.head.appendChild(style);
}

export interface QuickEquipMenuItem {
  label: string;
  onSelect: () => void;
}

let activeQuickEquipMenu: HTMLElement | null = null;
let quickEquipDismissMouseHandler: ((e: MouseEvent) => void) | null = null;
let quickEquipDismissKeyHandler: ((e: KeyboardEvent) => void) | null = null;

export function dismissQuickEquipMenu(): void {
  if (activeQuickEquipMenu) {
    activeQuickEquipMenu.remove();
    activeQuickEquipMenu = null;
  }
  if (quickEquipDismissMouseHandler) {
    document.removeEventListener('mousedown', quickEquipDismissMouseHandler);
    quickEquipDismissMouseHandler = null;
  }
  if (quickEquipDismissKeyHandler) {
    document.removeEventListener('keydown', quickEquipDismissKeyHandler);
    quickEquipDismissKeyHandler = null;
  }
}

export function showQuickEquipMenu(x: number, y: number, items: QuickEquipMenuItem[]): void {
  dismissQuickEquipMenu();
  if (items.length === 0) return;

  const menu = document.createElement('div');
  menu.className = 'quick-equip-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-equip-item';
    btn.textContent = item.label;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.onSelect();
      dismissQuickEquipMenu();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeQuickEquipMenu = menu;

  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - rect.width - 8);
  }
  if (top + rect.height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - rect.height - 8);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  quickEquipDismissMouseHandler = (e: MouseEvent) => {
    if (menu.contains(e.target as Node)) return;
    dismissQuickEquipMenu();
  };
  quickEquipDismissKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismissQuickEquipMenu();
  };

  document.addEventListener('mousedown', quickEquipDismissMouseHandler);
  document.addEventListener('keydown', quickEquipDismissKeyHandler);
}

export function btnStyle(primary = false): string {
  return `
    padding:7px 12px;border-radius:4px;cursor:pointer;font-size:${FONTS.size.body};
    font-family:${FONTS.mono};
    border:1px solid ${primary ? RETRO_COLORS.neonCyan : RETRO_COLORS.borderSubtle};
    background:${primary ? 'rgba(0,200,255,0.2)' : 'rgba(255,255,255,0.05)'};
    color:${RETRO_COLORS.textPrimary};
    ${primary ? `text-shadow:${RETRO_GLOW.cyan};` : ''}
  `;
}

export function btnStyleRarity(rarity: CardRarity): string {
  const theme = RARITY_BTN[rarity];
  return `
    padding:7px 12px;border-radius:4px;cursor:pointer;font-size:${FONTS.size.body};
    font-family:${FONTS.mono};
    border:1px solid ${theme.border};background:${theme.bg};color:${RETRO_COLORS.textPrimary};
  `;
}

export const SPELL_ROLE_COLORS: Record<SpellRole, { bg: string; text: string }> = {
  MOBILITY: { bg: 'rgba(52,211,153,0.15)', text: '#6ee7b7' },
  DAMAGE: { bg: 'rgba(248,113,113,0.15)', text: '#fca5a5' },
  HEALING: { bg: 'rgba(74,222,128,0.15)', text: '#86efac' },
  CC: { bg: 'rgba(245,158,11,0.15)', text: '#fcd34d' },
  DEFENSE: { bg: 'rgba(96,165,250,0.15)', text: '#93c5fd' },
  SUMMON: { bg: 'rgba(192,132,252,0.15)', text: '#d8b4fe' },
  TERRAIN: { bg: 'rgba(251,146,60,0.15)', text: '#fdba74' },
};

export function roleBadgeStyle(role: SpellRole): string {
  const colors = SPELL_ROLE_COLORS[role];
  return `
    font-size:${FONTS.size.badge};line-height:1.2;padding:2px 6px;border-radius:2px;
    font-family:${FONTS.mono};letter-spacing:0.04em;
    border:1px solid ${RETRO_COLORS.borderSubtle};
    background:${colors.bg};color:${colors.text};white-space:nowrap;
  `;
}

export function chipStyle(active = false): string {
  return `
    padding:3px 6px;border-radius:2px;cursor:pointer;font-size:${FONTS.size.badge};
    font-family:${FONTS.mono};
    border:1px solid ${active ? RETRO_COLORS.neonCyan : RETRO_COLORS.borderSubtle};
    background:${active ? 'rgba(0,200,255,0.22)' : 'rgba(255,255,255,0.04)'};
    color:${active ? '#dff' : '#bbb'};
  `;
}

export function renderPowerBar(
  cost: number,
  rarity: CardRarity,
  isPassive = false,
): HTMLElement {
  const max = isPassive ? PASSIVE_POWER_MAX : POWER_MAX;
  const pct = Math.min(100, Math.round((cost / max) * 100));
  const color = RARITY_COLORS[rarity];

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:10px;';

  const label = document.createElement('div');
  label.textContent = `⚡ Power: ${Math.round(cost)}`;
  label.style.cssText = `font-size:${FONTS.size.sm};color:#ccc;margin-bottom:4px;`;

  const track = document.createElement('div');
  track.style.cssText =
    'height:4px;border-radius:2px;background:rgba(255,255,255,0.08);overflow:hidden;';

  const fill = document.createElement('div');
  fill.style.cssText = `
    height:100%;width:${pct}%;border-radius:2px;
    background:${color};box-shadow:0 0 6px ${color}66;
    transition:width 0.2s ease;
  `;

  track.appendChild(fill);
  wrap.appendChild(label);
  wrap.appendChild(track);
  return wrap;
}
