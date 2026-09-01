import type { AbilitySchema, SpellArchetype, TriggerNode } from '../types';
import { SPELL_ARCHETYPE_SET } from '../constants';
import { validateInputProfile, validateResourceCost } from './condition';
import {
  clamp,
  isNumber,
  isObject,
  isString,
  type ValidationIssue,
  validationFail,
} from './helpers';
import { validateTriggerNode } from './trigger';
import { validateTrajectoryConfig } from './trajectory';
import { validateVisualDescriptor } from './visuals';

const FLAVOR_MAX_LEN = 120;

function clampFlavorString(value: unknown, max = FLAVOR_MAX_LEN): string | undefined {
  if (!isString(value)) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, clamp(max, 1, 500));
}

export function validateAbilitySchema(
  json: unknown,
  depth = 0,
  issues?: ValidationIssue[],
): AbilitySchema | null {
  const rootPath = depth === 0 ? 'root' : 'payload';
  if (!isObject(json)) return validationFail(issues, rootPath, 'expected object');
  if (!isString(json.id) || !isString(json.name)) {
    return validationFail(issues, rootPath, 'missing id or name');
  }
  if (!isNumber(json.cooldownMs) || !isNumber(json.recoilKick)) {
    return validationFail(issues, rootPath, 'invalid cooldownMs or recoilKick');
  }
  if (!Array.isArray(json.triggers)) {
    return validationFail(issues, rootPath, 'triggers must be an array');
  }

  const triggers: TriggerNode[] = [];
  for (let i = 0; i < json.triggers.length; i++) {
    const triggerPath = `${rootPath}.triggers[${i}]`;
    const validated = validateTriggerNode(json.triggers[i], depth, issues, triggerPath);
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
    if (!trajectory) return validationFail(issues, `${rootPath}.trajectory`, 'invalid trajectory');
    schema.trajectory = trajectory;
  }

  if (json.visuals !== undefined) {
    const visuals = validateVisualDescriptor(json.visuals);
    if (!visuals) return validationFail(issues, `${rootPath}.visuals`, 'invalid visuals');
    schema.visuals = visuals;
  }

  if (json.metadata !== undefined) {
    if (!isObject(json.metadata)) return validationFail(issues, `${rootPath}.metadata`, 'invalid metadata');
    schema.metadata = json.metadata as Record<string, unknown>;
  }

  if (json.inputProfile !== undefined) {
    const inputProfile = validateInputProfile(json.inputProfile);
    if (!inputProfile) return validationFail(issues, `${rootPath}.inputProfile`, 'invalid inputProfile');
    schema.inputProfile = inputProfile;
  }

  if (json.resourceCost !== undefined) {
    const resourceCost = validateResourceCost(json.resourceCost);
    if (!resourceCost) return validationFail(issues, `${rootPath}.resourceCost`, 'invalid resourceCost');
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
