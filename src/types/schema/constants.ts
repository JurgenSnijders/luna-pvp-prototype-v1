export const SPELL_ARCHETYPES: readonly string[] = [
  'KINETIC',
  'FIRE',
  'FROST',
  'LIGHTNING',
  'VOID',
  'HOLY',
  'TOXIC',
  'ARCANE',
  'MAGNETIC',
  'SONIC',
  'AERO',
  'GRAVITY',
  'EARTH',
  'CHRONO',
  'PLASMA',
  'NATURE',
  'BLOOD',
  'PHASE',
  'CHAOS',
];

export const SPELL_ARCHETYPE_SET: ReadonlySet<string> = new Set(SPELL_ARCHETYPES);

export const TARGETING_MODES = ['DIRECTIONAL', 'GROUND_POINT'] as const;
export const TARGETING_MODE_SET: ReadonlySet<string> = new Set(TARGETING_MODES);

export const TRAJECTORY_TYPES: ReadonlySet<string> = new Set([
  'LINEAR',
  'RETURN_TO_SOURCE',
  'ORBIT_ANCHOR',
  'HOMING_SLERP',
  'DISCONTINUOUS_BLINK',
  'BALLISTIC_ARC',
]);

export const FIELD_TYPES: ReadonlySet<string> = new Set([
  'RADIAL_IMPULSE',
  'VORTEX_TANGENT',
  'FRICTION_OVERRIDE',
  'MASS_ATTRACTOR',
]);

export const TRIGGER_TYPES: ReadonlySet<string> = new Set([
  'ON_CAST',
  'ON_TICK',
  'ON_HIT',
  'ON_EXPIRY',
  'ON_RETURN',
  'ON_HAZARD_CONTACT',
  'ON_RECAST',
  'ON_HIT_WALL',
  'ON_DISTANCE_TRAVELED',
  'ON_BOUNCE',
  'ON_AIR_APEX',
  'ON_GROUND_SLAM',
]);

export const CONSTRAINT_TYPES: ReadonlySet<string> = new Set([
  'SPRING_TETHER',
  'DISTANCE_ROD',
  'SURFACE_PIN',
]);

export const ACTION_TYPES: ReadonlySet<string> = new Set([
  'ADD_INSTABILITY',
  'APPLY_IMPULSE',
  'SPAWN_FIELD',
  'SPAWN_PROJECTILE',
  'SPAWN_CONSTRAINT',
  'CAST_CHILD_PAYLOAD',
  'MODIFY_STAT',
  'TELEPORT',
  'APPLY_STASIS',
  'RELEASE_STASIS',
  'REFLECT_PROJECTILES',
  'SPAWN_OBSTACLE',
  'MUTATE_TERRAIN',
  'MORPH_ENTITY',
  'SPAWN_ACTOR',
  'APPLY_STEALTH',
  'APPLY_STATUS',
  'LAUNCH_VERTICAL',
  'SET_GRAVITY_SCALE',
]);

export const OBSTACLE_SHAPES: ReadonlySet<string> = new Set(['CIRCLE', 'BOX']);
export const TERRAIN_TYPES: ReadonlySet<string> = new Set(['SAFE', 'LAVA']);
export const ACTOR_ARCHETYPES: ReadonlySet<string> = new Set(['TURRET', 'DECOY']);

export const ACTION_TARGETS: ReadonlySet<string> = new Set(['TARGET', 'CASTER', 'SELF']);

export const CONDITION_QUERIES: ReadonlySet<string> = new Set([
  'STAT_THRESHOLD',
  'TAG_CHECK',
  'PROXIMITY_COUNT',
  'SURFACE_TYPE',
  'COMBO_STEP',
  'ELEVATION',
]);

export const INPUT_PROFILE_MODES: ReadonlySet<string> = new Set([
  'INSTANT',
  'CHARGE_AND_RELEASE',
  'CHANNELED',
  'COMBO_CHAIN',
]);

export const RESOURCE_TYPES: ReadonlySet<string> = new Set([
  'COOLDOWN',
  'HEAT',
  'AMMO',
  'HEALTH_PCT',
]);

export const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(['LT', 'GT', 'EQ', 'LTE', 'GTE']);

export const IMPULSE_DIRECTION_MODES: ReadonlySet<string> = new Set([
  'AWAY_FROM_ORIGIN',
  'TOWARDS_CASTER',
  'TOWARDS_ORIGIN',
  'ALONG_TRAJECTORY',
  'PERPENDICULAR_TRAJECTORY',
  'CUSTOM',
]);

export const EMITTER_DISTRIBUTIONS: ReadonlySet<string> = new Set([
  'FAN',
  'RADIAL',
  'RANDOM_CONE',
  'PARALLEL',
]);

export const PROJECTILE_STYLES: ReadonlySet<string> = new Set([
  'DISC',
  'BEAM',
  'PULSING_ORB',
  'SHURIKEN',
  'CHAOS_LIGHTNING',
  'PRISM',
  'RUNE_SIGIL',
  'PLASMA_TENDRIL',
  'VOID_RIFT',
  'CRYSTAL_SHARD',
]);

export const TRAIL_TYPES: ReadonlySet<string> = new Set([
  'NONE',
  'SMOKE',
  'ICE_GLOW',
  'MAGMA_SPARKS',
  'NEON_RIBBON',
  'EMBER_SPIRAL',
  'FROST_CRYSTALS',
  'VOID_TENDRIL',
  'PLASMA_ARC',
  'DUST_PUFF',
]);

export const IMPACT_VFX_TYPES: ReadonlySet<string> = new Set([
  'SPARKS',
  'SHOCKWAVE',
  'ICE_BURST',
  'VORTEX_SWIRL',
  'MINI_NUKE',
  'PLASMA_BLOOM',
  'SHATTER',
  'IMPLOSION',
  'LIGHTNING_FORK',
  'RUNE_FLASH',
]);

export const VFX_BLEND_MODES: ReadonlySet<string> = new Set(['NORMAL', 'ADDITIVE']);
