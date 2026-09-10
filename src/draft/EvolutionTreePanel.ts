import { MAX_EVOLUTION_TIER } from '../ai/budget/constants';
import { formatSaturationChips } from '../ai/budget/saturation';
import { EvolutionStore } from '../game/EvolutionStore';
import type { SkillCategory } from '../types/cards';
import type { AbilitySchema } from '../types/schema';
import type { EvolutionNode } from '../types/evolution';
import { btnStyle } from './workshopStyles';

export interface EvolutionTreePanelOpts {
  spellId: string;
  category: SkillCategory;
  onGenerateMechanic: (spellId: string) => void;
  onCommitted: () => void;
  stopPreview: () => void;
  startPreview: (container: HTMLElement, spell: AbilitySchema) => void;
}

function getParentIdAtTier(tree: { activePath: string[]; nodes: EvolutionNode[] }, tier: number): string | null {
  if (tier <= 1) return null;
  const nodeId = tree.activePath[tier - 2];
  return nodeId ?? null;
}

function getNodesAtTier(
  tree: { nodes: EvolutionNode[] },
  tier: number,
  parentId: string | null,
): EvolutionNode[] {
  return tree.nodes.filter((node) => node.tier === tier && node.parentId === parentId);
}

function buildNodeCard(
  label: string,
  description: string,
  active: boolean,
  locked: boolean,
  onClick?: () => void,
): HTMLElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `evolution-node-card spell-tile${active ? ' tile-selected' : ''}${locked ? ' evolution-node-locked' : ''}`;
  card.disabled = locked;

  const title = document.createElement('div');
  title.className = 'evolution-node-title';
  title.textContent = label;

  const desc = document.createElement('div');
  desc.className = 'evolution-node-desc';
  desc.textContent = description;

  card.appendChild(title);
  card.appendChild(desc);

  if (onClick && !locked) {
    card.addEventListener('click', onClick);
  }

  return card;
}

export function renderEvolutionTree(host: HTMLElement, opts: EvolutionTreePanelOpts): void {
  opts.stopPreview();
  host.innerHTML = '';

  const resolvedId = EvolutionStore.getResolvedSpellId(opts.spellId);
  const tree = EvolutionStore.getTree(resolvedId) ?? EvolutionStore.ensureTree(resolvedId, opts.category);
  const resolved = EvolutionStore.resolveSpell(resolvedId, opts.category);
  const spell = resolved.schema;
  const saturationChips = formatSaturationChips(resolved.saturation);

  const root = document.createElement('div');
  root.className = 'evolution-tree-root';

  const header = document.createElement('div');
  header.className = 'evolution-tree-header';

  const title = document.createElement('div');
  title.className = 'evolution-tree-title';
  title.textContent = `${spell.name ?? 'Spell'} — Evolution Tree`;

  const stats = document.createElement('div');
  stats.className = 'evolution-tree-stats';
  stats.innerHTML = `
    <span>Tier ${resolved.tier}/${MAX_EVOLUTION_TIER}</span>
    <span>CD ${(spell.cooldownMs / 1000).toFixed(2)}s</span>
    <span>Recoil ${spell.recoilKick}</span>
    <span>Power ${Math.round(resolved.power)}</span>
  `;

  const chipRow = document.createElement('div');
  chipRow.className = 'evolution-saturation-chips';
  for (const chip of saturationChips) {
    const chipEl = document.createElement('span');
    chipEl.className = 'evolution-saturation-chip';
    chipEl.textContent = chip;
    chipRow.appendChild(chipEl);
  }

  const headerActions = document.createElement('div');
  headerActions.className = 'evolution-tree-header-actions';

  const backHint = document.createElement('div');
  backHint.className = 'evolution-tree-hint';
  backHint.textContent = 'Stat nodes apply instantly. Use Generate Mechanic for LLM structural changes.';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'evolution-reset-btn';
  resetBtn.textContent = 'RESET TREE';
  resetBtn.style.cssText = btnStyle();
  resetBtn.addEventListener('click', () => {
    EvolutionStore.resetTree(resolvedId, opts.category);
    opts.onCommitted();
    renderEvolutionTree(host, opts);
  });

  headerActions.appendChild(resetBtn);
  header.appendChild(title);
  header.appendChild(stats);
  if (saturationChips.length > 0) header.appendChild(chipRow);
  header.appendChild(headerActions);
  header.appendChild(backHint);

  const previewWrap = document.createElement('div');
  previewWrap.className = 'evolution-tree-preview';
  opts.startPreview(previewWrap, spell);

  const tiers = document.createElement('div');
  tiers.className = 'evolution-tree-tiers';

  const currentTier = tree.activePath.length;
  const atCap = currentTier >= MAX_EVOLUTION_TIER;

  if (atCap) {
    const capMsg = document.createElement('div');
    capMsg.className = 'evolution-tree-cap-msg';
    capMsg.textContent = `Maximum evolution tier (${MAX_EVOLUTION_TIER}) reached.`;
    tiers.appendChild(capMsg);
  }

  for (let tier = 1; tier <= MAX_EVOLUTION_TIER; tier++) {
    const row = document.createElement('div');
    row.className = 'evolution-tier-row';
    const locked = tier > currentTier + 1;
    if (locked) row.classList.add('evolution-tier-locked');

    const label = document.createElement('div');
    label.className = 'evolution-tier-label';
    label.textContent = `Tier ${tier}`;
    row.appendChild(label);

    const cards = document.createElement('div');
    cards.className = 'evolution-tier-cards';

    const parentId = getParentIdAtTier(tree, tier);
    const tierNodes = getNodesAtTier(tree, tier, parentId);
    const activeNodeId = tree.activePath[tier - 1];

    for (const node of tierNodes) {
      const isActive = node.id === activeNodeId;
      const description =
        node.kind === 'STAT'
          ? node.modifiers?.map((mod) => `${mod.op} ${mod.field}`).join(', ') ?? node.label
          : node.diff?.join(' · ') ?? 'Mechanic evolution';
      cards.appendChild(
        buildNodeCard(node.label, description, isActive, locked, () => {
          if (isActive) return;
          const nextPath = tree.activePath.slice(0, tier - 1);
          nextPath.push(node.id);
          EvolutionStore.setActivePath(resolvedId, nextPath, opts.category);
          opts.onCommitted();
          renderEvolutionTree(host, opts);
        }),
      );
    }

    if (!locked && tier === currentTier + 1 && !atCap) {
      const eligible = EvolutionStore.getEligibleStatNodes(resolvedId, opts.category);
      const usedCatalogIds = new Set(
        tierNodes
          .filter((node) => node.kind === 'STAT')
          .map((node) => node.label),
      );

      for (const entry of eligible) {
        if (usedCatalogIds.has(entry.label)) continue;
        cards.appendChild(
          buildNodeCard(entry.label, entry.description, false, false, () => {
            EvolutionStore.addStatNode(resolvedId, entry.id, opts.category);
            opts.onCommitted();
            renderEvolutionTree(host, opts);
          }),
        );
      }

      cards.appendChild(
        buildNodeCard('Generate Mechanic', 'LLM structural mutation', false, false, () => {
          opts.onGenerateMechanic(resolvedId);
        }),
      );
    }

    row.appendChild(cards);
    tiers.appendChild(row);
  }

  root.appendChild(header);
  root.appendChild(previewWrap);
  root.appendChild(tiers);
  host.appendChild(root);
}
