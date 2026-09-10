import type { AbilitySchema } from './schema';

export type SpellModifierField =
  | 'cooldownMs'
  | 'recoilKick'
  | 'trajectory.speed'
  | 'trajectory.maxRange'
  | 'trajectory.bounces'
  | 'trajectory.piercing'
  | 'trajectory.lobApex'
  | 'visuals.size'
  | 'emitter.count';

export type SpellModifierOp = 'ADD' | 'MULTIPLY' | 'SET';

export interface SpellModifier {
  field: SpellModifierField;
  op: SpellModifierOp;
  value: number;
}

export type EvolutionNodeKind = 'STAT' | 'MECHANIC';

export interface EvolutionNode {
  id: string;
  parentId: string | null;
  tier: number;
  kind: EvolutionNodeKind;
  label: string;
  modifiers?: SpellModifier[];
  resolvedSchema?: AbilitySchema;
  diff?: string[];
}

export interface EvolutionTree {
  version: 1;
  rootSpellId: string;
  baseSchema: AbilitySchema;
  nodes: EvolutionNode[];
  activePath: string[];
}

const SPELL_MODIFIER_FIELDS: ReadonlySet<string> = new Set([
  'cooldownMs',
  'recoilKick',
  'trajectory.speed',
  'trajectory.maxRange',
  'trajectory.bounces',
  'trajectory.piercing',
  'trajectory.lobApex',
  'visuals.size',
  'emitter.count',
]);

const SPELL_MODIFIER_OPS: ReadonlySet<string> = new Set(['ADD', 'MULTIPLY', 'SET']);
const EVOLUTION_NODE_KINDS: ReadonlySet<string> = new Set(['STAT', 'MECHANIC']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function validateSpellModifier(value: unknown): SpellModifier | null {
  if (!isObject(value)) return null;
  if (!isString(value.field) || !SPELL_MODIFIER_FIELDS.has(value.field)) return null;
  if (!isString(value.op) || !SPELL_MODIFIER_OPS.has(value.op)) return null;
  if (!isNumber(value.value)) return null;
  return {
    field: value.field as SpellModifierField,
    op: value.op as SpellModifierOp,
    value: value.value,
  };
}

export function validateEvolutionNode(
  value: unknown,
  validateSchema: (payload: unknown) => AbilitySchema | null,
): EvolutionNode | null {
  if (!isObject(value)) return null;
  if (!isString(value.id) || !value.id.trim()) return null;
  if (value.parentId !== null && !isString(value.parentId)) return null;
  if (!isNumber(value.tier) || value.tier < 1) return null;
  if (!isString(value.kind) || !EVOLUTION_NODE_KINDS.has(value.kind)) return null;
  if (!isString(value.label) || !value.label.trim()) return null;

  const node: EvolutionNode = {
    id: value.id,
    parentId: value.parentId === undefined ? null : value.parentId,
    tier: Math.floor(value.tier),
    kind: value.kind as EvolutionNodeKind,
    label: value.label,
  };

  if (node.kind === 'STAT') {
    if (!Array.isArray(value.modifiers) || value.modifiers.length === 0) return null;
    const modifiers: SpellModifier[] = [];
    for (const raw of value.modifiers) {
      const mod = validateSpellModifier(raw);
      if (!mod) return null;
      modifiers.push(mod);
    }
    node.modifiers = modifiers;
  }

  if (node.kind === 'MECHANIC') {
    if (value.resolvedSchema === undefined) return null;
    const resolved = validateSchema(value.resolvedSchema);
    if (!resolved) return null;
    node.resolvedSchema = resolved;
  }

  if (Array.isArray(value.diff)) {
    const diff = value.diff.filter((entry): entry is string => typeof entry === 'string');
    if (diff.length > 0) node.diff = diff;
  }

  return node;
}

export function validateEvolutionTree(
  value: unknown,
  validateSchema: (payload: unknown) => AbilitySchema | null,
): EvolutionTree | null {
  if (!isObject(value)) return null;
  if (value.version !== 1) return null;
  if (!isString(value.rootSpellId) || !value.rootSpellId.trim()) return null;

  const baseSchema = validateSchema(value.baseSchema);
  if (!baseSchema) return null;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.activePath)) return null;

  const nodes: EvolutionNode[] = [];
  for (const raw of value.nodes) {
    const node = validateEvolutionNode(raw, validateSchema);
    if (!node) return null;
    nodes.push(node);
  }

  const activePath: string[] = [];
  for (const id of value.activePath) {
    if (!isString(id) || !id.trim()) return null;
    activePath.push(id);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const id of activePath) {
    if (!nodeIds.has(id)) return null;
  }

  return {
    version: 1,
    rootSpellId: value.rootSpellId,
    baseSchema,
    nodes,
    activePath,
  };
}
