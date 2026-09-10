import {
  IMPACT_VFX_TYPES,
  PROJECTILE_STYLES,
  TRAIL_TYPES,
  VFX_BLEND_MODES,
  VFX_COLOR_REFS,
  VFX_DRAW_LAYERS,
  VFX_LAYER_KINDS,
} from '../constants';
import type {
  ImpactVfx,
  ProjectileStyle,
  TrailType,
  VisualDescriptor,
  VfxBlendMode,
  VfxColorRef,
  VfxDrawLayer,
  VfxLayer,
  VfxLayerKind,
  VfxParams,
} from '../types';
import { clamp, isNumber, isObject, isString } from './helpers';

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

export function validateVfxLayer(value: unknown): VfxLayer | null {
  if (!isObject(value)) return null;
  if (!isString(value.kind) || !VFX_LAYER_KINDS.has(value.kind)) return null;
  if (!isNumber(value.size) || !isNumber(value.lifetime)) return null;
  if (!isString(value.colorRef) || !VFX_COLOR_REFS.has(value.colorRef)) return null;
  if (!isString(value.layer) || !VFX_DRAW_LAYERS.has(value.layer)) return null;

  const layer: VfxLayer = {
    kind: value.kind as VfxLayerKind,
    size: clamp(value.size, 4, 200),
    lifetime: clamp(value.lifetime, 0.05, 2),
    colorRef: value.colorRef as VfxColorRef,
    layer: value.layer as VfxDrawLayer,
  };
  if (value.count !== undefined) {
    if (!isNumber(value.count)) return null;
    layer.count = clamp(value.count, 1, 24);
  }
  if (value.speed !== undefined) {
    if (!isNumber(value.speed)) return null;
    layer.speed = clamp(value.speed, 20, 600);
  }
  if (value.thickness !== undefined) {
    if (!isNumber(value.thickness)) return null;
    layer.thickness = clamp(value.thickness, 0.5, 12);
  }
  if (value.spreadDeg !== undefined) {
    if (!isNumber(value.spreadDeg)) return null;
    layer.spreadDeg = clamp(value.spreadDeg, 10, 360);
  }
  return layer;
}

export function validateImpactLayers(value: unknown): VfxLayer[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const layers: VfxLayer[] = [];
  for (const entry of value) {
    const layer = validateVfxLayer(entry);
    if (!layer) return null;
    layers.push(layer);
  }
  return layers.length > 0 ? layers : null;
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

  if (value.impactLayers !== undefined) {
    const impactLayers = validateImpactLayers(value.impactLayers);
    if (!impactLayers) return null;
    descriptor.impactLayers = impactLayers;
  }

  return descriptor;
}
