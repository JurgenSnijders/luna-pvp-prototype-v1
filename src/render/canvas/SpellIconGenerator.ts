import type {
  AbilitySchema,
  ActionPayload,
  ProjectileStyle,
  SpellArchetype,
  TrajectoryConfig,
  TriggerNode,
} from '../../types/schema';
import { getIconRenderStyle, type IconRenderStyle } from '../gl/retroVfxConfig';
import { resolveIconTrajectoryPaths } from './trajectoryTracer';

const LOGICAL_SIZE = 48;

const ARCHETYPE_COLORS: Record<SpellArchetype, string> = {
  KINETIC: '#e0f8ff',
  FIRE: '#ff4400',
  FROST: '#00e5ff',
  LIGHTNING: '#ffee00',
  VOID: '#cc44ff',
  HOLY: '#fff8c0',
  TOXIC: '#66ff44',
  ARCANE: '#bb66ff',
  MAGNETIC: '#44aaff',
  SONIC: '#88ffcc',
  AERO: '#aaddff',
  GRAVITY: '#aa44ff',
  EARTH: '#d4a373',
  CHRONO: '#ffcc44',
  PLASMA: '#ff66cc',
  NATURE: '#44cc66',
  BLOOD: '#cc2244',
  PHASE: '#44ffff',
  CHAOS: '#ff007f',
};

export function getArchetypeColor(archetype?: SpellArchetype, fallback?: string): string {
  if (archetype && archetype in ARCHETYPE_COLORS) {
    return ARCHETYPE_COLORS[archetype];
  }
  return fallback ?? '#00e5ff';
}

interface ActionFlags {
  hasSpawnActor: boolean;
  hasTeleport: boolean;
  hasSpawnField: boolean;
  hasSpawnProjectile: boolean;
}

interface IconContext {
  archetype: SpellArchetype;
  archetypeColor: string;
  projectileStyle: ProjectileStyle;
  trajectory?: TrajectoryConfig;
  flags: ActionFlags;
  payloadAtCenter: boolean;
  terminus: { x: number; y: number };
}

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

function resolveIconTrajectory(ability: AbilitySchema): TrajectoryConfig | undefined {
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

function collectActionFlags(ability: AbilitySchema): ActionFlags {
  const flags: ActionFlags = {
    hasSpawnActor: false,
    hasTeleport: false,
    hasSpawnField: false,
    hasSpawnProjectile: false,
  };
  walkTriggers(ability.triggers ?? [], (_node, action) => {
    if (action.type === 'SPAWN_ACTOR') flags.hasSpawnActor = true;
    if (action.type === 'TELEPORT') flags.hasTeleport = true;
    if (action.type === 'SPAWN_FIELD') flags.hasSpawnField = true;
    if (action.type === 'SPAWN_PROJECTILE') flags.hasSpawnProjectile = true;
  });
  return flags;
}

function buildIconContext(ability: AbilitySchema): IconContext {
  const archetype = ability.archetype ?? 'KINETIC';
  const archetypeColor = getArchetypeColor(archetype, ability.visuals?.color);
  const trajectory = resolveIconTrajectory(ability);
  const flags = collectActionFlags(ability);
  const projectileStyle = ability.visuals?.projectileStyle ?? 'DISC';

  const payloadAtCenter =
    flags.hasSpawnField && !trajectory && !flags.hasSpawnProjectile
    || trajectory?.type === 'ORBIT_ANCHOR'
    || flags.hasSpawnActor;

  const terminus = payloadAtCenter
    ? { x: 24, y: 24 }
    : { x: 36, y: 12 };

  return {
    archetype,
    archetypeColor,
    projectileStyle,
    trajectory,
    flags,
    payloadAtCenter,
    terminus,
  };
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createRadialGradient(24, 24, 4, 24, 24, 28);
  gradient.addColorStop(0, 'rgba(10, 14, 26, 0.95)');
  gradient.addColorStop(1, '#05070e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= LOGICAL_SIZE; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, LOGICAL_SIZE);
    ctx.stroke();
  }
  for (let y = 0; y <= LOGICAL_SIZE; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(LOGICAL_SIZE, y);
    ctx.stroke();
  }
}

function strokeWithGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  draw: () => void,
): void {
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  draw();
  ctx.shadowBlur = 0;
}

function drawPylonBase(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(24, 14);
    ctx.lineTo(32, 22);
    ctx.lineTo(30, 32);
    ctx.lineTo(18, 32);
    ctx.lineTo(16, 22);
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 32);
    ctx.lineTo(14, 38);
    ctx.moveTo(24, 32);
    ctx.lineTo(24, 38);
    ctx.moveTo(30, 32);
    ctx.lineTo(34, 38);
    ctx.stroke();
  });
}

function drawTeleportShift(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    const drawDiamond = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.stroke();
    };
    drawDiamond(14, 28, 5);
    drawDiamond(34, 20, 5);

    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(18, 26);
    ctx.lineTo(30, 22);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function drawRadarRings(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (const radius of [8, 14, 20]) {
      ctx.beginPath();
      ctx.arc(24, 24, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  });
}

function drawBoomerangLoop(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(24, 22, 14, 10, -0.4, 0.3, Math.PI * 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, 30);
    ctx.lineTo(10, 34);
    ctx.stroke();
  });
}

function drawOrbitRing(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(24, 24, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(24, 24, 2.5, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawHomingCurve(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 36);
    ctx.quadraticCurveTo(18, 10, 36, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(36, 14);
    ctx.lineTo(32, 10);
    ctx.moveTo(36, 14);
    ctx.lineTo(34, 18);
    ctx.stroke();
  });
}

function drawLinearShaft(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(12, 36);
    ctx.lineTo(36, 12);
    ctx.stroke();
  });
}

function drawDeliveryLayer(ctx: CanvasRenderingContext2D, icon: IconContext): void {
  const { archetypeColor, trajectory, flags } = icon;

  if (flags.hasSpawnActor) {
    drawPylonBase(ctx, archetypeColor);
    return;
  }
  if (flags.hasTeleport || trajectory?.type === 'DISCONTINUOUS_BLINK') {
    drawTeleportShift(ctx, archetypeColor);
    return;
  }
  if (flags.hasSpawnField && !trajectory && !flags.hasSpawnProjectile) {
    drawRadarRings(ctx, archetypeColor);
    return;
  }
  if (trajectory?.type === 'RETURN_TO_SOURCE') {
    drawBoomerangLoop(ctx, archetypeColor);
    return;
  }
  if (trajectory?.type === 'ORBIT_ANCHOR') {
    drawOrbitRing(ctx, archetypeColor);
    return;
  }
  if (trajectory?.type === 'HOMING_SLERP') {
    drawHomingCurve(ctx, archetypeColor);
    return;
  }
  drawLinearShaft(ctx, archetypeColor);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawPayloadGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: ProjectileStyle,
  color: string,
  markerSize: number,
): void {
  const r = markerSize * 0.5;
  const s = markerSize * 0.8;

  switch (style) {
    case 'SHURIKEN':
      strokeWithGlow(ctx, color, () => {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (Math.PI / 2) * i + Math.PI / 4;
          const px = x + Math.cos(angle) * r;
          const py = y + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      });
      break;
    case 'BEAM':
      strokeWithGlow(ctx, color, () => {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.5, y + s * 0.5);
        ctx.lineTo(x + s * 0.5, y - s * 0.5);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.25, y + s * 0.75);
        ctx.lineTo(x + s * 0.75, y - s * 0.25);
        ctx.stroke();
      });
      break;
    case 'PULSING_ORB':
      strokeWithGlow(ctx, color, () => {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      });
      break;
    case 'CHAOS_LIGHTNING':
      strokeWithGlow(ctx, color, () => {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.5, y + s * 0.75);
        ctx.lineTo(x - s * 0.125, y + s * 0.125);
        ctx.lineTo(x - s * 0.375, y - s * 0.125);
        ctx.lineTo(x + s * 0.125, y - s * 0.75);
        ctx.lineTo(x + s * 0.375, y - s * 0.25);
        ctx.lineTo(x + s * 0.625, y - s * 0.625);
        ctx.stroke();
      });
      break;
    default:
      strokeWithGlow(ctx, color, () => {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.stroke();
      });
      break;
  }
}

function drawPathChevrons(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
  logicalSize: number,
): void {
  if (points.length < 2) return;

  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const minLength = logicalSize * 0.25;
  if (length < minLength) return;

  const angle = Math.atan2(dy, dx);
  const ux = dx / length;
  const uy = dy / length;
  const chevronSpacing = logicalSize * 0.2;
  const chevronSize = logicalSize * 0.08;
  const startDist = logicalSize * 0.15;
  const endMargin = logicalSize * 0.12;

  ctx.save();
  ctx.lineWidth = 1.5;

  for (let dist = startDist; dist < length - endMargin; dist += chevronSpacing) {
    const t = (dist - startDist) / Math.max(1, length - startDist - endMargin);
    const alpha = 0.3 + t * 0.55;
    const cx = start.x + ux * dist;
    const cy = start.y + uy * dist;
    ctx.strokeStyle = hexToRgba(color, alpha);
    ctx.beginPath();
    ctx.moveTo(
      cx - Math.cos(angle) * chevronSize * 0.3 - Math.sin(angle) * chevronSize * 0.5,
      cy - Math.sin(angle) * chevronSize * 0.3 + Math.cos(angle) * chevronSize * 0.5,
    );
    ctx.lineTo(cx, cy);
    ctx.lineTo(
      cx - Math.cos(angle) * chevronSize * 0.3 + Math.sin(angle) * chevronSize * 0.5,
      cy - Math.sin(angle) * chevronSize * 0.3 - Math.cos(angle) * chevronSize * 0.5,
    );
    ctx.stroke();
  }

  ctx.restore();
}

function drawIconTrajectoryNetwork(
  ctx: CanvasRenderingContext2D,
  ability: AbilitySchema,
  archetypeColor: string,
  payloadStyle: ProjectileStyle,
): boolean {
  const result = resolveIconTrajectoryPaths(ability, LOGICAL_SIZE, 8);
  if (result.paths.length === 0) return false;

  const markerSize = LOGICAL_SIZE * 0.1;
  const originRadius = Math.max(2, LOGICAL_SIZE * 0.04);
  const lineWidth = Math.max(1.5, LOGICAL_SIZE * 0.035);

  ctx.fillStyle = hexToRgba(archetypeColor, 0.6);
  ctx.beginPath();
  ctx.arc(result.origin.x, result.origin.y, originRadius, 0, Math.PI * 2);
  ctx.fill();

  for (const path of result.paths) {
    if (path.points.length < 2) continue;

    const start = path.points[0];
    const end = path.points[path.points.length - 1];
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, hexToRgba(archetypeColor, 0.15));
    gradient.addColorStop(0.7, hexToRgba(archetypeColor, 0.7));
    gradient.addColorStop(1, hexToRgba(archetypeColor, 1));

    ctx.strokeStyle = gradient;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = archetypeColor;
    ctx.shadowBlur = 4;

    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    if (path.isClosed) {
      ctx.closePath();
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (result.trajectoryType === 'LINEAR') {
      drawPathChevrons(ctx, path.points, archetypeColor, LOGICAL_SIZE);
    }
  }

  for (const endpoint of result.endpoints) {
    drawPayloadGlyph(ctx, endpoint.x, endpoint.y, payloadStyle, archetypeColor, markerSize);
  }

  return true;
}

function drawPayloadLayer(ctx: CanvasRenderingContext2D, icon: IconContext): void {
  const { projectileStyle, archetypeColor, terminus } = icon;
  const { x, y } = terminus;
  drawPayloadGlyph(ctx, x, y, projectileStyle, archetypeColor, LOGICAL_SIZE * 0.1);
}

function drawFrostAccents(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1;
    for (let t = 0.2; t <= 0.8; t += 0.2) {
      const px = 12 + (36 - 12) * t;
      const py = 36 - (36 - 12) * t;
      ctx.beginPath();
      ctx.moveTo(px - 2, py + 3);
      ctx.lineTo(px, py);
      ctx.lineTo(px + 2, py + 3);
      ctx.stroke();
    }
  });
}

function drawFireAccents(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1;
    for (const ox of [20, 26, 32]) {
      ctx.beginPath();
      ctx.moveTo(ox, 18);
      ctx.lineTo(ox + 2, 12);
      ctx.lineTo(ox + 4, 18);
      ctx.stroke();
    }
  });
}

function drawVoidAccents(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(24, 24, 4, 0, Math.PI * 2);
  ctx.fill();
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(24, 24, 6, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawKineticAccents(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    for (const t of [0.35, 0.55]) {
      const px = 12 + (36 - 12) * t;
      const py = 36 - (36 - 12) * t;
      ctx.beginPath();
      ctx.moveTo(px - 3, py + 1);
      ctx.lineTo(px, py - 2);
      ctx.lineTo(px + 3, py + 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 1, py + 1);
      ctx.lineTo(px + 4, py - 2);
      ctx.lineTo(px + 7, py + 1);
      ctx.stroke();
    }
  });
}

function drawCornerBrackets(ctx: CanvasRenderingContext2D, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1;
    const len = 4;
    const inset = 4;
    const corners = [
      [inset, inset + len, inset, inset, inset + len, inset],
      [LOGICAL_SIZE - inset - len, inset, LOGICAL_SIZE - inset, inset, LOGICAL_SIZE - inset, inset + len],
      [inset, LOGICAL_SIZE - inset - len, inset, LOGICAL_SIZE - inset, inset + len, LOGICAL_SIZE - inset],
      [LOGICAL_SIZE - inset, LOGICAL_SIZE - inset - len, LOGICAL_SIZE - inset, LOGICAL_SIZE - inset, LOGICAL_SIZE - inset - len, LOGICAL_SIZE - inset],
    ];
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.stroke();
    }
  });
}

function drawArchetypeAccents(ctx: CanvasRenderingContext2D, icon: IconContext): void {
  const { archetype, archetypeColor } = icon;
  switch (archetype) {
    case 'FROST':
      drawFrostAccents(ctx, archetypeColor);
      break;
    case 'FIRE':
      drawFireAccents(ctx, archetypeColor);
      break;
    case 'VOID':
      drawVoidAccents(ctx, archetypeColor);
      break;
    case 'KINETIC':
      drawKineticAccents(ctx, archetypeColor);
      break;
    default:
      drawCornerBrackets(ctx, archetypeColor);
      break;
  }
}

function drawSemanticGlyph(ctx: CanvasRenderingContext2D, ability: AbilitySchema): void {
  const icon = buildIconContext(ability);
  drawBackground(ctx);
  const drewNetwork = drawIconTrajectoryNetwork(
    ctx,
    ability,
    icon.archetypeColor,
    icon.projectileStyle,
  );
  if (!drewNetwork) {
    drawDeliveryLayer(ctx, icon);
    drawPayloadLayer(ctx, icon);
  }
  drawArchetypeAccents(ctx, icon);
}

function drawSimulationTrace(ctx: CanvasRenderingContext2D, ability: AbilitySchema): void {
  const archetype = ability.archetype ?? 'KINETIC';
  const color = getArchetypeColor(archetype, ability.visuals?.color);
  const payloadStyle = ability.visuals?.projectileStyle ?? 'DISC';

  drawBackground(ctx);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(LOGICAL_SIZE / 2 - 4, LOGICAL_SIZE / 2);
  ctx.lineTo(LOGICAL_SIZE / 2 + 4, LOGICAL_SIZE / 2);
  ctx.moveTo(LOGICAL_SIZE / 2, LOGICAL_SIZE / 2 - 4);
  ctx.lineTo(LOGICAL_SIZE / 2, LOGICAL_SIZE / 2 + 4);
  ctx.stroke();

  const drewNetwork = drawIconTrajectoryNetwork(ctx, ability, color, payloadStyle);
  if (!drewNetwork) {
    drawDeliveryLayer(ctx, buildIconContext(ability));
  }
}

export function generateSpellIcon(
  ability: AbilitySchema,
  sizePx = 48,
  forcedStyle?: IconRenderStyle,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = sizePx * dpr;
  canvas.height = sizePx * dpr;
  canvas.style.width = `${sizePx}px`;
  canvas.style.height = `${sizePx}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  const scale = sizePx / LOGICAL_SIZE;
  ctx.scale(dpr * scale, dpr * scale);

  const style = forcedStyle ?? getIconRenderStyle();
  if (style === 'SIMULATION_TRACE') {
    drawSimulationTrace(ctx, ability);
  } else {
    drawSemanticGlyph(ctx, ability);
  }

  return canvas;
}
