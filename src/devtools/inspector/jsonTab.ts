import { ACTION_SLOT_KEYS, type ActionSlotKey } from '../../types/cards';
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

function getSlotIndex(slotSelect: HTMLSelectElement): number {
  return ACTION_SLOT_KEYS.indexOf(slotSelect.value as ActionSlotKey);
}

function slotLabel(ctx: InspectorContext, slotIndex: number): string {
  const key = ACTION_SLOT_KEYS[slotIndex];
  const ability = ctx.player.getAbility(slotIndex);
  return ability ? `${key} — ${ability.name}` : `${key} — (empty)`;
}

function refreshSlotOptions(ctx: InspectorContext, slotSelect: HTMLSelectElement): void {
  const selected = slotSelect.value;
  slotSelect.innerHTML = '';
  for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
    const opt = document.createElement('option');
    opt.value = ACTION_SLOT_KEYS[i];
    opt.textContent = slotLabel(ctx, i);
    slotSelect.appendChild(opt);
  }
  if (ACTION_SLOT_KEYS.includes(selected as ActionSlotKey)) {
    slotSelect.value = selected;
  }
}

function loadSlotIntoEditor(
  ctx: InspectorContext,
  slotIndex: number,
  jsonTextarea: HTMLTextAreaElement,
  refs: JsonTabRefs,
): void {
  const ability = ctx.player.getAbility(slotIndex);
  jsonTextarea.value = ability ? JSON.stringify(structuredClone(ability), null, 2) : '';
  showJsonError(refs, '');
}

async function copyText(text: string, textarea: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    textarea.select();
    return document.execCommand('copy');
  }
}

export function buildJsonTab(parent: HTMLElement, ctx: InspectorContext): JsonTabRefs {
  const errorBanner = document.createElement('div');
  errorBanner.style.cssText =
    'display:none;padding:8px;margin-bottom:8px;background:rgba(255,50,50,0.2);border-radius:6px;color:#ff6666;font-size:12px;';

  const slotSelect = document.createElement('select');
  slotSelect.style.cssText =
    'width:100%;padding:8px;margin-bottom:4px;background:#1a1a2e;color:#e0e0e8;border:1px solid rgba(255,255,255,0.15);border-radius:6px;';
  refreshSlotOptions(ctx, slotSelect);

  const helperText = document.createElement('div');
  helperText.textContent = 'Editing equipped spell for selected action-bar slot.';
  helperText.style.cssText = 'font-size:10px;color:#888;margin-bottom:8px;';

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

  const refs: JsonTabRefs = { errorBanner, jsonTextarea };

  const reloadFromSlot = (): void => {
    const slotIndex = getSlotIndex(slotSelect);
    if (slotIndex < 0) return;
    refreshSlotOptions(ctx, slotSelect);
    loadSlotIntoEditor(ctx, slotIndex, jsonTextarea, refs);
  };

  slotSelect.onchange = reloadFromSlot;
  loadSlotIntoEditor(ctx, 0, jsonTextarea, refs);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy JSON';
  copyBtn.style.cssText = buttonStyle(false) + 'flex:1;';
  copyBtn.onclick = async () => {
    const ok = await copyText(jsonTextarea.value, jsonTextarea);
    if (!ok) return;
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = original;
    }, 1500);
  };

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload from slot';
  reloadBtn.style.cssText = buttonStyle(false) + 'flex:1;';
  reloadBtn.onclick = reloadFromSlot;

  btnRow.appendChild(copyBtn);
  btnRow.appendChild(reloadBtn);

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
      const slotIndex = getSlotIndex(slotSelect);
      if (slotIndex >= 0) {
        ctx.player.setAbility(slotIndex, validated);
        refreshSlotOptions(ctx, slotSelect);
      }
      showJsonError(refs, '');
    } catch {
      showJsonError(refs, 'Invalid JSON syntax.');
    }
  };

  parent.appendChild(errorBanner);
  parent.appendChild(slotSelect);
  parent.appendChild(helperText);
  parent.appendChild(jsonTextarea);
  parent.appendChild(btnRow);
  parent.appendChild(applyBtn);

  return refs;
}
