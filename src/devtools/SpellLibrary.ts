import { PRESETS, PRESET_GROUPS } from './Presets';
import { ACTION_SLOT_KEYS } from '../types/cards';
import type { AbilitySchema } from '../types/schema';

export interface SpellLibraryCallbacks {
  onAssign: (slotIndex: number, schema: AbilitySchema) => void;
}

interface SpellEntry {
  id: string;
  name: string;
  schema: AbilitySchema;
}

export class SpellLibrary {
  private panel: HTMLElement;
  private searchInput: HTMLInputElement;
  private listEl: HTMLElement;
  private open_ = false;
  private highlightedSlot: number | null = null;
  private extraSpells: SpellEntry[] = [];
  private collapsedGroups = new Set<string>();
  private searchQuery = '';

  constructor(private callbacks: SpellLibraryCallbacks) {
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position: fixed; top: 50%; right: 0; transform: translate(100%, -50%);
      z-index: 9600; width: 320px; max-height: 80vh; overflow-y: auto;
      padding: 16px; border-radius: 12px 0 0 12px;
      background: rgba(10, 10, 20, 0.92); backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.12); border-right: none;
      color: #e0e0e8; font-family: system-ui, sans-serif;
      transition: transform 0.25s ease; pointer-events: auto;
    `;

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    const title = document.createElement('div');
    title.textContent = 'Spell Library';
    title.style.cssText = 'font-weight:bold;font-size:14px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = this.btnStyle();
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(closeBtn);

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search presets…';
    this.searchInput.style.cssText = `
      width: 100%; padding: 8px 10px; margin-bottom: 12px; box-sizing: border-box;
      background: rgba(20, 20, 35, 0.9); color: #e0e0e8;
      border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; font-size: 12px;
    `;
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase();
      this.renderList();
    });

    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    this.panel.appendChild(header);
    this.panel.appendChild(this.searchInput);
    this.panel.appendChild(this.listEl);
    document.body.appendChild(this.panel);

    for (const group of PRESET_GROUPS) {
      if (group.id !== 'tier-a') {
        this.collapsedGroups.add(group.id);
      }
    }

    this.renderList();
  }

  private btnStyle(primary = false): string {
    return `
      padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;
      border:1px solid ${primary ? '#00ccff' : 'rgba(255,255,255,0.15)'};
      background:${primary ? 'rgba(0,200,255,0.2)' : 'rgba(255,255,255,0.05)'};
      color:#e0e0e8;
    `;
  }

  private matchesSearch(name: string): boolean {
    if (!this.searchQuery) return true;
    return name.toLowerCase().includes(this.searchQuery);
  }

  private createSpellCard(entry: SpellEntry): HTMLElement {
    const card = document.createElement('div');
    card.draggable = true;
    card.style.cssText = `
      padding: 10px; border-radius: 8px; cursor: grab;
      background: rgba(20, 20, 35, 0.9); border: 1px solid rgba(255,255,255,0.1);
    `;

    const traj = entry.schema.trajectory?.type?.replace(/_/g, ' ') ?? 'Instant';
    const title = document.createElement('div');
    title.textContent = entry.name;
    title.style.cssText = 'font-size:13px;font-weight:bold;margin-bottom:4px;';

    const meta = document.createElement('div');
    meta.textContent = `${traj} · CD ${entry.schema.cooldownMs}ms`;
    meta.style.cssText = 'font-size:10px;color:#888;margin-bottom:8px;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';

    for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
      const key = ACTION_SLOT_KEYS[i];
      const btn = document.createElement('button');
      btn.textContent = key;
      btn.style.cssText = this.btnStyle(this.highlightedSlot === i);
      btn.onclick = (e) => {
        e.stopPropagation();
        this.callbacks.onAssign(i, structuredClone(entry.schema));
      };
      btnRow.appendChild(btn);
    }

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('application/json', JSON.stringify(entry.schema));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(btnRow);
    return card;
  }

  private renderList(): void {
    this.listEl.innerHTML = '';
    const searching = this.searchQuery.length > 0;

    for (const group of PRESET_GROUPS) {
      const visibleNames = group.presetNames.filter((name) => this.matchesSearch(name));
      if (visibleNames.length === 0) continue;

      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom:4px;';

      const header = document.createElement('button');
      header.type = 'button';
      const collapsed = !searching && this.collapsedGroups.has(group.id);
      header.style.cssText = `
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px; margin-bottom: 4px; cursor: pointer; text-align: left;
        background: rgba(30, 30, 50, 0.8); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px; color: #c8d0e0; font-size: 11px; font-weight: 600;
      `;

      const label = document.createElement('span');
      label.textContent = group.label;

      const badge = document.createElement('span');
      badge.textContent = `${visibleNames.length}`;
      badge.style.cssText = `
        font-size: 10px; padding: 2px 6px; border-radius: 10px;
        background: rgba(0, 200, 255, 0.15); color: #88ddff;
      `;

      const chevron = document.createElement('span');
      chevron.textContent = collapsed ? '▸' : '▾';
      chevron.style.cssText = 'margin-left: 8px; font-size: 10px; color: #888;';

      const right = document.createElement('span');
      right.style.cssText = 'display:flex;align-items:center;';
      right.appendChild(badge);
      right.appendChild(chevron);

      header.appendChild(label);
      header.appendChild(right);

      const body = document.createElement('div');
      body.style.cssText = `display:${collapsed ? 'none' : 'flex'};flex-direction:column;gap:8px;padding-left:4px;`;

      header.onclick = () => {
        if (this.collapsedGroups.has(group.id)) {
          this.collapsedGroups.delete(group.id);
        } else {
          this.collapsedGroups.add(group.id);
        }
        this.renderList();
      };

      for (const name of visibleNames) {
        const schema = PRESETS[name];
        if (!schema) continue;
        body.appendChild(
          this.createSpellCard({ id: schema.id, name, schema }),
        );
      }

      section.appendChild(header);
      section.appendChild(body);
      this.listEl.appendChild(section);
    }

    const forgedVisible = this.extraSpells.filter((e) => this.matchesSearch(e.name));
    if (forgedVisible.length > 0) {
      const forgedSection = document.createElement('div');
      forgedSection.style.cssText = 'margin-top:8px;';

      const forgedHeader = document.createElement('div');
      forgedHeader.textContent = `Forged this session (${forgedVisible.length})`;
      forgedHeader.style.cssText =
        'font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.03em;';

      const forgedBody = document.createElement('div');
      forgedBody.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      for (const entry of forgedVisible) {
        forgedBody.appendChild(this.createSpellCard(entry));
      }

      forgedSection.appendChild(forgedHeader);
      forgedSection.appendChild(forgedBody);
      this.listEl.appendChild(forgedSection);
    }
  }

  addSpell(schema: AbilitySchema): void {
    if (this.extraSpells.some((s) => s.id === schema.id)) return;
    if (Object.values(PRESETS).some((p) => p.id === schema.id)) return;
    this.extraSpells.push({ id: schema.id, name: schema.name, schema: structuredClone(schema) });
    this.renderList();
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  open(): void {
    this.open_ = true;
    this.highlightedSlot = null;
    this.panel.style.transform = 'translate(0, -50%)';
    this.renderList();
  }

  openForSlot(slotIndex: number): void {
    this.highlightedSlot = slotIndex;
    this.open();
  }

  close(): void {
    this.open_ = false;
    this.highlightedSlot = null;
    this.panel.style.transform = 'translate(100%, -50%)';
  }
}
