import { CombatLogger } from './CombatLogger';
import {
  createActionBtn,
  createPill,
  createTypeBadge,
  injectTelemetryStyles,
} from './telemetryStyles';
import type { CombatEvent, TelemetryFilterCategory } from '../types/telemetry';
import {
  EVENT_TYPE_SHORT_LABEL,
  eventMatchesSearch,
  filterByCategory,
  formatEventParams,
  formatInstability,
  formatKinematicDelta,
  formatVec,
  getEventEndpoints,
} from '../types/telemetry';

export interface TelemetryModalCallbacks {
  onOpenChange: (open: boolean) => void;
  onCopyJson: (durationMs: number) => Promise<number>;
}

const FILTER_CATEGORIES: TelemetryFilterCategory[] = [
  'ALL',
  'CASTS',
  'IMPULSES',
  'FIELDS',
  'RAMS',
  'SLAMS',
];

const TIME_RANGES: { label: string; ms: number }[] = [
  { label: '5s', ms: 5000 },
  { label: '10s', ms: 10000 },
  { label: '30s', ms: 30000 },
  { label: 'ALL', ms: Infinity },
];

export class TelemetryModal {
  private overlay: HTMLElement;
  private countBadge: HTMLElement;
  private liveDot: HTMLElement;
  private tableBody: HTMLElement;
  private searchInput: HTMLInputElement;
  private filterPills = new Map<TelemetryFilterCategory, HTMLButtonElement>();
  private timePills = new Map<number, HTMLButtonElement>();
  private refreshToggleBtn: HTMLButtonElement;
  private emptyState: HTMLElement;

  private filterType: TelemetryFilterCategory = 'ALL';
  private timeRangeMs = 10000;
  private searchQuery = '';
  private isOpen = false;
  private autoRefresh = true;
  private expandedEventId: number | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(private callbacks: TelemetryModalCallbacks) {
    injectTelemetryStyles();

    this.overlay = document.createElement('div');
    this.overlay.className = 'telemetry-overlay';

    const header = document.createElement('div');
    header.className = 'telemetry-header';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const title = document.createElement('span');
    title.className = 'telemetry-title';
    title.textContent = 'COMBAT TELEMETRY';
    this.liveDot = document.createElement('span');
    this.liveDot.className = 'telemetry-live-dot';
    this.countBadge = document.createElement('span');
    this.countBadge.className = 'telemetry-badge-count';
    this.countBadge.textContent = '0 events';
    titleRow.appendChild(title);
    titleRow.appendChild(this.liveDot);
    titleRow.appendChild(this.countBadge);
    header.appendChild(titleRow);

    const filterGroup = document.createElement('div');
    filterGroup.className = 'telemetry-pill-group';
    for (const cat of FILTER_CATEGORIES) {
      const pill = createPill(cat, cat === this.filterType);
      pill.onclick = () => this.setFilter(cat);
      this.filterPills.set(cat, pill);
      filterGroup.appendChild(pill);
    }
    header.appendChild(filterGroup);

    const timeGroup = document.createElement('div');
    timeGroup.className = 'telemetry-pill-group';
    for (const { label, ms } of TIME_RANGES) {
      const pill = createPill(label, ms === this.timeRangeMs);
      pill.onclick = () => this.setTimeRange(ms);
      this.timePills.set(ms, pill);
      timeGroup.appendChild(pill);
    }
    header.appendChild(timeGroup);

    this.searchInput = document.createElement('input');
    this.searchInput.className = 'telemetry-search';
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search entity ID, spell, field…';
    this.searchInput.addEventListener('input', () => {
      if (this.searchDebounce) clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => {
        this.searchQuery = this.searchInput.value;
        this.renderRows();
      }, 100);
    });
    header.appendChild(this.searchInput);

    this.refreshToggleBtn = createActionBtn('Pause Stream');
    this.refreshToggleBtn.onclick = () => this.toggleAutoRefresh();
    header.appendChild(this.refreshToggleBtn);

    const actions = document.createElement('div');
    actions.className = 'telemetry-actions';
    const copyBtn = createActionBtn('Copy JSON', true);
    copyBtn.onclick = () => void this.copyJson();
    const clearBtn = createActionBtn('Clear');
    clearBtn.onclick = () => this.clearLog();
    const closeBtn = createActionBtn('Close (Esc)');
    closeBtn.onclick = () => this.close();
    actions.appendChild(copyBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(closeBtn);
    header.appendChild(actions);

    this.overlay.appendChild(header);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'telemetry-table-wrap';

    const table = document.createElement('table');
    table.className = 'telemetry-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Time</th>
        <th>Type</th>
        <th>Source → Target</th>
        <th>Physics & Parameters</th>
        <th>Kinematic Delta</th>
        <th>Instability</th>
      </tr>
    `;
    table.appendChild(thead);

    this.tableBody = document.createElement('tbody');
    table.appendChild(this.tableBody);
    tableWrap.appendChild(table);

    this.emptyState = document.createElement('div');
    this.emptyState.className = 'telemetry-empty';
    this.emptyState.textContent = 'No combat events in the selected window.';
    this.emptyState.style.display = 'none';
    tableWrap.appendChild(this.emptyState);

    this.overlay.appendChild(tableWrap);
    document.body.appendChild(this.overlay);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  isOpened(): boolean {
    return this.isOpen;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.classList.add('open');
    this.callbacks.onOpenChange(true);
    this.renderRows();
    this.startRefresh();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this.expandedEventId = null;
    this.callbacks.onOpenChange(false);
    this.stopRefresh();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private setFilter(cat: TelemetryFilterCategory): void {
    this.filterType = cat;
    for (const [key, pill] of this.filterPills) {
      pill.classList.toggle('active', key === cat);
    }
    this.renderRows();
  }

  private setTimeRange(ms: number): void {
    this.timeRangeMs = ms;
    for (const [key, pill] of this.timePills) {
      pill.classList.toggle('active', key === ms);
    }
    this.renderRows();
  }

  private toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    this.refreshToggleBtn.textContent = this.autoRefresh ? 'Pause Stream' : 'Resume Stream';
    this.liveDot.classList.toggle('paused', !this.autoRefresh);
    if (this.autoRefresh && this.isOpen) this.startRefresh();
    else this.stopRefresh();
  }

  private startRefresh(): void {
    this.stopRefresh();
    if (!this.autoRefresh || !this.isOpen) return;
    this.refreshTimer = setInterval(() => this.renderRows(), 250);
  }

  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async copyJson(): Promise<void> {
    await this.callbacks.onCopyJson(this.timeRangeMs);
  }

  private clearLog(): void {
    CombatLogger.getInstance().clear();
    this.expandedEventId = null;
    this.renderRows();
  }

  private getFilteredEvents(): CombatEvent[] {
    const logger = CombatLogger.getInstance();
    let events = logger.getRecentEvents(this.timeRangeMs);
    events = filterByCategory(events, this.filterType);
    if (this.searchQuery.trim()) {
      events = events.filter((e) => eventMatchesSearch(e, this.searchQuery));
    }
    return events;
  }

  private renderRows(): void {
    if (!this.isOpen) return;

    const events = this.getFilteredEvents();
    const totalInWindow = CombatLogger.getInstance().getRecentEvents(this.timeRangeMs).length;
    this.countBadge.textContent = `${events.length} shown / ${totalInWindow} in window`;

    this.tableBody.replaceChildren();
    this.emptyState.style.display = events.length === 0 ? 'block' : 'none';

    const fragment = document.createDocumentFragment();
    for (const e of events) {
      fragment.appendChild(this.buildRow(e));
      if (this.expandedEventId === e.id) {
        fragment.appendChild(this.buildDetailRow(e));
      }
    }
    this.tableBody.appendChild(fragment);
  }

  private buildRow(e: CombatEvent): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = `telemetry-row${this.expandedEventId === e.id ? ' expanded' : ''}`;
    row.onclick = () => {
      this.expandedEventId = this.expandedEventId === e.id ? null : e.id;
      this.renderRows();
    };

    const { source, target } = getEventEndpoints(e);
    const instab = formatInstability(e);

    const timeCell = document.createElement('td');
    timeCell.className = 'telemetry-time';
    timeCell.innerHTML = `${(e.timeMs / 1000).toFixed(2)}s<div class="telemetry-time-sub">f${e.frame}</div>`;

    const typeCell = document.createElement('td');
    typeCell.appendChild(createTypeBadge(e.type, EVENT_TYPE_SHORT_LABEL[e.type]));

    const endpointCell = document.createElement('td');
    endpointCell.className = 'telemetry-endpoint';
    endpointCell.textContent = `${source} → ${target}`;

    const paramsCell = document.createElement('td');
    paramsCell.className = 'telemetry-params';
    paramsCell.textContent = formatEventParams(e);

    const deltaCell = document.createElement('td');
    deltaCell.className = 'telemetry-delta';
    deltaCell.textContent = formatKinematicDelta(e);

    const instabCell = document.createElement('td');
    instabCell.className = 'telemetry-instab';
    instabCell.textContent = instab;

    row.append(timeCell, typeCell, endpointCell, paramsCell, deltaCell, instabCell);
    return row;
  }

  private buildDetailRow(e: CombatEvent): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'telemetry-detail';
    const cell = document.createElement('td');
    cell.colSpan = 6;

    const vectors: string[] = [];
    switch (e.type) {
      case 'ABILITY_CAST':
        vectors.push(`aimDirection: ${formatVec(e.aimDirection)}`);
        break;
      case 'IMPULSE_APPLIED':
        vectors.push(`appliedDirection: ${formatVec(e.appliedDirection)}`);
        vectors.push(`velocityBefore: ${formatVec(e.velocityBefore)}`);
        vectors.push(`velocityAfter: ${formatVec(e.velocityAfter)}`);
        vectors.push(`deltaVelocity: ${formatVec(e.deltaVelocity)}`);
        break;
      case 'FIELD_ACCEL_TICK':
        vectors.push(`acceleration: ${formatVec(e.acceleration)}`);
        vectors.push(`velocityBefore: ${formatVec(e.velocityBefore)}`);
        vectors.push(`velocityAfter: ${formatVec(e.velocityAfter)}`);
        break;
      case 'RAM_COLLISION':
        vectors.push(`collisionNormal: ${formatVec(e.collisionNormal)}`);
        vectors.push(`rammerVelBefore: ${formatVec(e.rammerVelBefore)}`);
        vectors.push(`rammerVelAfter: ${formatVec(e.rammerVelAfter)}`);
        vectors.push(`targetVelBefore: ${formatVec(e.targetVelBefore)}`);
        vectors.push(`targetVelAfter: ${formatVec(e.targetVelAfter)}`);
        break;
      case 'SLAM_COLLISION':
        vectors.push(`surfaceNormal: ${formatVec(e.surfaceNormal)}`);
        vectors.push(`velBefore: ${formatVec(e.velBefore)}`);
        vectors.push(`velAfter: ${formatVec(e.velAfter)}`);
        break;
    }

    const pre = document.createElement('pre');
    const vectorBlock = vectors.length > 0 ? `\n\n// Vectors\n${vectors.join('\n')}` : '';
    pre.textContent = JSON.stringify(e, null, 2) + vectorBlock;
    cell.appendChild(pre);
    row.appendChild(cell);
    return row;
  }
}
