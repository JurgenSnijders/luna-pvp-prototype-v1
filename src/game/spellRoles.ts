import type { AbilitySchema, ActionPayload, ActionTarget } from '../types/schema';
import { walkActions } from '../types/schema';

export type SpellRole =
  | 'MOBILITY'
  | 'DAMAGE'
  | 'HEALING'
  | 'CC'
  | 'DEFENSE'
  | 'SUMMON'
  | 'TERRAIN';

export type VaultMetaFilter = 'EQUIPPED' | 'NEW' | 'CUSTOM';

export const SPELL_ROLES: readonly SpellRole[] = [
  'MOBILITY',
  'DAMAGE',
  'HEALING',
  'CC',
  'DEFENSE',
  'SUMMON',
  'TERRAIN',
];

const SPELL_ROLE_LABELS: Record<SpellRole, string> = {
  MOBILITY: 'Mobility',
  DAMAGE: 'Damage',
  HEALING: 'Healing',
  CC: 'CC',
  DEFENSE: 'Defense',
  SUMMON: 'Summon',
  TERRAIN: 'Terrain',
};

const SPELL_ROLE_SET = new Set<string>(SPELL_ROLES);

const CASTER_TARGETS: ReadonlySet<ActionTarget> = new Set(['CASTER', 'SELF']);
const TARGET_TARGETS: ReadonlySet<ActionTarget> = new Set(['TARGET']);

export function getSpellRoleLabel(role: SpellRole): string {
  return SPELL_ROLE_LABELS[role];
}

function isCasterTarget(target: ActionTarget | undefined): boolean {
  return target === undefined || CASTER_TARGETS.has(target);
}

function isEnemyTarget(target: ActionTarget | undefined): boolean {
  return TARGET_TARGETS.has(target ?? 'TARGET');
}

function isPositiveHealthModify(action: Extract<ActionPayload, { type: 'MODIFY_STAT' }>): boolean {
  if (action.stat !== 'health') return false;
  if (action.mode === 'add') return action.value > 0;
  if (action.mode === 'multiply') return action.value > 1;
  return action.value > 0;
}

function isDebuffStatModify(action: Extract<ActionPayload, { type: 'MODIFY_STAT' }>): boolean {
  if (!isEnemyTarget(action.target)) return false;
  if (action.stat === 'moveSpeed' || action.stat === 'linearDrag' || action.stat === 'mass') {
    if (action.mode === 'multiply') {
      return action.stat === 'moveSpeed' ? action.value < 1 : action.value > 1;
    }
    if (action.mode === 'add') {
      return action.stat === 'moveSpeed' ? action.value < 0 : action.value > 0;
    }
  }
  return false;
}

function isCasterSpeedBuff(action: Extract<ActionPayload, { type: 'MODIFY_STAT' }>): boolean {
  if (action.stat !== 'moveSpeed' || !isCasterTarget(action.target)) return false;
  if (action.mode === 'multiply') return action.value > 1;
  if (action.mode === 'add') return action.value > 0;
  return false;
}

export function inferSpellRoles(spell: AbilitySchema): SpellRole[] {
  const roles = new Set<SpellRole>();

  if (spell.recoilKick >= 200) {
    roles.add('MOBILITY');
  }
  if (spell.trajectory?.type === 'DISCONTINUOUS_BLINK') {
    roles.add('MOBILITY');
  }

  walkActions(spell, (v) => {
    const action = v.action;

    switch (action.type) {
      case 'TELEPORT':
        roles.add('MOBILITY');
        break;
      case 'APPLY_IMPULSE':
        if (isCasterTarget(action.target)) {
          roles.add('MOBILITY');
        } else if (isEnemyTarget(action.target)) {
          roles.add('DAMAGE');
        }
        break;
      case 'APPLY_STEALTH':
        roles.add('MOBILITY');
        break;
      case 'MODIFY_STAT':
        if (isPositiveHealthModify(action) && isCasterTarget(action.target)) {
          roles.add('HEALING');
        }
        if (isCasterSpeedBuff(action)) {
          roles.add('MOBILITY');
        }
        if (isDebuffStatModify(action)) {
          roles.add('CC');
        }
        break;
      case 'SPAWN_PROJECTILE':
        roles.add('DAMAGE');
        break;
      case 'ADD_INSTABILITY':
        if (isEnemyTarget(action.target)) {
          roles.add('DAMAGE');
        }
        break;
      case 'APPLY_STASIS':
        roles.add('CC');
        break;
      case 'SPAWN_FIELD':
        if (
          action.field.fieldType === 'MASS_ATTRACTOR' ||
          action.field.fieldType === 'VORTEX_TANGENT'
        ) {
          roles.add('CC');
        }
        roles.add('TERRAIN');
        break;
      case 'REFLECT_PROJECTILES':
        roles.add('DEFENSE');
        break;
      case 'SPAWN_OBSTACLE':
        roles.add('DEFENSE');
        break;
      case 'RELEASE_STASIS':
        roles.add('DEFENSE');
        break;
      case 'MORPH_ENTITY':
        if (isCasterTarget(action.target)) {
          roles.add('DEFENSE');
        }
        break;
      case 'SPAWN_ACTOR':
        roles.add('SUMMON');
        break;
      case 'MUTATE_TERRAIN':
        roles.add('TERRAIN');
        break;
      default:
        break;
    }
  });

  return SPELL_ROLES.filter((role) => roles.has(role));
}

function parseStoredRoles(metadata: Record<string, unknown> | undefined): SpellRole[] | null {
  if (!metadata || !Array.isArray(metadata.roles)) return null;
  const roles = metadata.roles.filter(
    (role): role is SpellRole => typeof role === 'string' && SPELL_ROLE_SET.has(role),
  );
  return roles.length > 0 ? roles : null;
}

export function getSpellRoles(spell: AbilitySchema): SpellRole[] {
  const stored = parseStoredRoles(spell.metadata);
  return stored ?? inferSpellRoles(spell);
}

export function spellMatchesRoleFilter(spell: AbilitySchema, selectedRoles: Set<SpellRole>): boolean {
  if (selectedRoles.size === 0) return true;
  const roles = getSpellRoles(spell);
  return roles.some((role) => selectedRoles.has(role));
}

export interface VaultMetaFilterContext {
  loadoutSpellIds: Set<string>;
  isNewSpell: (id: string) => boolean;
  isPresetSpell: (id: string) => boolean;
}

export function spellMatchesMetaFilter(
  spell: AbilitySchema,
  selectedMeta: Set<VaultMetaFilter>,
  context: VaultMetaFilterContext,
): boolean {
  if (selectedMeta.size === 0) return true;

  let matched = false;
  if (selectedMeta.has('EQUIPPED') && context.loadoutSpellIds.has(spell.id)) {
    matched = true;
  }
  if (selectedMeta.has('NEW') && context.isNewSpell(spell.id)) {
    matched = true;
  }
  if (selectedMeta.has('CUSTOM') && !context.isPresetSpell(spell.id)) {
    matched = true;
  }
  return matched;
}
