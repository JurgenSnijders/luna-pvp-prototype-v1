import type { AbilitySchema, SpellArchetype, TriggerNode } from '../types';
import { SPELL_ARCHETYPE_SET } from '../constants';
import { validateInputProfile, validateResourceCost } from './condition';
import { clamp, isNumber, isObject, isString } from './helpers';

const FLAVOR_MAX_LEN = 120;

function clampFlavorString(value: unknown, max = FLAVOR_MAX_LEN): string | undefined {
  if (!isString(value)) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, clamp(max, 1, 500));
}
import { validateTriggerNode } from './trigger';
import { validateTrajectoryConfig } from './trajectory';
import { validateVisualDescriptor } from './visuals';

export function validateAbilitySchema(json: unknown, depth = 0): AbilitySchema | null {
  if (!isObject(json)) return null;
  if (!isString(json.id) || !isString(json.name)) return null;
  if (!isNumber(json.cooldownMs) || !isNumber(json.recoilKick)) return null;
  if (!Array.isArray(json.triggers)) return null;

  const triggers: TriggerNode[] = [];
  for (const trigger of json.triggers) {
    const validated = validateTriggerNode(trigger, depth);
    if (!validated) return null;
    triggers.push(validated);
  }

  const schema: AbilitySchema = {
    id: json.id,
    name: json.name,
    cooldownMs: json.cooldownMs,
    recoilKick: json.recoilKick,
    triggers,
  };

  if (json.trajectory !== undefined) {
    const trajectory = validateTrajectoryConfig(json.trajectory);
    if (!trajectory) return null;
    schema.trajectory = trajectory;
  }

  if (json.visuals !== undefined) {
    const visuals = validateVisualDescriptor(json.visuals);
    if (!visuals) return null;
    schema.visuals = visuals;
  }

  if (json.metadata !== undefined) {
    if (!isObject(json.metadata)) return null;
    schema.metadata = json.metadata as Record<string, unknown>;
  }

  if (json.inputProfile !== undefined) {
    const inputProfile = validateInputProfile(json.inputProfile);
    if (!inputProfile) return null;
    schema.inputProfile = inputProfile;
  }

  if (json.resourceCost !== undefined) {
    const resourceCost = validateResourceCost(json.resourceCost);
    if (!resourceCost) return null;
    schema.resourceCost = resourceCost;
  }

  if (json.archetype !== undefined) {
    const archetypeRaw = isString(json.archetype) ? json.archetype.toUpperCase() : '';
    if (SPELL_ARCHETYPE_SET.has(archetypeRaw)) {
      schema.archetype = archetypeRaw as SpellArchetype;
    }
  }

  const tagline = clampFlavorString(json.tagline);
  if (tagline) schema.tagline = tagline;

  const description = clampFlavorString(json.description);
  if (description) schema.description = description;

  return schema;
}
