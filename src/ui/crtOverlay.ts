import { getEffectiveCrtSettings } from '../devtools/graphicsSettings';
import { RETRO_COLORS } from './tokens';

const OVERLAY_ID = 'crt-overlay';

function ensureOverlay(): HTMLDivElement {
  let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;';
    document.body.appendChild(el);
  }
  return el;
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`;
}

/**
 * Canvas2D/LOW-tier stand-in for the WebGL CRT pass: scanlines and vignette
 * only, no barrel distortion. Never shown while the WebGL CRT is presenting.
 */
export function applyCrtOverlay(): void {
  const crt = getEffectiveCrtSettings();
  const hasVfxCanvas = !!document.getElementById('vfx-canvas');
  const show = crt.crtEnabled && (crt.cssOverlay || (!hasVfxCanvas && !crt.webglCrt));
  const el = ensureOverlay();

  if (!show) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  const scan = rgba(RETRO_COLORS.bgDark, crt.scanlineIntensity * 0.35);
  const vig = rgba(RETRO_COLORS.bgDark, crt.vignette * 0.65);
  el.style.background = `
    repeating-linear-gradient(0deg, transparent, transparent 2px, ${scan} 2px, ${scan} 4px),
    radial-gradient(ellipse at center, transparent 40%, ${vig} 100%)
  `;
}
