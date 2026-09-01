import type { ActionSlotKey, CardRarity } from '../types/cards';

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
export const STYLE_ID = 'luna-workshop-styles';

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
  `;
  document.head.appendChild(style);
}

export function btnStyle(primary = false): string {
  return `
    padding:7px 12px;border-radius:8px;cursor:pointer;font-size:12px;
    border:1px solid ${primary ? '#00ccff' : 'rgba(255,255,255,0.15)'};
    background:${primary ? 'rgba(0,200,255,0.2)' : 'rgba(255,255,255,0.05)'};
    color:#e0e0e8;
  `;
}

export function btnStyleRarity(rarity: CardRarity): string {
  const theme = RARITY_BTN[rarity];
  return `
    padding:7px 12px;border-radius:8px;cursor:pointer;font-size:12px;
    border:1px solid ${theme.border};background:${theme.bg};color:#e0e0e8;
  `;
}

export function chipStyle(active = false): string {
  return `
    padding:3px 9px;border-radius:999px;cursor:pointer;font-size:11px;
    border:1px solid ${active ? '#00ccff' : 'rgba(255,255,255,0.14)'};
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
  label.style.cssText = 'font-size:11px;color:#ccc;margin-bottom:4px;';

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
