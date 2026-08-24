import { PRESETS, PRESET_NAMES } from './Presets';
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
  private listEl: HTMLElement;
  private open_ = false;
  private highlightedSlot: number | null = null;
  private extraSpells: SpellEntry[] = [];

  constructor(private callbacks: SpellLibraryCallbacks) {
    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      position: fixed; top: 50%; right: 0; transform: translate(100%, -50%);
      z-index: 9600; width: 300px; max-height: 80vh; overflow-y: auto;
      padding: 16px; border-radius: 12px 0 0 12px;
      background: rgba(10, 10, 20, 0.92); backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.12); border-right: none;
      color: #e0e0e8; font-family: system-ui, sans-serif;
      transition: transform 0.25s ease; pointer-events: auto;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    const title = document.createElement('div');
    title.textContent = 'Spell Library';
    title.style.cssText = 'font-weight:bold;font-size:14px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = this.btnStyle();
    closeBtn.onclick = () => this.close();
    header.appendChild(title);
    header.appendChild(closeBtn);

    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    this.panel.appendChild(header);
    this.panel.appendChild(this.listEl);
    document.body.appendChild(this.panel);

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

  private getAllSpells(): SpellEntry[] {
    const entries: SpellEntry[] = [];
    const seen = new Set<string>();

    for (const name of PRESET_NAMES) {
      const schema = PRESETS[name];
      if (!seen.has(schema.id)) {
        seen.add(schema.id);
        entries.push({ id: schema.id, name, schema });
      }
    }

    for (const entry of this.extraSpells) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        entries.push(entry);
      }
    }

    return entries;
  }

  private renderList(): void {
    this.listEl.innerHTML = '';

    for (const entry of this.getAllSpells()) {
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
      this.listEl.appendChild(card);
    }
  }

  addSpell(schema: AbilitySchema): void {
    if (this.extraSpells.some((s) => s.id === schema.id)) return;
    if (PRESET_NAMES.some((name) => PRESETS[name].id === schema.id)) return;
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
