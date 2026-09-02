import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  getAiSettings,
  setAiSettings,
  synthesizeCards,
  type AiSettings,
} from '../../ai/Synthesizer';
import { Dummy } from '../../entities/Dummy';
import { isInsideHex } from '../../math/HexMath';
import { Vector2D } from '../../math/Vector2D';
import type { InspectorContext } from '../InspectorUI';
import { buttonStyle, inputStyle, sectionDivider, sectionHeader } from './domHelpers';

export function randomHexPosition(ctx: InspectorContext): Vector2D {
  const { world } = ctx;
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

export function buildHarnessTab(parent: HTMLElement, ctx: InspectorContext): void {
  const aiSection = document.createElement('div');
  aiSection.style.cssText = sectionDivider();
  aiSection.appendChild(sectionHeader('AI Synthesizer Settings'));

  const settings = getAiSettings();

  const apiKeyInput = document.createElement('input');
  apiKeyInput.type = 'password';
  apiKeyInput.placeholder = 'Gemini API Key (Google AI Studio)';
  apiKeyInput.value = settings.apiKey;
  apiKeyInput.style.cssText = inputStyle();

  const baseUrlInput = document.createElement('input');
  baseUrlInput.type = 'text';
  baseUrlInput.placeholder = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  baseUrlInput.value = settings.baseUrl || DEFAULT_BASE_URL;
  baseUrlInput.style.cssText = inputStyle();

  const modelInput = document.createElement('input');
  modelInput.type = 'text';
  modelInput.placeholder = 'gemini-3.5-flash-lite';
  modelInput.value = settings.model || DEFAULT_MODEL;
  modelInput.style.cssText = inputStyle();

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
  openDraftBtn.style.cssText = buttonStyle(true) + 'width:100%;margin-top:8px;margin-bottom:6px;';
  openDraftBtn.onclick = () => ctx.openDraftModal();
  aiSection.appendChild(openDraftBtn);

  const testBtn = document.createElement('button');
  testBtn.textContent = 'Test Synthesizer';
  testBtn.style.cssText = buttonStyle(false) + 'width:100%;margin-bottom:6px;';
  testBtn.onclick = async () => {
    saveSettings();
    const p = ctx.player;
    const cards = await synthesizeCards('test kinetic vortex', {
      abilities: [...p.abilities],
      passives: p.passives,
    });
    alert(`Synthesized ${cards.length} cards: ${cards.map((c) => c.title).join(', ')}`);
  };
  aiSection.appendChild(testBtn);

  parent.appendChild(aiSection);

  if (ctx.matchManager) {
    const modeSection = document.createElement('div');
    modeSection.style.cssText = sectionDivider();
    modeSection.appendChild(sectionHeader('Game Mode'));

    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';

    const matchModeBtn = document.createElement('button');
    matchModeBtn.textContent = 'Match Mode';
    const sandboxModeBtn = document.createElement('button');
    sandboxModeBtn.textContent = 'Sandbox Mode';

    const syncModeButtons = (): void => {
      const isMatch = ctx.matchManager!.mode === 'MATCH';
      matchModeBtn.style.cssText =
        buttonStyle(isMatch) + 'flex:1;';
      sandboxModeBtn.style.cssText =
        buttonStyle(!isMatch) + 'flex:1;';
      if (matchOnlyControls) {
        matchOnlyControls.style.display = isMatch ? 'block' : 'none';
      }
      if (shrinkCheckbox) {
        shrinkCheckbox.checked = ctx.arenaShrink?.enabled ?? false;
      }
      if (aiCheckbox && ctx.botController) {
        aiCheckbox.checked = ctx.botController.enabled;
      }
    };

    matchModeBtn.onclick = () => {
      ctx.matchManager!.setMode('MATCH');
      syncModeButtons();
    };
    sandboxModeBtn.onclick = () => {
      ctx.matchManager!.setMode('SANDBOX');
      syncModeButtons();
    };

    modeRow.appendChild(matchModeBtn);
    modeRow.appendChild(sandboxModeBtn);
    modeSection.appendChild(modeRow);

    let shrinkCheckbox: HTMLInputElement | null = null;
    if (ctx.arenaShrink) {
      const shrinkRow = document.createElement('label');
      shrinkRow.style.cssText =
        'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-bottom:8px;';
      shrinkCheckbox = document.createElement('input');
      shrinkCheckbox.type = 'checkbox';
      shrinkCheckbox.checked = ctx.arenaShrink.enabled;
      shrinkCheckbox.onchange = () => {
        const arena = ctx.arenaShrink!;
        arena.enabled = shrinkCheckbox!.checked;
        if (!arena.enabled) arena.reset();
      };
      shrinkRow.appendChild(shrinkCheckbox);
      shrinkRow.appendChild(document.createTextNode('Enable Arena Shrink'));
      modeSection.appendChild(shrinkRow);
    }

    const respawnBtn = document.createElement('button');
    respawnBtn.textContent = 'Respawn All Combatants';
    respawnBtn.style.cssText = buttonStyle(false) + 'width:100%;margin-bottom:6px;';
    respawnBtn.onclick = () => ctx.onRespawnCombatants?.();
    modeSection.appendChild(respawnBtn);

    parent.appendChild(modeSection);

    const matchSection = document.createElement('div');
    matchSection.style.cssText = sectionDivider();
    matchSection.appendChild(sectionHeader('Match Controls'));

    const matchOnlyControls = document.createElement('div');

    const forceWinBtn = document.createElement('button');
    forceWinBtn.textContent = 'Force Win Round';
    forceWinBtn.style.cssText = buttonStyle(false) + 'width:100%;margin-bottom:6px;';
    forceWinBtn.onclick = () => ctx.matchManager!.forceRoundResult('player');
    matchOnlyControls.appendChild(forceWinBtn);

    const forceLoseBtn = document.createElement('button');
    forceLoseBtn.textContent = 'Force Lose Round';
    forceLoseBtn.style.cssText = buttonStyle(false) + 'width:100%;margin-bottom:6px;';
    forceLoseBtn.onclick = () => ctx.matchManager!.forceRoundResult('bot');
    matchOnlyControls.appendChild(forceLoseBtn);

    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'Restart Match';
    restartBtn.style.cssText = buttonStyle(true) + 'width:100%;margin-bottom:6px;';
    restartBtn.onclick = () => ctx.onRestartMatch?.();
    matchOnlyControls.appendChild(restartBtn);

    matchSection.appendChild(matchOnlyControls);

    let aiCheckbox: HTMLInputElement | null = null;
    if (ctx.botController) {
      const aiToggleRow = document.createElement('label');
      aiToggleRow.style.cssText =
        'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-top:4px;';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = ctx.botController.enabled;
      checkbox.onchange = () => {
        ctx.botController!.enabled = checkbox.checked;
      };
      aiCheckbox = checkbox;
      aiToggleRow.appendChild(checkbox);
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
        const pos = randomHexPosition(ctx);
        ctx.world.addDummy(new Dummy(pos));
      },
    },
    {
      label: 'Spawn AI Chaser',
      action: () => {
        const pos = randomHexPosition(ctx);
        const dummy = new Dummy(pos);
        dummy.isAiActive = true;
        ctx.world.addDummy(dummy);
      },
    },
    {
      label: 'Reset Arena',
      action: () => ctx.onReset(),
    },
    {
      label: 'Toggle Debug',
      action: () => {
        const opts = ctx.getDebugOptions();
        ctx.setDebugOptions({
          ...opts,
          showVectors: !opts.showVectors,
          showRadii: !opts.showRadii,
        });
      },
    },
    {
      label: 'Clear Entities',
      action: () => ctx.world.clearProjectilesAndZones(),
    },
  ];

  for (const { label, action } of buttons) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = buttonStyle(false) + 'width:100%;margin-bottom:6px;';
    btn.onclick = action;
    parent.appendChild(btn);
  }
}
