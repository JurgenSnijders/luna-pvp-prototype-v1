import type { SpatialZone } from '../entities/SpatialZone';
import { Vector2D } from '../math/Vector2D';
import type { SpellArchetype, VfxLayer } from '../types/schema';
import { hexToRgb, mixTowardWhite, rgbToHex } from './canvas/glowDisc';
import { getArchetypeColor } from './canvas/SpellIconGenerator';

export type ZoneVfxFamily = 'EMBER' | 'FROST' | 'VOID' | 'ARC' | 'BLOOM' | 'GRIT';

/**
 * Where inside the zone a tick spawns. `playVfxLayers` emits everything at the single
 * position it is handed, so the shape of a zone body comes from picking that point.
 */
type ZoneEmissionMode = 'CENTER' | 'EDGE_INWARD' | 'EDGE_TANGENT' | 'AREA';

const ARCHETYPE_FAMILY: Record<SpellArchetype, ZoneVfxFamily> = {
  FIRE: 'EMBER',
  PLASMA: 'EMBER',
  BLOOD: 'EMBER',
  FROST: 'FROST',
  AERO: 'FROST',
  VOID: 'VOID',
  GRAVITY: 'VOID',
  PHASE: 'VOID',
  CHRONO: 'VOID',
  LIGHTNING: 'ARC',
  MAGNETIC: 'ARC',
  SONIC: 'ARC',
  NATURE: 'BLOOM',
  TOXIC: 'BLOOM',
  HOLY: 'BLOOM',
  ARCANE: 'BLOOM',
  KINETIC: 'GRIT',
  EARTH: 'GRIT',
  CHAOS: 'GRIT',
};

const FAMILY_EMISSION: Record<ZoneVfxFamily, ZoneEmissionMode> = {
  EMBER: 'CENTER',
  BLOOM: 'CENTER',
  VOID: 'EDGE_INWARD',
  FROST: 'EDGE_TANGENT',
  ARC: 'AREA',
  GRIT: 'AREA',
};

/** `size` is authored as a fraction of zone radius and scaled by it at play time. */
const FAMILY_LAYERS: Record<ZoneVfxFamily, VfxLayer[]> = {
  BLOOM: [
    { kind: 'FLASH', size: 0.55, lifetime: 0.7, colorRef: 'PRIMARY', layer: 'SECONDARY' },
    {
      kind: 'RING',
      size: 0.9,
      lifetime: 0.6,
      thickness: 2,
      colorRef: 'SECONDARY',
      layer: 'SECONDARY',
    },
    { kind: 'SPARKS', count: 3, size: 0.04, lifetime: 0.8, colorRef: 'PRIMARY', layer: 'SECONDARY' },
  ],
  EMBER: [
    { kind: 'FLASH', size: 0.4, lifetime: 0.45, colorRef: 'PRIMARY', layer: 'SECONDARY' },
    { kind: 'SPARKS', count: 4, size: 0.05, lifetime: 0.6, colorRef: 'SECONDARY', layer: 'SECONDARY' },
    {
      kind: 'STREAK',
      count: 2,
      size: 0.3,
      speed: 60,
      spreadDeg: 40,
      lifetime: 0.5,
      colorRef: 'PRIMARY',
      layer: 'SECONDARY',
    },
  ],
  FROST: [
    {
      kind: 'STREAK',
      count: 3,
      size: 0.35,
      speed: 70,
      spreadDeg: 20,
      lifetime: 0.45,
      colorRef: 'SECONDARY',
      layer: 'SECONDARY',
    },
    { kind: 'SPARKS', count: 2, size: 0.03, lifetime: 0.55, colorRef: 'PRIMARY', layer: 'SECONDARY' },
  ],
  VOID: [
    {
      kind: 'STREAK',
      count: 3,
      size: 0.45,
      speed: 90,
      spreadDeg: 25,
      lifetime: 0.35,
      colorRef: 'PRIMARY',
      layer: 'SECONDARY',
    },
  ],
  ARC: [
    {
      kind: 'STREAK',
      count: 2,
      size: 0.25,
      speed: 140,
      spreadDeg: 120,
      lifetime: 0.18,
      colorRef: 'SECONDARY',
      layer: 'SECONDARY',
    },
    { kind: 'SPARKS', count: 3, size: 0.03, lifetime: 0.3, colorRef: 'PRIMARY', layer: 'SECONDARY' },
  ],
  GRIT: [
    { kind: 'SPARKS', count: 3, size: 0.04, lifetime: 0.5, colorRef: 'PRIMARY', layer: 'SECONDARY' },
    {
      kind: 'RING',
      size: 0.22,
      lifetime: 0.4,
      thickness: 2,
      colorRef: 'SECONDARY',
      layer: 'SECONDARY',
    },
  ],
};

/** The slice of `ParticleSystem` a zone tick needs, so the interpreter stays backend-agnostic. */
export interface ZoneVfxSink {
  playVfxLayers(
    pos: Vector2D,
    layers: VfxLayer[],
    primary: string,
    secondary: string,
    scale?: number,
    headingRad?: number,
  ): void;
}

export function resolveZoneVfxFamily(archetype: SpellArchetype): ZoneVfxFamily {
  return ARCHETYPE_FAMILY[archetype] ?? 'GRIT';
}

function resolveEmission(
  center: Vector2D,
  radius: number,
  mode: ZoneEmissionMode,
): { pos: Vector2D; headingRad: number } {
  switch (mode) {
    case 'CENTER':
      return { pos: center, headingRad: Math.random() * Math.PI * 2 };
    case 'EDGE_INWARD': {
      const angle = Math.random() * Math.PI * 2;
      const pos = center.add(Vector2D.fromAngle(angle, radius * 0.9));
      return { pos, headingRad: angle + Math.PI };
    }
    case 'EDGE_TANGENT': {
      const angle = Math.random() * Math.PI * 2;
      const pos = center.add(Vector2D.fromAngle(angle, radius * 0.9));
      return { pos, headingRad: angle + Math.PI / 2 };
    }
    case 'AREA':
    default: {
      const angle = Math.random() * Math.PI * 2;
      // sqrt keeps jittered points uniform across the disc instead of clumping at the center.
      const dist = radius * Math.sqrt(Math.random()) * 0.8;
      const pos = center.add(Vector2D.fromAngle(angle, dist));
      return { pos, headingRad: Math.random() * Math.PI * 2 };
    }
  }
}

/** One frame of archetype-colored body VFX for a live zone. */
export function playZoneTick(particles: ZoneVfxSink, zone: SpatialZone): void {
  const family = resolveZoneVfxFamily(zone.spellArchetype);
  const radius = zone.config.radius;
  const primary = getArchetypeColor(zone.spellArchetype);
  const secondary = rgbToHex(mixTowardWhite(hexToRgb(primary), 0.45));
  const { pos, headingRad } = resolveEmission(zone.pos, radius, FAMILY_EMISSION[family]);

  particles.playVfxLayers(pos, FAMILY_LAYERS[family], primary, secondary, radius, headingRad);
}
