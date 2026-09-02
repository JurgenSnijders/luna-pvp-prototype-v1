import { FONTS, RETRO_COLORS } from '../../ui/tokens';

export function buttonStyle(active: boolean): string {
  return `
      padding: 6px 10px;
      border: 1px solid ${active ? RETRO_COLORS.neonCyan : RETRO_COLORS.borderSubtle};
      background: ${active ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)'};
      color: ${RETRO_COLORS.textPrimary};
      border-radius: 4px;
      cursor: pointer;
      font-size: ${FONTS.size.body};
      font-family: ${FONTS.mono};
    `;
}

export function sectionHeader(title: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = title;
  el.style.cssText = `font-weight:bold;margin-bottom:8px;font-size:${FONTS.size.md};font-family:${FONTS.mono};color:${RETRO_COLORS.textPrimary};letter-spacing:0.04em;`;
  return el;
}

export function sectionDivider(): string {
  return `margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid ${RETRO_COLORS.borderSubtle};`;
}

export function helperText(parent: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin:-4px 0 10px;line-height:1.35;`;
  parent.appendChild(el);
}

export function sliderRow(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  unit = '',
): { refresh: () => void; setMax: (newMax: number) => void } {
  const row = document.createElement('div');
  row.style.marginBottom = '10px';
  const lbl = document.createElement('label');
  lbl.style.display = 'block';
  lbl.style.marginBottom = '4px';
  lbl.style.fontSize = FONTS.size.sm;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.style.cssText =
    'width:100%;accent-color:var(--retro-neon-cyan, #00e5ff);';
  const update = () => {
    const v = parseFloat(input.value);
    set(v);
    lbl.textContent = `${label}: ${step < 1 ? v.toFixed(2) : Math.round(v)}${unit}`;
  };
  const refresh = () => {
    input.value = String(get());
    const v = parseFloat(input.value);
    lbl.textContent = `${label}: ${step < 1 ? v.toFixed(2) : Math.round(v)}${unit}`;
  };
  input.oninput = update;
  refresh();
  row.appendChild(lbl);
  row.appendChild(input);
  parent.appendChild(row);
  return {
    refresh,
    setMax: (newMax: number) => {
      input.max = String(newMax);
      refresh();
    },
  };
}

export function numberSliderRow(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  unit = '',
): { refresh: () => void } {
  const row = document.createElement('div');
  row.style.marginBottom = '10px';
  const lbl = document.createElement('label');
  lbl.style.display = 'block';
  lbl.style.marginBottom = '4px';
  lbl.style.fontSize = FONTS.size.sm;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.style.cssText =
    'width:100%;margin-bottom:6px;accent-color:var(--retro-neon-cyan, #00e5ff);';

  const number = document.createElement('input');
  number.type = 'number';
  number.min = String(min);
  number.max = String(max);
  number.step = String(step);
  number.style.cssText = inputStyle();

  const formatValue = (v: number): string =>
    step < 1 ? v.toFixed(2) : String(Math.round(v));

  const updateLabel = (v: number): void => {
    lbl.textContent = `${label}: ${formatValue(v)}${unit}`;
  };

  const commit = (raw: number): void => {
    const v = Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : get();
    slider.value = String(v);
    number.value = String(v);
    set(v);
    updateLabel(v);
  };

  const refresh = (): void => {
    const v = get();
    slider.value = String(v);
    number.value = String(v);
    updateLabel(v);
  };

  slider.oninput = () => commit(parseFloat(slider.value));
  number.onchange = () => commit(parseFloat(number.value));
  number.onblur = () => commit(parseFloat(number.value));
  number.onkeydown = (e) => {
    if (e.key === 'Enter') {
      commit(parseFloat(number.value));
      number.blur();
    }
  };

  refresh();
  row.appendChild(lbl);
  row.appendChild(slider);
  row.appendChild(number);
  parent.appendChild(row);
  return { refresh };
}

export function numberRow(
  parent: HTMLElement,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (v: number) => void,
  unit = '',
): { refresh: () => void } {
  const row = document.createElement('div');
  row.style.marginBottom = '10px';
  const lbl = document.createElement('label');
  lbl.style.display = 'block';
  lbl.style.marginBottom = '4px';
  lbl.style.fontSize = FONTS.size.sm;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.style.cssText = inputStyle();
  const commit = () => {
    const raw = parseFloat(input.value);
    const v = Number.isFinite(raw)
      ? Math.max(min, Math.min(max, raw))
      : get();
    input.value = String(v);
    set(v);
    lbl.textContent = `${label}: ${Math.round(v)}${unit}`;
  };
  const refresh = () => {
    const v = get();
    input.value = String(v);
    lbl.textContent = `${label}: ${Math.round(v)}${unit}`;
  };
  input.onchange = commit;
  input.onblur = commit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      commit();
      input.blur();
    }
  };
  refresh();
  row.appendChild(lbl);
  row.appendChild(input);
  parent.appendChild(row);
  return { refresh };
}

export function inputStyle(): string {
  return `
      width:100%;padding:8px;margin-bottom:6px;box-sizing:border-box;
      background:${RETRO_COLORS.panelBgOpaque};color:${RETRO_COLORS.textPrimary};
      border:1px solid ${RETRO_COLORS.borderSubtle};
      border-radius:4px;font-size:${FONTS.size.body};font-family:${FONTS.mono};
    `;
}

export function selectRow(
  parent: HTMLElement,
  label: string,
  options: { value: string; label: string }[],
  get: () => string,
  set: (v: string) => void,
): { refresh: () => void; select: HTMLSelectElement } {
  const row = document.createElement('div');
  row.style.marginBottom = '10px';
  const lbl = document.createElement('label');
  lbl.style.cssText = `display:block;margin-bottom:4px;font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};`;
  lbl.textContent = label;
  const select = document.createElement('select');
  select.style.cssText = inputStyle();
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    select.appendChild(el);
  }
  const refresh = () => {
    select.value = get();
  };
  select.onchange = () => set(select.value);
  refresh();
  row.appendChild(lbl);
  row.appendChild(select);
  parent.appendChild(row);
  return { refresh, select };
}
