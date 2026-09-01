import type { CombatEvent, VectorTelemetry } from '../types/telemetry';
import { EVENT_TYPE_COLORS } from '../types/telemetry';

export const TELEMETRY_STYLE_ID = 'luna-telemetry-styles';

export function injectTelemetryStyles(): void {
  if (document.getElementById(TELEMETRY_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TELEMETRY_STYLE_ID;
  style.textContent = `
    .telemetry-overlay {
      position: fixed; inset: 0; z-index: 9999;
      display: none; flex-direction: column;
      background: rgba(6, 8, 16, 0.94);
      backdrop-filter: blur(16px);
      color: #e2e8f0;
      font-family: system-ui, -apple-system, sans-serif;
      pointer-events: auto;
    }
    .telemetry-overlay.open { display: flex; }
    .telemetry-header {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 14px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(10, 12, 24, 0.6);
    }
    .telemetry-title {
      font-size: 15px; font-weight: 700; letter-spacing: 0.08em;
      color: #f8fafc; margin-right: 8px;
    }
    .telemetry-badge-count {
      font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px;
      background: rgba(0, 229, 255, 0.15); color: #00e5ff;
      border: 1px solid rgba(0, 229, 255, 0.35);
    }
    .telemetry-live-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #22c55e; box-shadow: 0 0 8px #22c55e;
      animation: telemetryPulse 1.2s ease-in-out infinite;
    }
    .telemetry-live-dot.paused {
      background: #64748b; box-shadow: none; animation: none;
    }
    @keyframes telemetryPulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
    .telemetry-pill-group { display: flex; flex-wrap: wrap; gap: 6px; }
    .telemetry-pill {
      padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
      letter-spacing: 0.04em; cursor: pointer; border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04); color: #94a3b8;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .telemetry-pill:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
    .telemetry-pill.active {
      background: rgba(0, 229, 255, 0.15); border-color: rgba(0, 229, 255, 0.45); color: #00e5ff;
    }
    .telemetry-search {
      flex: 1; min-width: 160px; max-width: 280px;
      padding: 6px 10px; border-radius: 6px; font-size: 12px;
      border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.35);
      color: #e2e8f0; outline: none;
    }
    .telemetry-search:focus { border-color: rgba(0, 229, 255, 0.5); }
    .telemetry-actions { display: flex; gap: 6px; margin-left: auto; }
    .telemetry-btn {
      padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
      cursor: pointer; border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.05); color: #cbd5e1;
    }
    .telemetry-btn:hover { background: rgba(255,255,255,0.1); }
    .telemetry-btn.primary {
      border-color: rgba(0, 229, 255, 0.45); background: rgba(0, 229, 255, 0.12); color: #00e5ff;
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
      background: rgba(10, 12, 24, 0.95);
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      color: #94a3b8; font-weight: 600; font-size: 10px;
      letter-spacing: 0.06em; text-transform: uppercase;
    }
    .telemetry-row {
      cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      transition: background 0.1s;
    }
    .telemetry-row:hover { background: rgba(255, 255, 255, 0.04); }
    .telemetry-row:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
    .telemetry-row:nth-child(even):hover { background: rgba(255, 255, 255, 0.06); }
    .telemetry-row.expanded { background: rgba(0, 229, 255, 0.06); }
    .telemetry-row td { padding: 8px; vertical-align: top; }
    .telemetry-time { font-variant-numeric: tabular-nums; }
    .telemetry-time-sub { font-size: 10px; color: #64748b; }
    .telemetry-endpoint { font-size: 11px; color: #cbd5e1; }
    .telemetry-params { font-size: 11px; color: #94a3b8; max-width: 280px; }
    .telemetry-delta { font-size: 11px; color: #a5b4fc; font-variant-numeric: tabular-nums; }
    .telemetry-instab { font-size: 11px; color: #f97316; }
    .telemetry-badge {
      display: inline-block; padding: 2px 8px; border-radius: 999px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    }
    .telemetry-badge--cast { background: rgba(0,229,255,0.15); color: #00e5ff; border: 1px solid rgba(0,229,255,0.35); }
    .telemetry-badge--impulse { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.35); }
    .telemetry-badge--field { background: rgba(168,85,247,0.15); color: #a855f7; border: 1px solid rgba(168,85,247,0.35); }
    .telemetry-badge--ram { background: rgba(249,115,22,0.15); color: #f97316; border: 1px solid rgba(249,115,22,0.35); }
    .telemetry-badge--slam { background: rgba(244,63,94,0.15); color: #f43f5e; border: 1px solid rgba(244,63,94,0.35); }
    .telemetry-vec {
      font-family: ui-monospace, 'Cascadia Code', monospace;
      font-size: 11px; color: #94a3b8;
    }
    .telemetry-detail td {
      padding: 0 8px 12px 8px;
      background: rgba(0, 0, 0, 0.35);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .telemetry-detail pre {
      margin: 0; padding: 10px; border-radius: 6px;
      background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255,255,255,0.08);
      font-size: 11px; color: #cbd5e1; overflow-x: auto;
      font-family: ui-monospace, 'Cascadia Code', monospace;
    }
    .telemetry-empty {
      padding: 48px; text-align: center; color: #64748b; font-size: 14px;
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
