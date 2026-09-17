import { sanitizeAbilitySchema } from '../../ai/BudgetEngine';
import { ACTION_SLOT_KEYS, type ActionSlotKey } from '../../types/cards';
import {
  ACTION_TARGETS,
  ACTION_TYPES,
  FIELD_ARC_FACINGS,
  FIELD_TYPES,
  IMPULSE_DIRECTION_MODES,
  SPELL_ARCHETYPES,
  TRAJECTORY_TYPES,
  TRIGGER_TYPES,
  validateAbilitySchema,
  type ActionPayload,
  type TrajectoryConfig,
  type TriggerType,
} from '../../types/schema';
import type { InspectorContext } from '../InspectorUI';
import { FONTS, RETRO_COLORS } from '../../ui/tokens';
import { buttonStyle, inputStyle, numberRow, selectRow, toggleRow } from './domHelpers';
import {
  abilityGraphFromSchema,
  createDefaultActionGraph,
  createDefaultTrigger,
  createEmptyAbilityGraph,
  formatAction,
  graphPathKey,
  replaceActionGraphType,
  resolveActionNode,
  resolveTriggerList,
  resolveTriggerNode,
  schemaFromAbilityGraph,
  type AbilityGraphModel,
  type ActionGraphModel,
  type GraphNodeTarget,
  type GraphPathSegment,
  type SpellGraphNodeKind,
  type TriggerGraphModel,
} from './spellGraph';

const NODE_COLORS: Record<SpellGraphNodeKind, string> = {
  root: RETRO_COLORS.neonCyan,
  meta: RETRO_COLORS.textPrimary,
  trajectory: '#6ee7ff',
  input: '#6ee7b7',
  resource: '#fcd34d',
  trigger: '#fbbf24',
  condition: '#c4b5fd',
  action: RETRO_COLORS.textPrimary,
  if_false: '#f87171',
  host: '#94a3b8',
};

interface MoveContext {
  path: GraphPathSegment[];
  listKind: 'triggers' | 'actions';
  index: number;
  triggerIndex?: number;
}

interface TreeRow {
  key: string;
  depth: number;
  kind: SpellGraphNodeKind;
  label: string;
  detail?: string;
  target: GraphNodeTarget;
  canAddTrigger: boolean;
  canAddAction: boolean;
  canRemove: boolean;
  canMove: boolean;
  moveContext?: MoveContext;
}

function getSlotIndex(slotSelect: HTMLSelectElement): number {
  return ACTION_SLOT_KEYS.indexOf(slotSelect.value as ActionSlotKey);
}

function slotLabel(ctx: InspectorContext, slotIndex: number): string {
  const key = ACTION_SLOT_KEYS[slotIndex];
  const ability = ctx.player.getAbility(slotIndex);
  return ability ? `${key} — ${ability.name}` : `${key} — (empty)`;
}

function refreshSlotOptions(ctx: InspectorContext, slotSelect: HTMLSelectElement): void {
  const selected = slotSelect.value;
  slotSelect.innerHTML = '';
  for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
    const opt = document.createElement('option');
    opt.value = ACTION_SLOT_KEYS[i];
    opt.textContent = slotLabel(ctx, i);
    slotSelect.appendChild(opt);
  }
  if (ACTION_SLOT_KEYS.includes(selected as ActionSlotKey)) {
    slotSelect.value = selected;
  }
}

function formatTrajectoryLabel(trajectory: TrajectoryConfig): string {
  const parts: string[] = [trajectory.type];
  if (trajectory.speed !== undefined) parts.push(`speed=${trajectory.speed}`);
  if (trajectory.maxRange !== undefined) parts.push(`range=${trajectory.maxRange}`);
  if (trajectory.bounces !== undefined) parts.push(`bounces=${trajectory.bounces}`);
  return parts.join(' · ');
}

function formatTriggerMeta(node: TriggerGraphModel): string | undefined {
  const parts: string[] = [];
  if (node.minBounceSpeed !== undefined) parts.push(`minBounceSpeed=${node.minBounceSpeed}`);
  if (node.bounceIndex !== undefined) parts.push(`bounceIndex=${node.bounceIndex}`);
  if (node.minRamSpeed !== undefined) parts.push(`minRamSpeed=${node.minRamSpeed}`);
  if (node.tickIntervalMs !== undefined) parts.push(`tick=${node.tickIntervalMs}ms`);
  if (node.triggerDistance !== undefined) parts.push(`dist=${node.triggerDistance}`);
  if (node.fireOnHitDeath === false) parts.push('skipOnHitDeath');
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function collectTreeRows(model: AbilityGraphModel): TreeRow[] {
  const rows: TreeRow[] = [];

  rows.push({
    key: 'r',
    depth: 0,
    kind: 'root',
    label: model.name,
    detail: `cd=${model.cooldownMs}ms · recoil=${model.recoilKick}`,
    target: { kind: 'ability' },
    canAddTrigger: true,
    canAddAction: false,
    canRemove: false,
    canMove: false,
  });

  if (model.trajectory) {
    rows.push({
      key: 'r/traj',
      depth: 1,
      kind: 'trajectory',
      label: formatTrajectoryLabel(model.trajectory),
      target: { kind: 'ability' },
      canAddTrigger: false,
      canAddAction: false,
      canRemove: false,
      canMove: false,
    });
  }

  const walkTriggers = (
    containerPath: GraphPathSegment[],
    triggers: TriggerGraphModel[],
    depth: number,
  ): void => {
    triggers.forEach((trigger, ti) => {
      const triggerPath: GraphPathSegment[] = [
        ...containerPath,
        { seg: 'trigger', index: ti },
      ];
      rows.push({
        key: graphPathKey(triggerPath),
        depth,
        kind: 'trigger',
        label: trigger.trigger,
        detail: formatTriggerMeta(trigger),
        target: { kind: 'trigger', path: containerPath, index: ti },
        canAddTrigger: false,
        canAddAction: true,
        canRemove: true,
        canMove: true,
        moveContext: { path: containerPath, listKind: 'triggers', index: ti },
      });

      trigger.actions.forEach((action, ai) => {
        const actionPath: GraphPathSegment[] = [
          ...triggerPath,
          { seg: 'action', index: ai },
        ];
        const fmt = formatAction(action);
        rows.push({
          key: graphPathKey(actionPath),
          depth: depth + 1,
          kind: 'action',
          label: fmt.label,
          detail: fmt.detail,
          target: {
            kind: 'action',
            path: containerPath,
            triggerIndex: ti,
            index: ai,
          },
          canAddTrigger: action.kind === 'projectile' || action.kind === 'actor',
          canAddAction: false,
          canRemove: true,
          canMove: true,
          moveContext: {
            path: containerPath,
            listKind: 'actions',
            index: ai,
            triggerIndex: ti,
          },
        });

        if (action.kind === 'projectile' || action.kind === 'actor') {
          const hostPath: GraphPathSegment[] = [...actionPath, { seg: 'host' }];
          walkTriggers(hostPath, action.triggers, depth + 2);
        }
      });

      if (trigger.children && trigger.children.length > 0) {
        const childContainer: GraphPathSegment[] = [...triggerPath, { seg: 'children' }];
        walkTriggers(childContainer, trigger.children, depth + 1);
      }
    });
  };

  walkTriggers([{ seg: 'root' }], model.triggers, 1);
  return rows;
}

function targetsEqual(a: GraphNodeTarget | null, b: GraphNodeTarget): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'ability' && b.kind === 'ability') return true;
  if (a.kind === 'trigger' && b.kind === 'trigger') {
    return a.index === b.index && graphPathKey(a.path) === graphPathKey(b.path);
  }
  if (a.kind === 'action' && b.kind === 'action') {
    return (
      a.index === b.index &&
      a.triggerIndex === b.triggerIndex &&
      graphPathKey(a.path) === graphPathKey(b.path)
    );
  }
  return false;
}

function moveTrigger(model: AbilityGraphModel, path: GraphPathSegment[], index: number, delta: number): void {
  const list = resolveTriggerList(model, path);
  if (!list) return;
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(newIndex, 0, item);
}

function moveAction(
  model: AbilityGraphModel,
  path: GraphPathSegment[],
  triggerIndex: number,
  actionIndex: number,
  delta: number,
): void {
  const trigger = resolveTriggerNode(model, path, triggerIndex);
  if (!trigger) return;
  const list = trigger.actions;
  const newIndex = actionIndex + delta;
  if (newIndex < 0 || newIndex >= list.length) return;
  const [item] = list.splice(actionIndex, 1);
  list.splice(newIndex, 0, item);
}

function removeTrigger(model: AbilityGraphModel, path: GraphPathSegment[], index: number): void {
  resolveTriggerList(model, path)?.splice(index, 1);
}

function removeAction(
  model: AbilityGraphModel,
  path: GraphPathSegment[],
  triggerIndex: number,
  actionIndex: number,
): void {
  const trigger = resolveTriggerNode(model, path, triggerIndex);
  trigger?.actions.splice(actionIndex, 1);
}

function addTriggerToContainer(
  model: AbilityGraphModel,
  path: GraphPathSegment[],
  trigger: TriggerType = 'ON_HIT',
): void {
  resolveTriggerList(model, path)?.push(createDefaultTrigger(trigger));
}

function hostPathForAction(
  containerPath: GraphPathSegment[],
  triggerIndex: number,
  actionIndex: number,
): GraphPathSegment[] {
  return [
    ...containerPath,
    { seg: 'trigger', index: triggerIndex },
    { seg: 'action', index: actionIndex },
    { seg: 'host' },
  ];
}

function ensureTrajectory(model: AbilityGraphModel): TrajectoryConfig {
  if (!model.trajectory) {
    model.trajectory = { type: 'LINEAR', speed: 400, maxRange: 500 };
  }
  return model.trajectory;
}

function actionHasTargetField(action: ActionGraphModel): boolean {
  if (action.kind === 'projectile') return false;
  if (action.kind === 'child') return true;
  if (action.kind === 'actor') return true;
  return action.action.type !== 'SPAWN_CONSTRAINT' && action.action.type !== 'PLAY_VFX';
}

function setActionTarget(action: ActionGraphModel, target: string): void {
  const t = target as ActionPayload extends { target?: infer T } ? T : never;
  if (action.kind === 'action') {
    const leaf = action.action as { target?: typeof t };
    if (t) leaf.target = t;
    else delete leaf.target;
    return;
  }
  if (action.kind === 'actor') {
    if (t) action.action.target = t;
    else delete action.action.target;
    return;
  }
  if (action.kind === 'child') {
    if (t) action.target = t;
    else delete action.target;
  }
}

function getActionTarget(action: ActionGraphModel): string {
  if (action.kind === 'action') {
    const leaf = action.action as { target?: string };
    return leaf.target ?? '';
  }
  if (action.kind === 'actor') return action.action.target ?? '';
  if (action.kind === 'child') return action.target ?? '';
  return '';
}

function buildPropertyPanel(
  parent: HTMLElement,
  model: AbilityGraphModel,
  selection: GraphNodeTarget,
  refresh: () => void,
): void {
  parent.innerHTML = '';

  const header = document.createElement('div');
  header.textContent = 'Properties';
  header.style.cssText = `font-weight:bold;margin-bottom:8px;font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};`;
  parent.appendChild(header);

  const enumOptions = (values: Iterable<string>) =>
    [...values].sort().map((value) => ({ value, label: value }));

  if (selection.kind === 'ability') {
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    nameLabel.style.cssText = `display:block;margin-bottom:4px;font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};`;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = model.name;
    nameInput.style.cssText = inputStyle();
    nameInput.onchange = () => {
      model.name = nameInput.value.trim() || model.name;
      refresh();
    };
    parent.appendChild(nameLabel);
    parent.appendChild(nameInput);

    numberRow(parent, 'Cooldown (ms)', 100, 10000, 50, () => model.cooldownMs, (v) => {
      model.cooldownMs = v;
      refresh();
    }, 'ms');

    numberRow(parent, 'Recoil kick', 0, 500, 5, () => model.recoilKick, (v) => {
      model.recoilKick = v;
      refresh();
    });

    const traj = ensureTrajectory(model);
    selectRow(parent, 'Trajectory type', enumOptions(TRAJECTORY_TYPES), () => traj.type, (v) => {
      traj.type = v as TrajectoryConfig['type'];
      refresh();
    });
    numberRow(parent, 'Speed', 0, 2000, 10, () => traj.speed ?? 400, (v) => {
      traj.speed = v;
      refresh();
    });
    numberRow(parent, 'Max range', 50, 2000, 10, () => traj.maxRange ?? 500, (v) => {
      traj.maxRange = v;
      refresh();
    });
    numberRow(parent, 'Bounces', 0, 8, 1, () => traj.bounces ?? 0, (v) => {
      traj.bounces = v;
      refresh();
    });
    return;
  }

  if (selection.kind === 'trigger') {
    const trigger = resolveTriggerNode(model, selection.path, selection.index);
    if (!trigger) {
      parent.appendChild(document.createTextNode('Trigger not found.'));
      return;
    }

    selectRow(parent, 'Trigger type', enumOptions(TRIGGER_TYPES), () => trigger.trigger, (v) => {
      trigger.trigger = v as TriggerType;
      refresh();
    });

    if (trigger.trigger === 'ON_TICK') {
      numberRow(parent, 'Tick interval (ms)', 50, 5000, 50, () => trigger.tickIntervalMs ?? 250, (v) => {
        trigger.tickIntervalMs = v;
        refresh();
      }, 'ms');
    }
    if (trigger.trigger === 'ON_DISTANCE_TRAVELED') {
      numberRow(parent, 'Trigger distance', 10, 2000, 10, () => trigger.triggerDistance ?? 100, (v) => {
        trigger.triggerDistance = v;
        refresh();
      });
    }
    if (trigger.trigger === 'ON_BOUNCE') {
      numberRow(parent, 'Min bounce speed', 0, 2000, 10, () => trigger.minBounceSpeed ?? 0, (v) => {
        trigger.minBounceSpeed = v;
        refresh();
      });
      numberRow(parent, 'Bounce index', 0, 8, 1, () => trigger.bounceIndex ?? 0, (v) => {
        trigger.bounceIndex = v;
        refresh();
      });
    }
    if (trigger.trigger === 'ON_RAM') {
      numberRow(parent, 'Min ram speed', 0, 2000, 10, () => trigger.minRamSpeed ?? 0, (v) => {
        trigger.minRamSpeed = v;
        refresh();
      });
    }
    if (trigger.trigger === 'ON_EXPIRY') {
      const row = document.createElement('label');
      row.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:${FONTS.size.sm};`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = trigger.fireOnHitDeath !== false;
      checkbox.onchange = () => {
        trigger.fireOnHitDeath = checkbox.checked;
        refresh();
      };
      row.appendChild(checkbox);
      row.appendChild(document.createTextNode('Fire on hit death'));
      parent.appendChild(row);
    }
    return;
  }

  const action = resolveActionNode(
    model,
    selection.path,
    selection.triggerIndex,
    selection.index,
  );
  if (!action) {
    parent.appendChild(document.createTextNode('Action not found.'));
    return;
  }

  const currentType =
    action.kind === 'action'
      ? action.action.type
      : action.kind === 'child'
        ? 'CAST_CHILD_PAYLOAD'
        : action.action.type;

  selectRow(parent, 'Action type', enumOptions(ACTION_TYPES), () => currentType, (v) => {
    const next = replaceActionGraphType(action, v as ActionPayload['type']);
    const trigger = resolveTriggerNode(model, selection.path, selection.triggerIndex);
    if (trigger) {
      trigger.actions[selection.index] = next;
    }
    refresh();
  });

  if (currentType !== 'CAST_CHILD_PAYLOAD' && actionHasTargetField(action)) {
    selectRow(parent, 'Target', [{ value: '', label: '(default)' }, ...enumOptions(ACTION_TARGETS)], () => getActionTarget(action), (v) => {
      setActionTarget(action, v);
      refresh();
    });
  }

  const leaf = action.kind === 'action' ? action.action : null;
  if (action.kind === 'projectile') {
    const traj = action.action.projectileTrajectory;
    selectRow(parent, 'Projectile trajectory', enumOptions(TRAJECTORY_TYPES), () => traj.type, (v) => {
      traj.type = v as TrajectoryConfig['type'];
      refresh();
    });
    numberRow(parent, 'Projectile speed', 0, 2000, 10, () => traj.speed ?? 400, (v) => {
      traj.speed = v;
      refresh();
    });
    numberRow(parent, 'Projectile range', 50, 2000, 10, () => traj.maxRange ?? 500, (v) => {
      traj.maxRange = v;
      refresh();
    });
    numberRow(parent, 'Projectile bounces', 0, 8, 1, () => traj.bounces ?? 0, (v) => {
      traj.bounces = v;
      refresh();
    });
    const emitter = action.action.emitter ?? { count: 1, spreadDeg: 0, distribution: 'FAN' as const };
    if (!action.action.emitter) action.action.emitter = emitter;
    numberRow(parent, 'Emitter count', 1, 12, 1, () => emitter.count, (v) => {
      emitter.count = v;
      refresh();
    });
    numberRow(parent, 'Emitter spread (deg)', 0, 360, 5, () => emitter.spreadDeg, (v) => {
      emitter.spreadDeg = v;
      refresh();
    });
  } else if (leaf?.type === 'APPLY_IMPULSE') {
    numberRow(parent, 'Base force', 0, 5000, 25, () => leaf.baseForce, (v) => {
      leaf.baseForce = v;
      refresh();
    });
    selectRow(
      parent,
      'Direction mode',
      [{ value: '', label: '(default)' }, ...enumOptions(IMPULSE_DIRECTION_MODES)],
      () => leaf.directionMode ?? '',
      (v) => {
        if (v) leaf.directionMode = v as typeof leaf.directionMode;
        else delete leaf.directionMode;
        refresh();
      },
    );
  } else if (leaf?.type === 'ADD_INSTABILITY') {
    numberRow(parent, 'Amount', 0, 500, 5, () => leaf.amount, (v) => {
      leaf.amount = v;
      refresh();
    });
  } else if (leaf?.type === 'SPAWN_FIELD') {
    selectRow(parent, 'Field type', enumOptions(FIELD_TYPES), () => leaf.field.fieldType, (v) => {
      leaf.field.fieldType = v as typeof leaf.field.fieldType;
      refresh();
    });
    numberRow(parent, 'Radius', 10, 200, 5, () => leaf.field.radius, (v) => {
      leaf.field.radius = v;
      refresh();
    });
    numberRow(parent, 'Strength', 0, 5000, 25, () => leaf.field.strength, (v) => {
      leaf.field.strength = v;
      refresh();
    });
    numberRow(parent, 'Duration (ms)', 100, 5000, 50, () => leaf.field.durationMs, (v) => {
      leaf.field.durationMs = v;
      refresh();
    });
  } else if (leaf?.type === 'REFLECT_PROJECTILES') {
    numberRow(parent, 'Radius', 10, 500, 5, () => leaf.radius ?? 150, (v) => {
      leaf.radius = v;
      refresh();
    });
    numberRow(parent, 'Arc (deg)', 0, 360, 5, () => leaf.arcDeg ?? 360, (v) => {
      if (v >= 360) delete leaf.arcDeg;
      else leaf.arcDeg = v;
      refresh();
    });
    selectRow(
      parent,
      'Arc facing',
      [{ value: '', label: '(default)' }, ...enumOptions(FIELD_ARC_FACINGS)],
      () => leaf.arcFacing ?? '',
      (v) => {
        if (v) leaf.arcFacing = v as typeof leaf.arcFacing;
        else delete leaf.arcFacing;
        refresh();
      },
    );
    numberRow(parent, 'Arc offset (deg)', -360, 360, 5, () => leaf.arcOffsetDeg ?? 0, (v) => {
      if (v === 0) delete leaf.arcOffsetDeg;
      else leaf.arcOffsetDeg = v;
      refresh();
    });
    toggleRow(parent, 'Hold while pressed', () => leaf.whileHeld ?? false, (v) => {
      if (v) leaf.whileHeld = true;
      else delete leaf.whileHeld;
      refresh();
    });
    numberRow(
      parent,
      leaf.whileHeld ? 'Max hold (ms)' : 'Duration (ms)',
      0,
      5000,
      50,
      () => leaf.durationMs ?? 0,
      (v) => {
        if (v === 0) delete leaf.durationMs;
        else leaf.durationMs = v;
        refresh();
      },
    );
  } else if (leaf?.type === 'TELEPORT') {
    numberRow(parent, 'Distance', 0, 1000, 10, () => leaf.distance, (v) => {
      leaf.distance = v;
      refresh();
    });
  } else if (leaf?.type === 'APPLY_STASIS' || leaf?.type === 'APPLY_STEALTH') {
    numberRow(parent, 'Duration (ms)', 100, 15000, 50, () => leaf.durationMs, (v) => {
      leaf.durationMs = v;
      refresh();
    });
  } else if (leaf?.type === 'APPLY_STATUS') {
    selectRow(parent, 'Archetype', enumOptions(SPELL_ARCHETYPES), () => leaf.archetype, (v) => {
      leaf.archetype = v as typeof leaf.archetype;
      refresh();
    });
    numberRow(parent, 'Duration (ms)', 100, 10000, 50, () => leaf.durationMs, (v) => {
      leaf.durationMs = v;
      refresh();
    });
  } else if (leaf?.type === 'LAUNCH_VERTICAL') {
    numberRow(parent, 'Target apex', 0, 400, 5, () => leaf.targetApex ?? 80, (v) => {
      leaf.targetApex = v;
      refresh();
    });
  } else if (leaf?.type === 'MODIFY_STAT') {
    selectRow(
      parent,
      'Stat',
      ['mass', 'linearDrag', 'moveSpeed', 'instabilityPct', 'health'].map((value) => ({
        value,
        label: value,
      })),
      () => leaf.stat,
      (v) => {
        leaf.stat = v as typeof leaf.stat;
        refresh();
      },
    );
    selectRow(
      parent,
      'Mode',
      ['add', 'set', 'multiply'].map((value) => ({ value, label: value })),
      () => leaf.mode,
      (v) => {
        leaf.mode = v as typeof leaf.mode;
        refresh();
      },
    );
    numberRow(parent, 'Value', -1000, 1000, 1, () => leaf.value, (v) => {
      leaf.value = v;
      refresh();
    });
  }
}

export function buildGraphTab(parent: HTMLElement, ctx: InspectorContext): void {
  const errorBanner = document.createElement('div');
  errorBanner.style.cssText =
    `display:none;padding:8px;margin-bottom:8px;background:rgba(255,50,50,0.2);border-radius:6px;color:#ff6666;font-size:${FONTS.size.body};`;

  const slotSelect = document.createElement('select');
  slotSelect.style.cssText = inputStyle();
  refreshSlotOptions(ctx, slotSelect);

  const helperText = document.createElement('div');
  helperText.textContent = 'Edit trigger/action structure. Apply runs sanitize + validate.';
  helperText.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;`;

  const graphRoot = document.createElement('div');
  graphRoot.style.cssText = `
    max-height: 220px;
    overflow: auto;
    padding: 8px;
    border: 1px solid ${RETRO_COLORS.borderSubtle};
    border-radius: 4px;
    background: ${RETRO_COLORS.panelBgOpaque};
    margin-bottom: 8px;
  `;

  const structurePanel = document.createElement('div');
  structurePanel.style.cssText = 'margin-bottom:8px;';

  const propertyPanel = document.createElement('div');
  propertyPanel.style.cssText = `
    max-height: 260px;
    overflow: auto;
    padding: 8px;
    border: 1px solid ${RETRO_COLORS.borderSubtle};
    border-radius: 4px;
    background: ${RETRO_COLORS.panelBgOpaque};
    margin-bottom: 8px;
  `;

  let workingModel: AbilityGraphModel | null = null;
  let selection: GraphNodeTarget = { kind: 'ability' };

  const showError = (msg: string): void => {
    if (!msg) {
      errorBanner.style.display = 'none';
      return;
    }
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
  };

  const loadFromSlot = (): void => {
    showError('');
    const slotIndex = getSlotIndex(slotSelect);
    if (slotIndex < 0) return;
    refreshSlotOptions(ctx, slotSelect);
    const ability = ctx.player.getAbility(slotIndex);
    workingModel = ability
      ? abilityGraphFromSchema(structuredClone(ability))
      : createEmptyAbilityGraph();
    selection = { kind: 'ability' };
    renderAll();
  };

  const applyToSlot = (): void => {
    if (!workingModel) return;
    showError('');
    try {
      const schema = schemaFromAbilityGraph(workingModel);
      const sanitized = sanitizeAbilitySchema(schema, 'SECONDARY');
      const validated = validateAbilitySchema(sanitized);
      if (!validated) {
        showError('Invalid ability schema after sanitize. Fix properties or use JSON tab.');
        return;
      }
      const slotIndex = getSlotIndex(slotSelect);
      if (slotIndex >= 0) {
        ctx.player.setAbility(slotIndex, validated);
        workingModel = abilityGraphFromSchema(structuredClone(validated));
        refreshSlotOptions(ctx, slotSelect);
      }
    } catch {
      showError('Failed to apply graph.');
    }
  };

  const renderStructureControls = (): void => {
    structurePanel.innerHTML = '';
    if (!workingModel) return;

    const row = collectTreeRows(workingModel).find((r) => targetsEqual(selection, r.target));
    if (!row) return;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;';

    const makeBtn = (label: string, onClick: () => void, enabled = true): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = buttonStyle(false) + `flex:1;min-width:72px;opacity:${enabled ? 1 : 0.4};`;
      btn.disabled = !enabled;
      btn.onclick = onClick;
      return btn;
    };

    if (row.canAddTrigger) {
      btnRow.appendChild(
        makeBtn('Add trigger', () => {
          if (!workingModel) return;
          if (selection.kind === 'ability') {
            addTriggerToContainer(workingModel, [{ seg: 'root' }], 'ON_HIT');
          } else if (selection.kind === 'action') {
            addTriggerToContainer(
              workingModel,
              hostPathForAction(selection.path, selection.triggerIndex, selection.index),
              'ON_HIT',
            );
          }
          renderAll();
        }),
      );
    }

    if (row.canAddAction && selection.kind === 'trigger') {
      btnRow.appendChild(
        makeBtn('Add action', () => {
          if (!workingModel || selection.kind !== 'trigger') return;
          const trigger = resolveTriggerNode(workingModel, selection.path, selection.index);
          trigger?.actions.push(createDefaultActionGraph('APPLY_IMPULSE'));
          renderAll();
        }),
      );
    }

    if (row.canRemove) {
      btnRow.appendChild(
        makeBtn('Remove', () => {
          if (!workingModel) return;
          if (selection.kind === 'trigger') {
            removeTrigger(workingModel, selection.path, selection.index);
            selection = { kind: 'ability' };
          } else if (selection.kind === 'action') {
            removeAction(workingModel, selection.path, selection.triggerIndex, selection.index);
            selection = {
              kind: 'trigger',
              path: selection.path,
              index: selection.triggerIndex,
            };
          }
          renderAll();
        }),
      );
    }

    if (row.canMove && row.moveContext) {
      const ctxMove = row.moveContext;
      btnRow.appendChild(
        makeBtn('Move up', () => {
          if (!workingModel) return;
          if (ctxMove.listKind === 'triggers') {
            moveTrigger(workingModel, ctxMove.path, ctxMove.index, -1);
            if (selection.kind === 'trigger') selection = { ...selection, index: selection.index - 1 };
          } else if (ctxMove.triggerIndex !== undefined) {
            moveAction(workingModel, ctxMove.path, ctxMove.triggerIndex, ctxMove.index, -1);
            if (selection.kind === 'action') selection = { ...selection, index: selection.index - 1 };
          }
          renderAll();
        }, ctxMove.index > 0),
      );
      btnRow.appendChild(
        makeBtn('Move down', () => {
          if (!workingModel) return;
          if (ctxMove.listKind === 'triggers') {
            const list = resolveTriggerList(workingModel, ctxMove.path);
            if (!list || ctxMove.index >= list.length - 1) return;
            moveTrigger(workingModel, ctxMove.path, ctxMove.index, 1);
            if (selection.kind === 'trigger') selection = { ...selection, index: selection.index + 1 };
          } else if (ctxMove.triggerIndex !== undefined) {
            const trigger = resolveTriggerNode(workingModel, ctxMove.path, ctxMove.triggerIndex);
            if (!trigger || ctxMove.index >= trigger.actions.length - 1) return;
            moveAction(workingModel, ctxMove.path, ctxMove.triggerIndex, ctxMove.index, 1);
            if (selection.kind === 'action') selection = { ...selection, index: selection.index + 1 };
          }
          renderAll();
        }),
      );
    }

    if (btnRow.childElementCount > 0) {
      structurePanel.appendChild(btnRow);
    }
  };

  const renderTree = (): void => {
    graphRoot.innerHTML = '';
    if (!workingModel) {
      graphRoot.textContent = 'No working copy loaded.';
      return;
    }

    for (const row of collectTreeRows(workingModel)) {
      const line = document.createElement('div');
      const selected = targetsEqual(selection, row.target);
      line.style.cssText = `
        display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;
        margin-left:${row.depth * 12}px;margin-bottom:4px;padding:4px 6px;border-radius:4px;
        cursor:pointer;font-family:${FONTS.mono};font-size:${FONTS.size.sm};line-height:1.35;
        background:${selected ? 'rgba(0,200,255,0.12)' : 'transparent'};
        border:1px solid ${selected ? RETRO_COLORS.neonCyan : 'transparent'};
      `;
      line.onclick = () => {
        selection = row.target;
        renderAll();
      };

      const kind = document.createElement('span');
      kind.textContent = row.kind === 'root' ? 'SPELL' : row.kind.toUpperCase();
      kind.style.cssText = `
        color:${NODE_COLORS[row.kind]};font-size:${FONTS.size.badge};
        letter-spacing:0.04em;text-transform:uppercase;
      `;

      const label = document.createElement('span');
      label.textContent = row.label;
      label.style.cssText = `color:${RETRO_COLORS.textPrimary};font-weight:600;`;

      line.appendChild(kind);
      line.appendChild(label);

      if (row.detail) {
        const detail = document.createElement('span');
        detail.textContent = row.detail;
        detail.style.cssText = `color:${RETRO_COLORS.textMuted};font-size:${FONTS.size.badge};`;
        line.appendChild(detail);
      }

      graphRoot.appendChild(line);
    }
  };

  const renderAll = (): void => {
    renderTree();
    renderStructureControls();
    if (workingModel) {
      buildPropertyPanel(propertyPanel, workingModel, selection, renderAll);
    } else {
      propertyPanel.innerHTML = '';
    }
  };

  slotSelect.onchange = loadFromSlot;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload from slot';
  reloadBtn.style.cssText = buttonStyle(false) + 'flex:1;';
  reloadBtn.onclick = loadFromSlot;

  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply to slot';
  applyBtn.style.cssText = buttonStyle(false) + 'flex:1;';
  applyBtn.onclick = applyToSlot;

  btnRow.appendChild(reloadBtn);
  btnRow.appendChild(applyBtn);

  parent.appendChild(errorBanner);
  parent.appendChild(slotSelect);
  parent.appendChild(helperText);
  parent.appendChild(graphRoot);
  parent.appendChild(structurePanel);
  parent.appendChild(propertyPanel);
  parent.appendChild(btnRow);

  loadFromSlot();
}
