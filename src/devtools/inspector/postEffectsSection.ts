import {
  getPostEffectConflictReason,
  getPostEffectParam,
  getPostEffectUserEnabled,
  isPostEffectTierAvailable,
  setPostEffectEnabled,
  setPostEffectParam,
} from '../graphicsSettings';
import {
  POST_EFFECT_IDS,
  POST_EFFECTS,
  type PostEffectGroup,
  type PostEffectId,
} from '../../render/gl/postEffects';
import { FONTS, RETRO_COLORS } from '../../ui/tokens';
import { helperText, sliderRow, toggleRow } from './domHelpers';

const GROUP_LABELS: Record<PostEffectGroup, string> = {
  CRT: 'CRT Effects',
  ANALOG: 'Analog Artifacts',
  RETRO: 'Retro Console',
  REACTIVE: 'Gameplay Reactive',
  GRADE: 'Color Grading',
};

interface EffectControl {
  sync: () => void;
}

export function buildPostEffectsSection(parent: HTMLElement): { sync: () => void } {
  const controls: EffectControl[] = [];
  const grouped = new Map<PostEffectGroup, PostEffectId[]>();

  for (const id of POST_EFFECT_IDS) {
    const group = POST_EFFECTS[id].group;
    const list = grouped.get(group) ?? [];
    list.push(id);
    grouped.set(group, list);
  }

  for (const [group, ids] of grouped) {
    const groupLabel = document.createElement('div');
    groupLabel.textContent = GROUP_LABELS[group];
    groupLabel.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin:12px 0 6px;letter-spacing:0.04em;`;
    parent.appendChild(groupLabel);

    for (const id of ids) {
      const def = POST_EFFECTS[id];
      const paramsContainer = document.createElement('div');
      paramsContainer.style.cssText = 'margin-left:12px;margin-bottom:4px;';

      const tierAvailable = isPostEffectTierAvailable(id);
      const conflict = getPostEffectConflictReason(id);
      const tierHint = tierAvailable ? undefined : `requires ${def.minTier}`;
      const conflictHint =
        conflict && tierAvailable ? `conflicts with ${POST_EFFECTS[conflict].label}` : undefined;
      const hint = conflictHint ?? tierHint;

      const toggle = toggleRow(
        parent,
        def.label,
        () => getPostEffectUserEnabled(id),
        (enabled) => setPostEffectEnabled(id, enabled),
        {
          disabled: !tierAvailable || !!conflictHint,
          hint,
        },
      );

      const paramSliders: { refresh: () => void }[] = [];
      for (const param of def.params) {
        const slider = sliderRow(
          paramsContainer,
          param.label,
          param.min,
          param.max,
          param.step,
          () => getPostEffectParam(id, param.key),
          (v) => setPostEffectParam(id, param.key, v),
        );
        paramSliders.push(slider);
      }

      const syncEffect = (): void => {
        const available = isPostEffectTierAvailable(id);
        const activeConflict = getPostEffectConflictReason(id);
        const disabled = !available || !!activeConflict;
        toggle.checkbox.disabled = disabled;
        toggle.refresh();
        const enabled = getPostEffectUserEnabled(id) && !disabled;
        paramsContainer.style.display = enabled && def.params.length > 0 ? 'block' : 'none';
        for (const slider of paramSliders) slider.refresh();
      };

      toggle.checkbox.onchange = () => {
        if (!toggle.checkbox.disabled) {
          setPostEffectEnabled(id, toggle.checkbox.checked);
          syncEffect();
        }
      };

      parent.appendChild(paramsContainer);
      controls.push({ sync: syncEffect });
      syncEffect();
    }
  }

  helperText(
    parent,
    'Per-effect toggles apply when CRT Post-Processing is enabled. Tier locks and conflicts disable controls automatically.',
  );

  const sync = (): void => {
    for (const control of controls) control.sync();
  };

  return { sync };
}
