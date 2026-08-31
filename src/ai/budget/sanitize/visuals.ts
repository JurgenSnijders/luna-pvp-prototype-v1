import type { ImpactVfx, ProjectileStyle, TrailType, VisualDescriptor } from '../../../types/schema';
import { IMPACT_VFX_TYPES, PROJECTILE_STYLES, TRAIL_TYPES } from '../constants';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';

export function sanitizeVisuals(raw: unknown): VisualDescriptor {
  const obj = isObject(raw) ? raw : {};
  const trailRaw =
    typeof obj.trailType === 'string' ? obj.trailType.toUpperCase() : 'NONE';
  const impactRaw =
    typeof obj.impactVfx === 'string' ? obj.impactVfx.toUpperCase() : 'SPARKS';
  const styleRaw =
    typeof obj.projectileStyle === 'string'
      ? obj.projectileStyle.toUpperCase()
      : 'DISC';

  const descriptor: VisualDescriptor = {
    color: typeof obj.color === 'string' && obj.color.trim() ? obj.color : '#00e5ff',
    size: clamp(ensureFiniteNumber(obj.size, 8), 4, 32),
    projectileStyle: (PROJECTILE_STYLES.has(styleRaw) ? styleRaw : 'DISC') as ProjectileStyle,
    trailType: (TRAIL_TYPES.has(trailRaw) ? trailRaw : 'NONE') as TrailType,
    impactVfx: (IMPACT_VFX_TYPES.has(impactRaw) ? impactRaw : 'SPARKS') as ImpactVfx,
  };

  if (isObject(obj.vfx)) {
    const vfxRaw = obj.vfx;
    const vfx: VisualDescriptor['vfx'] = {};
    if (vfxRaw.glowIntensity !== undefined) {
      vfx.glowIntensity = clamp(ensureFiniteNumber(vfxRaw.glowIntensity, 1), 0, 2);
    }
    if (vfxRaw.trailDensity !== undefined) {
      vfx.trailDensity = clamp(ensureFiniteNumber(vfxRaw.trailDensity, 1), 0, 2);
    }
    if (vfxRaw.trailLengthMs !== undefined) {
      vfx.trailLengthMs = clamp(ensureFiniteNumber(vfxRaw.trailLengthMs, 400), 50, 2000);
    }
    if (vfxRaw.impactScale !== undefined) {
      vfx.impactScale = clamp(ensureFiniteNumber(vfxRaw.impactScale, 1), 0.5, 2);
    }
    if (typeof vfxRaw.secondaryColor === 'string' && vfxRaw.secondaryColor.trim()) {
      vfx.secondaryColor = vfxRaw.secondaryColor;
    }
    if (typeof vfxRaw.blendMode === 'string') {
      const bm = vfxRaw.blendMode.toUpperCase();
      if (bm === 'NORMAL' || bm === 'ADDITIVE') vfx.blendMode = bm;
    }
    if (vfxRaw.shakeIntensity !== undefined) {
      vfx.shakeIntensity = clamp(ensureFiniteNumber(vfxRaw.shakeIntensity, 1), 0, 2);
    }
    if (vfxRaw.distortion !== undefined) {
      vfx.distortion = clamp(ensureFiniteNumber(vfxRaw.distortion, 0), 0, 1);
    }
    if (Object.keys(vfx).length > 0) descriptor.vfx = vfx;
  }

  return descriptor;
}
