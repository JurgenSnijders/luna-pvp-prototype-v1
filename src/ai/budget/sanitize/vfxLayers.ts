import type {
  VfxColorRef,
  VfxDrawLayer,
  VfxLayer,
  VfxLayerKind,
} from '../../../types/schema';
import {
  VFX_COLOR_REFS,
  VFX_DRAW_LAYERS,
  VFX_LAYER_KINDS,
} from '../../../types/schema/constants';
import { maxVfxLayerSpawns, truncateVfxLayers } from '../../../render/backends/vfxLayerComposer';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';

const LOW_TIER_PARTICLE_BUDGET = 1024;

function sanitizeSingleLayer(raw: unknown): VfxLayer | null {
  if (!isObject(raw)) return null;
  const kindRaw = typeof raw.kind === 'string' ? raw.kind.toUpperCase() : '';
  if (!VFX_LAYER_KINDS.has(kindRaw)) return null;
  const colorRefRaw = typeof raw.colorRef === 'string' ? raw.colorRef.toUpperCase() : '';
  if (!VFX_COLOR_REFS.has(colorRefRaw)) return null;
  const layerRaw = typeof raw.layer === 'string' ? raw.layer.toUpperCase() : '';
  if (!VFX_DRAW_LAYERS.has(layerRaw)) return null;

  const kind = kindRaw as VfxLayerKind;
  const layer: VfxLayer = {
    kind,
    size: clamp(ensureFiniteNumber(raw.size, 24), 4, 200),
    lifetime: clamp(ensureFiniteNumber(raw.lifetime, 0.35), 0.05, 2),
    colorRef: colorRefRaw as VfxColorRef,
    layer: layerRaw as VfxDrawLayer,
  };

  if (raw.count !== undefined) {
    layer.count = clamp(ensureFiniteNumber(raw.count, 8), 1, 24);
  }
  if (raw.speed !== undefined) {
    layer.speed = clamp(ensureFiniteNumber(raw.speed, 120), 20, 600);
  }
  if (raw.thickness !== undefined) {
    layer.thickness = clamp(ensureFiniteNumber(raw.thickness, 3), 0.5, 12);
  }
  if (raw.spreadDeg !== undefined) {
    layer.spreadDeg = clamp(ensureFiniteNumber(raw.spreadDeg, 360), 10, 360);
  }

  return layer;
}

export function sanitizeImpactLayers(raw: unknown): VfxLayer[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const layers: VfxLayer[] = [];
  for (const entry of raw) {
    const layer = sanitizeSingleLayer(entry);
    if (layer) layers.push(layer);
  }
  if (layers.length === 0) return undefined;
  const maxSpawns = maxVfxLayerSpawns(LOW_TIER_PARTICLE_BUDGET);
  const truncated = truncateVfxLayers(layers, maxSpawns);
  return truncated.length > 0 ? truncated : undefined;
}
