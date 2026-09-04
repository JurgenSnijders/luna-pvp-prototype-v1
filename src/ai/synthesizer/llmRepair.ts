import { sanitizeAbilitySchema } from '../BudgetEngine';
import type { CardRarity, SkillCategory } from '../../types/cards';
import type { TriggerNode } from '../../types/schema';
import {
  ACTION_TYPES,
  normalizeAbilityPayload,
  normalizeActionPayload,
  TRIGGER_TYPES,
  validateAbilitySchema,
} from '../../types/schema';

export function diagnoseDraftCardsValidation(val: unknown): string[] {
  const reasons: string[] = [];

  if (val === null || typeof val !== 'object') {
    reasons.push('root:not_object');
    return reasons;
  }

  let cards: unknown[] | null = null;
  if (Array.isArray(val)) {
    cards = val;
    reasons.push(`root:top_level_array length=${val.length}`);
  } else {
    const root = val as Record<string, unknown>;
    reasons.push(`root:keys=${Object.keys(root).join(',') || '(none)'}`);
    if (Array.isArray(root.cards)) {
      cards = root.cards;
      reasons.push(`root:cards_array length=${root.cards.length}`);
    } else {
      reasons.push('root:missing_cards_array');
      return reasons;
    }
  }

  if (!cards) return reasons;
  if (cards.length !== 3) reasons.push(`cards:expected_3 got_${cards.length}`);

  const rarities = new Set(['COMMON', 'RARE', 'EPIC', 'CHAOTIC']);
  const cardTypes = new Set(['ACTIVE_ABILITY', 'PASSIVE_UPGRADE']);

  cards.forEach((raw, i) => {
    if (raw === null || typeof raw !== 'object') {
      reasons.push(`card[${i}]:not_object`);
      return;
    }
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== 'string') reasons.push(`card[${i}]:missing_id`);
    // Stage 1 metadata cards use "name" instead of "title" — either satisfies the check.
    if (typeof c.title !== 'string' && typeof c.name !== 'string') {
      reasons.push(`card[${i}]:missing_title`);
    }
    if (typeof c.tagline !== 'string') reasons.push(`card[${i}]:missing_tagline`);
    if (typeof c.description !== 'string') reasons.push(`card[${i}]:missing_description`);
    // rarity/type/budgetCost are optional now (defaulted by validateDraftCard) — only
    // flag them when present-but-invalid, not merely absent.
    if (c.rarity !== undefined && (typeof c.rarity !== 'string' || !rarities.has(c.rarity))) {
      reasons.push(`card[${i}]:invalid_rarity=${String(c.rarity)}`);
    }
    if (c.type !== undefined && (typeof c.type !== 'string' || !cardTypes.has(c.type))) {
      reasons.push(`card[${i}]:invalid_type=${String(c.type)}`);
    }
    if (
      c.budgetCost !== undefined &&
      (typeof c.budgetCost !== 'number' || !Number.isFinite(c.budgetCost))
    ) {
      reasons.push(`card[${i}]:invalid_budgetCost=${String(c.budgetCost)}`);
    }

    // abilityPayload is optional for metadata-only forge/evolve cards — only diagnose
    // it when present but malformed, not merely absent.
    if (c.type === 'ACTIVE_ABILITY' && c.abilityPayload !== undefined) {
      if (!validateAbilitySchema(c.abilityPayload)) {
        const payload = c.abilityPayload as Record<string, unknown>;
        reasons.push(
          `card[${i}]:abilityPayload_invalid keys=${Object.keys(payload ?? {}).join(',')}`,
        );
        if (typeof payload?.id !== 'string') reasons.push(`card[${i}]:ability_missing_id`);
        if (typeof payload?.name !== 'string') reasons.push(`card[${i}]:ability_missing_name`);
        if (!Array.isArray(payload?.triggers)) reasons.push(`card[${i}]:ability_missing_triggers`);
        if (payload?.trajectory !== undefined) {
          const traj = payload.trajectory as Record<string, unknown>;
          reasons.push(`card[${i}]:trajectory_type=${String(traj?.type)}`);
        }
        reasons.push(...diagnoseAbilityPayload(c.abilityPayload, i));
        reasons.push(...diagnoseAbilitySchemaSteps(c.abilityPayload, i));
      }
    }

    if (c.type === 'PASSIVE_UPGRADE' && !Array.isArray(c.passivePayload)) {
      reasons.push(`card[${i}]:missing_passivePayload`);
    }
  });

  return reasons;
}

function diagnoseAbilityPayload(payload: unknown, cardIndex: number): string[] {
  const reasons: string[] = [];
  if (payload === null || typeof payload !== 'object') {
    reasons.push(`card[${cardIndex}]:ability_not_object`);
    return reasons;
  }

  const p = payload as Record<string, unknown>;
  if (typeof p.cooldownMs === 'string') {
    reasons.push(`card[${cardIndex}]:cooldownMs_is_string`);
  } else if (typeof p.cooldownMs !== 'number') {
    reasons.push(`card[${cardIndex}]:cooldownMs_type=${typeof p.cooldownMs}`);
  }
  if (typeof p.recoilKick === 'string') {
    reasons.push(`card[${cardIndex}]:recoilKick_is_string`);
  } else if (typeof p.recoilKick !== 'number') {
    reasons.push(`card[${cardIndex}]:recoilKick_type=${typeof p.recoilKick}`);
  }

  if (
    p.metadata !== undefined &&
    (p.metadata === null || typeof p.metadata !== 'object' || Array.isArray(p.metadata))
  ) {
    reasons.push(`card[${cardIndex}]:metadata_invalid_type=${typeof p.metadata}`);
  }

  if (p.trajectory !== undefined && typeof p.trajectory === 'object' && p.trajectory !== null) {
    const traj = p.trajectory as Record<string, unknown>;
    for (const key of ['speed', 'maxRange', 'piercing', 'turnAccel']) {
      if (typeof traj[key] === 'string') {
        reasons.push(`card[${cardIndex}]:trajectory_${key}_is_string`);
      }
    }
  }

  if (!Array.isArray(p.triggers)) {
    reasons.push(`card[${cardIndex}]:triggers_not_array`);
    return reasons;
  }

  const validTriggers = TRIGGER_TYPES;
  const validActions = ACTION_TYPES;

  p.triggers.forEach((raw, ti) => {
    if (raw === null || typeof raw !== 'object') {
      reasons.push(`card[${cardIndex}]:trigger[${ti}]:not_object`);
      return;
    }
    const trig = raw as Record<string, unknown>;
    const triggerVal = trig.trigger ?? trig.on;
    if (typeof triggerVal !== 'string' || !validTriggers.has(triggerVal)) {
      reasons.push(`card[${cardIndex}]:trigger[${ti}]:invalid=${String(triggerVal)}`);
      if (trig.on !== undefined && trig.trigger === undefined) {
        reasons.push(`card[${cardIndex}]:trigger[${ti}]:uses_on_key`);
      }
    }
    if (!Array.isArray(trig.actions)) {
      reasons.push(`card[${cardIndex}]:trigger[${ti}]:missing_actions`);
      return;
    }
    trig.actions.forEach((rawAction, ai) => {
      if (rawAction === null || typeof rawAction !== 'object') {
        reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:not_object`);
        return;
      }
      const action = rawAction as Record<string, unknown>;
      if (typeof action.type !== 'string' || !validActions.has(action.type)) {
        reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:invalid_type=${String(action.type)}`);
      }
      if (action.type === 'SPAWN_FIELD' && action.field && typeof action.field === 'object') {
        const field = action.field as Record<string, unknown>;
        if (typeof field.fieldType === 'string' && !['RADIAL_IMPULSE', 'VORTEX_TANGENT', 'FRICTION_OVERRIDE', 'MASS_ATTRACTOR'].includes(field.fieldType)) {
          reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:invalid_fieldType=${field.fieldType}`);
        }
        for (const key of ['radius', 'strength', 'durationMs']) {
          if (typeof field[key] === 'string') {
            reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:field_${key}_is_string`);
          }
        }
      }
      for (const key of ['amount', 'baseForce', 'distance', 'value']) {
        if (typeof action[key] === 'string') {
          reasons.push(`card[${cardIndex}]:trigger[${ti}]:action[${ai}]:${key}_is_string`);
        }
      }
    });
  });

  return reasons;
}

function diagnoseAbilitySchemaSteps(payload: unknown, cardIndex: number): string[] {
  const reasons: string[] = [];
  if (payload === null || typeof payload !== 'object') {
    reasons.push(`card[${cardIndex}]:schema:not_object`);
    return reasons;
  }

  const p = payload as Record<string, unknown>;
  if (typeof p.cooldownMs !== 'number' || !Number.isFinite(p.cooldownMs)) {
    reasons.push(`card[${cardIndex}]:schema:cooldownMs=${String(p.cooldownMs)}`);
  }
  if (typeof p.recoilKick !== 'number' || !Number.isFinite(p.recoilKick)) {
    reasons.push(`card[${cardIndex}]:schema:recoilKick=${String(p.recoilKick)}`);
  }

  if (!Array.isArray(p.triggers)) {
    reasons.push(`card[${cardIndex}]:schema:triggers_type=${typeof p.triggers}`);
    return reasons;
  }

  p.triggers.forEach((raw, ti) => {
    if (raw === null || typeof raw !== 'object') {
      reasons.push(`card[${cardIndex}]:schema:trigger[${ti}]:not_object`);
      return;
    }
    const trig = raw as Record<string, unknown>;
    if (!Array.isArray(trig.actions)) {
      reasons.push(
        `card[${cardIndex}]:schema:trigger[${ti}]:actions_type=${typeof trig.actions}`,
      );
      return;
    }
    const triggerProbe = {
      id: 'probe_trigger',
      name: 'probe',
      cooldownMs: 100,
      recoilKick: 0,
      triggers: [trig],
    };
    if (!validateAbilitySchema(triggerProbe)) {
      reasons.push(`card[${cardIndex}]:schema:trigger[${ti}]_invalid`);
    }
  });

  if (p.trajectory !== undefined) {
    const trajectoryProbe = {
      id: 'probe_trajectory',
      name: 'probe',
      cooldownMs: 100,
      recoilKick: 0,
      triggers: [],
      trajectory: p.trajectory,
    };
    if (!validateAbilitySchema(trajectoryProbe)) {
      reasons.push(`card[${cardIndex}]:schema:trajectory_block_invalid`);
    }
    const traj = p.trajectory as Record<string, unknown>;
    for (const key of ['speed', 'maxRange', 'piercing', 'turnAccel', 'orbitRadius', 'orbitSpeed']) {
      const val = traj[key];
      if (val !== undefined && (typeof val !== 'number' || !Number.isFinite(val))) {
        reasons.push(`card[${cardIndex}]:schema:trajectory.${key}=${String(val)}`);
      }
    }
  }

  if (!validateAbilitySchema(payload)) {
    reasons.push(`card[${cardIndex}]:schema:validate_failed`);
  }

  return reasons;
}

const TRIGGER_ALIASES: Record<string, TriggerNode['trigger']> = {
  ON_IMPACT: 'ON_HIT',
  ON_COLLISION: 'ON_HIT',
  ON_CONTACT: 'ON_HIT',
  ON_DESTROY: 'ON_EXPIRY',
  ON_DEATH: 'ON_EXPIRY',
  ON_SPAWN: 'ON_CAST',
  ON_DETONATE: 'ON_RECAST',
  ON_WALL_HIT: 'ON_HIT_WALL',
};

const ACTION_ALIASES: Record<string, string> = {
  SPAWN_CHILD_PROJECTILE: 'SPAWN_PROJECTILE',
  SPAWN_PROJECTILE: 'SPAWN_PROJECTILE',
  CREATE_PROJECTILE: 'SPAWN_PROJECTILE',
  SPAWN_FIELD_ZONE: 'SPAWN_FIELD',
  IMPULSE: 'APPLY_IMPULSE',
  INSTABILITY: 'ADD_INSTABILITY',
};

const FIELD_ALIASES: Record<string, string> = {
  VORTEX: 'VORTEX_TANGENT',
  IMPULSE: 'RADIAL_IMPULSE',
  RADIAL: 'RADIAL_IMPULSE',
  ATTRACTOR: 'MASS_ATTRACTOR',
  GRAVITY: 'MASS_ATTRACTOR',
  BLACK_HOLE: 'MASS_ATTRACTOR',
  SINGULARITY: 'MASS_ATTRACTOR',
  FRICTION: 'FRICTION_OVERRIDE',
  ICE: 'FRICTION_OVERRIDE',
};

const TRAJECTORY_ALIASES: Record<string, string> = {
  HOMING: 'HOMING_SLERP',
  SEEKER: 'HOMING_SLERP',
  BOOMERANG: 'RETURN_TO_SOURCE',
  ORBIT: 'ORBIT_ANCHOR',
  BLINK: 'DISCONTINUOUS_BLINK',
  LASER: 'LINEAR',
  BEAM: 'LINEAR',
  PROJECTILE: 'LINEAR',
  BOLT: 'LINEAR',
  SHOT: 'LINEAR',
  RAIL: 'LINEAR',
  RAILGUN: 'LINEAR',
};

const VALID_TRAJECTORY_TYPES = new Set([
  'LINEAR',
  'RETURN_TO_SOURCE',
  'ORBIT_ANCHOR',
  'HOMING_SLERP',
  'DISCONTINUOUS_BLINK',
]);

const VALID_TRAIL_TYPES = new Set([
  'NONE', 'SMOKE', 'ICE_GLOW', 'MAGMA_SPARKS', 'NEON_RIBBON',
  'EMBER_SPIRAL', 'FROST_CRYSTALS', 'VOID_TENDRIL', 'PLASMA_ARC', 'DUST_PUFF',
]);
const VALID_IMPACT_VFX = new Set([
  'SPARKS', 'SHOCKWAVE', 'ICE_BURST', 'VORTEX_SWIRL', 'MINI_NUKE',
  'PLASMA_BLOOM', 'SHATTER', 'IMPLOSION', 'LIGHTNING_FORK', 'RUNE_FLASH',
]);
const VALID_PROJECTILE_STYLES = new Set([
  'DISC', 'BEAM', 'PULSING_ORB', 'SHURIKEN', 'CHAOS_LIGHTNING',
  'PRISM', 'RUNE_SIGIL', 'PLASMA_TENDRIL', 'VOID_RIFT', 'CRYSTAL_SHARD',
]);

const PROJECTILE_STYLE_ALIASES: Record<string, string> = {
  LASER: 'BEAM',
  RAIL: 'BEAM',
  RAILGUN: 'BEAM',
  BOLT: 'DISC',
  ORB: 'PULSING_ORB',
  BOMB: 'PULSING_ORB',
  BLADE: 'SHURIKEN',
  STAR: 'SHURIKEN',
  SPINNING: 'SHURIKEN',
  LIGHTNING: 'CHAOS_LIGHTNING',
  ELECTRIC: 'CHAOS_LIGHTNING',
  CHAOS: 'CHAOS_LIGHTNING',
  ARC: 'CHAOS_LIGHTNING',
  CRYSTAL: 'CRYSTAL_SHARD',
  SHARD: 'CRYSTAL_SHARD',
  PRISMATIC: 'PRISM',
  FACET: 'PRISM',
  RUNE: 'RUNE_SIGIL',
  SIGIL: 'RUNE_SIGIL',
  GLYPH: 'RUNE_SIGIL',
  PLASMA: 'PLASMA_TENDRIL',
  TENDRIL: 'PLASMA_TENDRIL',
  VOID: 'VOID_RIFT',
  RIFT: 'VOID_RIFT',
  DARK: 'VOID_RIFT',
};

function normalizeEnumToken(value: string, aliases: Record<string, string>): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return aliases[compact] ?? compact;
}

function normalizeTriggerAlias(trigger: string): string {
  return normalizeEnumToken(trigger, TRIGGER_ALIASES as Record<string, string>);
}

function normalizeActionAlias(actionType: string): string {
  return normalizeEnumToken(actionType, ACTION_ALIASES);
}

function normalizeFieldTypeAlias(fieldType: string): string {
  return normalizeEnumToken(fieldType, FIELD_ALIASES);
}

function coerceNumericFields(obj: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
      obj[key] = Number(v);
    }
  }
}

function filterValidActions(actions: unknown[]): unknown[] {
  return actions
    .map(repairActionPayload)
    .filter((action) => {
      if (action === null || typeof action !== 'object') return false;
      const type = (action as Record<string, unknown>).type;
      return typeof type === 'string' && type.length > 0;
    });
}

function repairModifyStatAction(obj: Record<string, unknown>): void {
  if (obj.type !== 'MODIFY_STAT') return;
  if (typeof obj.stat === 'string') {
    const raw = obj.stat.trim();
    const lower = raw.toLowerCase();
    const statMap: Record<string, string> = {
      mass: 'mass',
      linear_drag: 'linearDrag',
      lineardrag: 'linearDrag',
      move_speed: 'moveSpeed',
      movespeed: 'moveSpeed',
      instability: 'instabilityPct',
      instabilitypct: 'instabilityPct',
    };
    obj.stat = statMap[lower] ?? statMap[lower.replace(/_/g, '')] ?? lower;
  }
  if (typeof obj.mode === 'string') {
    obj.mode = obj.mode.toLowerCase();
  }
  coerceNumericFields(obj, ['value']);
}

function stripNullFields(obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      delete obj[key];
    }
  }
}

function ensureFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function repairVisualDescriptor(raw: unknown): Record<string, unknown> {
  const obj =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  stripNullFields(obj);
  coerceNumericFields(obj, ['size']);
  const trail =
    typeof obj.trailType === 'string' ? obj.trailType.toUpperCase() : 'NONE';
  const impact =
    typeof obj.impactVfx === 'string' ? obj.impactVfx.toUpperCase() : 'SPARKS';
  const styleRaw =
    typeof obj.projectileStyle === 'string'
      ? normalizeEnumToken(obj.projectileStyle, PROJECTILE_STYLE_ALIASES)
      : 'DISC';
  const result: Record<string, unknown> = {
    color: typeof obj.color === 'string' && obj.color.trim() ? obj.color : '#00e5ff',
    size: Math.max(4, Math.min(32, ensureFiniteNumber(obj.size, 8))),
    projectileStyle: VALID_PROJECTILE_STYLES.has(styleRaw) ? styleRaw : 'DISC',
    trailType: VALID_TRAIL_TYPES.has(trail) ? trail : 'NONE',
    impactVfx: VALID_IMPACT_VFX.has(impact) ? impact : 'SPARKS',
  };
  if (obj.vfx !== null && typeof obj.vfx === 'object') {
    result.vfx = obj.vfx;
  }
  return result;
}

function repairTrajectoryConfig(traj: unknown): unknown {
  if (traj === null || typeof traj !== 'object') {
    return { type: 'LINEAR', speed: 400, maxRange: 500 };
  }
  const t = { ...(traj as Record<string, unknown>) };
  stripNullFields(t);
  coerceNumericFields(t, [
    'speed',
    'maxRange',
    'piercing',
    'turnAccel',
    'orbitRadius',
    'orbitSpeed',
    'blinkDistance',
    'spawnAltitude',
    'fallSpeed',
    'lobApex',
    'bounces',
    'bounceRestitution',
    'gravityScale',
  ]);
  const rawAltitude = ensureFiniteNumber(t.spawnAltitude, 0);
  const rawFallSpeed = ensureFiniteNumber(t.fallSpeed, 0);
  const rawLobApex = ensureFiniteNumber(t.lobApex, 0);
  const isSkyDrop = rawAltitude > 0 || (rawFallSpeed > 0 && rawLobApex <= 0);
  if (typeof t.type === 'string') {
    t.type = normalizeEnumToken(t.type, TRAJECTORY_ALIASES);
  }
  if (isSkyDrop) {
    t.type = 'BALLISTIC_ARC';
    if (rawAltitude <= 0 && rawFallSpeed > 0) {
      t.spawnAltitude = 600;
    }
    const rawSpeed = ensureFiniteNumber(t.speed, 0);
    if (rawSpeed > 100) {
      t.speed = 0;
    }
  } else if (typeof t.type !== 'string' || !VALID_TRAJECTORY_TYPES.has(t.type)) {
    t.type = 'LINEAR';
  }
  return t;
}

function repairFieldConfig(field: unknown): unknown {
  if (field === null || typeof field !== 'object') return field;
  const f = { ...(field as Record<string, unknown>) };
  stripNullFields(f);
  if (typeof f.fieldType === 'string') {
    f.fieldType = normalizeFieldTypeAlias(f.fieldType);
  }
  if (f.durationMs === undefined && f.duration !== undefined) {
    f.durationMs = f.duration;
    delete f.duration;
  }
  if (typeof f.fieldType === 'string') {
    f.radius = ensureFiniteNumber(f.radius, 80);
    f.strength = ensureFiniteNumber(f.strength, 500);
    f.durationMs = ensureFiniteNumber(f.durationMs, 2000);
  }
  return f;
}

function repairActionPayload(action: unknown): unknown {
  if (action === null || typeof action !== 'object') return action;
  const normalized = normalizeActionPayload(action);
  const obj = { ...(normalized as Record<string, unknown>) };
  stripNullFields(obj);

  if (obj.baseForce === undefined && obj.force !== undefined) {
    obj.baseForce = obj.force;
    delete obj.force;
  }
  if (obj.amount === undefined && obj.instability !== undefined) {
    obj.amount = obj.instability;
    delete obj.instability;
  }
  if (typeof obj.type === 'string') {
    obj.type = normalizeActionAlias(obj.type);
  }
  repairModifyStatAction(obj);
  coerceNumericFields(obj, ['amount', 'baseForce', 'distance', 'value', 'aimOffsetDeg']);
  if (obj.type === 'APPLY_IMPULSE') {
    obj.baseForce = ensureFiniteNumber(obj.baseForce, 400);
  }
  if (obj.type === 'ADD_INSTABILITY') {
    obj.amount = ensureFiniteNumber(obj.amount, 20);
  }
  if (obj.type === 'TELEPORT') {
    obj.distance = ensureFiniteNumber(obj.distance, 100);
  }
  if (obj.field !== undefined) {
    obj.field = repairFieldConfig(obj.field);
  }
  if (obj.type === 'SPAWN_PROJECTILE') {
    if (obj.projectileTrajectory === undefined && obj.trajectory !== undefined) {
      obj.projectileTrajectory = obj.trajectory;
      delete obj.trajectory;
    }
    obj.projectileTrajectory = repairTrajectoryConfig(obj.projectileTrajectory);
    if (obj.visuals !== undefined) {
      obj.visuals = repairVisualDescriptor(obj.visuals);
    }
    if (obj.emitter === undefined || typeof obj.emitter !== 'object') {
      obj.emitter = {
        count: 1,
        spreadDeg: 0,
        distribution: 'FAN',
        ...(obj.aimOffsetDeg !== undefined
          ? { aimOffsetDeg: ensureFiniteNumber(obj.aimOffsetDeg, 0) }
          : {}),
      };
    } else {
      const emitter = { ...(obj.emitter as Record<string, unknown>) };
      coerceNumericFields(emitter, ['count', 'spreadDeg', 'aimOffsetDeg', 'inheritVelocityRatio']);
      if (typeof emitter.pattern === 'string' && typeof emitter.distribution !== 'string') {
        emitter.distribution = emitter.pattern;
        delete emitter.pattern;
      }
      if (typeof emitter.distribution !== 'string') emitter.distribution = 'FAN';
      if (emitter.count === undefined) emitter.count = 1;
      if (emitter.spreadDeg === undefined) {
        emitter.spreadDeg = ensureFiniteNumber(emitter.count, 1) > 1 ? 30 : 0;
      }
      if (obj.aimOffsetDeg !== undefined && emitter.aimOffsetDeg === undefined) {
        emitter.aimOffsetDeg = ensureFiniteNumber(obj.aimOffsetDeg, 0);
      }
      obj.emitter = emitter;
    }
    delete obj.aimOffsetDeg;
  } else if (obj.trajectory !== undefined) {
    obj.trajectory = repairTrajectoryConfig(obj.trajectory);
  }
  if (Array.isArray(obj.triggers)) {
    obj.triggers = obj.triggers.map(repairTriggerNode);
  }
  if (obj.type === 'CAST_CHILD_PAYLOAD' && obj.payload !== undefined) {
    obj.payload = repairAbilityPayload(obj.payload);
  }

  return obj;
}

function repairTriggerNode(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node;
  const obj = { ...(node as Record<string, unknown>) };
  stripNullFields(obj);

  if (obj.trigger === undefined && typeof obj.on === 'string') {
    obj.trigger = obj.on;
    delete obj.on;
  }
  if (!Array.isArray(obj.actions) && Array.isArray(obj.effects)) {
    obj.actions = obj.effects;
    delete obj.effects;
  }
  if (!Array.isArray(obj.actions) && obj.actions && typeof obj.actions === 'object') {
    obj.actions = [obj.actions];
  }
  if (!Array.isArray(obj.actions)) {
    obj.actions = [];
  }
  if (typeof obj.trigger === 'string') {
    obj.trigger = normalizeTriggerAlias(obj.trigger);
  }
  obj.actions = filterValidActions(obj.actions as unknown[]);
  if (Array.isArray(obj.ifFalseActions)) {
    obj.ifFalseActions = filterValidActions(obj.ifFalseActions as unknown[]);
  }
  if (Array.isArray(obj.children)) {
    obj.children = obj.children.map(repairTriggerNode);
  }

  return obj;
}

function repairTriggersField(triggers: unknown): unknown[] {
  if (Array.isArray(triggers)) {
    return triggers.map(repairTriggerNode) as unknown[];
  }
  if (triggers !== null && typeof triggers === 'object') {
    return Object.entries(triggers as Record<string, unknown>).map(([key, val]) => {
      if (val && typeof val === 'object' && !Array.isArray(val) && 'type' in val) {
        return repairTriggerNode({ trigger: key, actions: [val] });
      }
      if (val && typeof val === 'object' && !Array.isArray(val) && 'actions' in val) {
        return repairTriggerNode({ trigger: key, ...(val as Record<string, unknown>) });
      }
      return repairTriggerNode({ trigger: key, actions: val });
    }) as unknown[];
  }
  return [];
}

export function repairAbilityPayload(payload: unknown, description?: string): unknown {
  if (payload === null || typeof payload !== 'object') return payload;
  const normalized = normalizeAbilityPayload(payload);
  const obj = { ...(normalized as Record<string, unknown>) };
  stripNullFields(obj);

  obj.cooldownMs = ensureFiniteNumber(obj.cooldownMs, 800);
  obj.recoilKick = ensureFiniteNumber(obj.recoilKick, 50);

  if (obj.trajectory !== undefined) {
    obj.trajectory = repairTrajectoryConfig(obj.trajectory);
  }
  if (obj.visuals !== undefined) {
    obj.visuals = repairVisualDescriptor(obj.visuals);
  }
  obj.triggers = repairTriggersField(obj.triggers);
  if (
    obj.metadata !== undefined &&
    (obj.metadata === null || typeof obj.metadata !== 'object' || Array.isArray(obj.metadata))
  ) {
    delete obj.metadata;
  }

  return obj;
}

const METADATA_RARITY_CYCLE: CardRarity[] = ['COMMON', 'RARE', 'EPIC'];
const VALID_CARD_RARITIES = new Set(['COMMON', 'RARE', 'EPIC', 'CHAOTIC']);

function repairDraftCard(card: unknown, index = 0): unknown {
  if (card === null || typeof card !== 'object') return card;
  const obj = { ...(card as Record<string, unknown>) };
  if (typeof obj.type === 'string') {
    obj.type = obj.type.toUpperCase();
  }
  if (typeof obj.rarity === 'string') {
    obj.rarity = obj.rarity.toUpperCase();
  }
  if (typeof obj.rarity !== 'string' || !VALID_CARD_RARITIES.has(obj.rarity)) {
    // Metadata-only cards from the token-diet prompts omit rarity — cycle for visual variety
    // instead of collapsing all 3 drafts to the same default.
    obj.rarity = METADATA_RARITY_CYCLE[index % METADATA_RARITY_CYCLE.length];
  }
  if (typeof obj.budgetCost !== 'number' || !Number.isFinite(obj.budgetCost)) {
    // No physics payload yet to score — 0 signals "unscored" rather than implying a real budget.
    obj.budgetCost = ensureFiniteNumber(obj.budgetCost, 0);
  }
  if (obj.abilityPayload !== undefined) {
    const cardTitle = typeof obj.title === 'string' ? obj.title : typeof obj.name === 'string' ? obj.name : '';
    const cardDesc = typeof obj.description === 'string' ? obj.description : '';
    const description = `${cardTitle} ${cardDesc}`.trim();
    const repaired = repairAbilityPayload(obj.abilityPayload, description || undefined);
    const category =
      typeof obj.category === 'string' ? (obj.category as SkillCategory) : 'SECONDARY';
    obj.abilityPayload = sanitizeAbilitySchema(
      repaired,
      category,
      0,
      description || undefined,
    );
  }
  return obj;
}

export function summarizeValidationFailure(diagnosis: string[], normalizedDiagnosis: string[]): string {
  const all = [...diagnosis, ...normalizedDiagnosis];
  const detailed = all.filter(
    (r) =>
      r.includes('schema:') ||
      r.includes('trigger[') ||
      r.includes('_is_string') ||
      r.includes('_type=') ||
      r.includes('invalid_type') ||
      r.includes('invalid_fieldType') ||
      r.includes('invalid=') ||
      r.includes('uses_on_key') ||
      r.includes('metadata_invalid') ||
      r.includes('missing_actions'),
  );
  const nonGeneric = detailed.length > 0
    ? detailed
    : all.filter((r) => !r.includes('abilityPayload_invalid'));
  const summary = (nonGeneric.length > 0 ? nonGeneric : all).slice(0, 8);
  return summary.join('; ');
}

export function deepNormalizeLLMValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepNormalizeLLMValue);
  }

  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'trigger' && typeof v === 'string') {
        out[k] = normalizeTriggerAlias(v);
      } else if (k === 'fieldType' && typeof v === 'string') {
        out[k] = normalizeFieldTypeAlias(v);
      } else if (k === 'metadata') {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          out[k] = deepNormalizeLLMValue(v);
        }
      } else {
        out[k] = deepNormalizeLLMValue(v);
      }
    }
    return out;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
  }

  return value;
}

export function normalizeLLMResponse(parsed: unknown): unknown {
  const coerced = deepNormalizeLLMValue(parsed);

  if (coerced === null || typeof coerced !== 'object') return coerced;
  const root = coerced as Record<string, unknown>;

  if (Array.isArray(root.cards)) {
    root.cards = root.cards.map((c, i) => repairDraftCard(c, i));
    return root;
  }
  if (Array.isArray(coerced)) {
    return coerced.map((c, i) => repairDraftCard(c, i));
  }

  return coerced;
}

export function coerceMessageContent(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }
  return '';
}

function jsonErrorContext(content: string, errorMsg: string): string {
  const posMatch = errorMsg.match(/position (\d+)/i);
  if (!posMatch) return '';
  const pos = Number(posMatch[1]);
  const start = Math.max(0, pos - 50);
  const end = Math.min(content.length, pos + 50);
  return ` near "...${content.slice(start, pos)}>>${content.slice(pos, end)}..."`;
}

function tryCloseTruncatedJson(text: string): string {
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  let repaired = text;
  while (brackets > 0) {
    repaired += ']';
    brackets--;
  }
  while (braces > 0) {
    repaired += '}';
    braces--;
  }
  return repaired;
}

function buildJsonRepairCandidates(text: string): string[] {
  const variants = new Set<string>();
  const add = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed) variants.add(trimmed);
  };

  add(text);
  add(text.replace(/,\s*([}\]])/g, '$1'));
  add(text.replace(/,\s*,/g, ','));

  const noBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const noComments = noBlockComments.replace(/^\s*\/\/.*$/gm, '');
  add(noComments);
  add(noComments.replace(/,\s*([}\]])/g, '$1'));

  const unquotedKeys = noComments.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    '$1"$2":',
  );
  add(unquotedKeys);
  add(unquotedKeys.replace(/,\s*([}\]])/g, '$1'));

  const nullishFixed = noComments
    .replace(/\bundefined\b/g, 'null')
    .replace(/\bNaN\b/g, '0')
    .replace(/\b-Infinity\b/g, '-999999')
    .replace(/\bInfinity\b/g, '999999');
  add(nullishFixed);
  add(nullishFixed.replace(/,\s*([}\]])/g, '$1'));

  const singleQuoted = nullishFixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');
  add(singleQuoted);
  add(singleQuoted.replace(/,\s*([}\]])/g, '$1'));

  add(tryCloseTruncatedJson(nullishFixed));
  add(tryCloseTruncatedJson(nullishFixed).replace(/,\s*([}\]])/g, '$1'));

  return [...variants];
}

export function tryParseLLMJson(content: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const baseCandidates: string[] = [];
  const trimmed = content.trim();
  baseCandidates.push(trimmed);

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) baseCandidates.push(fenceMatch[1].trim());

  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    baseCandidates.push(trimmed.slice(braceStart, braceEnd + 1));
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    baseCandidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  const allCandidates = new Set<string>();
  for (const base of baseCandidates) {
    for (const repaired of buildJsonRepairCandidates(base)) {
      allCandidates.add(repaired);
    }
  }

  let lastError = 'unknown parse error';
  let lastCandidate = trimmed;
  for (const candidate of allCandidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'parse error';
      lastCandidate = candidate;
    }
  }

  return { ok: false, error: `${lastError}${jsonErrorContext(lastCandidate, lastError)}` };
}
