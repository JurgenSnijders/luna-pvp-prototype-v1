import type { SkillCategory } from '../../../types/cards';
import type { AbilitySchema, SpellArchetype, TriggerNode } from '../../../types/schema';
import { SPELL_ARCHETYPE_SET, validateAbilitySchema } from '../../../types/schema';
import { repairAbilitySemantics } from '../repair';
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

export function sanitizeAbilitySchema(
  raw: unknown,
  _category: SkillCategory = 'SECONDARY',
  sanitizeDepth = 0,
  description?: string,
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

  promoteRootEmitter(schema, obj);

  if (!schema.trajectory && !hasOnCastEffect(schema.triggers)) {
    schema.trajectory = sanitizeTrajectory(obj.trajectory);
  }

  const validated = validateAbilitySchema(schema);
  if (!validated) {
    return {
      id,
      name,
      cooldownMs,
      recoilKick,
      trajectory: { type: 'LINEAR', speed: 400, maxRange: 500 },
      triggers: [],
      visuals: sanitizeVisuals(undefined),
    };
  }

  const repairText =
    description ??
    [validated.tagline, validated.description].filter(Boolean).join(' ');
  const repaired = repairAbilitySemantics(validated, repairText);
  return validateAbilitySchema(repaired) ?? repaired;
}
