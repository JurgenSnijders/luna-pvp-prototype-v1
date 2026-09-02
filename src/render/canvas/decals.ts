import { areGroundDecalsEnabled } from '../../devtools/graphicsSettings';
import type { SpellArchetype } from '../../types/schema';

export type DecalType = 'SCORCH' | 'FROST_CRACK' | 'VOID_STAIN' | 'KINETIC_CRATER';

export interface DecalInstance {
  x: number;
  y: number;
  radius: number;
  type: DecalType;
  color: string;
  rotation: number;
  createdAt: number;
  durationMs: number;
  active: boolean;
}

const MAX_DECALS = 128;

const DEFAULT_DURATIONS: Record<DecalType, number> = {
  SCORCH: 10000,
  FROST_CRACK: 10000,
  VOID_STAIN: 14000,
  KINETIC_CRATER: 9000,
};

export function mapArchetypeToDecal(archetype: SpellArchetype | undefined): DecalType {
  switch (archetype) {
    case 'FIRE':
    case 'PLASMA':
      return 'SCORCH';
    case 'FROST':
      return 'FROST_CRACK';
    case 'VOID':
    case 'GRAVITY':
    case 'PHASE':
    case 'MAGNETIC':
      return 'VOID_STAIN';
    default:
      return 'KINETIC_CRATER';
  }
}

function hashSeed(x: number, y: number, i: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + i * 43.17) * 43758.5453;
  return n - Math.floor(n);
}

function drawScorch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(10, 5, 5, ${alpha * 0.7})`;
  ctx.fill();

  const crackCount = 6 + Math.floor(hashSeed(x, y, 1) * 3);
  ctx.strokeStyle = `rgba(30, 15, 10, ${alpha * 0.55})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < crackCount; i++) {
    const angle = (Math.PI * 2 * i) / crackCount + hashSeed(x, y, i + 2) * 0.4;
    const len = radius * (0.5 + hashSeed(x, y, i + 10) * 0.45);
    const jag = radius * 0.12 * (hashSeed(x, y, i + 20) - 0.5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
    ctx.lineTo(
      Math.cos(angle) * len + Math.cos(angle + 0.5) * jag,
      Math.sin(angle) * len + Math.sin(angle + 0.5) * jag,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawFrostCrack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  alpha: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = color.startsWith('#') ? color : '#00e5ff';
  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = 1.2;

  const branches = 4 + Math.floor(hashSeed(x, y, 3) * 3);
  for (let i = 0; i < branches; i++) {
    const angle = (Math.PI * 2 * i) / branches;
    const len = radius * (0.55 + hashSeed(x, y, i + 5) * 0.35);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
    const subAngle = angle + (hashSeed(x, y, i + 15) - 0.5) * 0.8;
    const subLen = len * 0.45;
    ctx.lineTo(
      Math.cos(angle) * len * 0.55 + Math.cos(subAngle) * subLen,
      Math.sin(angle) * len * 0.55 + Math.sin(subAngle) * subLen,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawVoidStain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(40, 10, 60, ${alpha * 0.5})`;
  ctx.fill();

  ctx.strokeStyle = `rgba(120, 40, 180, ${alpha * 0.45})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.65, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(80, 20, 120, ${alpha * 0.3})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6 + rotation * 0.3;
    ctx.beginPath();
    ctx.arc(
      Math.cos(angle) * radius * 0.35,
      Math.sin(angle) * radius * 0.35,
      radius * 0.08,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawKineticCrater(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.strokeStyle = `rgba(60, 65, 80, ${alpha * 0.5})`;
  ctx.lineWidth = 1.5;
  for (const scale of [0.35, 0.55, 0.75]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  const notches = 8;
  ctx.fillStyle = `rgba(20, 22, 30, ${alpha * 0.55})`;
  for (let i = 0; i < notches; i++) {
    const angle = (Math.PI * 2 * i) / notches;
    const nx = Math.cos(angle) * radius * 0.6;
    const ny = Math.sin(angle) * radius * 0.6;
    const disp = radius * 0.08;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx + Math.cos(angle) * disp, ny + Math.sin(angle) * disp);
    ctx.lineTo(nx + Math.cos(angle + 0.15) * disp * 0.5, ny + Math.sin(angle + 0.15) * disp * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

class DecalManager {
  private decals: DecalInstance[] = Array.from({ length: MAX_DECALS }, () => ({
    x: 0,
    y: 0,
    radius: 0,
    type: 'SCORCH' as DecalType,
    color: '#ff4400',
    rotation: 0,
    createdAt: 0,
    durationMs: 0,
    active: false,
  }));
  private writeIndex = 0;

  addDecal(
    x: number,
    y: number,
    radius: number,
    type: DecalType,
    color = '#ff4400',
    durationMs?: number,
  ): void {
    if (!areGroundDecalsEnabled()) return;

    const decal = this.decals[this.writeIndex];
    decal.x = x;
    decal.y = y;
    decal.radius = radius;
    decal.type = type;
    decal.color = color;
    decal.rotation = Math.random() * Math.PI * 2;
    decal.createdAt = performance.now();
    decal.durationMs = durationMs ?? DEFAULT_DURATIONS[type];
    decal.active = true;

    this.writeIndex = (this.writeIndex + 1) % MAX_DECALS;
  }

  render(ctx: CanvasRenderingContext2D, now: number): void {
    if (!areGroundDecalsEnabled()) return;

    for (const decal of this.decals) {
      if (!decal.active) continue;
      const progress = (now - decal.createdAt) / decal.durationMs;
      if (progress >= 1) {
        decal.active = false;
        continue;
      }
      const alpha = 1 - progress;
      switch (decal.type) {
        case 'SCORCH':
          drawScorch(ctx, decal.x, decal.y, decal.radius, decal.rotation, alpha);
          break;
        case 'FROST_CRACK':
          drawFrostCrack(ctx, decal.x, decal.y, decal.radius, decal.rotation, alpha, decal.color);
          break;
        case 'VOID_STAIN':
          drawVoidStain(ctx, decal.x, decal.y, decal.radius, decal.rotation, alpha);
          break;
        case 'KINETIC_CRATER':
          drawKineticCrater(ctx, decal.x, decal.y, decal.radius, decal.rotation, alpha);
          break;
      }
    }
  }

  clear(): void {
    for (const decal of this.decals) {
      decal.active = false;
    }
    this.writeIndex = 0;
  }
}

export const decalManager = new DecalManager();
