import type { Player } from '../entities/Player';
import { ACTION_SLOT_KEYS, SLOT_CATEGORY_MAP, getCategoryLabel, type ActionSlotKey } from '../types/cards';
import { validateAbilitySchema } from '../types/schema';
import type { AbilitySchema, ActionPayload, EmitterConfig, TrajectoryConfig, TriggerNode } from '../types/schema';
import { FONTS, RETRO_COLORS, RETRO_GLOW } from '../ui/tokens';
import { generateSpellIcon, getArchetypeColor } from './canvas/SpellIconGenerator';
import { getIconRenderStyle, type IconRenderStyle } from './gl/retroVfxConfig';

export interface ActionBarHUDCallbacks {
  onSlotAssign: (slotIndex: number, schema: AbilitySchema) => void;
  onEmptySlotClick: (slotIndex: number) => void;
}

interface SlotElements {
  root: HTMLElement;
  iconContainer: HTMLElement;
  badge: HTMLElement;
  label: HTMLElement;
  cooldownOverlay: HTMLElement;
  chargeOverlay: HTMLElement;
  heatOverlay: HTMLElement;
  gcdOverlay: HTMLElement;
  compileOverlay: HTMLElement;
  resourceBadge: HTMLElement;
  lockoutOverlay: HTMLElement;
  countdown: HTMLElement;
  accent: string;
  archetypeColor: string;
  lastAbilityId: string | null;
  lastIconStyle: IconRenderStyle | null;
}

const BADGE_STYLES: Record<ActionSlotKey, { color: string; bg: string }> = {
  LMB: { color: '#00e5ff', bg: 'rgba(0, 229, 255, 0.12)' },
  RMB: { color: '#00e5ff', bg: 'rgba(0, 229, 255, 0.12)' },
  Q: { color: '#ffd700', bg: 'rgba(255, 215, 0, 0.12)' },
  E: { color: '#aa44ff', bg: 'rgba(170, 68, 255, 0.12)' },
  SPACE: { color: '#44ff88', bg: 'rgba(68, 255, 136, 0.12)' },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEnumLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

interface DisplayTrajectory {
  trajectory?: TrajectoryConfig;
  emitter?: EmitterConfig;
  isNested?: boolean;
}

function resolveDisplayTrajectory(ability: AbilitySchema): DisplayTrajectory {
  if (ability.trajectory) {
    return { trajectory: ability.trajectory, isNested: false };
  }
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        return {
          trajectory: action.projectileTrajectory,
          emitter: action.emitter,
          isNested: true,
        };
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.trajectory) {
        return {
          trajectory: action.payload.trajectory,
          isNested: true,
        };
      }
    }
  }
  return {};
}

function formatTrajectoryLine(resolved: DisplayTrajectory): string {
  if (!resolved.trajectory) {
    return 'Instant · 0px/s · 0px range';
  }
  const trajectory = resolved.trajectory;
  const type = escapeHtml(formatEnumLabel(trajectory.type));
  const speed = trajectory.speed ?? 0;
  const range = trajectory.maxRange ?? 0;
  let line = `${type} · ${speed}px/s · ${range}px range`;
  if (resolved.emitter && resolved.emitter.count > 1) {
    const distribution = escapeHtml(formatEnumLabel(resolved.emitter.distribution ?? 'FAN'));
    line += ` · ${resolved.emitter.count}x ${distribution}`;
  }
  return line;
}

// Trigger trees can nest another full trigger tree inside a SPAWN_PROJECTILE action
// (e.g. the projectile's own ON_EXPIRY behavior), so tooltip summaries must recurse.
function walkTriggers(
  nodes: TriggerNode[],
  visit: (node: TriggerNode, action: ActionPayload) => void,
): void {
  for (const node of nodes) {
    for (const action of node.actions) {
      visit(node, action);
      if (action.type === 'SPAWN_PROJECTILE' && action.triggers) {
        walkTriggers(action.triggers, visit);
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.triggers) {
        walkTriggers(action.payload.triggers, visit);
      }
    }
    if (node.children) walkTriggers(node.children, visit);
  }
}

function sumInstability(ability: AbilitySchema): number {
  let total = 0;
  walkTriggers(ability.triggers, (_node, action) => {
    if (action.type === 'ADD_INSTABILITY') total += action.amount;
  });
  return total;
}

function collectAllActionTypes(ability: AbilitySchema): string[] {
  const actions = new Set<string>();
  walkTriggers(ability.triggers, (_node, action) => {
    actions.add(action.type);
  });
  return [...actions];
}

function summarizeTriggerNames(ability: AbilitySchema): string[] {
  const triggers = new Set<string>();
  walkTriggers(ability.triggers, (node) => {
    triggers.add(node.trigger);
  });
  return [...triggers];
}

function formatAbilityTooltip(ability: AbilitySchema, slotKey: ActionSlotKey, accentColor: string): string {
  const category = getCategoryLabel(SLOT_CATEGORY_MAP[slotKey]);
  const cooldown = ability.cooldownMs >= 1000
    ? `${(ability.cooldownMs / 1000).toFixed(1)}s`
    : `${ability.cooldownMs}ms`;
  const instability = sumInstability(ability);
  const trajectoryLine = formatTrajectoryLine(resolveDisplayTrajectory(ability));
  const triggers = summarizeTriggerNames(ability);
  const actionTypes = collectAllActionTypes(ability);
  const triggerList = triggers.length > 0 ? escapeHtml(triggers.join(', ')) : '—';
  const actionList = actionTypes.length > 0 ? escapeHtml(formatEnumLabel(actionTypes.join(', '))) : '—';
  const flavorBlock = [
    ability.tagline
      ? `<div style="font-size:${FONTS.size.sm};color:#00e5ff;font-style:italic;margin-bottom:2px;">${escapeHtml(ability.tagline)}</div>`
      : '',
    ability.description
      ? `<div style="font-size:${FONTS.size.body};color:#aaa;line-height:1.3;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1);">${escapeHtml(ability.description)}</div>`
      : '',
  ].join('');
  const visuals = ability.visuals;
  const swatchColor = visuals?.color ?? '#888';
  const projectileStyle = visuals ? escapeHtml(formatEnumLabel(visuals.projectileStyle)) : '—';
  const resourceCost = ability.resourceCost;
  const resourceLine = resourceCost
    ? `<div style="margin-bottom:8px;">
        <div style="color:${RETRO_COLORS.textMuted}; font-size:${FONTS.size.badge}; text-transform:uppercase; margin-bottom:2px;">Resource</div>
        <div style="font-size:${FONTS.size.body};">${escapeHtml(formatEnumLabel(resourceCost.type))} · cost ${resourceCost.cost}${
          resourceCost.maxCapacity !== undefined ? ` · cap ${resourceCost.maxCapacity}` : ''
        }${
          resourceCost.rechargeRate !== undefined ? ` · ${resourceCost.rechargeRate}/s` : ''
        }</div>
      </div>`
    : '';

  return `
    <div style="font-family:${FONTS.mono};">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px;">
      <span style="font-weight:700; font-size:${FONTS.size.md}; color:${accentColor};">${escapeHtml(ability.name)}</span>
      <span style="font-size:${FONTS.size.badge}; font-weight:700; padding:1px 5px; border-radius:4px; background:${accentColor}22; color:${accentColor};">${slotKey}</span>
    </div>
    ${flavorBlock}
    <div style="font-size:${FONTS.size.badge}; color:#94a3b8; text-transform:uppercase; letter-spacing:0.03em; margin-bottom:8px;">${category}</div>
    <div style="display:flex; gap:10px; margin-bottom:8px; font-size:${FONTS.size.body};">
      <div><span style="color:${RETRO_COLORS.textMuted};">CD</span> ${cooldown}</div>
      <div><span style="color:${RETRO_COLORS.textMuted};">Recoil</span> ${ability.recoilKick}px/s</div>
      <div><span style="color:${RETRO_COLORS.textMuted};">Instab</span> ${instability}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="color:${RETRO_COLORS.textMuted}; font-size:${FONTS.size.badge}; text-transform:uppercase; margin-bottom:2px;">Trajectory</div>
      <div style="font-size:${FONTS.size.body};">${trajectoryLine}</div>
    </div>
    <div style="margin-bottom:8px;">
      <div style="color:${RETRO_COLORS.textMuted}; font-size:${FONTS.size.badge}; text-transform:uppercase; margin-bottom:2px;">Triggers</div>
      <div style="font-size:${FONTS.size.body};">${triggerList}</div>
      <div style="color:${RETRO_COLORS.textMuted}; font-size:${FONTS.size.badge}; text-transform:uppercase; margin:4px 0 2px;">Actions</div>
      <div style="font-size:${FONTS.size.body};">${actionList}</div>
    </div>
    ${resourceLine}
    <div style="display:flex; align-items:center; gap:6px;">
      <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${swatchColor}; border:1px solid rgba(255,255,255,0.3);"></span>
      <span style="font-size:${FONTS.size.badge}; color:#cbd5e1;">${projectileStyle}</span>
    </div>
    </div>
  `;
}

export class ActionBarHUD {
  private root: HTMLElement;
  private slots: SlotElements[] = [];
  private tooltipEl: HTMLDivElement;
  private activeHoveredSlot: number | null = null;
  private cachedPlayerRef: Player | null = null;
  private aimingSlotIndex: number | null = null;

  constructor(private callbacks: ActionBarHUDCallbacks) {
    this.injectAimingStyles();
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      z-index: 9500; display: flex; gap: 12px; pointer-events: auto;
      font-family: ${FONTS.mono};
    `;

    for (let i = 0; i < ACTION_SLOT_KEYS.length; i++) {
      const key = ACTION_SLOT_KEYS[i];
      const slotEl = this.createSlot(i, key);
      this.slots.push(slotEl);
      this.root.appendChild(slotEl.root);

      // Visual gap between weapons (E) and mobility (SPACE)
      if (i === 3) {
        const spacer = document.createElement('div');
        spacer.style.cssText = 'width: 16px; flex-shrink: 0;';
        this.root.appendChild(spacer);
      }
    }

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText = `
      position: fixed; display: none; pointer-events: none; z-index: 10000;
      width: 250px; background: ${RETRO_COLORS.panelBg};
      border: 1px solid ${RETRO_COLORS.borderSubtle}; border-radius: 4px;
      padding: 10px 12px;
      box-shadow: ${RETRO_GLOW.boxCyan};
      backdrop-filter: blur(8px); font-family: ${FONTS.mono};
      color: ${RETRO_COLORS.textPrimary}; font-size: ${FONTS.size.body}; line-height: 1.4; opacity: 0;
      transition: opacity 0.15s ease, transform 0.15s ease;
    `;
    document.body.appendChild(this.tooltipEl);

    document.body.appendChild(this.root);

    window.addEventListener('iconstylechanged', () => {
      for (const slot of this.slots) {
        slot.lastAbilityId = null;
      }
    });
  }

  private injectAimingStyles(): void {
    if (document.getElementById('action-bar-aiming-styles')) return;
    const style = document.createElement('style');
    style.id = 'action-bar-aiming-styles';
    style.textContent = `
      @keyframes slotAimPulse {
        from {
          box-shadow: inset 0 0 12px rgba(0, 229, 255, 0.35), 0 0 8px rgba(0, 229, 255, 0.45);
          border-color: rgba(0, 229, 255, 0.75);
        }
        to {
          box-shadow: inset 0 0 20px rgba(0, 229, 255, 0.55), 0 0 18px rgba(0, 229, 255, 0.85);
          border-color: rgba(0, 229, 255, 1);
        }
      }
      .slot-aiming {
        transform: scale(1.05);
        animation: slotAimPulse 0.8s ease-in-out infinite alternate;
      }
    `;
    document.head.appendChild(style);
  }

  setSlotAimingState(slotIndex: number | null): void {
    if (this.aimingSlotIndex === slotIndex) return;

    if (this.aimingSlotIndex !== null) {
      this.slots[this.aimingSlotIndex].root.classList.remove('slot-aiming');
    }

    this.aimingSlotIndex = slotIndex;

    if (slotIndex !== null) {
      this.slots[slotIndex].root.classList.add('slot-aiming');
    }
  }

  private createSlot(slotIndex: number, key: ActionSlotKey): SlotElements {
    const accent = BADGE_STYLES[key];
    const root = document.createElement('div');
    root.style.cssText = `
      width: 80px; height: 80px; position: relative; overflow: hidden;
      backdrop-filter: blur(8px); background: rgba(18, 18, 30, 0.85);
      border: 1px solid ${RETRO_COLORS.borderNeon}40; border-radius: 4px;
      box-shadow: ${RETRO_GLOW.boxCyan};
      cursor: pointer; transition: border-color 0.15s ease, box-shadow 0.15s ease;
    `;

    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = `
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      z-index: 1; pointer-events: none;
    `;

    const badge = document.createElement('div');
    badge.textContent = key;
    badge.style.cssText = `
      position: absolute; top: 4px; left: 4px; z-index: 3;
      font-size: 12px; font-weight: 700; color: ${accent.color};
      background: ${accent.bg}; padding: 1px 3px; border-radius: 4px;
    `;

    const label = document.createElement('div');
    label.textContent = '+ Assign';
    label.style.cssText = `
      position: absolute; bottom: 3px; left: 2px; right: 2px; z-index: 3;
      font-size: 11px; color: #666; text-align: center;
      text-shadow: 0 1px 3px #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      pointer-events: none;
    `;

    const cooldownOverlay = document.createElement('div');
    cooldownOverlay.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 0%; z-index: 4;
      background: rgba(0, 0, 0, 0.7); pointer-events: none;
      transition: height 0.05s linear;
    `;

    const chargeOverlay = document.createElement('div');
    chargeOverlay.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 0%; display: none; z-index: 4;
      background: rgba(0, 229, 255, 0.45); pointer-events: none;
      transition: height 0.05s linear;
    `;

    const heatOverlay = document.createElement('div');
    heatOverlay.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 0%; display: none; z-index: 4;
      background: linear-gradient(to top, #ff4400, #ff8800);
      pointer-events: none; opacity: 0.85;
      transition: height 0.05s linear;
    `;

    // Global cooldown sweep: fills from the top and only ever shows once the slot's own
    // cooldown has cleared, so it reads as a shared casting-lockout beat rather than recharge.
    const gcdOverlay = document.createElement('div');
    gcdOverlay.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0; height: 0%; display: none; z-index: 4;
      background: rgba(255, 255, 255, 0.16); pointer-events: none;
      transition: height 0.05s linear;
    `;

    const compileOverlay = document.createElement('div');
    compileOverlay.style.cssText = `
      position: absolute; inset: 0; display: none; z-index: 5; pointer-events: none;
    `;

    const resourceBadge = document.createElement('div');
    resourceBadge.style.cssText = `
      position: absolute; top: 4px; right: 4px; display: none; z-index: 3;
      font-size: ${FONTS.size.badge}; font-weight: 700; color: #e2e8f0;
      background: rgba(0, 0, 0, 0.55); padding: 1px 4px; border-radius: 4px;
      pointer-events: none; line-height: 1.2;
    `;

    const lockoutOverlay = document.createElement('div');
    lockoutOverlay.style.cssText = `
      position: absolute; inset: 0; display: none; z-index: 6; pointer-events: none;
      align-items: center; justify-content: center; flex-direction: column;
      background: rgba(120, 0, 0, 0.55); color: #ffcccc;
      font-size: ${FONTS.size.badge}; font-weight: 700; text-align: center; line-height: 1.2;
    `;

    const countdown = document.createElement('div');
    countdown.style.cssText = `
      position: absolute; inset: 0; display: none; z-index: 7;
      align-items: center; justify-content: center;
      font-size: ${FONTS.size.lg}; font-weight: 700; color: #fff; text-shadow: 0 0 8px rgba(0,0,0,0.8);
      pointer-events: none;
    `;

    root.appendChild(iconContainer);
    root.appendChild(badge);
    root.appendChild(label);
    root.appendChild(cooldownOverlay);
    root.appendChild(chargeOverlay);
    root.appendChild(heatOverlay);
    root.appendChild(gcdOverlay);
    root.appendChild(compileOverlay);
    root.appendChild(resourceBadge);
    root.appendChild(lockoutOverlay);
    root.appendChild(countdown);

    root.addEventListener('dragover', (e) => {
      e.preventDefault();
      root.style.borderColor = accent.color;
      root.style.boxShadow = `${RETRO_GLOW.boxCyan}, 0 0 12px ${accent.color}66`;
    });

    root.addEventListener('dragleave', () => {
      root.style.borderColor = '';
      root.style.boxShadow = '';
    });

    root.addEventListener('drop', (e) => {
      e.preventDefault();
      root.style.borderColor = '';
      root.style.boxShadow = '';
      const raw = e.dataTransfer?.getData('application/json');
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const schema = validateAbilitySchema(parsed);
        if (schema) this.callbacks.onSlotAssign(slotIndex, schema);
      } catch {
        // ignore invalid drop payload
      }
    });

    root.addEventListener('click', () => {
      const ability = root.dataset.hasAbility === 'true';
      if (!ability) this.callbacks.onEmptySlotClick(slotIndex);
    });

    root.addEventListener('mouseenter', () => {
      if (root.dataset.hasAbility !== 'true') return;
      this.activeHoveredSlot = slotIndex;
      this.renderTooltip(slotIndex);
      this.updateTooltipPosition(slotIndex);
    });

    root.addEventListener('mouseleave', () => {
      this.activeHoveredSlot = null;
      this.tooltipEl.style.display = 'none';
      this.tooltipEl.style.opacity = '0';
    });

    return {
      root,
      iconContainer,
      badge,
      label,
      cooldownOverlay,
      chargeOverlay,
      heatOverlay,
      gcdOverlay,
      compileOverlay,
      resourceBadge,
      lockoutOverlay,
      countdown,
      accent: accent.color,
      archetypeColor: accent.color,
      lastAbilityId: null,
      lastIconStyle: null,
    };
  }

  private updateSlotIcon(slotIndex: number, ability: AbilitySchema | null): void {
    const slot = this.slots[slotIndex];
    const nextId = ability?.id ?? null;
    const nextStyle = getIconRenderStyle();
    if (nextId === slot.lastAbilityId && nextStyle === slot.lastIconStyle) return;

    slot.iconContainer.replaceChildren();
    slot.lastAbilityId = nextId;
    slot.lastIconStyle = nextStyle;

    if (ability) {
      slot.iconContainer.appendChild(generateSpellIcon(ability, 64));
      slot.label.textContent = ability.name;
      slot.label.style.color = '#ccc';
      slot.archetypeColor = getArchetypeColor(ability.archetype, ability.visuals?.color);
      slot.root.style.borderColor = `${slot.archetypeColor}4d`;
      slot.root.dataset.hasAbility = 'true';
      slot.root.style.borderStyle = 'solid';
    } else {
      slot.label.textContent = '+ Assign';
      slot.label.style.color = '#666';
      slot.archetypeColor = slot.accent;
      slot.root.dataset.hasAbility = 'false';
      slot.root.style.borderStyle = 'dashed';
    }
  }

  private updateTooltipPosition(slotIndex: number): void {
    const rect = this.slots[slotIndex].root.getBoundingClientRect();
    const tooltipWidth = 250;
    const gap = 10;
    const left = Math.max(10, Math.min(
      window.innerWidth - tooltipWidth - 10,
      rect.left + rect.width / 2 - tooltipWidth / 2,
    ));
    const top = rect.top - gap;
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.bottom = `${window.innerHeight - top}px`;
    this.tooltipEl.style.top = 'auto';
  }

  private renderTooltip(slotIndex: number): void {
    const ability = this.cachedPlayerRef?.getAbility(slotIndex) ?? null;
    const compiling = this.cachedPlayerRef?.isSlotCompiling(slotIndex) ?? false;
    if (!ability || compiling) {
      this.tooltipEl.style.display = 'none';
      this.tooltipEl.style.opacity = '0';
      return;
    }

    const key = ACTION_SLOT_KEYS[slotIndex];
    this.tooltipEl.innerHTML = formatAbilityTooltip(ability, key, this.slots[slotIndex].accent);
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.opacity = '1';
  }

  update(player: Player): void {
    this.cachedPlayerRef = player;
    this.setSlotAimingState(
      player.activeAimingState ? player.activeAimingState.slotIndex : null,
    );

    if (this.activeHoveredSlot !== null) {
      const hovered = this.activeHoveredSlot;
      const hoveredAbility = player.getAbility(hovered);
      if (!hoveredAbility || player.isSlotCompiling(hovered)) {
        this.tooltipEl.style.display = 'none';
        this.tooltipEl.style.opacity = '0';
      } else {
        this.renderTooltip(hovered);
        this.updateTooltipPosition(hovered);
      }
    }

    const now = performance.now();
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const ability = player.getAbility(i);
      const ratio = player.getSlotCooldownRatio(i);
      const remaining = player.getSlotCooldownRemainingMs(i);
      const ready = player.isSlotReady(i);
      const compiling = player.isSlotCompiling(i);
      const accent = slot.accent;

      this.updateSlotIcon(i, ability);

      if (compiling) {
        // Background synthesis in flight — suppress the real cooldown fill/ready-glow and
        // show an animated pulse instead so the player can see the slot isn't just idle.
        slot.cooldownOverlay.style.height = '0%';
        slot.gcdOverlay.style.display = 'none';

        const pulse = (Math.sin(now / 200) + 1) / 2; // 0..1
        slot.compileOverlay.style.display = 'block';
        slot.compileOverlay.style.background = `rgba(255, 191, 0, ${0.2 + pulse * 0.3})`;
        slot.root.style.borderColor = `rgba(255, 191, 0, ${0.55 + pulse * 0.45})`;
        slot.root.style.boxShadow = `0 0 ${8 + pulse * 8}px rgba(255, 191, 0, ${0.35 + pulse * 0.35})`;

        slot.countdown.style.display = 'flex';
        slot.countdown.style.fontSize = FONTS.size.badge;
        slot.countdown.textContent = 'COMPILING…';
        continue;
      }

      slot.compileOverlay.style.display = 'none';
      slot.countdown.style.fontSize = FONTS.size.lg;

      const resourceCost = ability?.resourceCost;
      const usesResourceCooldown =
        resourceCost?.type === 'HEAT' || resourceCost?.type === 'AMMO';

      slot.heatOverlay.style.display = 'none';
      slot.resourceBadge.style.display = 'none';
      slot.lockoutOverlay.style.display = 'none';
      slot.lockoutOverlay.style.flexDirection = 'column';

      if (resourceCost?.type === 'HEAT') {
        const heatRatio = player.getSlotHeatRatio(i);
        slot.heatOverlay.style.display = 'block';
        slot.heatOverlay.style.height = `${heatRatio * 100}%`;
        if (player.isSlotOverheated(i)) {
          const pulse = (Math.sin(now / 120) + 1) / 2;
          slot.lockoutOverlay.style.display = 'flex';
          slot.lockoutOverlay.style.background = `rgba(180, 0, 0, ${0.45 + pulse * 0.35})`;
          slot.lockoutOverlay.textContent = 'OVERHEAT';
        }
      } else if (resourceCost?.type === 'AMMO') {
        const ammo = player.getSlotAmmoCount(i);
        const capacity = player.getSlotAmmoCapacity(i);
        slot.resourceBadge.style.display = 'block';
        slot.resourceBadge.textContent = `${ammo}/${capacity}`;
        if (player.isSlotReloading(i)) {
          const lockoutRatio = player.getSlotLockoutRatio(i);
          slot.lockoutOverlay.style.display = 'flex';
          slot.lockoutOverlay.style.background = `rgba(0, 0, 0, ${0.35 + lockoutRatio * 0.35})`;
          slot.lockoutOverlay.innerHTML = `RELOADING...<br><span style="font-size:${FONTS.size.badge}">${Math.ceil(player.getSlotLockoutRemainingMs(i))}ms</span>`;
        }
      } else if (resourceCost?.type === 'HEALTH_PCT') {
        slot.resourceBadge.style.display = 'block';
        slot.resourceBadge.style.color = '#ff6b6b';
        slot.resourceBadge.textContent = `-${resourceCost.cost}% HP`;
      }

      if (usesResourceCooldown) {
        slot.cooldownOverlay.style.height = '0%';
      } else {
        slot.cooldownOverlay.style.height = `${ratio * 100}%`;
      }

      const slotInput = player.slotInputs[i];
      const isCharging =
        ability?.inputProfile?.mode === 'CHARGE_AND_RELEASE' && slotInput.charging;
      if (isCharging) {
        const maxCharge = ability.inputProfile?.maxChargeMs ?? 1000;
        const chargeRatio = maxCharge > 0 ? slotInput.chargeMs / maxCharge : 0;
        slot.chargeOverlay.style.display = 'block';
        slot.chargeOverlay.style.height = `${Math.min(1, chargeRatio) * 100}%`;
      } else {
        slot.chargeOverlay.style.display = 'none';
        slot.chargeOverlay.style.height = '0%';
      }

      // GCD sweep only reads once the slot's own cooldown has cleared — otherwise the
      // per-slot cooldown fill already communicates the lockout.
      const gcdRatio = player.getGlobalCooldownRatio();
      const gcdOnly = ability && remaining <= 0 && gcdRatio > 0;
      slot.gcdOverlay.style.display = gcdOnly ? 'block' : 'none';
      if (gcdOnly) {
        slot.gcdOverlay.style.height = `${gcdRatio * 100}%`;
      }

      if (player.isSlotOverheated(i) || player.isSlotReloading(i)) {
        slot.countdown.style.display = 'flex';
        slot.countdown.style.fontSize = FONTS.size.badge;
        const lockoutRemaining = player.getSlotLockoutRemainingMs(i);
        slot.countdown.textContent = lockoutRemaining >= 1000
          ? `${(lockoutRemaining / 1000).toFixed(1)}s`
          : `${Math.ceil(lockoutRemaining)}ms`;
      } else if (remaining > 0) {
        slot.countdown.style.display = 'flex';
        slot.countdown.textContent = remaining >= 1000
          ? `${(remaining / 1000).toFixed(1)}s`
          : `${Math.ceil(remaining)}ms`;
      } else if (gcdOnly) {
        const gcdRemaining = player.globalCooldownTimerMs;
        slot.countdown.style.display = 'flex';
        slot.countdown.textContent = gcdRemaining >= 1000
          ? `${(gcdRemaining / 1000).toFixed(1)}s`
          : `${Math.ceil(gcdRemaining)}ms`;
      } else {
        slot.countdown.style.display = 'none';
      }

      if (ready && ability && this.aimingSlotIndex !== i) {
        slot.root.style.borderColor = accent;
        slot.root.style.boxShadow = `${RETRO_GLOW.boxCyan}, 0 0 10px ${accent}59`;
      } else if (!slot.root.matches(':hover') && this.aimingSlotIndex !== i) {
        slot.root.style.borderColor = ability ? `${slot.archetypeColor}4d` : `${accent}40`;
        slot.root.style.boxShadow = '';
      }
    }
  }
}
