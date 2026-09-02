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
  angle: number;
  range: number;
  width: number;
  radialRadius: number;
  playerRadius: number;
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

function drawFrostAccents(
  ctx: CanvasRenderingContext2D,
  shaftStart: number,
  shaftEnd: number,
  shaftWidth: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  const tickLen = 8;
  for (let x = shaftStart + 20; x < shaftEnd; x += 28) {
    const side = ((x / 28) % 2 === 0) ? 1 : -1;
    const y = (shaftWidth / 2 + 4) * side;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tickLen * 0.6, y + tickLen * side);
    ctx.lineTo(x + tickLen, y);
    ctx.stroke();
  }
  const tipX = shaftEnd + 18;
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(tipX + 10, -shaftWidth * 0.5);
  ctx.lineTo(tipX + 20, 0);
  ctx.lineTo(tipX + 10, shaftWidth * 0.5);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.5);
  ctx.fill();
  ctx.stroke();
}

function drawFireAccents(
  ctx: CanvasRenderingContext2D,
  shaftStart: number,
  range: number,
  color: string,
  now: number,
): void {
  ctx.strokeStyle = hexToRgba(color, 0.7);
  ctx.lineWidth = 2;
  const pulse = (now / 300) % 1;
  for (let i = 0; i < 5; i++) {
    const t = ((i / 5 + pulse) % 1);
    const x = shaftStart + t * (range - shaftStart - 36);
    ctx.beginPath();
    ctx.moveTo(x - 6, -8);
    ctx.lineTo(x, 0);
    ctx.lineTo(x - 6, 8);
    ctx.stroke();
  }
}

function drawLightningAccents(
  ctx: CanvasRenderingContext2D,
  shaftStart: number,
  range: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const endX = range - 36;
  const segments = 6;
  ctx.beginPath();
  ctx.moveTo(shaftStart, 0);
  for (let i = 1; i <= segments; i++) {
    const x = shaftStart + (endX - shaftStart) * (i / segments);
    const y = (i % 2 === 0 ? 1 : -1) * (6 + (i % 3) * 3);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawVoidAccents(
  ctx: CanvasRenderingContext2D,
  shaftStart: number,
  shaftEnd: number,
  shaftWidth: number,
  headBase: number,
  range: number,
  color: string,
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.moveTo(shaftStart, -shaftWidth / 2);
  ctx.lineTo(shaftEnd, -shaftWidth / 2);
  ctx.lineTo(headBase, -shaftWidth * 0.85);
  ctx.lineTo(range, 0);
  ctx.lineTo(headBase, shaftWidth * 0.85);
  ctx.lineTo(shaftEnd, shaftWidth / 2);
  ctx.lineTo(shaftStart, shaftWidth / 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hexToRgba(color, 0.35);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawKineticAccents(
  ctx: CanvasRenderingContext2D,
  shaftStart: number,
  range: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(shaftStart, 0);
  ctx.lineTo(range - 36, 0);
  ctx.stroke();
  ctx.setLineDash([]);

  const endX = range - 36;
  for (let x = shaftStart + 30; x < endX; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, -5);
    ctx.lineTo(x + 10, 0);
    ctx.lineTo(x, 5);
    ctx.stroke();
  }
}

function drawTerminalReticle(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  color: string,
  size: number,
): void {
  const s = size;
  ctx.strokeStyle = hexToRgba(color, 0.4);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(tipX, 0, s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tipX, 0, s, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tipX - s - 4, 0);
  ctx.lineTo(tipX + s + 4, 0);
  ctx.moveTo(tipX, -s - 4);
  ctx.lineTo(tipX, s + 4);
  ctx.stroke();
}

export function drawSkillshotArrow(
  ctx: CanvasRenderingContext2D,
  state: AimingState,
  now = performance.now(),
): void {
  const archetype = state.ability.archetype ?? 'KINETIC';
  const color = getArchetypeColor(archetype, state.ability.visuals?.color);
  const range = state.range;
  const shaftWidth = state.width;
  const shaftStart = state.playerRadius;
  const shaftEnd = range - 36;
  const headBase = range - 36;

  ctx.save();
  ctx.translate(state.origin.x, state.origin.y);
  ctx.rotate(state.angle);

  const grad = ctx.createLinearGradient(shaftStart, 0, range, 0);
  grad.addColorStop(0, hexToRgba(color, 0.15));
  grad.addColorStop(1, hexToRgba(color, 0.35));

  ctx.beginPath();
  ctx.moveTo(shaftStart, -shaftWidth / 2);
  ctx.lineTo(shaftEnd, -shaftWidth / 2);
  ctx.lineTo(headBase, -shaftWidth * 0.85);
  ctx.lineTo(range, 0);
  ctx.lineTo(headBase, shaftWidth * 0.85);
  ctx.lineTo(shaftEnd, shaftWidth / 2);
  ctx.lineTo(shaftStart, shaftWidth / 2);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = hexToRgba(color, 0.35);
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  switch (archetype) {
    case 'FROST':
      drawFrostAccents(ctx, shaftStart, shaftEnd, shaftWidth, color);
      break;
    case 'FIRE':
    case 'PLASMA':
      drawFireAccents(ctx, shaftStart, range, color, now);
      break;
    case 'LIGHTNING':
    case 'CHAOS':
      drawLightningAccents(ctx, shaftStart, range, color);
      break;
    case 'VOID':
    case 'ARCANE':
      drawVoidAccents(ctx, shaftStart, shaftEnd, shaftWidth, headBase, range, color);
      break;
    default:
      drawKineticAccents(ctx, shaftStart, range, color);
      break;
  }

  drawTerminalReticle(ctx, range, color, 10);

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
  render(ctx: CanvasRenderingContext2D, state: AimingState): void {
    const now = performance.now();
    if (state.mode === 'directional') {
      drawSkillshotArrow(ctx, state, now);
    } else {
      drawAoERadial(ctx, state, now);
    }
  }
}
