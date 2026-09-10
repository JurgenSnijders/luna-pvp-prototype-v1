import { ACTION_SLOT_KEYS, type ActionSlotKey } from '../../types/cards';
import type { InspectorContext } from '../InspectorUI';
import { FONTS, RETRO_COLORS } from '../../ui/tokens';
import { buttonStyle, inputStyle } from './domHelpers';
import { buildSpellGraphDisplay, type SpellGraphNode, type SpellGraphNodeKind } from './spellGraph';

const NODE_COLORS: Record<SpellGraphNodeKind, string> = {
  root: RETRO_COLORS.neonCyan,
  meta: RETRO_COLORS.textPrimary,
  trajectory: '#6ee7ff',
  input: '#6ee7b7',
  resource: '#fcd34d',
  trigger: '#fbbf24',
  condition: '#c4b5fd',
  action: RETRO_COLORS.textPrimary,
  if_false: '#f87171',
  host: '#94a3b8',
};

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

function renderGraphNode(node: SpellGraphNode, parent: HTMLElement, depth: number): void {
  const row = document.createElement('div');
  row.style.cssText = `
    display: flex;
    flex-direction: column;
    margin-left: ${depth * 12}px;
    margin-bottom: 4px;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    font-family: ${FONTS.mono};
    font-size: ${FONTS.size.sm};
    line-height: 1.35;
  `;

  const kind = document.createElement('span');
  kind.textContent = node.kind === 'root' ? 'SPELL' : node.kind.toUpperCase();
  kind.style.cssText = `
    color: ${NODE_COLORS[node.kind]};
    font-size: ${FONTS.size.badge};
    letter-spacing: 0.04em;
    text-transform: uppercase;
  `;

  const label = document.createElement('span');
  label.textContent = node.label;
  label.style.cssText = `color: ${RETRO_COLORS.textPrimary}; font-weight: 600;`;

  header.appendChild(kind);
  header.appendChild(label);

  if (node.detail) {
    const detail = document.createElement('span');
    detail.textContent = node.detail;
    detail.style.cssText = `color: ${RETRO_COLORS.textMuted}; font-size: ${FONTS.size.badge};`;
    header.appendChild(detail);
  }

  row.appendChild(header);
  parent.appendChild(row);

  if (node.children.length > 0) {
    const childWrap = document.createElement('div');
    childWrap.style.cssText = 'margin-top: 2px;';
    for (const child of node.children) {
      renderGraphNode(child, childWrap, depth + 1);
    }
    parent.appendChild(childWrap);
  }
}

export function buildGraphTab(parent: HTMLElement, ctx: InspectorContext): void {
  const slotSelect = document.createElement('select');
  slotSelect.style.cssText = inputStyle();
  refreshSlotOptions(ctx, slotSelect);

  const helperText = document.createElement('div');
  helperText.textContent = 'Read-only trigger/action tree for the equipped spell.';
  helperText.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;`;

  const graphRoot = document.createElement('div');
  graphRoot.style.cssText = `
    max-height: 360px;
    overflow: auto;
    padding: 8px;
    border: 1px solid ${RETRO_COLORS.borderSubtle};
    border-radius: 4px;
    background: ${RETRO_COLORS.panelBgOpaque};
  `;

  const emptyState = document.createElement('div');
  emptyState.textContent = 'No ability equipped in this slot.';
  emptyState.style.cssText = `color:${RETRO_COLORS.textMuted};font-size:${FONTS.size.sm};`;

  const renderGraph = (): void => {
    graphRoot.innerHTML = '';
    const slotIndex = getSlotIndex(slotSelect);
    if (slotIndex < 0) return;

    refreshSlotOptions(ctx, slotSelect);
    const ability = ctx.player.getAbility(slotIndex);
    if (!ability) {
      graphRoot.appendChild(emptyState);
      return;
    }

    renderGraphNode(buildSpellGraphDisplay(ability), graphRoot, 0);
  };

  slotSelect.onchange = renderGraph;

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Refresh graph';
  reloadBtn.style.cssText = buttonStyle(false) + 'margin-top:8px;width:100%;';
  reloadBtn.onclick = renderGraph;

  parent.appendChild(slotSelect);
  parent.appendChild(helperText);
  parent.appendChild(graphRoot);
  parent.appendChild(reloadBtn);

  renderGraph();
}
