export type SpellArchetype =
  | 'KINETIC'
  | 'FIRE'
  | 'FROST'
  | 'LIGHTNING'
  | 'VOID'
  | 'HOLY'
  | 'TOXIC'
  | 'ARCANE'
  | 'MAGNETIC'
  | 'SONIC'
  | 'AERO'
  | 'GRAVITY'
  | 'EARTH'
  | 'CHRONO'
  | 'PLASMA'
  | 'NATURE'
  | 'BLOOD'
  | 'PHASE'
  | 'CHAOS';

export type TrajectoryType =
  | 'LINEAR'
  | 'RETURN_TO_SOURCE'
  | 'ORBIT_ANCHOR'
  | 'HOMING_SLERP'
  | 'DISCONTINUOUS_BLINK';

export type FieldType =
  | 'RADIAL_IMPULSE'
  | 'VORTEX_TANGENT'
  | 'FRICTION_OVERRIDE'
  | 'MASS_ATTRACTOR';

export type TriggerType =
  | 'ON_CAST'
  | 'ON_TICK'
  | 'ON_HIT'
  | 'ON_EXPIRY'
  | 'ON_RETURN'
  | 'ON_HAZARD_CONTACT'
  | 'ON_RECAST'
  | 'ON_HIT_WALL'
  | 'ON_DISTANCE_TRAVELED';

export type ConstraintType = 'SPRING_TETHER' | 'DISTANCE_ROD' | 'SURFACE_PIN';

export type ActionType =
  | 'ADD_INSTABILITY'
  | 'APPLY_IMPULSE'
  | 'SPAWN_FIELD'
  | 'SPAWN_PROJECTILE'
  | 'SPAWN_CONSTRAINT'
  | 'CAST_CHILD_PAYLOAD'
  | 'MODIFY_STAT'
  | 'TELEPORT'
  | 'APPLY_STASIS'
  | 'RELEASE_STASIS'
  | 'REFLECT_PROJECTILES'
  | 'SPAWN_OBSTACLE'
  | 'MUTATE_TERRAIN'
  | 'MORPH_ENTITY'
  | 'SPAWN_ACTOR'
  | 'APPLY_STEALTH';

export type ObstacleShape = 'CIRCLE' | 'BOX';
export type TerrainType = 'SAFE' | 'LAVA';

export type ActionTarget = 'TARGET' | 'CASTER' | 'SELF';

export type ConditionQuery =
  | 'STAT_THRESHOLD'
  | 'TAG_CHECK'
  | 'PROXIMITY_COUNT'
  | 'SURFACE_TYPE'
  | 'COMBO_STEP';

export type InputProfileMode =
  | 'INSTANT'
  | 'CHARGE_AND_RELEASE'
  | 'CHANNELED'
  | 'COMBO_CHAIN';

export interface InputProfile {
  mode: InputProfileMode;
  maxChargeMs?: number;
  minChargeMs?: number;
  channelIntervalMs?: number;
  comboWindowMs?: number;
}

export type ResourceType = 'COOLDOWN' | 'HEAT' | 'AMMO' | 'HEALTH_PCT';

export interface ResourceCost {
  type: ResourceType;
  cost: number;
  maxCapacity?: number;
  rechargeRate?: number;
  lockoutDurationMs?: number;
}

export type ComparisonOperator = 'LT' | 'GT' | 'EQ' | 'LTE' | 'GTE';

export interface ConditionNode {
  query: ConditionQuery;
  target?: ActionTarget;
  stat?: 'health' | 'instabilityPct';
  comparison?: ComparisonOperator;
  value: number | string;
  radius?: number;
}

export type ImpulseDirectionMode =
  | 'AWAY_FROM_ORIGIN'
  | 'TOWARDS_CASTER'
  | 'TOWARDS_ORIGIN'
  | 'ALONG_TRAJECTORY'
  | 'PERPENDICULAR_TRAJECTORY'
  | 'CUSTOM';

export type EmitterDistribution = 'FAN' | 'RADIAL' | 'RANDOM_CONE' | 'PARALLEL';

export type ProjectileStyle =
  | 'DISC'
  | 'BEAM'
  | 'PULSING_ORB'
  | 'SHURIKEN'
  | 'CHAOS_LIGHTNING'
  | 'PRISM'
  | 'RUNE_SIGIL'
  | 'PLASMA_TENDRIL'
  | 'VOID_RIFT'
  | 'CRYSTAL_SHARD';

export type TrailType =
  | 'NONE'
  | 'SMOKE'
  | 'ICE_GLOW'
  | 'MAGMA_SPARKS'
  | 'NEON_RIBBON'
  | 'EMBER_SPIRAL'
  | 'FROST_CRYSTALS'
  | 'VOID_TENDRIL'
  | 'PLASMA_ARC'
  | 'DUST_PUFF';

export type ImpactVfx =
  | 'SPARKS'
  | 'SHOCKWAVE'
  | 'ICE_BURST'
  | 'VORTEX_SWIRL'
  | 'MINI_NUKE'
  | 'PLASMA_BLOOM'
  | 'SHATTER'
  | 'IMPLOSION'
  | 'LIGHTNING_FORK'
  | 'RUNE_FLASH';

export type VfxBlendMode = 'NORMAL' | 'ADDITIVE';

export interface VfxParams {
  glowIntensity?: number;
  trailDensity?: number;
  trailLengthMs?: number;
  impactScale?: number;
  secondaryColor?: string;
  blendMode?: VfxBlendMode;
  shakeIntensity?: number;
  distortion?: number;
}

export interface TrajectoryConfig {
  type: TrajectoryType;
  speed?: number;
  turnAccel?: number;
  maxRange?: number;
  piercing?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  blinkDistance?: number;
}

export interface FieldConfig {
  fieldType: FieldType;
  radius: number;
  strength: number;
  durationMs: number;
  frictionValue?: number;
  attachToSource?: boolean;
  offset?: { x: number; y: number };
  detachOnParentDeath?: boolean;
}

export interface EmitterConfig {
  count: number;
  spreadDeg: number;
  aimOffsetDeg?: number;
  distribution: EmitterDistribution;
  inheritVelocityRatio?: number;
}

export interface VisualDescriptor {
  color: string;
  size: number;
  projectileStyle: ProjectileStyle;
  trailType: TrailType;
  impactVfx: ImpactVfx;
  vfx?: VfxParams;
}

export interface AddInstabilityAction {
  type: 'ADD_INSTABILITY';
  amount: number;
  target?: ActionTarget;
}

export interface ApplyImpulseAction {
  type: 'APPLY_IMPULSE';
  baseForce: number;
  direction?: { x: number; y: number };
  target?: ActionTarget;
  directionMode?: ImpulseDirectionMode;
}

export interface SpawnFieldAction {
  type: 'SPAWN_FIELD';
  field: FieldConfig;
  target?: ActionTarget;
}

export interface SpawnProjectileAction {
  type: 'SPAWN_PROJECTILE';
  projectileTrajectory: TrajectoryConfig;
  emitter?: EmitterConfig;
  triggers?: TriggerNode[];
  visuals?: VisualDescriptor;
}

export interface ModifyStatAction {
  type: 'MODIFY_STAT';
  stat: 'mass' | 'linearDrag' | 'moveSpeed' | 'instabilityPct' | 'health';
  value: number;
  mode: 'add' | 'set' | 'multiply';
  target?: ActionTarget;
}

export interface TeleportAction {
  type: 'TELEPORT';
  distance: number;
  direction?: { x: number; y: number };
  target?: ActionTarget;
}

export interface ApplyStasisAction {
  type: 'APPLY_STASIS';
  durationMs: number;
  forceAccumulatorScale?: number;
  target?: ActionTarget;
}

export interface ReleaseStasisAction {
  type: 'RELEASE_STASIS';
  target?: ActionTarget;
}

export interface ReflectProjectilesAction {
  type: 'REFLECT_PROJECTILES';
  target?: ActionTarget;
  radius?: number;
}

export interface ObstacleConfig {
  shape: ObstacleShape;
  width: number;
  height: number;
  angle?: number;
  isDestructible?: boolean;
  maxHealth?: number;
  durationMs: number;
}

export interface TerrainMutationConfig {
  type: TerrainType;
  radius: number;
  durationMs: number;
}

export interface SpawnObstacleAction {
  type: 'SPAWN_OBSTACLE';
  obstacle: ObstacleConfig;
  target?: ActionTarget;
}

export interface MutateTerrainAction {
  type: 'MUTATE_TERRAIN';
  mutation: TerrainMutationConfig;
  target?: ActionTarget;
}

export interface MorphConfig {
  radius?: number;
  mass?: number;
  speedMultiplier?: number;
  durationMs: number;
}

export type ActorArchetype = 'TURRET' | 'DECOY';

export interface ActorConfig {
  archetype: ActorArchetype;
  health: number;
  durationMs: number;
  anchored?: boolean;
  radius?: number;
  mass?: number;
  targetingRange?: number;
  triggers?: TriggerNode[];
  visuals?: VisualDescriptor;
}

export interface MorphEntityAction {
  type: 'MORPH_ENTITY';
  morph: MorphConfig;
  target?: ActionTarget;
}

export interface SpawnActorAction {
  type: 'SPAWN_ACTOR';
  actor: ActorConfig;
  target?: ActionTarget;
}

export interface ApplyStealthAction {
  type: 'APPLY_STEALTH';
  durationMs: number;
  revealOnCast?: boolean;
  target?: ActionTarget;
}

export interface ConstraintConfig {
  type: ConstraintType;
  stiffness?: number;
  restLength?: number;
  maxBreakDistance?: number;
  durationMs: number;
}

export interface SpawnConstraintAction {
  type: 'SPAWN_CONSTRAINT';
  constraint: ConstraintConfig;
  source?: ActionTarget;
  target?: ActionTarget;
}

export interface TriggerNode {
  trigger: TriggerType;
  tickIntervalMs?: number;
  triggerDistance?: number;
  fireOnHitDeath?: boolean;
  conditions?: ConditionNode[];
  actions: ActionPayload[];
  ifFalseActions?: ActionPayload[];
  children?: TriggerNode[];
}

export interface AbilitySchema {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  archetype?: SpellArchetype;
  cooldownMs: number;
  recoilKick: number;
  trajectory?: TrajectoryConfig;
  triggers: TriggerNode[];
  visuals?: VisualDescriptor;
  metadata?: Record<string, unknown>;
  inputProfile?: InputProfile;
  resourceCost?: ResourceCost;
}

export interface CastChildPayloadAction {
  type: 'CAST_CHILD_PAYLOAD';
  payload: AbilitySchema;
  inheritVelocity?: boolean;
  inheritInstability?: boolean;
  maxRecursionDepth?: number;
  target?: ActionTarget;
}

export type ActionPayload =
  | AddInstabilityAction
  | ApplyImpulseAction
  | SpawnFieldAction
  | SpawnProjectileAction
  | SpawnConstraintAction
  | CastChildPayloadAction
  | ModifyStatAction
  | TeleportAction
  | ApplyStasisAction
  | ReleaseStasisAction
  | ReflectProjectilesAction
  | SpawnObstacleAction
  | MutateTerrainAction
  | MorphEntityAction
  | SpawnActorAction
  | ApplyStealthAction;
