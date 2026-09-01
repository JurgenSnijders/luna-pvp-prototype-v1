const FLAT_FIELD_KEYS = [
  'fieldType',
  'radius',
  'strength',
  'durationMs',
  'duration',
  'attachToSource',
  'frictionValue',
  'offset',
  'detachOnParentDeath',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasFlatFieldProps(action: Record<string, unknown>): boolean {
  return (
    action.fieldType !== undefined ||
    action.radius !== undefined ||
    action.strength !== undefined ||
    action.durationMs !== undefined ||
    action.duration !== undefined
  );
}

function stripFieldFalloff(field: Record<string, unknown>): void {
  delete field.falloff;
}

export function normalizeSpawnFieldAction(action: unknown): unknown {
  if (!isObject(action)) return action;
  if (action.type !== 'SPAWN_FIELD') return action;

  const obj = { ...action };

  if (!isObject(obj.field) && hasFlatFieldProps(obj)) {
    const durationMs = obj.durationMs ?? obj.duration ?? 2500;
    obj.field = {
      fieldType: obj.fieldType ?? 'MASS_ATTRACTOR',
      radius: obj.radius ?? 180,
      strength: obj.strength ?? 4000,
      durationMs,
      ...(obj.attachToSource !== undefined ? { attachToSource: obj.attachToSource } : {}),
      ...(obj.frictionValue !== undefined ? { frictionValue: obj.frictionValue } : {}),
      ...(isObject(obj.offset) ? { offset: obj.offset } : {}),
      ...(obj.detachOnParentDeath !== undefined
        ? { detachOnParentDeath: obj.detachOnParentDeath }
        : {}),
    };
    for (const key of FLAT_FIELD_KEYS) {
      delete obj[key];
    }
  }

  delete obj.falloff;

  if (isObject(obj.field)) {
    const field = { ...obj.field };
    if (field.durationMs === undefined && field.duration !== undefined) {
      field.durationMs = field.duration;
      delete field.duration;
    }
    stripFieldFalloff(field);
    obj.field = field;
  }

  return obj;
}

function normalizeTriggerNode(node: unknown): unknown {
  if (!isObject(node)) return node;
  const obj = { ...node };

  if (Array.isArray(obj.actions)) {
    obj.actions = obj.actions.map(normalizeActionPayload);
  }
  if (Array.isArray(obj.ifFalseActions)) {
    obj.ifFalseActions = obj.ifFalseActions.map(normalizeActionPayload);
  }
  if (Array.isArray(obj.children)) {
    obj.children = obj.children.map(normalizeTriggerNode);
  }

  return obj;
}

export function normalizeActionPayload(action: unknown): unknown {
  const normalized = normalizeSpawnFieldAction(action);
  if (!isObject(normalized)) return normalized;

  const obj = { ...normalized };

  if (obj.type === 'SPAWN_PROJECTILE' && Array.isArray(obj.triggers)) {
    obj.triggers = obj.triggers.map(normalizeTriggerNode);
  }
  if (obj.type === 'CAST_CHILD_PAYLOAD' && obj.payload !== undefined) {
    obj.payload = normalizeAbilityPayload(obj.payload);
  }

  return obj;
}

export function normalizeAbilityPayload(payload: unknown): unknown {
  if (!isObject(payload)) return payload;
  const obj = { ...payload };

  if (Array.isArray(obj.triggers)) {
    obj.triggers = obj.triggers.map(normalizeTriggerNode);
  }

  return obj;
}
