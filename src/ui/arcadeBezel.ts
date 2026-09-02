import {
  getEffectiveCrtSettings,
  getPostEffectParam,
  isPostEffectEnabled,
} from '../devtools/graphicsSettings';
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
    el.style.background = '';
    return;
  }

  const vmin = Math.min(window.innerWidth, window.innerHeight);
  const insetSpread = Math.round(vmin * 0.08);
  const insetBlur = Math.round(vmin * 0.024);
  const glareOn = isPostEffectEnabled('GLASS_GLARE');
  const glareIntensity = glareOn ? getPostEffectParam('GLASS_GLARE', 'intensity') : 0;

  el.style.display = 'block';
  el.style.boxShadow = [
    `inset 0 0 ${insetSpread}px ${insetBlur}px ${RETRO_COLORS.bgDark}`,
    `inset 0 0 0 3px ${RETRO_COLORS.borderSubtle}`,
  ].join(', ');

  if (glareIntensity > 0) {
    const alpha = (0.08 + glareIntensity * 0.14).toFixed(3);
    el.style.background = `linear-gradient(135deg, rgba(255, 255, 255, ${alpha}) 0%, rgba(255, 255, 255, 0) 42%)`;
  } else {
    el.style.background = '';
  }
}
