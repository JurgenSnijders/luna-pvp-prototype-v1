import { sanitizeAbilitySchema } from '../../ai/BudgetEngine';
import { repairAbilityPayload } from '../../ai/synthesizer/llmRepair';
import { ACTION_SLOT_KEYS, type PassiveModifierPayload } from '../../types/cards';
import { normalizeAbilityPayload, validateAbilitySchema } from '../../types/schema';
import type { InspectorContext } from '../InspectorUI';
import { FONTS, RETRO_COLORS } from '../../ui/tokens';
import { buttonStyle, inputStyle } from './domHelpers';

export interface JsonTabRefs {
  errorBanner: HTMLElement;
  jsonTextarea: HTMLTextAreaElement;
}

type InspectorTokenKind = 'base' | 'compiled' | 'passive';

interface InspectorToken {
  kind: InspectorTokenKind;
  index: number;
}

const DEFAULT_TOKEN = 'base:0';

export function showJsonError(refs: JsonTabRefs, msg: string): void {
  if (!msg) {
    refs.errorBanner.style.display = 'none';
    return;
  }
  refs.errorBanner.textContent = msg;
  refs.errorBanner.style.display = 'block';
}

function parseInspectorToken(value: string): InspectorToken | null {
  const match = /^(base|compiled|passive):(\d+)$/.exec(value);
  if (!match) return null;
  return { kind: match[1] as InspectorTokenKind, index: Number(match[2]) };
}

function formatInspectorToken(token: InspectorToken): string {
  return `${token.kind}:${token.index}`;
}

function activeSlotLabel(
  ctx: InspectorContext,
  slotIndex: number,
  variant: 'Base' | 'Compiled',
): string {
  const key = ACTION_SLOT_KEYS[slotIndex];
  const ability =
    variant === 'Base'
      ? ctx.player.getBaseAbility(slotIndex)
      : ctx.player.getAbility(slotIndex);
  const name = ability?.name ?? '(empty)';
  return `[${key}] ${name} (${variant})`;
}

function passiveLabel(passive: PassiveModifierPayload, index: number): string {
  const prefix = `[PASSIVE ${index + 1}]`;
  if (
    passive.stat !== undefined &&
    passive.op !== undefined &&
    passive.value !== undefined
  ) {
    return `${prefix} ${passive.stat} ${passive.op} ${passive.value}`;
  }
  const hookCount = passive.hooks?.length ?? 0;
  const spliceCount = passive.splices?.length ?? 0;
  if (hookCount > 0 || spliceCount > 0) {
    const parts: string[] = [];
    if (hookCount > 0) parts.push(`${hookCount} hook${hookCount === 1 ? '' : 's'}`);
    if (spliceCount > 0) parts.push(`${spliceCount} splice${spliceCount === 1 ? '' : 's'}`);
    return `${prefix} ${parts.join(', ')}`;
  }
  return prefix;
}

function appendOption(
  group: HTMLOptGroupElement,
  token: string,
  label: string,
  disabled = false,
): void {
  const opt = document.createElement('option');
  opt.value = token;
  opt.textContent = label;
  opt.disabled = disabled;
  group.appendChild(opt);
}

function refreshInspectorOptions(ctx: InspectorContext, slotSelect: HTMLSelectElement): void {
  const selected = slotSelect.value;
  slotSelect.innerHTML = '';

  const baseGroup = document.createElement('optgroup');
  baseGroup.label = 'Active (base)';
  for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
    appendOption(baseGroup, `base:${i}`, activeSlotLabel(ctx, i, 'Base'));
  }
  slotSelect.appendChild(baseGroup);

  const compiledGroup = document.createElement('optgroup');
  compiledGroup.label = 'Active (compiled)';
  for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
    appendOption(compiledGroup, `compiled:${i}`, activeSlotLabel(ctx, i, 'Compiled'));
  }
  slotSelect.appendChild(compiledGroup);

  const passiveGroup = document.createElement('optgroup');
  passiveGroup.label = 'Passives';
  const passives = ctx.player.passives;
  const equippedPassiveIndices = passives
    .map((mod, index) => (mod ? index : -1))
    .filter((index) => index >= 0);
  if (equippedPassiveIndices.length === 0) {
    appendOption(passiveGroup, 'passive:none', '(none equipped)', true);
  } else {
    for (const i of equippedPassiveIndices) {
      const mod = passives[i];
      if (!mod) continue;
      appendOption(passiveGroup, `passive:${i}`, passiveLabel(mod, i));
    }
  }
  slotSelect.appendChild(passiveGroup);

  const validValues = new Set(
    Array.from(slotSelect.options)
      .filter((opt) => !opt.disabled)
      .map((opt) => opt.value),
  );
  if (validValues.has(selected)) {
    slotSelect.value = selected;
  } else {
    slotSelect.value = DEFAULT_TOKEN;
  }
}

function getSelectedPayload(ctx: InspectorContext, token: InspectorToken): unknown {
  switch (token.kind) {
    case 'base':
      return ctx.player.getBaseAbility(token.index);
    case 'compiled':
      return ctx.player.getAbility(token.index);
    case 'passive':
      return ctx.player.passives[token.index] ?? null;
    default:
      return null;
  }
}

function helperTextForToken(token: InspectorToken): string {
  switch (token.kind) {
    case 'base':
      return 'Editing authored (base) schema for the selected action-bar slot. Apply Schema writes to abilityBases and recompiles splices.';
    case 'compiled':
      return 'Read-only view of the compiled ability after passive splices. Use Active (base) to edit.';
    case 'passive':
      return 'Read-only view of an equipped passive modifier (hooks, splices, stat mods).';
    default:
      return '';
  }
}

function loadSelectionIntoEditor(
  ctx: InspectorContext,
  token: InspectorToken,
  jsonTextarea: HTMLTextAreaElement,
  refs: JsonTabRefs,
): void {
  const payload = getSelectedPayload(ctx, token);
  jsonTextarea.value = payload ? JSON.stringify(structuredClone(payload), null, 2) : '';
  showJsonError(refs, '');
}

function updateSelectionUi(
  ctx: InspectorContext,
  token: InspectorToken,
  jsonTextarea: HTMLTextAreaElement,
  refs: JsonTabRefs,
  helperText: HTMLElement,
  applyBtn: HTMLButtonElement,
): void {
  helperText.textContent = helperTextForToken(token);
  applyBtn.disabled = token.kind !== 'base';
  applyBtn.style.opacity = token.kind === 'base' ? '1' : '0.5';
  loadSelectionIntoEditor(ctx, token, jsonTextarea, refs);
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
    `display:none;padding:8px;margin-bottom:8px;background:rgba(255,50,50,0.2);border-radius:6px;color:#ff6666;font-size:${FONTS.size.body};`;

  const slotSelect = document.createElement('select');
  slotSelect.style.cssText = inputStyle();
  refreshInspectorOptions(ctx, slotSelect);
  slotSelect.value = DEFAULT_TOKEN;

  const helperText = document.createElement('div');
  helperText.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;`;

  const jsonTextarea = document.createElement('textarea');
  jsonTextarea.style.cssText = `
      width: 100%;
      height: 200px;
      font-family: monospace;
      font-size: ${FONTS.size.body};
      background: ${RETRO_COLORS.panelBgOpaque};
      color: ${RETRO_COLORS.textPrimary};
      border: 1px solid ${RETRO_COLORS.borderSubtle};
      border-radius: 4px;
      padding: 8px;
      resize: vertical;
      box-sizing: border-box;
    `;

  const refs: JsonTabRefs = { errorBanner, jsonTextarea };

  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply Schema';
  applyBtn.style.cssText = buttonStyle(false) + 'margin-top:8px;width:100%;';

  const reloadSelection = (): void => {
    const token = parseInspectorToken(slotSelect.value);
    if (!token) return;
    refreshInspectorOptions(ctx, slotSelect);
    const refreshed = parseInspectorToken(slotSelect.value);
    if (!refreshed) return;
    updateSelectionUi(ctx, refreshed, jsonTextarea, refs, helperText, applyBtn);
  };

  slotSelect.onchange = reloadSelection;
  updateSelectionUi(
    ctx,
    parseInspectorToken(DEFAULT_TOKEN)!,
    jsonTextarea,
    refs,
    helperText,
    applyBtn,
  );

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
  reloadBtn.textContent = 'Reload';
  reloadBtn.style.cssText = buttonStyle(false) + 'flex:1;';
  reloadBtn.onclick = reloadSelection;

  btnRow.appendChild(copyBtn);
  btnRow.appendChild(reloadBtn);

  applyBtn.onclick = () => {
    const token = parseInspectorToken(slotSelect.value);
    if (!token || token.kind !== 'base') return;
    try {
      const parsed = JSON.parse(jsonTextarea.value);
      const normalized = normalizeAbilityPayload(parsed);
      const repaired = repairAbilityPayload(normalized);
      const validated = validateAbilitySchema(sanitizeAbilitySchema(repaired, 'SECONDARY'));
      if (!validated) {
        showJsonError(refs, 'Invalid ability schema structure.');
        return;
      }
      ctx.player.setAbility(token.index, validated);
      refreshInspectorOptions(ctx, slotSelect);
      slotSelect.value = formatInspectorToken(token);
      updateSelectionUi(ctx, token, jsonTextarea, refs, helperText, applyBtn);
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
