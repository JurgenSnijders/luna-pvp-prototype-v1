import { PassiveInventoryManager } from '../game/PassiveInventory';
import type { DraftCard } from '../types/cards';
import { extractMechanicBadges, renderBadge } from './mechanicBadges';
import { attachPassiveVaultDrag } from './passiveDragDrop';

export interface PassiveGridTileOptions {
  selected: boolean;
  rarityColor: string;
  onSelect: () => void;
}

function getPassiveIconData(card: DraftCard): string | undefined {
  return card.passivePayload?.find((mod) => mod.iconData)?.iconData;
}

function appendPassiveMechanicBadges(container: HTMLElement, card: DraftCard): void {
  const badges = document.createElement('div');
  badges.className = 'passive-tile-badges';
  for (const badge of extractMechanicBadges(card).slice(0, 3)) {
    const el = renderBadge(badge.label, badge.kind);
    el.setAttribute('data-badge', badge.label);
    badges.appendChild(el);
  }
  if (badges.childElementCount > 0) {
    container.appendChild(badges);
  }
}

function renderArtTile(tile: HTMLElement, iconData: string): void {
  tile.classList.add('passive-tile-art');
  const bg = document.createElement('div');
  bg.className = 'passive-tile-art-bg';
  bg.style.backgroundImage = `url("${iconData}")`;
  tile.appendChild(bg);
}

function renderTextTile(tile: HTMLElement, card: DraftCard): void {
  tile.classList.add('passive-tile-text');

  const title = document.createElement('div');
  title.className = 'spell-tile-title';
  title.textContent = card.title;
  tile.appendChild(title);

  appendPassiveMechanicBadges(tile, card);

  const generateBtn = document.createElement('button');
  generateBtn.type = 'button';
  generateBtn.className = 'passive-tile-generate-btn';
  const pending = PassiveInventoryManager.isIconGenerationPending(card.id);
  generateBtn.textContent = pending ? 'Generating...' : 'Generate Art';
  generateBtn.disabled = pending;
  generateBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (PassiveInventoryManager.isIconGenerationPending(card.id)) return;
    generateBtn.textContent = 'Generating...';
    generateBtn.disabled = true;
    PassiveInventoryManager.requestIconGeneration(card.id);
  });
  tile.appendChild(generateBtn);
}

export function renderPassiveGridTile(card: DraftCard, options: PassiveGridTileOptions): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'spell-tile passive-tile';
  if (options.selected) {
    tile.classList.add('tile-selected');
  }

  tile.style.borderColor = options.rarityColor;
  tile.style.boxShadow = `0 0 12px ${options.rarityColor}59`;

  const iconData = getPassiveIconData(card);
  if (iconData) {
    renderArtTile(tile, iconData);
  } else {
    renderTextTile(tile, card);
  }

  tile.addEventListener('click', options.onSelect);
  attachPassiveVaultDrag(tile, card.id);
  return tile;
}
