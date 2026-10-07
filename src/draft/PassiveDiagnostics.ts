import { FONTS, RETRO_COLORS } from '../ui/tokens';

export function renderPassiveDiagnostics(container: HTMLElement): void {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'passive-diagnostics-panel';
  panel.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    height: 100%;
    color: ${RETRO_COLORS.textPrimary};
    font-family: ${FONTS.mono};
  `;

  const heading = document.createElement('h2');
  heading.textContent = 'System Diagnostics';
  heading.style.cssText = `
    margin: 0;
    font-size: ${FONTS.size.lg};
    letter-spacing: 0.04em;
    color: ${RETRO_COLORS.neonCyan};
  `;

  const body = document.createElement('p');
  body.textContent = 'Passive effects will be aggregated here.';
  body.style.cssText = `
    margin: 0;
    font-size: ${FONTS.size.body};
    line-height: 1.5;
    color: ${RETRO_COLORS.textMuted};
  `;

  panel.appendChild(heading);
  panel.appendChild(body);
  container.appendChild(panel);
}
