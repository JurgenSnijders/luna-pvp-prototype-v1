import { IMPACT_VFX_TYPES, PROJECTILE_STYLES, TRAIL_TYPES, VFX_BLEND_MODES } from '../constants';
import type {
  ImpactVfx,
  ProjectileStyle,
  TrailType,
  VisualDescriptor,
  VfxBlendMode,
  VfxParams,
} from '../types';
import { isNumber, isObject, isString } from './helpers';

export function validateVfxParams(value: unknown): VfxParams | null {
  if (!isObject(value)) return null;
  const params: VfxParams = {};
  if (value.glowIntensity !== undefined) {
    if (!isNumber(value.glowIntensity)) return null;
    params.glowIntensity = value.glowIntensity;
  }
  if (value.trailDensity !== undefined) {
    if (!isNumber(value.trailDensity)) return null;
    params.trailDensity = value.trailDensity;
  }
  if (value.trailLengthMs !== undefined) {
    if (!isNumber(value.trailLengthMs)) return null;
    params.trailLengthMs = value.trailLengthMs;
  }
  if (value.impactScale !== undefined) {
    if (!isNumber(value.impactScale)) return null;
    params.impactScale = value.impactScale;
  }
  if (value.secondaryColor !== undefined) {
    if (!isString(value.secondaryColor)) return null;
    params.secondaryColor = value.secondaryColor;
  }
  if (value.blendMode !== undefined) {
    if (!isString(value.blendMode) || !VFX_BLEND_MODES.has(value.blendMode)) return null;
    params.blendMode = value.blendMode as VfxBlendMode;
  }
  if (value.shakeIntensity !== undefined) {
    if (!isNumber(value.shakeIntensity)) return null;
    params.shakeIntensity = value.shakeIntensity;
  }
  if (value.distortion !== undefined) {
    if (!isNumber(value.distortion)) return null;
    params.distortion = value.distortion;
  }
  return params;
}

export function validateVisualDescriptor(value: unknown): VisualDescriptor | null {
  if (!isObject(value)) return null;
  if (!isString(value.color) || !isNumber(value.size)) return null;
  if (!isString(value.trailType) || !TRAIL_TYPES.has(value.trailType)) return null;
  if (!isString(value.impactVfx) || !IMPACT_VFX_TYPES.has(value.impactVfx)) return null;

  let projectileStyle: ProjectileStyle = 'DISC';
  if (value.projectileStyle !== undefined) {
    if (!isString(value.projectileStyle) || !PROJECTILE_STYLES.has(value.projectileStyle)) {
      return null;
    }
    projectileStyle = value.projectileStyle as ProjectileStyle;
  }

  const descriptor: VisualDescriptor = {
    color: value.color,
    size: value.size,
    projectileStyle,
    trailType: value.trailType as TrailType,
    impactVfx: value.impactVfx as ImpactVfx,
  };

  if (value.vfx !== undefined) {
    const vfx = validateVfxParams(value.vfx);
    if (!vfx) return null;
    descriptor.vfx = vfx;
  }

  return descriptor;
}
