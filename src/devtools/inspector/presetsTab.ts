import { PRESETS, PRESET_GROUPS } from '../Presets';
import { ACTION_SLOT_KEYS } from '../../types/cards';
import type { InspectorContext } from '../InspectorUI';
import { buttonStyle, inputStyle } from './domHelpers';

export function buildPresetsTab(
  parent: HTMLElement,
  ctx: InspectorContext,
  jsonTextarea?: HTMLTextAreaElement,
): void {
  const select = document.createElement('select');
  select.style.cssText = inputStyle();
  for (const group of PRESET_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const name of group.presetNames) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
    const key = ACTION_SLOT_KEYS[i];
    const loadBtn = document.createElement('button');
    loadBtn.textContent = `Load to ${key}`;
    loadBtn.style.cssText = buttonStyle(false) + 'flex:1;min-width:70px;';
    loadBtn.onclick = () => {
      const preset = PRESETS[select.value];
      if (preset) {
        ctx.player.setAbility(i, structuredClone(preset));
        if (jsonTextarea) {
          jsonTextarea.value = JSON.stringify(preset, null, 2);
        }
      }
    };
    btnRow.appendChild(loadBtn);
  }

  parent.appendChild(select);
  parent.appendChild(btnRow);
}
