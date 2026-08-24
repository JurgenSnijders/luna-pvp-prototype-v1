import type { MatchManager } from '../game/MatchManager';
import type { ArenaShrink } from '../game/ArenaShrink';
import type { BotController } from '../entities/BotController';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Player } from '../entities/Player';
import { Dummy } from '../entities/Dummy';
import { isInsideHex } from '../math/HexMath';
import { Vector2D } from '../math/Vector2D';
import type { Interpreter } from '../primitives/Interpreter';
import type { CanvasRenderer, DebugOptions } from '../render/CanvasRenderer';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  getAiSettings,
  setAiSettings,
  synthesizeCards,
  type AiSettings,
} from '../ai/Synthesizer';
import { PRESETS, PRESET_NAMES } from './Presets';
import { ACTION_SLOT_KEYS } from '../types/cards';
import { validateAbilitySchema } from '../types/schema';

export interface InspectorContext {
  player: Player;
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
  private telemetryEl!: HTMLElement;
  private jsonTextarea!: HTMLTextAreaElement;
  private errorBanner!: HTMLElement;

  constructor(
    private root: HTMLElement,
    private ctx: InspectorContext,
  ) {
    this.build();
  }

  private build(): void {
    this.root.innerHTML = '';
    const panel = document.createElement('div');
    panel.style.cssText = `
      pointer-events: auto;
      width: 320px;
      max-height: 100vh;
      overflow-y: auto;
      margin: 12px;
      padding: 16px;
      background: rgba(10, 10, 20, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      color: #e0e0e8;
    `;

    const tabs = ['Stats', 'Presets', 'JSON', 'Harness'];
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;';
    const content = document.createElement('div');

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.textContent = tab;
      btn.style.cssText = this.buttonStyle(false);
      btn.onclick = () => {
        content.innerHTML = '';
        switch (tab) {
          case 'Stats':
            this.buildStatsTab(content);
            break;
          case 'Presets':
            this.buildPresetsTab(content);
            break;
          case 'JSON':
            this.buildJsonTab(content);
            break;
          case 'Harness':
            this.buildHarnessTab(content);
            break;
        }
        for (const b of tabBar.querySelectorAll('button')) {
          (b as HTMLButtonElement).style.cssText = this.buttonStyle(
            b.textContent === tab,
          );
        }
      };
      tabBar.appendChild(btn);
    }

    this.telemetryEl = document.createElement('div');
    this.telemetryEl.style.cssText =
      'margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);font-size:11px;color:#888;';

    panel.appendChild(tabBar);
    panel.appendChild(content);
    panel.appendChild(this.telemetryEl);
    this.root.appendChild(panel);

    this.buildStatsTab(content);
    tabBar.querySelector('button')!.style.cssText = this.buttonStyle(true);
  }

  private buttonStyle(active: boolean): string {
    return `
      padding: 6px 10px;
      border: 1px solid ${active ? '#00ccff' : 'rgba(255,255,255,0.15)'};
      background: ${active ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)'};
      color: #e0e0e8;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    `;
  }

  private sliderRow(
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
  ): void {
    const row = document.createElement('div');
    row.style.marginBottom = '10px';
    const lbl = document.createElement('label');
    lbl.style.display = 'block';
    lbl.style.marginBottom = '4px';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(get());
    input.style.width = '100%';
    const update = () => {
      const v = parseFloat(input.value);
      set(v);
      lbl.textContent = `${label}: ${step < 1 ? v.toFixed(2) : Math.round(v)}`;
    };
    input.oninput = update;
    update();
    row.appendChild(lbl);
    row.appendChild(input);
    parent.appendChild(row);
  }

  private buildStatsTab(parent: HTMLElement): void {
    const p = this.ctx.player;
    this.sliderRow(parent, 'Move Speed', 50, 600, 10, () => p.moveSpeed, (v) => {
      p.moveSpeed = v;
    });
    this.sliderRow(parent, 'Acceleration', 200, 3000, 50, () => p.baseAcceleration, (v) => {
      p.baseAcceleration = v;
    });
    this.sliderRow(parent, 'Linear Drag', 0, 10, 0.1, () => p.baseLinearDrag, (v) => {
      p.baseLinearDrag = v;
      p.linearDrag = v;
    });
    this.sliderRow(parent, 'Mass', 0.1, 5, 0.1, () => p.mass, (v) => {
      p.mass = v;
    });
    this.sliderRow(parent, 'Instability %', 0, 400, 1, () => p.instabilityPct, (v) => {
      p.instabilityPct = v;
    });
  }

  private buildPresetsTab(parent: HTMLElement): void {
    const select = document.createElement('select');
    select.style.cssText =
      'width:100%;padding:8px;margin-bottom:8px;background:#1a1a2e;color:#e0e0e8;border:1px solid rgba(255,255,255,0.15);border-radius:6px;';
    for (const name of PRESET_NAMES) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
      const key = ACTION_SLOT_KEYS[i];
      const loadBtn = document.createElement('button');
      loadBtn.textContent = `Load to ${key}`;
      loadBtn.style.cssText = this.buttonStyle(false) + 'flex:1;min-width:70px;';
      loadBtn.onclick = () => {
        const preset = PRESETS[select.value];
        if (preset) {
          this.ctx.player.setAbility(i, structuredClone(preset));
          if (this.jsonTextarea) {
            this.jsonTextarea.value = JSON.stringify(preset, null, 2);
          }
        }
      };
      btnRow.appendChild(loadBtn);
    }

    parent.appendChild(select);
    parent.appendChild(btnRow);
  }

  private buildJsonTab(parent: HTMLElement): void {
    this.errorBanner = document.createElement('div');
    this.errorBanner.style.cssText =
      'display:none;padding:8px;margin-bottom:8px;background:rgba(255,50,50,0.2);border-radius:6px;color:#ff6666;font-size:12px;';

    this.jsonTextarea = document.createElement('textarea');
    this.jsonTextarea.style.cssText = `
      width: 100%;
      height: 200px;
      font-family: monospace;
      font-size: 11px;
      background: #0a0a14;
      color: #ccc;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 8px;
      resize: vertical;
      box-sizing: border-box;
    `;
    if (this.ctx.player.getAbility(0)) {
      this.jsonTextarea.value = JSON.stringify(this.ctx.player.getAbility(0), null, 2);
    }

    const slotSelect = document.createElement('select');
    slotSelect.style.cssText =
      'width:100%;padding:8px;margin-bottom:8px;background:#1a1a2e;color:#e0e0e8;border:1px solid rgba(255,255,255,0.15);border-radius:6px;';
    for (const key of ACTION_SLOT_KEYS) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `Target Slot: ${key}`;
      slotSelect.appendChild(opt);
    }

    const applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply Schema';
    applyBtn.style.cssText = this.buttonStyle(false) + 'margin-top:8px;width:100%;';
    applyBtn.onclick = () => {
      try {
        const parsed = JSON.parse(this.jsonTextarea.value);
        const validated = validateAbilitySchema(parsed);
        if (!validated) {
          this.showError('Invalid ability schema structure.');
          return;
        }
        const slotIndex = ACTION_SLOT_KEYS.indexOf(slotSelect.value as (typeof ACTION_SLOT_KEYS)[number]);
        if (slotIndex >= 0) {
          this.ctx.player.setAbility(slotIndex, validated);
        }
        this.showError('');
      } catch {
        this.showError('Invalid JSON syntax.');
      }
    };

    parent.appendChild(this.errorBanner);
    parent.appendChild(slotSelect);
    parent.appendChild(this.jsonTextarea);
    parent.appendChild(applyBtn);
  }

  private showError(msg: string): void {
    if (!msg) {
      this.errorBanner.style.display = 'none';
      return;
    }
    this.errorBanner.textContent = msg;
    this.errorBanner.style.display = 'block';
  }

  private buildHarnessTab(parent: HTMLElement): void {
    const aiSection = document.createElement('div');
    aiSection.style.cssText = 'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
    const aiTitle = document.createElement('div');
    aiTitle.textContent = 'AI Synthesizer Settings';
    aiTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:12px;';
    aiSection.appendChild(aiTitle);

    const settings = getAiSettings();

    const apiKeyInput = document.createElement('input');
    apiKeyInput.type = 'password';
    apiKeyInput.placeholder = 'Gemini API Key (Google AI Studio)';
    apiKeyInput.value = settings.apiKey;
    apiKeyInput.style.cssText = this.inputStyle();

    const baseUrlInput = document.createElement('input');
    baseUrlInput.type = 'text';
    baseUrlInput.placeholder = 'https://generativelanguage.googleapis.com/v1beta/openai/';
    baseUrlInput.value = settings.baseUrl || DEFAULT_BASE_URL;
    baseUrlInput.style.cssText = this.inputStyle();

    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.placeholder = 'gemini-3.5-flash-lite';
    modelInput.value = settings.model || DEFAULT_MODEL;
    modelInput.style.cssText = this.inputStyle();

    const saveSettings = (): void => {
      const s: AiSettings = {
        apiKey: apiKeyInput.value,
        baseUrl: baseUrlInput.value || DEFAULT_BASE_URL,
        model: modelInput.value || DEFAULT_MODEL,
      };
      setAiSettings(s);
    };

    apiKeyInput.onchange = saveSettings;
    baseUrlInput.onchange = saveSettings;
    modelInput.onchange = saveSettings;

    aiSection.appendChild(apiKeyInput);
    aiSection.appendChild(baseUrlInput);
    aiSection.appendChild(modelInput);

    const openDraftBtn = document.createElement('button');
    openDraftBtn.textContent = 'Open Draft Synthesizer';
    openDraftBtn.style.cssText = this.buttonStyle(true) + 'width:100%;margin-top:8px;margin-bottom:6px;';
    openDraftBtn.onclick = () => this.ctx.openDraftModal();
    aiSection.appendChild(openDraftBtn);

    const testBtn = document.createElement('button');
    testBtn.textContent = 'Test Synthesizer';
    testBtn.style.cssText = this.buttonStyle(false) + 'width:100%;margin-bottom:6px;';
    testBtn.onclick = async () => {
      saveSettings();
      const p = this.ctx.player;
      const cards = await synthesizeCards('test kinetic vortex', {
        abilities: [...p.abilities],
        passives: p.passives,
      });
      alert(`Synthesized ${cards.length} cards: ${cards.map((c) => c.title).join(', ')}`);
    };
    aiSection.appendChild(testBtn);

    parent.appendChild(aiSection);

    if (this.ctx.matchManager) {
      const modeSection = document.createElement('div');
      modeSection.style.cssText =
        'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
      const modeTitle = document.createElement('div');
      modeTitle.textContent = 'Game Mode';
      modeTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:12px;';
      modeSection.appendChild(modeTitle);

      const modeRow = document.createElement('div');
      modeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';

      const matchModeBtn = document.createElement('button');
      matchModeBtn.textContent = 'Match Mode';
      const sandboxModeBtn = document.createElement('button');
      sandboxModeBtn.textContent = 'Sandbox Mode';

      const syncModeButtons = (): void => {
        const isMatch = this.ctx.matchManager!.mode === 'MATCH';
        matchModeBtn.style.cssText =
          this.buttonStyle(isMatch) + 'flex:1;';
        sandboxModeBtn.style.cssText =
          this.buttonStyle(!isMatch) + 'flex:1;';
        if (matchOnlyControls) {
          matchOnlyControls.style.display = isMatch ? 'block' : 'none';
        }
        if (shrinkCheckbox) {
          shrinkCheckbox.checked = this.ctx.arenaShrink?.enabled ?? false;
        }
        if (aiCheckbox && this.ctx.botController) {
          aiCheckbox.checked = this.ctx.botController.enabled;
        }
      };

      matchModeBtn.onclick = () => {
        this.ctx.matchManager!.setMode('MATCH');
        syncModeButtons();
      };
      sandboxModeBtn.onclick = () => {
        this.ctx.matchManager!.setMode('SANDBOX');
        syncModeButtons();
      };

      modeRow.appendChild(matchModeBtn);
      modeRow.appendChild(sandboxModeBtn);
      modeSection.appendChild(modeRow);

      let shrinkCheckbox: HTMLInputElement | null = null;
      if (this.ctx.arenaShrink) {
        const shrinkRow = document.createElement('label');
        shrinkRow.style.cssText =
          'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-bottom:8px;';
        shrinkCheckbox = document.createElement('input');
        shrinkCheckbox.type = 'checkbox';
        shrinkCheckbox.checked = this.ctx.arenaShrink.enabled;
        shrinkCheckbox.onchange = () => {
          const arena = this.ctx.arenaShrink!;
          arena.enabled = shrinkCheckbox!.checked;
          if (!arena.enabled) arena.reset();
        };
        shrinkRow.appendChild(shrinkCheckbox);
        shrinkRow.appendChild(document.createTextNode('Enable Arena Shrink'));
        modeSection.appendChild(shrinkRow);
      }

      const respawnBtn = document.createElement('button');
      respawnBtn.textContent = 'Respawn All Combatants';
      respawnBtn.style.cssText = this.buttonStyle(false) + 'width:100%;margin-bottom:6px;';
      respawnBtn.onclick = () => this.ctx.onRespawnCombatants?.();
      modeSection.appendChild(respawnBtn);

      parent.appendChild(modeSection);

      const matchSection = document.createElement('div');
      matchSection.style.cssText =
        'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
      const matchTitle = document.createElement('div');
      matchTitle.textContent = 'Match Controls';
      matchTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:12px;';
      matchSection.appendChild(matchTitle);

      const matchOnlyControls = document.createElement('div');

      const forceWinBtn = document.createElement('button');
      forceWinBtn.textContent = 'Force Win Round';
      forceWinBtn.style.cssText = this.buttonStyle(false) + 'width:100%;margin-bottom:6px;';
      forceWinBtn.onclick = () => this.ctx.matchManager!.forceRoundResult('player');
      matchOnlyControls.appendChild(forceWinBtn);

      const forceLoseBtn = document.createElement('button');
      forceLoseBtn.textContent = 'Force Lose Round';
      forceLoseBtn.style.cssText = this.buttonStyle(false) + 'width:100%;margin-bottom:6px;';
      forceLoseBtn.onclick = () => this.ctx.matchManager!.forceRoundResult('bot');
      matchOnlyControls.appendChild(forceLoseBtn);

      const restartBtn = document.createElement('button');
      restartBtn.textContent = 'Restart Match';
      restartBtn.style.cssText = this.buttonStyle(true) + 'width:100%;margin-bottom:6px;';
      restartBtn.onclick = () => this.ctx.onRestartMatch?.();
      matchOnlyControls.appendChild(restartBtn);

      matchSection.appendChild(matchOnlyControls);

      let aiCheckbox: HTMLInputElement | null = null;
      if (this.ctx.botController) {
        const aiToggleRow = document.createElement('label');
        aiToggleRow.style.cssText =
          'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-top:4px;';
        aiCheckbox = document.createElement('input');
        aiCheckbox.type = 'checkbox';
        aiCheckbox.checked = this.ctx.botController.enabled;
        aiCheckbox.onchange = () => {
          this.ctx.botController!.enabled = aiCheckbox.checked;
        };
        aiToggleRow.appendChild(aiCheckbox);
        aiToggleRow.appendChild(document.createTextNode('Bot AI Enabled'));
        matchSection.appendChild(aiToggleRow);
      }

      parent.appendChild(matchSection);
      syncModeButtons();
    }

    const buttons: Array<{ label: string; action: () => void }> = [
      {
        label: 'Spawn Dummy',
        action: () => {
          const pos = this.randomHexPosition();
          this.ctx.world.addDummy(new Dummy(pos));
        },
      },
      {
        label: 'Spawn AI Chaser',
        action: () => {
          const pos = this.randomHexPosition();
          const dummy = new Dummy(pos);
          dummy.isAiActive = true;
          this.ctx.world.addDummy(dummy);
        },
      },
      {
        label: 'Reset Arena',
        action: () => this.ctx.onReset(),
      },
      {
        label: 'Toggle Debug',
        action: () => {
          const opts = this.ctx.getDebugOptions();
          this.ctx.setDebugOptions({
            ...opts,
            showVectors: !opts.showVectors,
            showRadii: !opts.showRadii,
          });
        },
      },
      {
        label: 'Clear Entities',
        action: () => this.ctx.world.clearProjectilesAndZones(),
      },
    ];

    for (const { label, action } of buttons) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = this.buttonStyle(false) + 'width:100%;margin-bottom:6px;';
      btn.onclick = action;
      parent.appendChild(btn);
    }
  }

  private inputStyle(): string {
    return `
      width:100%;padding:8px;margin-bottom:6px;box-sizing:border-box;
      background:#0a0a14;color:#e0e0e8;border:1px solid rgba(255,255,255,0.15);
      border-radius:6px;font-size:12px;
    `;
  }

  private randomHexPosition(): Vector2D {
    const { world } = this.ctx;
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * world.hexRadius * 0.7;
      const pos = world.hexCenter.add(Vector2D.fromAngle(angle, dist));
      if (isInsideHex(pos, world.hexCenter, world.hexRadius)) {
        return pos;
      }
    }
    return world.hexCenter.clone();
  }

  updateTelemetry(): void {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    const p = this.ctx.player;
    const w = this.ctx.world;
    const mm = this.ctx.matchManager;
    const matchInfo = mm
      ? `<div>Mode: ${mm.mode}</div>
         <div>Match: ${mm.state}</div>
         <div>Score: ${mm.playerWins} — ${mm.botWins}</div>
         <div>Round: ${mm.roundNumber}</div>`
      : '';
    const slotLines = ACTION_SLOT_KEYS.map((key, i) => {
      const ability = p.getAbility(i);
      const name = ability?.name ?? 'Empty';
      const remaining = p.getSlotCooldownRemainingMs(i);
      const status = remaining > 0
        ? `${(remaining / 1000).toFixed(1)}s`
        : ability ? 'Ready' : '—';
      return `<div>${key}: ${name} (${status})</div>`;
    }).join('');
    this.telemetryEl.innerHTML = `
      ${matchInfo}
      <div>FPS: ${this.fps}</div>
      <div>Entities: ${w.getEntityCount()}</div>
      <div>Zones: ${w.zones.filter((z) => !z.isDead).length}</div>
      <div>Velocity: ${p.vel.mag().toFixed(1)} px/s</div>
      ${slotLines}
      <div>Passives: ${p.passives.length}</div>
    `;
  }
}
