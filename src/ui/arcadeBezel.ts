import { getEffectiveCrtSettings } from '../devtools/graphicsSettings';
import { RETRO_COLORS } from './tokens';

const BEZEL_ID = 'arcade-bezel';

function ensureBezel(): HTMLDivElement {
  let el = document.getElementById(BEZEL_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = BEZEL_ID;
    // z-index 3 sits above #vfx-canvas (1) and physics debug (2),
    // below the inspector (10) and HUD (9000+).
    el.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:3;border-radius:18px;';
    document.body.appendChild(el);
  }
  return el;
}

export function applyArcadeBezel(): void {
  const el = ensureBezel();
  if (!getEffectiveCrtSettings().arcadeBezel) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  el.style.boxShadow = [
    `inset 0 0 80px 24px ${RETRO_COLORS.bgDark}`,
    `inset 0 0 0 3px ${RETRO_COLORS.borderSubtle}`,
    'inset 0 0 120px 40px rgba(0, 0, 0, 0.53)',
  ].join(', ');
}
