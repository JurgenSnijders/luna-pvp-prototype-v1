import { TELEGRAPH_COLORS } from './colors';
import { drawDeployableFrame, muteDeployableBody } from './deployables';
import type {
  IconMark,
  IconRng,
  SpellIconColors,
  SpellIconModifiers,
  SpellIconSpec,
} from './spellIconAnalysis';
import type { EmitterConfig, ProjectileStyle, TrajectoryType } from '../../types/schema';
import {
  spreadAnglesForCastShot,
  type CollectedCastProjectile,
} from './trajectoryTracer';

const CX = 24;
const CY = 24;
const TILT = (15 * Math.PI) / 180;

const NEUTRAL = `rgba(${TELEGRAPH_COLORS.NEUTRAL.r}, ${TELEGRAPH_COLORS.NEUTRAL.g}, ${TELEGRAPH_COLORS.NEUTRAL.b}, 0.55)`;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function glowStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  draw: () => void,
): void {
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 0;
  draw();
  ctx.shadowBlur = 0;
}

const FLIGHT_ORIGIN = { x: 12, y: 36 };
const FLIGHT_TARGET = { x: 36, y: 12 };

function scaleOrbitIconRadius(
  orbitRadius: number,
  orbitShots: CollectedCastProjectile[],
): number {
  if (orbitShots.length <= 1) return 14;
  const maxR = Math.max(...orbitShots.map((s) => s.trajectory.orbitRadius ?? 100));
  return ((orbitRadius ?? 100) / maxR) * 18;
}

function drawCasterCore(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(CX, CY, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.85);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawSolidOrbBead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  radius = 4,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.9);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawSpearhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  color: string,
  length = 8,
): void {
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const px = -uy;
  const py = ux;
  const tipX = x + ux * length * 0.5;
  const tipY = y + uy * length * 0.5;
  const baseX = x - ux * length * 0.35;
  const baseY = y - uy * length * 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * length * 0.28, baseY + py * length * 0.28);
  ctx.lineTo(baseX - px * length * 0.28, baseY - py * length * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexToRgba(color, 0.9);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawRuneSigilGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  heading: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  const sq = 5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.strokeRect(-sq, -sq, sq * 2, sq * 2);
  ctx.beginPath();
  ctx.moveTo(0, -sq);
  ctx.lineTo(sq, 0);
  ctx.lineTo(0, sq);
  ctx.lineTo(-sq, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawFlightEndpointGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: ProjectileStyle,
  color: string,
  heading: number,
): void {
  switch (style) {
    case 'PULSING_ORB':
      drawSolidOrbBead(ctx, x, y, color, 4);
      break;
    case 'RUNE_SIGIL':
      drawRuneSigilGlyph(ctx, x, y, color, heading);
      break;
    case 'PLASMA_TENDRIL':
      drawSpearhead(ctx, x, y, heading, color);
      break;
    default:
      drawPayloadGlyph(ctx, x, y, style, color, 10, false, heading);
      break;
  }
}

function traceOpenFlightPath(
  ctx: CanvasRenderingContext2D,
  trajectoryType: TrajectoryType,
  origin: { x: number; y: number },
  target: { x: number; y: number },
): number {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const heading = Math.atan2(dy, dx);
  const mx = (origin.x + target.x) / 2;
  const my = (origin.y + target.y) / 2;
  const px = -Math.sin(heading);
  const py = Math.cos(heading);

  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  switch (trajectoryType) {
    case 'HOMING_SLERP':
      ctx.quadraticCurveTo(mx + px * 10, my + py * 10, target.x, target.y);
      break;
    case 'BALLISTIC_ARC':
      ctx.quadraticCurveTo(mx, my - 14, target.x, target.y);
      break;
    default:
      ctx.lineTo(target.x, target.y);
      break;
  }
  ctx.stroke();
  return heading;
}

function spreadEmitterAngles(emitter: EmitterConfig, baseAngle: number): number[] {
  const count = Math.max(1, Math.min(12, emitter.count));
  const spreadRad = (emitter.spreadDeg * Math.PI) / 180;
  const aimOffsetRad = ((emitter.aimOffsetDeg ?? 0) * Math.PI) / 180;
  const adjustedBase = baseAngle + aimOffsetRad;
  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    let theta: number;
    switch (emitter.distribution) {
      case 'RADIAL':
        theta = adjustedBase + (i * (Math.PI * 2)) / count;
        break;
      case 'RANDOM_CONE':
        theta =
          count === 1
            ? adjustedBase
            : adjustedBase + (i - (count - 1) / 2) * (spreadRad / Math.max(1, count - 1));
        break;
      case 'PARALLEL':
        theta = adjustedBase;
        break;
      case 'FAN':
      default:
        if (count === 1) {
          theta = adjustedBase;
        } else {
          theta = adjustedBase - spreadRad / 2 + i * (spreadRad / (count - 1));
        }
        break;
    }
    angles.push(theta);
  }
  return angles;
}

function drawSchemaOrbits(
  ctx: CanvasRenderingContext2D,
  orbitShots: CollectedCastProjectile[],
  style: ProjectileStyle,
  colors: SpellIconColors,
): void {
  drawCasterCore(ctx, colors.primary);
  for (const shot of orbitShots) {
    const radius = scaleOrbitIconRadius(shot.trajectory.orbitRadius ?? 100, orbitShots);
    ctx.strokeStyle = hexToRgba(colors.primary, 0.75);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(CX, CY, radius, 0, Math.PI * 2);
    ctx.stroke();

    const angles = spreadAnglesForCastShot(shot);
    for (const angle of angles) {
      const bx = CX + Math.cos(angle) * radius;
      const by = CY + Math.sin(angle) * radius;
      if (style === 'PULSING_ORB') {
        drawSolidOrbBead(ctx, bx, by, colors.primary, 4);
      } else {
        drawPayloadGlyph(ctx, bx, by, style, colors.primary, 8, false, angle + Math.PI / 2);
      }
    }
  }
}

function drawSchemaOpenShots(
  ctx: CanvasRenderingContext2D,
  openShots: CollectedCastProjectile[],
  style: ProjectileStyle,
  colors: SpellIconColors,
): void {
  const baseDx = FLIGHT_TARGET.x - FLIGHT_ORIGIN.x;
  const baseDy = FLIGHT_TARGET.y - FLIGHT_ORIGIN.y;
  const baseAngle = Math.atan2(baseDy, baseDx);
  const baseLen = Math.hypot(baseDx, baseDy);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const shot of openShots) {
    const emitter: EmitterConfig = { ...shot.emitter, aimOffsetDeg: shot.aimOffsetDeg };
    const emitterAngles = spreadEmitterAngles(emitter, baseAngle);
    for (const theta of emitterAngles) {
      const origin = FLIGHT_ORIGIN;
      const target = {
        x: origin.x + Math.cos(theta) * baseLen,
        y: origin.y + Math.sin(theta) * baseLen,
      };

      ctx.strokeStyle = hexToRgba(colors.primary, 0.8);
      ctx.lineWidth = 2;
      const heading = traceOpenFlightPath(ctx, shot.trajectory.type, origin, target);
      drawFlightEndpointGlyph(ctx, target.x, target.y, style, colors.primary, heading);
    }
  }
}

/** Schema-faithful cast flight art. Returns true when cast shots were drawn. */
export function drawSchemaFlight(
  ctx: CanvasRenderingContext2D,
  spec: SpellIconSpec,
): boolean {
  if (spec.castShots.length === 0) return false;

  const orbitShots = spec.castShots.filter((s) => s.trajectory.type === 'ORBIT_ANCHOR');
  const openShots = spec.castShots.filter((s) => s.trajectory.type !== 'ORBIT_ANCHOR');

  ctx.save();
  if (orbitShots.length > 0) {
    drawSchemaOrbits(ctx, orbitShots, spec.style, spec.colors);
  }
  if (openShots.length > 0) {
    drawSchemaOpenShots(ctx, openShots, spec.style, spec.colors);
  }
  ctx.restore();
  return true;
}

export function drawPayloadGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: ProjectileStyle,
  color: string,
  markerSize: number,
  withGlow = true,
  heading = 0,
): void {
  const r = markerSize * 0.5;
  const s = markerSize * 0.8;
  const stroke = (draw: () => void) => {
    if (withGlow) glowStroke(ctx, color, draw);
    else {
      ctx.strokeStyle = color;
      draw();
    }
  };

  switch (style) {
    case 'SHURIKEN':
      stroke(() => {
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
      stroke(() => {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.5, y + s * 0.5);
        ctx.lineTo(x + s * 0.5, y - s * 0.5);
        ctx.stroke();
      });
      break;
    case 'PULSING_ORB':
      drawSolidOrbBead(ctx, x, y, color, Math.max(4, r * 0.85));
      break;
    case 'CHAOS_LIGHTNING':
      stroke(() => {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.5, y + s * 0.6);
        ctx.lineTo(x - s * 0.1, y + s * 0.05);
        ctx.lineTo(x - s * 0.3, y - s * 0.15);
        ctx.lineTo(x + s * 0.15, y - s * 0.6);
        ctx.stroke();
      });
      break;
    case 'PRISM':
      stroke(() => {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.85, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r * 0.85, y);
        ctx.closePath();
        ctx.stroke();
      });
      break;
    case 'RUNE_SIGIL':
      drawRuneSigilGlyph(ctx, x, y, color, heading);
      break;
    case 'VOID_RIFT':
      stroke(() => {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.35, r * 0.85, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      break;
    case 'CRYSTAL_SHARD':
      stroke(() => {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + r * 0.9, y - r * 0.9);
        ctx.lineTo(x - r * 0.4, y + r * 0.3);
        ctx.lineTo(x - r * 0.15, y - r * 0.5);
        ctx.closePath();
        ctx.stroke();
      });
      break;
    case 'PLASMA_TENDRIL':
      drawSpearhead(ctx, x, y, heading, color, s);
      break;
    default:
      stroke(() => {
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
      break;
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, mark: Extract<IconMark, { kind: 'OBSTACLE' }>, colors: SpellIconColors, tilt: number): void {
  const body = muteDeployableBody(colors.primary, 0.55);
  if (mark.shape === 'CIRCLE') {
    drawDeployableFrame(ctx, {
      x: CX,
      y: CY,
      shape: { kind: 'CIRCLE', radius: 12 },
      rim: TELEGRAPH_COLORS.FRIENDLY,
      body,
      hitFlash: 0,
      spawnT: 1,
      fade: 1,
    });
    return;
  }
  const aspect = Math.max(0.35, Math.min(4, mark.aspect));
  const halfW = 16;
  const halfH = Math.max(4, halfW / aspect);
  drawDeployableFrame(ctx, {
    x: CX,
    y: CY,
    shape: { kind: 'BOX', halfW, halfH, angle: tilt },
    rim: TELEGRAPH_COLORS.FRIENDLY,
    body,
    hitFlash: 0,
    spawnT: 1,
    fade: 1,
  });
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  mark: Extract<IconMark, { kind: 'ACTOR' }>,
  colors: SpellIconColors,
  tilt: number,
): void {
  const body = muteDeployableBody(colors.primary, 0.55);
  if (mark.actor === 'TURRET') {
    drawDeployableFrame(ctx, {
      x: CX,
      y: CY,
      shape: { kind: 'BOX', halfW: 9, halfH: 9, angle: tilt },
      rim: TELEGRAPH_COLORS.FRIENDLY,
      body,
      hitFlash: 0,
      spawnT: 1,
      fade: 1,
    });
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(tilt);
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.restore();
    return;
  }
  drawDeployableFrame(ctx, {
    x: CX,
    y: CY,
    shape: { kind: 'CIRCLE', radius: 11 },
    rim: TELEGRAPH_COLORS.FRIENDLY,
    body,
    hitFlash: 0,
    spawnT: 1,
    fade: 1,
  });
}

function drawField(
  ctx: CanvasRenderingContext2D,
  mark: Extract<IconMark, { kind: 'FIELD' }>,
  colors: SpellIconColors,
): void {
  const radius = 14;
  const wedge = mark.arcDeg < 360;
  const half = ((mark.arcDeg * Math.PI) / 180) / 2;
  const aim = -Math.PI / 2;
  ctx.beginPath();
  if (wedge) {
    ctx.moveTo(CX, CY);
    ctx.arc(CX, CY, radius, aim - half, aim + half);
    ctx.closePath();
  } else {
    ctx.arc(CX, CY, radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = hexToRgba(colors.primary, 0.18);
  ctx.fill();
  glowStroke(ctx, colors.primary, () => {
    ctx.lineWidth = 1.75;
    ctx.stroke();
  });

  ctx.strokeStyle = colors.secondary;
  ctx.lineWidth = 1.25;
  if (mark.fieldType === 'VORTEX_TANGENT') {
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const t = i / 18;
      const a = t * Math.PI * 3;
      const rad = 3 + t * 9;
      const x = CX + Math.cos(a) * rad;
      const y = CY + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }
  if (mark.fieldType === 'FRICTION_OVERRIDE') {
    ctx.beginPath();
    ctx.moveTo(CX - 8, CY - 2);
    ctx.lineTo(CX - 3, CY + 2);
    ctx.lineTo(CX + 1, CY - 3);
    ctx.lineTo(CX + 8, CY + 2);
    ctx.moveTo(CX - 7, CY + 6);
    ctx.lineTo(CX + 6, CY + 5);
    ctx.stroke();
    return;
  }
  const inward = mark.fieldType === 'MASS_ATTRACTOR';
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 * i) / 4 + Math.PI / 4;
    const outer = inward ? 11 : 5;
    const inner = inward ? 5 : 11;
    const x0 = CX + Math.cos(a) * outer;
    const y0 = CY + Math.sin(a) * outer;
    const x1 = CX + Math.cos(a) * inner;
    const y1 = CY + Math.sin(a) * inner;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

function drawParry(ctx: CanvasRenderingContext2D, arcDeg: number, colors: SpellIconColors): void {
  const radius = 14;
  const arc = Math.min(Math.PI * 2, (arcDeg * Math.PI) / 180);
  const aim = -Math.PI / 2;
  glowStroke(ctx, colors.primary, () => {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY + 4, radius, aim - arc / 2, aim + arc / 2);
    ctx.stroke();
  });
  ctx.fillStyle = colors.secondary;
  ctx.beginPath();
  ctx.arc(CX, CY + 4, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBlink(ctx: CanvasRenderingContext2D, colors: SpellIconColors): void {
  ctx.fillStyle = hexToRgba(colors.primary, 0.85);
  ctx.beginPath();
  ctx.arc(15, 30, 3, 0, Math.PI * 2);
  ctx.fill();
  glowStroke(ctx, colors.primary, () => {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(34, 12);
    ctx.lineTo(39, 18);
    ctx.lineTo(34, 24);
    ctx.lineTo(29, 18);
    ctx.closePath();
    ctx.stroke();
  });
  ctx.strokeStyle = colors.secondary;
  ctx.lineWidth = 1.25;
  for (const [dx, dy] of [[0, -6], [5, -2], [-5, -2]] as const) {
    ctx.beginPath();
    ctx.moveTo(34, 18);
    ctx.lineTo(34 + dx, 12 + dy);
    ctx.stroke();
  }
}

function drawOrbit(
  ctx: CanvasRenderingContext2D,
  style: ProjectileStyle,
  colors: SpellIconColors,
  _rng: IconRng,
  orbitShots: CollectedCastProjectile[],
): void {
  if (orbitShots.length > 0) {
    drawSchemaOrbits(ctx, orbitShots, style, colors);
    return;
  }
  ctx.strokeStyle = hexToRgba(colors.primary, 0.75);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(CX, CY, 14, 0, Math.PI * 2);
  ctx.stroke();
  drawCasterCore(ctx, colors.primary);
  drawSolidOrbBead(ctx, CX + 14, CY, colors.primary, 4);
}

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  style: ProjectileStyle,
  colors: SpellIconColors,
  modifiers: SpellIconModifiers,
  trajectoryType: TrajectoryType = 'LINEAR',
): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = hexToRgba(colors.primary, 0.8);
  ctx.lineWidth = 2;
  const heading = traceOpenFlightPath(ctx, trajectoryType, FLIGHT_ORIGIN, FLIGHT_TARGET);
  drawFlightEndpointGlyph(ctx, FLIGHT_TARGET.x, FLIGHT_TARGET.y, style, colors.primary, heading);

  if (modifiers.pierce) {
    const ux = Math.cos(heading);
    const uy = Math.sin(heading);
    ctx.strokeStyle = hexToRgba(colors.secondary, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(FLIGHT_TARGET.x - ux * 8, FLIGHT_TARGET.y - uy * 8);
    ctx.lineTo(FLIGHT_TARGET.x + ux * 8, FLIGHT_TARGET.y + uy * 8);
    ctx.stroke();
  }
}

function drawTerrain(ctx: CanvasRenderingContext2D, colors: SpellIconColors): void {
  ctx.beginPath();
  ctx.ellipse(CX, CY + 2, 15, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = muteDeployableBody(colors.primary, 0.62);
  ctx.fill();
  glowStroke(ctx, colors.primary, () => {
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.strokeStyle = hexToRgba(colors.secondary, 0.7);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX - 9, CY + 1);
  ctx.lineTo(CX + 9, CY + 1);
  ctx.moveTo(CX - 6, CY + 5);
  ctx.lineTo(CX + 6, CY + 5);
  ctx.stroke();
}

function drawUtility(
  ctx: CanvasRenderingContext2D,
  utility: Extract<IconMark, { kind: 'UTILITY' }>['utility'],
  colors: SpellIconColors,
): void {
  glowStroke(ctx, colors.primary, () => {
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    if (utility === 'STASIS') {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        const x = CX + Math.cos(a) * 11;
        const y = CY + Math.sin(a) * 11;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (utility === 'STEALTH') {
      ctx.ellipse(CX, CY, 12, 7, 0, 0, Math.PI * 2);
      ctx.moveTo(CX - 4, CY);
      ctx.arc(CX, CY, 2.5, 0, Math.PI * 2);
    } else if (utility === 'MORPH') {
      ctx.arc(CX - 4, CY, 8, 0, Math.PI * 2);
      ctx.moveTo(CX + 12, CY);
      ctx.arc(CX + 4, CY, 8, 0, Math.PI * 2);
    } else {
      ctx.moveTo(CX, CY - 11);
      ctx.lineTo(CX + 8, CY + 7);
      ctx.lineTo(CX - 8, CY + 7);
      ctx.closePath();
    }
    ctx.stroke();
  });
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  mark: IconMark,
  colors: SpellIconColors,
  modifiers: SpellIconModifiers,
  style: ProjectileStyle,
  tilt: number,
  rng: IconRng,
  castShots: CollectedCastProjectile[] = [],
  trajectoryType?: TrajectoryType,
): void {
  ctx.save();
  if (mark.kind !== 'OBSTACLE' && mark.kind !== 'ACTOR') {
    ctx.translate(CX, CY);
    ctx.rotate(tilt);
    ctx.translate(-CX, -CY);
  }
  switch (mark.kind) {
    case 'OBSTACLE':
      drawObstacle(ctx, mark, colors, tilt);
      break;
    case 'ACTOR':
      drawActor(ctx, mark, colors, tilt);
      break;
    case 'FIELD':
      drawField(ctx, mark, colors);
      break;
    case 'PARRY':
      drawParry(ctx, mark.arcDeg, colors);
      break;
    case 'BLINK':
      drawBlink(ctx, colors);
      break;
    case 'ORBIT':
      drawOrbit(
        ctx,
        style,
        colors,
        rng,
        castShots.filter((s) => s.trajectory.type === 'ORBIT_ANCHOR'),
      );
      break;
    case 'PROJECTILE':
      drawProjectile(ctx, mark.style, colors, modifiers, trajectoryType ?? 'LINEAR');
      break;
    case 'TERRAIN':
      drawTerrain(ctx, colors);
      break;
    case 'UTILITY':
      drawUtility(ctx, mark.utility, colors);
      break;
  }
  ctx.restore();
}

export function drawPrimaryMark(
  ctx: CanvasRenderingContext2D,
  spec: SpellIconSpec,
  rng: IconRng,
): void {
  const tilt = (rng() * 2 - 1) * TILT;
  drawMark(
    ctx,
    spec.primary,
    spec.colors,
    spec.modifiers,
    spec.style,
    tilt,
    rng,
    spec.castShots,
    spec.castShots[0]?.trajectory.type ?? spec.path,
  );
}

function drawPathHint(ctx: CanvasRenderingContext2D, path: TrajectoryType): void {
  ctx.strokeStyle = NEUTRAL;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (path) {
    case 'HOMING_SLERP':
      ctx.moveTo(34, 42);
      ctx.quadraticCurveTo(40, 34, 44, 36);
      break;
    case 'RETURN_TO_SOURCE':
      ctx.ellipse(39, 38, 5, 3.5, 0, 0.4, Math.PI * 1.7);
      break;
    case 'BALLISTIC_ARC':
      ctx.moveTo(33, 42);
      ctx.quadraticCurveTo(39, 32, 45, 41);
      break;
    case 'DRAWN_PATH':
      ctx.moveTo(33, 40);
      ctx.lineTo(37, 36);
      ctx.lineTo(40, 40);
      ctx.lineTo(45, 34);
      break;
    default:
      ctx.moveTo(33, 42);
      ctx.lineTo(45, 34);
      break;
  }
  ctx.stroke();
}

/** Travel hint, or a small copy of the secondary mechanic when the spell does not travel. */
export function drawCornerHint(ctx: CanvasRenderingContext2D, spec: SpellIconSpec): void {
  if (spec.castShots.length > 0) return;
  ctx.save();
  ctx.globalAlpha *= 0.7;
  if (spec.path) {
    drawPathHint(ctx, spec.path);
  } else if (spec.secondary) {
    ctx.translate(39, 39);
    ctx.scale(0.28, 0.28);
    ctx.translate(-CX, -CY);
    drawMark(
      ctx,
      spec.secondary,
      spec.colors,
      { count: 1, pierce: false, bounce: false, child: false },
      spec.style,
      0,
      () => 0.5,
    );
  }
  ctx.restore();
}
