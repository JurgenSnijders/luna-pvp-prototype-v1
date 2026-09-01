export function buttonStyle(active: boolean): string {
  return `
      padding: 6px 10px;
      border: 1px solid ${active ? '#00ccff' : 'rgba(255,255,255,0.15)'};
      background: ${active ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.05)'};
      color: #e0e0e8;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
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
      background:#0a0a14;color:#e0e0e8;border:1px solid rgba(255,255,255,0.15);
      border-radius:6px;font-size:12px;
    `;
}
