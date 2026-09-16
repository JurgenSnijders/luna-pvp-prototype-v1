import type { SkillCategory } from '../../../types/cards';
import type { AbilitySchema, SpellArchetype, TargetingMode, TriggerNode, ValidationIssue } from '../../../types/schema';
import { SPELL_ARCHETYPE_SET, TARGETING_MODE_SET, validateAbilitySchema } from '../../../types/schema';
import { repairAbilitySemantics, type SemanticRepairMode } from '../repair';
import { ensureFiniteNumber, isObject } from '../helpers';

const FLAVOR_MAX_LEN = 120;

function clampFlavorString(value: unknown, max = FLAVOR_MAX_LEN): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}
import { sanitizeInputProfile, sanitizeResourceCost } from './condition';
import { hasOnCastEffect, promoteRootEmitter, sanitizeTriggerNode } from './trigger';
import { sanitizeTrajectory } from './trajectory';
import { sanitizeVisuals } from './visuals';

const LINEAR_SPAWN_FLOOR = { type: 'LINEAR' as const, speed: 400, maxRange: 500 };

function applyPlayableFloor(schema: AbilitySchema): void {
  if (!schema.trajectory && !hasOnCastEffect(schema.triggers)) {
    schema.trajectory = { ...LINEAR_SPAWN_FLOOR };
  }
}

function finalizeValidatedSchema(
  schema: AbilitySchema,
  description?: string,
  isHeadlessMode = false,
  repairMode: SemanticRepairMode = 'EVOLUTION',
): AbilitySchema {
  applyPlayableFloor(schema);

  const repairText =
    description ??
    [schema.tagline, schema.description].filter(Boolean).join(' ');
  const repaired = repairAbilitySemantics(schema, repairText, isHeadlessMode, repairMode);

  const strictRepaired = validateAbilitySchema(repaired);
  if (strictRepaired) return strictRepaired;

  const salvagedRepaired = validateAbilitySchema(repaired, 0, undefined, true);
  return salvagedRepaired ?? repaired;
}

export function sanitizeAbilitySchema(
  raw: unknown,
  _category: SkillCategory = 'SECONDARY',
  sanitizeDepth = 0,
  description?: string,
  isHeadlessMode = false,
  repairMode: SemanticRepairMode = 'EVOLUTION',
): AbilitySchema {
  const obj = isObject(raw) ? { ...raw } : {};

  const id = typeof obj.id === 'string' && obj.id ? obj.id : 'sanitized_ability';
  const name = typeof obj.name === 'string' && obj.name ? obj.name : 'Sanitized Ability';
  const cooldownMs = ensureFiniteNumber(obj.cooldownMs, 800);
  const recoilKick = ensureFiniteNumber(obj.recoilKick, 50);

  let triggers: TriggerNode[] = [];
  if (Array.isArray(obj.triggers)) {
    triggers = obj.triggers
      .map((t) => sanitizeTriggerNode(t, sanitizeDepth, _category))
      .filter((n): n is TriggerNode => n !== null);
  }

  const schema: AbilitySchema = {
    id,
    name,
    cooldownMs,
    recoilKick,
    triggers,
  };

  if (obj.trajectory !== undefined) {
    schema.trajectory = sanitizeTrajectory(obj.trajectory);
  }

  schema.visuals = sanitizeVisuals(obj.visuals);

  if (isObject(obj.metadata)) {
    schema.metadata = obj.metadata as Record<string, unknown>;
  }

  if (obj.inputProfile !== undefined) {
    schema.inputProfile = sanitizeInputProfile(obj.inputProfile);
  }

  if (obj.resourceCost !== undefined) {
    const resourceCost = sanitizeResourceCost(obj.resourceCost);
    if (resourceCost) {
      schema.resourceCost = resourceCost;
    }
  }

  if (typeof obj.archetype === 'string') {
    const archetypeRaw = obj.archetype.toUpperCase();
    if (SPELL_ARCHETYPE_SET.has(archetypeRaw)) {
      schema.archetype = archetypeRaw as SpellArchetype;
    }
  }

  const tagline = clampFlavorString(obj.tagline);
  if (tagline) schema.tagline = tagline;

  const cardDescription = clampFlavorString(obj.description);
  if (cardDescription) schema.description = cardDescription;

  if (typeof obj.targetingMode === 'string') {
    const modeRaw = obj.targetingMode.toUpperCase();
    if (TARGETING_MODE_SET.has(modeRaw)) {
      schema.targetingMode = modeRaw as TargetingMode;
    }
  }

  if (obj.maxTargetRange !== undefined) {
    schema.maxTargetRange = Math.max(100, Math.min(1200, ensureFiniteNumber(obj.maxTargetRange, 500)));
  }

  promoteRootEmitter(schema, obj);

  if (!schema.trajectory && !hasOnCastEffect(schema.triggers)) {
    schema.trajectory = sanitizeTrajectory(obj.trajectory);
  }

  const issues: ValidationIssue[] = [];
  let validated = validateAbilitySchema(schema, 0, issues);
  if (!validated) {
    const hadActor = JSON.stringify(raw).includes('"SPAWN_ACTOR"');
    console.warn('[Sanitizer] Validation failed. Dropped invalid leaves.', {
      id,
      name,
      hadActor,
      issues,
    });
    validated = validateAbilitySchema(schema, 0, issues, true);
    if (!validated) {
      validated = {
        id,
        name,
        cooldownMs,
        recoilKick,
        triggers: schema.triggers,
        visuals: schema.visuals,
        ...(schema.trajectory ? { trajectory: schema.trajectory } : {}),
        ...(schema.metadata ? { metadata: schema.metadata } : {}),
        ...(schema.inputProfile ? { inputProfile: schema.inputProfile } : {}),
        ...(schema.resourceCost ? { resourceCost: schema.resourceCost } : {}),
        ...(schema.archetype ? { archetype: schema.archetype } : {}),
        ...(schema.tagline ? { tagline: schema.tagline } : {}),
        ...(schema.description ? { description: schema.description } : {}),
        ...(schema.targetingMode ? { targetingMode: schema.targetingMode } : {}),
        ...(schema.maxTargetRange !== undefined ? { maxTargetRange: schema.maxTargetRange } : {}),
      };
    }
  }

  return finalizeValidatedSchema(validated, description, isHeadlessMode, repairMode);
}
