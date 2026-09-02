import type {
  AbilitySchema,
  TrajectoryConfig,
  TrajectoryType,
} from '../../types/schema';
import { getArchetypeColor } from './SpellIconGenerator';

export type AimingMode = 'directional' | 'radial';

export interface AimingState {
  slotIndex: number;
  ability: AbilitySchema;
  mode: AimingMode;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  /** Unclamped mouse world position; overlay length/angle is rebuilt from this at draw time. */
  cursor: { x: number; y: number };
  angle: number;
  range: number;
  width: number;
  radialRadius: number;
  playerRadius: number;
}

export function layoutAimingVisual(
  state: AimingState,
  origin: { x: number; y: number },
): AimingState {
  const dx = state.cursor.x - origin.x;
  const dy = state.cursor.y - origin.y;
  const dist = Math.hypot(dx, dy);
  const angle = dist > 0.01 ? Math.atan2(dy, dx) : state.angle;
  const clampedDist =
    state.mode === 'directional' ? Math.min(dist, state.range) : dist;
  return {
    ...state,
    origin: { x: origin.x, y: origin.y },
    angle,
    target: {
      x: origin.x + Math.cos(angle) * clampedDist,
      y: origin.y + Math.sin(angle) * clampedDist,
    },
  };
}

const DIRECTIONAL_TYPES: TrajectoryType[] = [
  'LINEAR',
  'RETURN_TO_SOURCE',
  'HOMING_SLERP',
  'DISCONTINUOUS_BLINK',
];

function resolveRootTrajectory(ability: AbilitySchema): TrajectoryConfig | undefined {
  if (ability.trajectory) return ability.trajectory;
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_PROJECTILE' && action.projectileTrajectory) {
        return action.projectileTrajectory;
      }
      if (action.type === 'CAST_CHILD_PAYLOAD' && action.payload?.trajectory) {
        return action.payload.trajectory;
      }
    }
  }
  return undefined;
}

function collectOnCastFieldRadii(ability: AbilitySchema): number[] {
  const radii: number[] = [];
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'SPAWN_FIELD') {
        radii.push(action.field.radius);
      }
    }
  }
  return radii;
}

function hasOnCastTeleport(ability: AbilitySchema): boolean {
  for (const triggerNode of ability.triggers ?? []) {
    if (triggerNode.trigger !== 'ON_CAST') continue;
    for (const action of triggerNode.actions ?? []) {
      if (action.type === 'TELEPORT') return true;
    }
  }
  return false;
}

export function classifyAimingMode(ability: AbilitySchema): AimingMode | null {
  const profile = ability.inputProfile ?? { mode: 'INSTANT' };
  if (profile.mode !== 'INSTANT') return null;

  const trajectory = resolveRootTrajectory(ability);
  if (trajectory) {
    if (DIRECTIONAL_TYPES.includes(trajectory.type)) return 'directional';
    if (trajectory.type === 'ORBIT_ANCHOR') return 'radial';
  }

  if (hasOnCastTeleport(ability) && !trajectory) return null;

  const fieldRadii = collectOnCastFieldRadii(ability);
  if (fieldRadii.length > 0 && !trajectory) return 'radial';

  return null;
}

export function resolveAbilityAimParams(ability: AbilitySchema): {
  trajectory?: TrajectoryConfig;
  range: number;
  width: number;
  radialRadius: number;
} {
  const trajectory = resolveRootTrajectory(ability);
  const fieldRadii = collectOnCastFieldRadii(ability);
  const range = trajectory?.maxRange ?? trajectory?.orbitRadius ?? 350;
  const width = Math.max(28, (ability.visuals?.size ?? 14) * 2);
  let radialRadius = 0;
  if (trajectory?.type === 'ORBIT_ANCHOR') {
    radialRadius = trajectory.orbitRadius ?? 100;
  } else if (fieldRadii.length > 0) {
    radialRadius = Math.max(...fieldRadii);
  }
  return { trajectory, range, width, radialRadius };
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function longitudinalT(x: number, startX: number, endX: number): number {
  return Math.max(0, Math.min(1, (x - startX) / Math.max(1, endX - startX)));
}

function fadeAlpha(x: number, startX: number, endX: number, maxAlpha: number): number {
  return Math.pow(longitudinalT(x, startX, endX), 1.6) * maxAlpha;
}

function drawFrostAccents(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  shaftEnd: number,
  shaftWidth: number,
  color: string,
): void {
  ctx.lineWidth = 1.5;
  const tickLen = 8;
  for (let x = startX + 20; x < shaftEnd; x += 28) {
    ctx.strokeStyle = hexToRgba(color, fadeAlpha(x, startX, endX, 0.85));
    const side = ((x / 28) % 2 === 0) ? 1 : -1;
    const y = (shaftWidth / 2 + 4) * side;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tickLen * 0.6, y + tickLen * side);
    ctx.lineTo(x + tickLen, y);
    ctx.stroke();
  }
  const tipX = shaftEnd + 18;
  const tipAlpha = fadeAlpha(tipX, startX, endX, 0.85);
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(tipX + 10, -shaftWidth * 0.5);
  ctx.lineTo(tipX + 20, 0);
  ctx.lineTo(tipX + 10, shaftWidth * 0.5);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, tipAlpha * 0.45);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, tipAlpha);
  ctx.stroke();
}

function drawFireAccents(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  color: string,
  now: number,
): void {
  ctx.lineWidth = 2;
  const pulse = (now / 300) % 1;
  const lineEnd = endX - 45;
  const span = Math.max(1, lineEnd - startX);
  for (let i = 0; i < 5; i++) {
    const t = ((i / 5 + pulse) % 1);
    const x = startX + 20 + t * span;
    ctx.strokeStyle = hexToRgba(color, fadeAlpha(x, startX, endX, 0.85));
    ctx.beginPath();
    ctx.moveTo(x - 6, -8);
    ctx.lineTo(x, 0);
    ctx.lineTo(x - 6, 8);
    ctx.stroke();
  }
}

function drawLightningAccents(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  color: string,
): void {
  ctx.lineWidth = 2;
  const lineEnd = endX - 45;
  const segments = 6;
  let prevX = startX + 20;
  let prevY = 0;
  for (let i = 1; i <= segments; i++) {
    const x = startX + 20 + (lineEnd - (startX + 20)) * (i / segments);
    const y = (i % 2 === 0 ? 1 : -1) * (6 + (i % 3) * 3);
    const midX = (prevX + x) / 2;
    ctx.strokeStyle = hexToRgba(color, fadeAlpha(midX, startX, endX, 0.85));
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
    prevX = x;
    prevY = y;
  }
}

function drawVoidAccents(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  shaftStart: number,
  shaftEnd: number,
  shaftWidth: number,
  headBase: number,
  range: number,
  color: string,
): void {
  const voidFillGrad = ctx.createLinearGradient(startX, 0, endX, 0);
  voidFillGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  voidFillGrad.addColorStop(0.35, 'rgba(0, 0, 0, 0.06)');
  voidFillGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.18)');
  voidFillGrad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');

  ctx.beginPath();
  ctx.moveTo(shaftStart, -shaftWidth / 2);
  ctx.lineTo(shaftEnd, -shaftWidth / 2);
  ctx.lineTo(headBase, -shaftWidth * 0.85);
  ctx.lineTo(range, 0);
  ctx.lineTo(headBase, shaftWidth * 0.85);
  ctx.lineTo(shaftEnd, shaftWidth / 2);
  ctx.lineTo(shaftStart, shaftWidth / 2);
  ctx.closePath();
  ctx.fillStyle = voidFillGrad;
  ctx.fill();

  const voidStrokeGrad = ctx.createLinearGradient(startX, 0, endX, 0);
  voidStrokeGrad.addColorStop(0, hexToRgba(color, 0));
  voidStrokeGrad.addColorStop(0.25, hexToRgba(color, 0.12));
  voidStrokeGrad.addColorStop(0.65, hexToRgba(color, 0.35));
  voidStrokeGrad.addColorStop(1, hexToRgba(color, 0.45));
  ctx.strokeStyle = voidStrokeGrad;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawKineticAccents(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  color: string,
): void {
  ctx.lineWidth = 2;
  const lineEnd = endX - 45;

  for (let x = startX + 20; x < lineEnd; x += 12) {
    ctx.strokeStyle = hexToRgba(color, fadeAlpha(x, startX, endX, 0.85));
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(Math.min(x + 6, lineEnd), 0);
    ctx.stroke();
  }

  for (let x = startX + 20; x < endX - 45; x += 32) {
    ctx.strokeStyle = hexToRgba(color, fadeAlpha(x, startX, endX, 0.85));
    ctx.beginPath();
    ctx.moveTo(x, -5);
    ctx.lineTo(x + 10, 0);
    ctx.lineTo(x, 5);
    ctx.stroke();
  }
}

export function drawSkillshotArrow(
  ctx: CanvasRenderingContext2D,
  state: AimingState,
  now = performance.now(),
): void {
  const archetype = state.ability.archetype ?? 'KINETIC';
  const color = getArchetypeColor(archetype, state.ability.visuals?.color);
  const maxRange = state.range;
  const cursorLen = Math.hypot(
    state.target.x - state.origin.x,
    state.target.y - state.origin.y,
  );
  const minLen = state.playerRadius + 40;
  const len = Math.max(minLen, Math.min(cursorLen, maxRange));
  const shaftWidth = state.width;
  const shaftStart = state.playerRadius;
  const shaftEnd = len - 36;
  const headBase = len - 36;
  const startX = state.playerRadius + 6;
  const endX = len;

  ctx.save();
  ctx.translate(state.origin.x, state.origin.y);
  ctx.rotate(state.angle);

  const fillGrad = ctx.createLinearGradient(startX, 0, endX, 0);
  fillGrad.addColorStop(0, hexToRgba(color, 0));
  fillGrad.addColorStop(0.35, hexToRgba(color, 0.06));
  fillGrad.addColorStop(0.7, hexToRgba(color, 0.22));
  fillGrad.addColorStop(1, hexToRgba(color, 0.45));

  const strokeGrad = ctx.createLinearGradient(startX, 0, endX, 0);
  strokeGrad.addColorStop(0, hexToRgba(color, 0));
  strokeGrad.addColorStop(0.25, hexToRgba(color, 0.15));
  strokeGrad.addColorStop(0.65, hexToRgba(color, 0.65));
  strokeGrad.addColorStop(1, hexToRgba(color, 1));

  ctx.beginPath();
  ctx.moveTo(shaftStart, -shaftWidth / 2);
  ctx.lineTo(shaftEnd, -shaftWidth / 2);
  ctx.lineTo(headBase, -shaftWidth * 0.85);
  ctx.lineTo(len, 0);
  ctx.lineTo(headBase, shaftWidth * 0.85);
  ctx.lineTo(shaftEnd, shaftWidth / 2);
  ctx.lineTo(shaftStart, shaftWidth / 2);
  ctx.closePath();
  ctx.fillStyle = fillGrad;
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  switch (archetype) {
    case 'FROST':
      drawFrostAccents(ctx, startX, endX, shaftEnd, shaftWidth, color);
      break;
    case 'FIRE':
    case 'PLASMA':
      drawFireAccents(ctx, startX, endX, color, now);
      break;
    case 'LIGHTNING':
    case 'CHAOS':
      drawLightningAccents(ctx, startX, endX, color);
      break;
    case 'VOID':
    case 'ARCANE':
      drawVoidAccents(
        ctx,
        startX,
        endX,
        shaftStart,
        shaftEnd,
        shaftWidth,
        headBase,
        len,
        color,
      );
      break;
    default:
      drawKineticAccents(ctx, startX, endX, color);
      break;
  }

  ctx.restore();
}

export function drawAoERadial(
  ctx: CanvasRenderingContext2D,
  state: AimingState,
  now = performance.now(),
): void {
  const archetype = state.ability.archetype ?? 'KINETIC';
  const color = getArchetypeColor(archetype, state.ability.visuals?.color);
  const radius = state.radialRadius > 0 ? state.radialRadius : state.range;
  const center =
    state.mode === 'radial' && state.radialRadius > 0 && !state.ability.trajectory
      ? state.origin
      : state.target;

  ctx.save();
  ctx.strokeStyle = hexToRgba(color, 0.35);
  ctx.lineWidth = 4;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  const rotation = (now / 2000) * Math.PI * 2;
  const tickCount = 8;
  ctx.beginPath();
  for (let i = 0; i < tickCount; i++) {
    const angle = rotation + (i / tickCount) * Math.PI * 2;
    const inner = radius - 10;
    const outer = radius + 6;
    ctx.moveTo(
      center.x + Math.cos(angle) * inner,
      center.y + Math.sin(angle) * inner,
    );
    ctx.lineTo(
      center.x + Math.cos(angle) * outer,
      center.y + Math.sin(angle) * outer,
    );
  }
  ctx.stroke();

  ctx.fillStyle = hexToRgba(color, 0.12);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export class AimingIndicatorRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    state: AimingState,
    origin?: { x: number; y: number },
  ): void {
    const visual = origin ? layoutAimingVisual(state, origin) : state;
    const now = performance.now();
    if (visual.mode === 'directional') {
      drawSkillshotArrow(ctx, visual, now);
    } else {
      drawAoERadial(ctx, visual, now);
    }
  }
}
