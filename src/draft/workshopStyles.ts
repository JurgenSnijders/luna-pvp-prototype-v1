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
export const STYLE_ID = 'luna-workshop-styles-v9';

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
      height: 100%;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
      gap: 12px;
    }

    .workspace-split {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      gap: 16px;
      overflow: hidden;
    }

    .workspace-main {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    .workspace-main .workspace-content {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }

    .workspace-inspector-pane {
      flex: 0 0 320px;
      display: flex;
      flex-direction: column;
      background: rgba(10, 14, 26, 0.75);
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      border-radius: 4px;
      padding: 16px;
      box-sizing: border-box;
      overflow-y: auto;
    }

    .inspector-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 13px;
      color: var(--retro-text-muted, #6d8896);
      line-height: 1.4;
      padding: 16px;
    }

    .inspector-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 12px;
    }

    .inspector-hero-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 12px;
      background: rgba(4, 6, 12, 0.85);
      border: 1.5px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      border-radius: 4px;
      box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.8);
    }

    .inspector-header {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .inspector-title {
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 16px;
      color: #ffffff;
      text-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
      word-break: break-word;
    }

    .inspector-archetype-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 2px;
      border: 1px solid currentColor;
      width: fit-content;
    }

    .inspector-telemetry-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: rgba(8, 12, 22, 0.5);
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
    }

    .telemetry-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .telemetry-label {
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 9px;
      color: var(--retro-text-muted, #6a7796);
      text-transform: uppercase;
    }

    .telemetry-value {
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 12px;
      color: var(--retro-text-primary, #e0f8ff);
    }

    .inspector-tags-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .inspector-action-pill {
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 10px;
      padding: 2px 6px;
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      background: rgba(0, 229, 255, 0.08);
      color: var(--retro-neon-cyan, #00e5ff);
      border-radius: 2px;
    }

    .inspector-desc {
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 11px;
      line-height: 1.4;
      color: var(--retro-text-secondary, #9ba8c7);
      flex: 1 1 auto;
      overflow-y: auto;
    }

    .inspector-actions-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-top: 1px solid var(--retro-border-subtle);
      padding-top: 10px;
      margin-top: 8px;
    }

    .inspector-upgrade-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 12px;
      font-family: Fixedsys, monospace;
      font-size: 11px;
      background: rgba(0, 229, 255, 0.1);
      border: 1px solid var(--retro-neon-cyan);
      color: var(--retro-neon-cyan);
      border-radius: 3px;
      cursor: pointer;
      text-transform: uppercase;
      transition: all 0.15s ease;
      box-shadow: 0 0 6px rgba(0, 229, 255, 0.2);
    }

    .inspector-upgrade-btn:hover {
      background: rgba(0, 229, 255, 0.25);
      color: #ffffff;
      box-shadow: 0 0 12px rgba(0, 229, 255, 0.5);
      transform: translateY(-1px);
    }

    .forge-evolving-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 12px;
      background: rgba(255, 170, 0, 0.1);
      border: 1px solid #ffaa00;
      border-radius: 4px;
      margin-bottom: 12px;
      font-family: Fixedsys, monospace;
      font-size: 11px;
      color: #ffaa00;
    }

    .forge-evolving-cancel {
      margin-left: auto;
      background: transparent;
      border: none;
      color: var(--retro-text-muted);
      cursor: pointer;
      font-family: Fixedsys, monospace;
      font-size: 10px;
    }
    .forge-evolving-cancel:hover {
      color: #ffffff;
    }

    .inspector-equip-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-top: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      padding-top: 10px;
      margin-top: auto;
      flex-shrink: 0;
    }

    .inspector-equip-label {
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 10px;
      color: var(--retro-text-muted, #6d8896);
      text-transform: uppercase;
    }

    .inspector-equip-buttons {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
    }

    .inspector-equip-btn {
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 10px;
      padding: 6px 2px;
      background: var(--retro-panel-bg, rgba(8, 10, 20, 0.85));
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      color: var(--retro-text-primary, #e0f8ff);
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.12s ease;
      text-align: center;
    }

    .inspector-equip-btn:hover {
      border-color: var(--retro-neon-cyan, #00e5ff);
      background: rgba(0, 229, 255, 0.15);
      color: #ffffff;
    }

    .inspector-equip-btn.is-active-slot {
      border-color: var(--retro-neon-cyan, #00e5ff);
      background: rgba(0, 229, 255, 0.25);
      box-shadow: 0 0 6px rgba(0, 229, 255, 0.4);
      color: #ffffff;
    }

    .bottom-loadout-bay {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 10px 16px;
      background: rgba(6, 9, 18, 0.85);
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      border-radius: 6px;
      box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.6);
    }

    .bottom-slot {
      position: relative;
      width: 64px;
      height: 64px;
      background: var(--retro-panel-bg, rgba(8, 10, 20, 0.85));
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
    }

    .bottom-slot:hover {
      border-color: var(--retro-neon-cyan, #00e5ff);
      transform: translateY(-2px);
    }

    .bottom-slot.is-dragging {
      cursor: grabbing;
    }

    .bottom-slot-badge {
      position: absolute;
      top: 3px;
      left: 4px;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 11px;
      color: var(--retro-text-muted, #6d8896);
      z-index: 2;
      pointer-events: none;
    }

    .bottom-slot-name {
      position: absolute;
      bottom: 2px;
      left: 2px;
      right: 2px;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 9px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--retro-text-primary, #e0f8ff);
      z-index: 2;
      pointer-events: none;
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

    .forge-root {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      gap: 0;
    }

    .forge-cards {
      flex: 1 1 auto;
      min-height: 280px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      align-items: stretch;
      margin-top: 16px;
    }

    .forge-card-redesign {
      display: flex;
      flex-direction: column;
      background: rgba(6, 9, 18, 0.9);
      border: 1.5px solid var(--card-border-color, var(--retro-border-subtle));
      border-radius: 6px;
      padding: 14px;
      gap: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .forge-card-redesign:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8), 0 0 10px var(--card-glow-color, rgba(0, 229, 255, 0.2));
    }

    .forge-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .forge-card-rarity {
      font-family: Fixedsys, monospace;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .forge-card-archetype {
      font-family: Fixedsys, monospace;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 2px;
      border: 1px solid currentColor;
    }

    .forge-card-glyph-frame {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px;
      background: rgba(4, 6, 12, 0.85);
      border: 1px solid var(--retro-border-subtle);
      border-radius: 4px;
    }

    .forge-card-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .forge-card-title {
      font-family: Fixedsys, monospace;
      font-size: 15px;
      color: #ffffff;
    }

    .forge-card-tagline {
      font-family: Fixedsys, monospace;
      font-size: 11px;
      color: var(--retro-text-muted);
    }

    .forge-card-desc {
      font-family: Fixedsys, monospace;
      font-size: 11px;
      line-height: 1.35;
      color: var(--retro-text-secondary, #9ba8c7);
      min-height: 44px;
    }

    .forge-card-telemetry {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: rgba(10, 14, 26, 0.6);
      border: 1px solid var(--retro-border-subtle);
      border-radius: 4px;
      padding: 8px;
    }

    .telemetry-row-full {
      grid-column: 1 / -1;
    }

    .telemetry-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .telemetry-k {
      font-family: Fixedsys, monospace;
      font-size: 9px;
      color: var(--retro-text-muted);
      text-transform: uppercase;
    }

    .telemetry-v {
      font-family: Fixedsys, monospace;
      font-size: 11px;
      color: var(--retro-text-primary);
    }

    .telemetry-v.highlight-repulse {
      color: #ffaa00;
    }

    .telemetry-v.highlight-instability {
      color: #ff6644;
    }

    .forge-card-status-block {
      background: rgba(0, 229, 255, 0.05);
      border: 1px dashed rgba(0, 229, 255, 0.25);
      padding: 6px 8px;
      border-radius: 3px;
      font-family: Fixedsys, monospace;
      font-size: 10px;
      color: var(--retro-neon-cyan);
    }

    .forge-card-footer {
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 8px;
    }

    .forge-stored-indicator {
      font-family: Fixedsys, monospace;
      font-size: 10px;
      color: var(--retro-neon-magenta);
      text-align: center;
      letter-spacing: 0.5px;
    }

    .forge-claim-btn {
      width: 100%;
      padding: 8px;
      font-family: Fixedsys, monospace;
      font-size: 11px;
      background: rgba(0, 229, 255, 0.15);
      border: 1px solid var(--retro-neon-cyan);
      color: #ffffff;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .forge-claim-btn:hover {
      background: rgba(0, 229, 255, 0.3);
      box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
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

    .vault-sort-select {
      flex-shrink: 0;
      padding: 10px 12px;
      border-radius: 4px;
      border: 1px solid var(--retro-border-subtle, rgba(0, 229, 255, 0.2));
      background: var(--retro-panel-bg-opaque, #0a0d18);
      color: var(--retro-text-primary, #e0f8ff);
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 13px;
      cursor: pointer;
      outline: none;
    }

    .vault-sort-select:focus {
      border-color: var(--retro-neon-cyan, #00e5ff);
      box-shadow: var(--retro-glow-cyan, 0 0 8px rgba(0, 229, 255, 0.6));
    }

    .spell-grid-square {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 10px;
      padding: 8px 4px 16px 4px;
      overflow-y: auto;
    }

    .spell-tile {
      position: relative;
      width: 72px;
      height: 72px;
      box-sizing: border-box;
      background: var(--retro-panel-bg, #080c18);
      background-image:
        linear-gradient(rgba(0, 229, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 229, 255, 0.03) 1px, transparent 1px);
      background-size: 8px 8px;
      border: 1.5px solid var(--retro-border-subtle, #1a2236);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
      user-select: none;
    }

    .spell-tile:hover,
    .spell-tile.tile-selected {
      transform: scale(1.06);
      z-index: 2;
    }

    .spell-tile.tile-selected {
      border-color: #ffffff !important;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.4);
    }

    .spell-tile.is-dragging {
      opacity: 0.4;
      transform: scale(0.98);
      cursor: grabbing;
    }

    .tile-icon-wrap {
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .tile-equipped-badge {
      position: absolute;
      top: 2px;
      left: 2px;
      padding: 1px 3px;
      font-family: 'Fixedsys', 'FixedSys', 'Courier New', monospace;
      font-size: 9px;
      line-height: 1;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid var(--retro-neon-cyan, #00e5ff);
      color: var(--retro-neon-cyan, #00e5ff);
      border-radius: 2px;
      z-index: 3;
      pointer-events: none;
    }

    .tile-new-dot {
      position: absolute;
      top: 3px;
      right: 3px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--retro-neon-magenta, #ff007f);
      box-shadow: 0 0 6px var(--retro-neon-magenta, #ff007f);
      animation: newBadgePulse 1s ease-in-out infinite alternate;
      z-index: 3;
      pointer-events: none;
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

    .card-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--retro-text-primary, #e0f8ff);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
