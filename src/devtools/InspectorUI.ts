import type { MatchManager } from '../game/MatchManager';
import type { ArenaShrink } from '../game/ArenaShrink';
import type { BotController } from '../entities/BotController';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import { Player } from '../entities/Player';
import type { Interpreter } from '../primitives/Interpreter';
import type { CanvasRenderer, DebugOptions } from '../render/CanvasRenderer';
import { ACTION_SLOT_KEYS } from '../types/cards';
import { INSPECTOR_COLLAPSED_STORAGE_KEY } from '../game/settings';
import { FONTS, RETRO_COLORS, RETRO_GLOW, retroPanelStyle } from '../ui/tokens';
import { buttonStyle } from './inspector/domHelpers';
import { buildGraphicsTab } from './inspector/graphicsTab';
import { buildHarnessTab } from './inspector/harnessTab';
import { buildJsonTab, type JsonTabRefs } from './inspector/jsonTab';
import { buildPresetsTab } from './inspector/presetsTab';
import { buildStatsTab } from './inspector/statsTab';
import {
  TELEMETRY_UPDATE_INTERVAL_MS,
  buildTelemetryDom,
  type TelemetryRefs,
} from './inspector/telemetry';

export interface InspectorContext {
  player: Player;
  bot?: Player;
  world: PhysicsWorld;
  interpreter: Interpreter;
  renderer: CanvasRenderer;
  getDebugOptions: () => DebugOptions;
  setDebugOptions: (opts: DebugOptions) => void;
  onReset: () => void;
  openDraftModal: () => void;
  matchManager?: MatchManager;
  botController?: BotController;
  arenaShrink?: ArenaShrink;
  onRestartMatch?: () => void;
  onRespawnCombatants?: () => void;
}

export class InspectorUI {
  private fps = 0;
  private frameCount = 0;
  private lastFpsTime = performance.now();
  private lastTelemetryDomUpdate = 0;
  private telemetryEl!: HTMLElement;
  private telemetryRefs: TelemetryRefs | null = null;
  private jsonTabRefs: JsonTabRefs | null = null;
  private isCollapsed: boolean =
    localStorage.getItem(INSPECTOR_COLLAPSED_STORAGE_KEY) === 'true';
  private container!: HTMLDivElement;
  private headerEl!: HTMLDivElement;
  private bodyEl!: HTMLDivElement;
  private toggleBtn!: HTMLButtonElement;

  constructor(
    private root: HTMLElement,
    private ctx: InspectorContext,
  ) {
    this.build();
  }

  private build(): void {
    this.root.innerHTML = '';
    this.container = document.createElement('div');
    this.container.style.cssText = `
      pointer-events: auto;
      max-height: 100vh;
      overflow-y: auto;
      margin: 12px;
      ${retroPanelStyle('cyan')}
      font-family: ${FONTS.mono};
      font-size: ${FONTS.size.body};
      color: ${RETRO_COLORS.textPrimary};
    `;

    this.headerEl = document.createElement('div');
    this.headerEl.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;user-select:none;';
    this.headerEl.onclick = () => this.toggleCollapse();

    const title = document.createElement('span');
    title.textContent = 'DEVTOOLS';
    title.style.cssText =
      `font-size: ${FONTS.size.badge}; font-weight: 700; color: ${RETRO_COLORS.textMuted}; letter-spacing: 0.05em; text-shadow: ${RETRO_GLOW.cyan};`;

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.type = 'button';
    this.toggleBtn.style.cssText = buttonStyle(false) + 'padding:2px 8px;line-height:1;';

    this.headerEl.appendChild(title);
    this.headerEl.appendChild(this.toggleBtn);

    this.bodyEl = document.createElement('div');

    const tabs = ['Stats', 'Presets', 'JSON', 'Graphics', 'Harness'];
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;';
    const content = document.createElement('div');

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.textContent = tab;
      btn.style.cssText = buttonStyle(false);
      btn.onclick = () => {
        content.innerHTML = '';
        switch (tab) {
          case 'Stats':
            buildStatsTab(content, this.ctx);
            break;
          case 'Presets':
            buildPresetsTab(content, this.ctx, this.jsonTabRefs?.jsonTextarea);
            break;
          case 'JSON':
            this.jsonTabRefs = buildJsonTab(content, this.ctx);
            break;
          case 'Graphics':
            buildGraphicsTab(content);
            break;
          case 'Harness':
            buildHarnessTab(content, this.ctx);
            break;
        }
        for (const b of tabBar.querySelectorAll('button')) {
          (b as HTMLButtonElement).style.cssText = buttonStyle(
            b.textContent === tab,
          );
        }
      };
      tabBar.appendChild(btn);
    }

    this.telemetryEl = document.createElement('div');
    this.telemetryEl.style.cssText =
      `margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);font-size:${FONTS.size.sm};color:#888;`;

    this.bodyEl.appendChild(tabBar);
    this.bodyEl.appendChild(content);
    this.bodyEl.appendChild(this.telemetryEl);

    this.container.appendChild(this.headerEl);
    this.container.appendChild(this.bodyEl);

    buildStatsTab(content, this.ctx);
    tabBar.querySelector('button')!.style.cssText = buttonStyle(true);

    this.toggleCollapse(this.isCollapsed);

    this.root.appendChild(this.container);

    window.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
  }

  private toggleCollapse(forceState?: boolean): void {
    this.isCollapsed = forceState !== undefined ? forceState : !this.isCollapsed;
    localStorage.setItem(INSPECTOR_COLLAPSED_STORAGE_KEY, String(this.isCollapsed));

    this.bodyEl.style.display = this.isCollapsed ? 'none' : 'block';
    this.toggleBtn.textContent = this.isCollapsed ? '+' : '−';
    this.headerEl.style.marginBottom = this.isCollapsed ? '0' : '8px';

    this.container.style.width = this.isCollapsed ? 'auto' : '320px';
    this.container.style.padding = this.isCollapsed ? '6px 10px' : '16px';
    this.container.style.cursor = this.isCollapsed ? 'pointer' : 'default';
    this.container.style.maxHeight = this.isCollapsed ? 'none' : '100vh';
    this.container.style.overflowY = this.isCollapsed ? 'visible' : 'auto';
  }

  private handleGlobalKeydown(e: KeyboardEvent): void {
    if (e.key !== 'F1' && e.key !== '\\') return;

    const active = document.activeElement;
    const tag = active?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (active instanceof HTMLElement && active.isContentEditable)
    ) {
      return;
    }

    if (e.key === 'F1') e.preventDefault();
    this.toggleCollapse();
  }

  updateTelemetry(): void {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    if (this.isCollapsed) return;

    // DOM writes are throttled; only the FPS counter above runs per frame.
    if (now - this.lastTelemetryDomUpdate < TELEMETRY_UPDATE_INTERVAL_MS) return;
    this.lastTelemetryDomUpdate = now;

    if (!this.telemetryRefs) {
      this.telemetryRefs = buildTelemetryDom(this.telemetryEl, this.ctx);
    }
    const refs = this.telemetryRefs;

    const p = this.ctx.player;
    const w = this.ctx.world;
    const mm = this.ctx.matchManager;

    if (mm) {
      refs.mode.textContent = `Mode: ${mm.mode}`;
      refs.match.textContent = `Match: ${mm.state}`;
      refs.score.textContent = `Score: ${mm.playerWins} — ${mm.botWins}`;
      refs.round.textContent = `Round: ${mm.roundNumber}`;
    }

    refs.fps.textContent = `FPS: ${this.fps}`;
    refs.entities.textContent = `Entities: ${w.getEntityCount()}`;

    let liveZones = 0;
    for (const zone of w.zones) {
      if (!zone.isDead) liveZones++;
    }
    refs.zones.textContent = `Zones: ${liveZones}`;
    refs.velocity.textContent = `Velocity: ${p.vel.mag().toFixed(1)} px/s`;

    const lavaTag = p.tags.has('in_lava') ? ' (in lava)' : '';
    refs.combatant.textContent =
      `HP: ${Math.round(p.health)}/${p.maxHealth} | Instability: ${Math.round(p.instabilityPct)}%${lavaTag}`;

    for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
      const ability = p.getAbility(i);
      const name = ability?.name ?? 'Empty';
      const remaining = p.getSlotCooldownRemainingMs(i);
      const status = remaining > 0
        ? `${(remaining / 1000).toFixed(1)}s`
        : ability ? 'Ready' : '—';
      refs.slots[i].textContent = `${ACTION_SLOT_KEYS[i]}: ${name} (${status})`;
    }

    refs.passives.textContent = `Passives: ${p.passives.length}`;
  }
}
