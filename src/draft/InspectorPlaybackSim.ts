import { PhysicsWorld } from '../engine/PhysicsWorld';
import { Z_TO_SCREEN } from '../engine/verticalConstants';
import { Dummy } from '../entities/Dummy';
import { Player } from '../entities/Player';
import { Vector2D } from '../math/Vector2D';
import { applyField } from '../primitives/Fields';
import { Interpreter } from '../primitives/Interpreter';
import { HEADLESS_LIFECYCLE_FX } from '../primitives/interpreter/lifecycle';
import { FIELD_COLORS } from '../render/canvas/colors';
import { resolveRootTrajectory } from '../render/canvas/trajectoryTracer';
import { CombatLogger } from '../telemetry/CombatLogger';
import type { AbilitySchema, ProjectileStyle } from '../types/schema';

export interface ProjectileFrameData {
  x: number;
  y: number;
  z: number;
  radius: number;
  style: ProjectileStyle;
  color: string;
  heading: number;
}

export interface ZoneFrameData {
  x: number;
  y: number;
  radius: number;
  color: string;
  fieldType: string;
}

export interface ImpactFrameData {
  x: number;
  y: number;
  radius: number;
  color: string;
  age: number;
}

export interface PlaybackFrame {
  projectiles: ProjectileFrameData[];
  zones: ZoneFrameData[];
  impacts: ImpactFrameData[];
}

export interface PlaybackRecording {
  frames: PlaybackFrame[];
  originCanvasPos: { x: number; y: number };
  targetCanvasPos: { x: number; y: number };
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  totalDurationMs: number;
}

const SIM_DT = 1 / 60;
const MAX_FRAMES = 150;
const IMPACT_LIFETIME_FRAMES = 12;
const EARLY_EXIT_TAIL_FRAMES = 8;
const SANDBOX_HEX_RADIUS = 2000;

const recordingCache = new Map<string, PlaybackRecording>();

interface ActiveImpact {
  x: number;
  y: number;
  radius: number;
  color: string;
  age: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function applySandboxFields(world: PhysicsWorld, dt: number): void {
  const combatants = world.getCombatants();
  for (const entity of combatants) {
    entity.linearDrag = entity.baseLinearDrag;
  }
  for (const zone of world.zones) {
    if (zone.isDead) continue;
    for (const entity of combatants) {
      if (entity.isDead) continue;
      applyField(zone, entity, dt, world);
    }
  }
}

function resolveAimConfig(spell: AbilitySchema): { aimAngle: number; targetDistance: number } {
  const trajectory = resolveRootTrajectory(spell);
  if (trajectory?.type === 'ORBIT_ANCHOR') {
    return {
      aimAngle: 0,
      targetDistance: trajectory.orbitRadius ?? 80,
    };
  }
  const maxRange = trajectory?.maxRange ?? 220;
  return {
    aimAngle: -Math.PI / 4,
    targetDistance: clamp(maxRange * 0.7, 90, 320),
  };
}

function snapshotFrame(
  world: PhysicsWorld,
  activeImpacts: ActiveImpact[],
): PlaybackFrame {
  const projectiles: ProjectileFrameData[] = [];
  for (const proj of world.projectiles) {
    if (proj.isDead) continue;
    const heading =
      proj.vel.magSq() > 0
        ? Math.atan2(proj.vel.y, proj.vel.x)
        : proj.aimAngle;
    projectiles.push({
      x: proj.pos.x,
      y: proj.pos.y,
      z: proj.z,
      radius: proj.radius,
      style: proj.visuals?.projectileStyle ?? 'DISC',
      color: proj.visuals?.color ?? '#00e5ff',
      heading,
    });
  }

  const zones: ZoneFrameData[] = [];
  for (const zone of world.zones) {
    if (zone.isDead) continue;
    zones.push({
      x: zone.pos.x,
      y: zone.pos.y,
      radius: zone.config.radius,
      color: FIELD_COLORS[zone.config.fieldType] ?? '#aa44ff',
      fieldType: zone.config.fieldType,
    });
  }

  const impacts: ImpactFrameData[] = activeImpacts.map((impact) => ({
    x: impact.x,
    y: impact.y,
    radius: impact.radius,
    color: impact.color,
    age: impact.age,
  }));

  return { projectiles, zones, impacts };
}

function hasActiveEntities(world: PhysicsWorld, activeImpacts: ActiveImpact[]): boolean {
  if (world.projectiles.some((p) => !p.isDead)) return true;
  if (world.zones.some((z) => !z.isDead)) return true;
  if (world.summons.some((s) => !s.isDead)) return true;
  if (activeImpacts.length > 0) return true;
  return false;
}

function seedImpactsFromEvents(
  world: PhysicsWorld,
  spell: AbilitySchema,
  activeImpacts: ActiveImpact[],
): void {
  const defaultColor = spell.visuals?.color ?? '#00e5ff';

  for (const hit of world.pendingHits) {
    activeImpacts.push({
      x: hit.hitPos.x,
      y: hit.hitPos.y,
      radius: 8,
      color: hit.projectile.visuals?.color ?? defaultColor,
      age: 0,
    });
  }

  for (const projectile of world.pendingExpirations) {
    if (
      projectile.expiryReason !== 'range' &&
      projectile.expiryReason !== 'lifetime' &&
      projectile.expiryReason !== 'ground'
    ) {
      continue;
    }
    activeImpacts.push({
      x: projectile.pos.x,
      y: projectile.pos.y,
      radius: 8,
      color: projectile.visuals?.color ?? defaultColor,
      age: 0,
    });
  }

  for (const impact of world.pendingWallImpacts) {
    activeImpacts.push({
      x: impact.x,
      y: impact.y,
      radius: 6,
      color: defaultColor,
      age: 0,
    });
  }
}

function ageImpacts(activeImpacts: ActiveImpact[]): void {
  for (let i = activeImpacts.length - 1; i >= 0; i--) {
    activeImpacts[i].age += 1 / IMPACT_LIFETIME_FRAMES;
    if (activeImpacts[i].age >= 1) {
      activeImpacts.splice(i, 1);
    }
  }
}

function transformRecording(
  rawFrames: PlaybackFrame[],
  casterPos: Vector2D,
  targetPos: Vector2D,
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
): PlaybackRecording {
  let minX = casterPos.x;
  let maxX = casterPos.x;
  let minY = casterPos.y;
  let maxY = casterPos.y;

  const inflate = (x: number, y: number, radius: number): void => {
    minX = Math.min(minX, x - radius);
    maxX = Math.max(maxX, x + radius);
    minY = Math.min(minY, y - radius);
    maxY = Math.max(maxY, y + radius);
  };

  inflate(casterPos.x, casterPos.y, 14);
  inflate(targetPos.x, targetPos.y, 14);

  for (const frame of rawFrames) {
    for (const proj of frame.projectiles) {
      inflate(proj.x, proj.y - proj.z * Z_TO_SCREEN, proj.radius);
      inflate(proj.x, proj.y, proj.radius);
    }
    for (const zone of frame.zones) {
      inflate(zone.x, zone.y, zone.radius);
    }
    for (const impact of frame.impacts) {
      inflate(impact.x, impact.y, impact.radius * (1 + impact.age));
    }
  }

  const bboxW = Math.max(maxX - minX, 120);
  const bboxH = Math.max(maxY - minY, 80);
  const availW = canvasWidth - padding * 2;
  const availH = canvasHeight - padding * 2;
  const scale = Math.min(availW / bboxW, availH / bboxH);

  const bboxCenterX = (minX + maxX) / 2;
  const bboxCenterY = (minY + maxY) / 2;
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;

  const toCanvasX = (wx: number) => canvasCenterX + (wx - bboxCenterX) * scale;
  const toCanvasY = (wy: number) => canvasCenterY + (wy - bboxCenterY) * scale;

  const mapPoint = (x: number, y: number) => ({
    x: toCanvasX(x),
    y: toCanvasY(y),
  });

  const frames = rawFrames.map((frame) => ({
    projectiles: frame.projectiles.map((proj) => ({
      ...proj,
      ...mapPoint(proj.x, proj.y),
      radius: Math.max(3, Math.min(12, proj.radius * scale)),
    })),
    zones: frame.zones.map((zone) => ({
      ...zone,
      ...mapPoint(zone.x, zone.y),
      radius: zone.radius * scale,
    })),
    impacts: frame.impacts.map((impact) => ({
      ...impact,
      ...mapPoint(impact.x, impact.y),
      radius: impact.radius * scale * (1 + impact.age * 0.5),
    })),
  }));

  return {
    frames,
    originCanvasPos: mapPoint(casterPos.x, casterPos.y),
    targetCanvasPos: mapPoint(targetPos.x, targetPos.y),
    canvasWidth,
    canvasHeight,
    scale,
    totalDurationMs: (rawFrames.length / 60) * 1000,
  };
}

function runSandboxSimulation(spell: AbilitySchema): {
  rawFrames: PlaybackFrame[];
  casterPos: Vector2D;
  targetPos: Vector2D;
} {
  const world = new PhysicsWorld(Vector2D.zero(), SANDBOX_HEX_RADIUS);
  const caster = new Player(Vector2D.zero(), ['player', 'combatant', 'kinematic']);
  world.addPlayer(caster);

  const { aimAngle, targetDistance } = resolveAimConfig(spell);
  const heading = Vector2D.fromAngle(aimAngle);
  const targetPos = heading.scale(targetDistance);
  const dummy = new Dummy(targetPos);
  dummy.tags.add('kinematic');
  world.addDummy(dummy);

  const interp = new Interpreter();
  interp.executeAbility(
    spell,
    {
      origin: caster.pos.clone(),
      heading,
      caster,
      depth: 0,
      ability: spell,
    },
    world,
  );

  const rawFrames: PlaybackFrame[] = [];
  const activeImpacts: ActiveImpact[] = [];
  let idleFrames = 0;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    interp.updateTrajectories(world, SIM_DT);
    world.updateSpatialZones(SIM_DT);
    applySandboxFields(world, SIM_DT);
    world.step(SIM_DT);
    interp.processLifecycleEvents(world, SIM_DT, HEADLESS_LIFECYCLE_FX);

    seedImpactsFromEvents(world, spell, activeImpacts);
    rawFrames.push(snapshotFrame(world, activeImpacts));
    ageImpacts(activeImpacts);

    if (!hasActiveEntities(world, activeImpacts)) {
      idleFrames++;
      if (idleFrames >= EARLY_EXIT_TAIL_FRAMES) break;
    } else {
      idleFrames = 0;
    }
  }

  return { rawFrames, casterPos: caster.pos.clone(), targetPos: dummy.pos.clone() };
}

export function recordSpellPlayback(
  spell: AbilitySchema,
  canvasWidth = 240,
  canvasHeight = 120,
  padding = 16,
): PlaybackRecording {
  const cacheKey = `${spell.id ?? spell.name}|${canvasWidth}x${canvasHeight}|${padding}`;
  const cached = recordingCache.get(cacheKey);
  if (cached) return cached;

  const logger = CombatLogger.getInstance();
  const loggerWasEnabled = logger.enabled;
  const nativeRandom = Math.random;

  logger.enabled = false;
  Math.random = createSeededRandom(0x5c0be3);

  try {
    const { rawFrames, casterPos, targetPos } = runSandboxSimulation(spell);
    const recording = transformRecording(
      rawFrames.length > 0 ? rawFrames : [{ projectiles: [], zones: [], impacts: [] }],
      casterPos,
      targetPos,
      canvasWidth,
      canvasHeight,
      padding,
    );
    recordingCache.set(cacheKey, recording);
    return recording;
  } finally {
    logger.enabled = loggerWasEnabled;
    Math.random = nativeRandom;
  }
}
