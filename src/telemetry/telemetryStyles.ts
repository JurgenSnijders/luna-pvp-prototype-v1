import type { CombatEvent, VectorTelemetry } from '../types/telemetry';
import { EVENT_TYPE_COLORS } from '../types/telemetry';
import { FONTS, RETRO_COLORS } from '../ui/tokens';

export const TELEMETRY_STYLE_ID = 'luna-telemetry-styles';

export function injectTelemetryStyles(): void {
  if (document.getElementById(TELEMETRY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TELEMETRY_STYLE_ID;
  style.textContent = `
    .telemetry-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: none; flex-direction: column;
      background: ${RETRO_COLORS.panelBg};
      backdrop-filter: blur(16px);
      color: ${RETRO_COLORS.textPrimary};
      font-family: ${FONTS.mono};
      pointer-events: auto;
    }
    .telemetry-overlay.open { display: flex; }
    .telemetry-header {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 14px 18px;
      border-bottom: 1px solid ${RETRO_COLORS.borderSubtle};
      background: ${RETRO_COLORS.panelBgOpaque};
    }
    .telemetry-title {
      font-size: 15px; font-weight: 700; letter-spacing: 0.08em;
      color: ${RETRO_COLORS.textPrimary}; margin-right: 8px;
    }
    .telemetry-badge-count {
      font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px;
      background: rgba(0, 229, 255, 0.15); color: ${RETRO_COLORS.neonCyan};
      border: 1px solid ${RETRO_COLORS.borderSubtle};
    }
    .telemetry-live-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; box-shadow: 0 0 8px #22c55e;
      animation: telemetryPulse 1.2s ease-in-out infinite;
    }
    .telemetry-live-dot.paused {
      background: ${RETRO_COLORS.textMuted}; box-shadow: none; animation: none;
    }
    @keyframes telemetryPulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
    .telemetry-pill-group { display: flex; flex-wrap: wrap; gap: 6px; }
    .telemetry-pill {
      padding: 5px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
      letter-spacing: 0.04em; cursor: pointer; border: 1px solid ${RETRO_COLORS.borderSubtle};
      background: ${RETRO_COLORS.panelBg}; color: ${RETRO_COLORS.textMuted};
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .telemetry-pill:hover { background: ${RETRO_COLORS.panelBgOpaque}; color: ${RETRO_COLORS.textPrimary}; }
    .telemetry-pill.active {
      background: rgba(0, 229, 255, 0.15); border-color: ${RETRO_COLORS.borderNeon}; color: ${RETRO_COLORS.neonCyan};
    }
    .telemetry-search {
      flex: 1; min-width: 160px; max-width: 280px;
      padding: 6px 10px; border-radius: 4px; font-size: 12px;
      border: 1px solid ${RETRO_COLORS.borderSubtle}; background: rgba(0,0,0,0.35);
      color: ${RETRO_COLORS.textPrimary}; outline: none; font-family: ${FONTS.mono};
    }
    .telemetry-search:focus { border-color: rgba(0, 229, 255, 0.5); }
    .telemetry-actions { display: flex; gap: 6px; margin-left: auto; }
    .telemetry-btn {
      padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600;
      cursor: pointer; border: 1px solid ${RETRO_COLORS.borderSubtle};
      background: ${RETRO_COLORS.panelBg}; color: ${RETRO_COLORS.textPrimary};
      font-family: ${FONTS.mono};
    }
    .telemetry-btn:hover { background: ${RETRO_COLORS.panelBgOpaque}; }
    .telemetry-btn.primary {
      border-color: ${RETRO_COLORS.borderNeon}; background: rgba(0, 229, 255, 0.12); color: ${RETRO_COLORS.neonCyan};
    }
    .telemetry-table-wrap {
      flex: 1; overflow: auto; padding: 0 12px 12px;
    }
    .telemetry-table {
      width: 100%; border-collapse: collapse; font-size: 12px;
    }
    .telemetry-table thead th {
      position: sticky; top: 0; z-index: 1;
      text-align: left; padding: 10px 8px;
      background: ${RETRO_COLORS.panelBgOpaque};
      border-bottom: 1px solid ${RETRO_COLORS.borderSubtle};
      color: ${RETRO_COLORS.textMuted}; font-weight: 600; font-size: 10px;
      letter-spacing: 0.06em; text-transform: uppercase;
    }
    .telemetry-row {
      cursor: pointer; border-bottom: 1px solid ${RETRO_COLORS.borderSubtle};
      transition: background 0.1s;
    }
    .telemetry-row:hover { background: ${RETRO_COLORS.panelBg}; }
    .telemetry-row:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
    .telemetry-row:nth-child(even):hover { background: ${RETRO_COLORS.panelBg}; }
    .telemetry-row.expanded { background: rgba(0, 229, 255, 0.06); }
    .telemetry-row td { padding: 8px; vertical-align: top; }
    .telemetry-time { font-variant-numeric: tabular-nums; }
    .telemetry-time-sub { font-size: 10px; color: ${RETRO_COLORS.textMuted}; }
    .telemetry-endpoint { font-size: 11px; color: ${RETRO_COLORS.textPrimary}; }
    .telemetry-params { font-size: 11px; color: ${RETRO_COLORS.textMuted}; max-width: 280px; }
    .telemetry-delta { font-size: 11px; color: #a5b4fc; font-variant-numeric: tabular-nums; }
    .telemetry-instab { font-size: 11px; color: #f97316; }
    .telemetry-badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    }
    .telemetry-badge--cast { background: rgba(0,229,255,0.15); color: #00e5ff; border: 1px solid rgba(0,229,255,0.35); }
    .telemetry-badge--impulse { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.35); }
    .telemetry-badge--field { background: rgba(168,85,247,0.15); color: #a855f7; border: 1px solid rgba(168,85,247,0.35); }
    .telemetry-badge--ram { background: rgba(249,115,22,0.15); color: #f97316; border: 1px solid rgba(249,115,22,0.35); }
    .telemetry-badge--slam { background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.35); }
    .telemetry-vec {
      font-family: ${FONTS.mono};
      font-size: 11px; color: ${RETRO_COLORS.textMuted};
    }
    .telemetry-detail td {
      padding: 0 8px 12px 8px;
      background: ${RETRO_COLORS.panelBgOpaque};
      border-bottom: 1px solid ${RETRO_COLORS.borderSubtle};
    }
    .telemetry-detail pre {
      margin: 0; padding: 10px; border-radius: 4px;
      background: ${RETRO_COLORS.panelBgOpaque}; border: 1px solid ${RETRO_COLORS.borderSubtle};
      font-size: 11px; color: ${RETRO_COLORS.textPrimary}; overflow-x: auto;
      font-family: ${FONTS.mono};
    }
    .telemetry-empty {
      padding: 48px; text-align: center; color: ${RETRO_COLORS.textMuted}; font-size: 14px;
    }
  `;
  document.head.appendChild(style);
}

const BADGE_CLASS: Record<CombatEvent['type'], string> = {
  ABILITY_CAST: 'telemetry-badge--cast',
  IMPULSE_APPLIED: 'telemetry-badge--impulse',
  FIELD_ACCEL_TICK: 'telemetry-badge--field',
  RAM_COLLISION: 'telemetry-badge--ram',
  SLAM_COLLISION: 'telemetry-badge--slam',
};

export function createTypeBadge(type: CombatEvent['type'], label: string): HTMLElement {
  const span = document.createElement('span');
  span.className = `telemetry-badge ${BADGE_CLASS[type]}`;
  span.textContent = label;
  span.style.color = EVENT_TYPE_COLORS[type];
  return span;
}

export function createPill(label: string, active: boolean): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `telemetry-pill${active ? ' active' : ''}`;
  btn.textContent = label;
  return btn;
}

export function createActionBtn(label: string, primary = false): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `telemetry-btn${primary ? ' primary' : ''}`;
  btn.textContent = label;
  return btn;
}

export function vecSpan(v: VectorTelemetry): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'telemetry-vec';
  span.textContent = `(${v.x.toFixed(2)}, ${v.y.toFixed(2)} | ${v.mag.toFixed(2)})`;
  return span;
}
