import { ACTION_SLOT_KEYS } from '../../types/cards';
import { validateAbilitySchema } from '../../types/schema';
import type { InspectorContext } from '../InspectorUI';
import { buttonStyle } from './domHelpers';

export interface JsonTabRefs {
  errorBanner: HTMLElement;
  jsonTextarea: HTMLTextAreaElement;
}

export function showJsonError(refs: JsonTabRefs, msg: string): void {
  if (!msg) {
    refs.errorBanner.style.display = 'none';
    return;
  }
  refs.errorBanner.textContent = msg;
  refs.errorBanner.style.display = 'block';
}

export function buildJsonTab(parent: HTMLElement, ctx: InspectorContext): JsonTabRefs {
  const errorBanner = document.createElement('div');
  errorBanner.style.cssText =
    'display:none;padding:8px;margin-bottom:8px;background:rgba(255,50,50,0.2);border-radius:6px;color:#ff6666;font-size:12px;';

  const jsonTextarea = document.createElement('textarea');
  jsonTextarea.style.cssText = `
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
  if (ctx.player.getAbility(0)) {
    jsonTextarea.value = JSON.stringify(ctx.player.getAbility(0), null, 2);
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

  const refs: JsonTabRefs = { errorBanner, jsonTextarea };

  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply Schema';
  applyBtn.style.cssText = buttonStyle(false) + 'margin-top:8px;width:100%;';
  applyBtn.onclick = () => {
    try {
      const parsed = JSON.parse(jsonTextarea.value);
      const validated = validateAbilitySchema(parsed);
      if (!validated) {
        showJsonError(refs, 'Invalid ability schema structure.');
        return;
      }
      const slotIndex = ACTION_SLOT_KEYS.indexOf(slotSelect.value as (typeof ACTION_SLOT_KEYS)[number]);
      if (slotIndex >= 0) {
        ctx.player.setAbility(slotIndex, validated);
      }
      showJsonError(refs, '');
    } catch {
      showJsonError(refs, 'Invalid JSON syntax.');
    }
  };

  parent.appendChild(errorBanner);
  parent.appendChild(slotSelect);
  parent.appendChild(jsonTextarea);
  parent.appendChild(applyBtn);

  return refs;
}
