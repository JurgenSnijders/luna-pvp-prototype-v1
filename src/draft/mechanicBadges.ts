import type { DraftCard } from '../types/cards';
import type { AbilitySchema, ActionPayload, TriggerNode } from '../types/schema';

export type BadgeKind = 'trajectory' | 'field' | 'trigger' | 'cast';

const BADGE_COLORS: Record<BadgeKind, { bg: string; text: string }> = {
  trajectory: { bg: 'rgba(0,200,255,0.15)', text: '#6ee7ff' },
  field: { bg: 'rgba(170,68,255,0.15)', text: '#d8b4fe' },
  trigger: { bg: 'rgba(245,158,11,0.15)', text: '#fcd34d' },
  cast: { bg: 'rgba(52,211,153,0.15)', text: '#6ee7b7' },
};

const TRAJECTORY_LABELS = new Set([
  'LINEAR',
  'RETURN TO SOURCE',
  'ORBIT ANCHOR',
  'HOMING SLERP',
  'DISCONTINUOUS BLINK',
]);

const FIELD_LABELS = new Set([
  'RADIAL IMPULSE',
  'VORTEX TANGENT',
  'FRICTION OVERRIDE',
  'MASS ATTRACTOR',
]);

function classifyBadge(label: string): BadgeKind {
  const clean = label.replace(/^\[|\]$/g, '').trim().toUpperCase();
  if (TRAJECTORY_LABELS.has(clean)) return 'trajectory';
  if (FIELD_LABELS.has(clean)) return 'field';
  return 'trigger';
}

export function renderBadge(label: string, kind?: BadgeKind): HTMLSpanElement {
  const resolved = kind ?? classifyBadge(label);
  const colors = BADGE_COLORS[resolved];
  const span = document.createElement('span');
  span.textContent = label;
  span.style.cssText = `
    font-size:9px;padding:2px 6px;border-radius:4px;
    background:${colors.bg};color:${colors.text};white-space:nowrap;
  `;
  return span;
}

function collectDeployableActions(nodes: TriggerNode[]): ActionPayload[] {
  const all: ActionPayload[] = [];
  const collect = (triggerNodes: TriggerNode[]): void => {
    for (const node of triggerNodes) {
      all.push(...node.actions);
      if (node.ifFalseActions) all.push(...node.ifFalseActions);
      if (node.children) collect(node.children);
    }
  };
  collect(nodes);
  return all;
}

export function extractMechanicBadgesFromAbility(
  s: AbilitySchema,
): { label: string; kind: BadgeKind }[] {
  const badges: { label: string; kind: BadgeKind }[] = [];
  const seen = new Set<string>();

  const pushBadge = (label: string, kind: BadgeKind): void => {
    if (seen.has(label)) return;
    seen.add(label);
    badges.push({ label, kind });
  };

  if (s.trajectory) {
    pushBadge(`[${s.trajectory.type.replace(/_/g, ' ')}]`, 'trajectory');
  }

  if (s.inputProfile?.mode && s.inputProfile.mode !== 'INSTANT') {
    pushBadge(`[${s.inputProfile.mode.replace(/_/g, ' ')}]`, 'cast');
  }
  if (s.resourceCost?.type) {
    pushBadge(`[${s.resourceCost.type.replace(/_/g, ' ')}]`, 'cast');
  }

  const actionBadges: Partial<Record<string, string>> = {
    SPAWN_FIELD: '',
    TELEPORT: '[TELEPORT]',
    APPLY_IMPULSE: '[IMPULSE]',
    SPAWN_PROJECTILE: '[EMITTER]',
    APPLY_STASIS: '[STASIS]',
    RELEASE_STASIS: '[RELEASE STASIS]',
    MORPH_ENTITY: '[MORPH]',
    APPLY_STEALTH: '[STEALTH]',
    SPAWN_ACTOR: '[ACTOR]',
    SPAWN_OBSTACLE: '[OBSTACLE]',
    MUTATE_TERRAIN: '[TERRAIN]',
    SPAWN_CONSTRAINT: '[CONSTRAINT]',
    REFLECT_PROJECTILES: '[REFLECT]',
    CAST_CHILD_PAYLOAD: '[CHILD PAYLOAD]',
  };

  const visitAction = (action: ActionPayload): void => {
    if (action.type === 'SPAWN_FIELD') {
      pushBadge(`[${action.field.fieldType.replace(/_/g, ' ')}]`, 'field');
    } else if (action.type === 'SPAWN_ACTOR') {
      if (action.actor.archetype === 'TURRET') {
        pushBadge('[TURRET]', 'trigger');
      } else {
        const label = actionBadges.SPAWN_ACTOR;
        if (label) pushBadge(label, 'trigger');
      }
    } else {
      const label = actionBadges[action.type];
      if (label) pushBadge(label, 'trigger');
    }

    if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
      collectActions(action.triggers);
    }
    if (action.type === 'CAST_CHILD_PAYLOAD') {
      collectActions(action.payload.triggers);
    }
    if (action.type === 'SPAWN_ACTOR' && action.actor.triggers) {
      collectActions(action.actor.triggers);
    }
  };

  const collectActions = (nodes: AbilitySchema['triggers']): void => {
    for (const node of nodes) {
      for (const action of node.actions) {
        visitAction(action);
      }
      if (node.ifFalseActions) {
        for (const action of node.ifFalseActions) {
          visitAction(action);
        }
      }
      if (node.children) collectActions(node.children);
    }
  };

  collectActions(s.triggers);

  if (!s.trajectory) {
    const deployActions = collectDeployableActions(s.triggers);
    const hasStationaryDeploy = deployActions.some(
      (a) => a.type === 'SPAWN_ACTOR' || a.type === 'SPAWN_OBSTACLE',
    );
    if (hasStationaryDeploy) {
      pushBadge('[STATIONARY]', 'trigger');
    }
  }

  return badges;
}

export function renderStreamBadges(
  container: HTMLElement,
  badges: string[],
  kinds?: Record<string, BadgeKind>,
): void {
  const next = new Set(badges);
  for (const child of [...container.children]) {
    const label = child.getAttribute('data-badge');
    if (label && !next.has(label)) child.remove();
  }

  const existing = new Set(
    [...container.children]
      .map((child) => child.getAttribute('data-badge'))
      .filter((label): label is string => label !== null),
  );

  for (const label of badges) {
    if (existing.has(label)) continue;
    const kind = kinds?.[label] ?? classifyBadge(label);
    const badge = renderBadge(label, kind);
    badge.setAttribute('data-badge', label);
    container.appendChild(badge);
  }
}

export function extractMechanicBadges(
  card: DraftCard,
): { label: string; kind: BadgeKind }[] {
  if (card.type === 'ACTIVE_ABILITY' && card.abilityPayload) {
    return extractMechanicBadgesFromAbility(card.abilityPayload);
  }

  if (card.type === 'PASSIVE_UPGRADE' && card.passivePayload) {
    return card.passivePayload.map((mod) => {
      const sign = mod.op === 'MULTIPLY' ? `${Math.round((mod.value - 1) * 100)}%` : `+${mod.value}`;
      return { label: `[${mod.stat} ${sign}]`, kind: 'trigger' as const };
    });
  }

  return [];
}
