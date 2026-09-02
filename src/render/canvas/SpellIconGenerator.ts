import type {
  AbilitySchema,
  ActionPayload,
  ProjectileStyle,
  SpellArchetype,
  TrajectoryConfig,
  TriggerNode,
} from '../../types/schema';
import { getIconRenderStyle, type IconRenderStyle } from '../gl/retroVfxConfig';
import { sampleAbilityTrajectory, type TrajectoryTrace } from './trajectoryTracer';

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

function drawShuriken(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    const r = 6;
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
}

function drawBeamRails(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 4);
    ctx.lineTo(x + 4, y - 4);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 6);
    ctx.lineTo(x + 6, y - 2);
    ctx.stroke();
  });
}

function drawPulsingOrb(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawChaosLightning(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 6);
    ctx.lineTo(x - 1, y + 1);
    ctx.lineTo(x - 3, y - 1);
    ctx.lineTo(x + 1, y - 6);
    ctx.lineTo(x + 3, y - 2);
    ctx.lineTo(x + 5, y - 5);
    ctx.stroke();
  });
}

function drawDiscDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  strokeWithGlow(ctx, color, () => {
    ctx.lineWidth = 1.5;
    const r = 5;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.stroke();
  });
}

function drawPayloadLayer(ctx: CanvasRenderingContext2D, icon: IconContext): void {
  const { projectileStyle, archetypeColor, terminus } = icon;
  const { x, y } = terminus;

  switch (projectileStyle) {
    case 'SHURIKEN':
      drawShuriken(ctx, x, y, archetypeColor);
      break;
    case 'BEAM':
      drawBeamRails(ctx, x, y, archetypeColor);
      break;
    case 'PULSING_ORB':
      drawPulsingOrb(ctx, x, y, archetypeColor);
      break;
    case 'CHAOS_LIGHTNING':
      drawChaosLightning(ctx, x, y, archetypeColor);
      break;
    default:
      drawDiscDiamond(ctx, x, y, archetypeColor);
      break;
  }
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
  drawDeliveryLayer(ctx, icon);
  drawPayloadLayer(ctx, icon);
  drawArchetypeAccents(ctx, icon);
}

interface NormalizedTrace {
  segments: Array<Array<{ x: number; y: number }>>;
  fields: Array<{ x: number; y: number; radius: number; fieldType: string }>;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  hasReturn: boolean;
}

function normalizeTrace(trace: TrajectoryTrace, logicalSize: number, padding: number): NormalizedTrace {
  const flipY = (p: { x: number; y: number }) => ({ x: p.x, y: -p.y });

  const rawSegments: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const p of trace.points) {
    if (Number.isNaN(p.x)) {
      if (current.length > 0) {
        rawSegments.push(current);
        current = [];
      }
      continue;
    }
    current.push(flipY(p));
  }
  if (current.length > 0) rawSegments.push(current);

  const allPoints = rawSegments.flat();
  const allFields = trace.fields.map((f) => ({ ...flipY(f), radius: f.radius, fieldType: f.fieldType }));

  if (allPoints.length === 0) {
    const center = logicalSize / 2;
    return {
      segments: [[{ x: center, y: center }]],
      fields: allFields.map((f) => ({ ...f, x: center, y: center, radius: f.radius * 0.05 })),
      startPoint: { x: center, y: center },
      endPoint: { x: center, y: center },
      hasReturn: trace.hasReturn,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of allPoints) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (const f of allFields) {
    minX = Math.min(minX, f.x - f.radius);
    minY = Math.min(minY, f.y - f.radius);
    maxX = Math.max(maxX, f.x + f.radius);
    maxY = Math.max(maxY, f.y + f.radius);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const avail = logicalSize - padding * 2;
  const scale = Math.min(avail / bw, avail / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const center = logicalSize / 2;

  const mapPoint = (p: { x: number; y: number }) => ({
    x: center + (p.x - cx) * scale,
    y: center + (p.y - cy) * scale,
  });

  const segments = rawSegments.map((seg) => seg.map(mapPoint));

  return {
    segments,
    fields: allFields.map((f) => ({
      ...mapPoint(f),
      radius: f.radius * scale,
      fieldType: f.fieldType,
    })),
    startPoint: mapPoint(flipY(trace.startPoint)),
    endPoint: mapPoint(flipY(trace.endPoint)),
    hasReturn: trace.hasReturn,
  };
}

function drawSimulationTrace(ctx: CanvasRenderingContext2D, ability: AbilitySchema): void {
  const archetype = ability.archetype ?? 'KINETIC';
  const archetypeColor = getArchetypeColor(archetype, ability.visuals?.color);
  const trace = sampleAbilityTrajectory(ability);
  const normalized = normalizeTrace(trace, LOGICAL_SIZE, 6);

  drawBackground(ctx);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(LOGICAL_SIZE / 2 - 4, LOGICAL_SIZE / 2);
  ctx.lineTo(LOGICAL_SIZE / 2 + 4, LOGICAL_SIZE / 2);
  ctx.moveTo(LOGICAL_SIZE / 2, LOGICAL_SIZE / 2 - 4);
  ctx.lineTo(LOGICAL_SIZE / 2, LOGICAL_SIZE / 2 + 4);
  ctx.stroke();

  for (const field of normalized.fields) {
    ctx.strokeStyle = archetypeColor;
    ctx.shadowColor = archetypeColor;
    ctx.shadowBlur = 4;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(field.x, field.y, Math.max(3, field.radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }

  ctx.strokeStyle = archetypeColor;
  ctx.shadowColor = archetypeColor;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const segment of normalized.segments) {
    if (segment.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(segment[0].x, segment[0].y);
    for (let j = 1; j < segment.length; j++) {
      ctx.lineTo(segment[j].x, segment[j].y);
    }
    ctx.stroke();

    if (normalized.hasReturn && segment.length >= 4) {
      const returnStart = Math.floor(segment.length * 0.55);
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(segment[returnStart].x, segment[returnStart].y);
      for (let j = returnStart + 1; j < segment.length; j++) {
        ctx.lineTo(segment[j].x, segment[j].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
    }
  }

  ctx.shadowBlur = 0;

  const { startPoint, endPoint } = normalized;

  ctx.fillStyle = archetypeColor;
  ctx.shadowColor = archetypeColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(startPoint.x, startPoint.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  const r = 4;
  ctx.strokeStyle = archetypeColor;
  ctx.shadowColor = archetypeColor;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(endPoint.x, endPoint.y - r);
  ctx.lineTo(endPoint.x + r, endPoint.y);
  ctx.lineTo(endPoint.x, endPoint.y + r);
  ctx.lineTo(endPoint.x - r, endPoint.y);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
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
