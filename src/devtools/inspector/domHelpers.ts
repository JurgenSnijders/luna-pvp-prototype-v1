import { FONTS, RETRO_COLORS } from '../../ui/tokens';

export function buttonStyle(active: boolean): string {
  return `
      padding: 6px 10px;
      border: 1px solid ${active ? RETRO_COLORS.neonCyan : RETRO_COLORS.borderSubtle};
      background: ${active ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)'};
      color: ${RETRO_COLORS.textPrimary};
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: ${FONTS.mono};
    `;
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
): { refresh: () => void } {
  const row = document.createElement('div');
  row.style.marginBottom = '10px';
  const lbl = document.createElement('label');
  lbl.style.display = 'block';
  lbl.style.marginBottom = '4px';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.style.width = '100%';
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
  return { refresh };
}

export function inputStyle(): string {
  return `
      width:100%;padding:8px;margin-bottom:6px;box-sizing:border-box;
      background:${RETRO_COLORS.panelBgOpaque};color:${RETRO_COLORS.textPrimary};
      border:1px solid ${RETRO_COLORS.borderSubtle};
      border-radius:4px;font-size:12px;font-family:${FONTS.mono};
    `;
}

export interface SliderRowHandle {
  element: HTMLElement;
  setValue: (val: number) => void;
}

function formatSliderValue(value: number, step: number): string {
  if (step < 0.001) return value.toFixed(4);
  if (step < 0.01) return value.toFixed(3);
  if (step < 1) return value.toFixed(2);
  return String(Math.round(value));
}

export function createSliderRow(
  label: string,
  min: number,
  max: number,
  step: number,
  initialValue: number,
  onChange: (val: number) => void,
): SliderRowHandle {
  const row = document.createElement('div');
  row.style.cssText = 'margin-bottom: 10px;';

  const header = document.createElement('div');
  header.style.cssText =
    'display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;';

  const lbl = document.createElement('span');
  lbl.textContent = label;
  lbl.style.cssText = `font-size: 11px; color: ${RETRO_COLORS.textMuted}; font-family: ${FONTS.mono};`;

  const readout = document.createElement('span');
  readout.style.cssText = `font-size: 11px; color: ${RETRO_COLORS.textPrimary}; font-family: ${FONTS.mono};`;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.style.cssText = `width: 100%; accent-color: ${RETRO_COLORS.neonCyan};`;

  let syncing = false;

  const setValue = (val: number): void => {
    syncing = true;
    input.value = String(val);
    readout.textContent = formatSliderValue(val, step);
    syncing = false;
  };

  input.oninput = () => {
    if (syncing) return;
    const v = parseFloat(input.value);
    readout.textContent = formatSliderValue(v, step);
    onChange(v);
  };

  setValue(initialValue);

  header.appendChild(lbl);
  header.appendChild(readout);
  row.appendChild(header);
  row.appendChild(input);

  return { element: row, setValue };
}

export interface SelectRowHandle {
  element: HTMLElement;
  setValue: (val: string) => void;
}

export function createSelectRow(
  label: string,
  options: Array<{ value: string; label: string }>,
  initialValue: string,
  onChange: (val: string) => void,
): SelectRowHandle {
  const row = document.createElement('div');
  row.style.cssText = 'margin-bottom: 10px;';

  const lbl = document.createElement('div');
  lbl.textContent = label;
  lbl.style.cssText = `font-size: 11px; color: ${RETRO_COLORS.textMuted}; font-family: ${FONTS.mono}; margin-bottom: 4px;`;

  const select = document.createElement('select');
  select.style.cssText = inputStyle();

  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  }

  let syncing = false;

  const setValue = (val: string): void => {
    syncing = true;
    select.value = val;
    syncing = false;
  };

  select.onchange = () => {
    if (syncing) return;
    onChange(select.value);
  };

  setValue(initialValue);

  row.appendChild(lbl);
  row.appendChild(select);

  return { element: row, setValue };
}
