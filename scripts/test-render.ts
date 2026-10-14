import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthBarColor, instabilityColor } from '../src/render/canvas/colors';
import { buildSpriteCacheKey } from '../src/render/canvas/SpriteCache';
import { canSpawnAtCount } from '../src/render/backends/webgl/spawnPriority';
import {
  clearUserZoomOverride,
  computeArenaFitZoom,
  fitArenaToSafeView,
  getLastFitZoom,
  markUserZoomOverride,
} from '../src/camera/cameraArenaFit';
import { Camera2D } from '../src/camera/Camera2D';
import {
  circleShadow,
  selectShadowCasters,
  shadowVolumeVerts,
} from '../src/render/shadowGeometry';
import type { Light } from '../src/render/LightLayer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'render-helpers.snapshot.json');
const UPDATE_SNAPSHOT = process.argv.includes('--update-snapshot');

function installMockWindow(): void {
  if (typeof globalThis.window !== 'undefined') return;
  Object.defineProperty(globalThis, 'window', {
    value: {
      innerWidth: 1024,
      innerHeight: 600,
      devicePixelRatio: 1,
    },
    configurable: true,
  });
}

interface RenderSnapshot {
  instabilityColors: Record<string, string>;
  healthBarColors: Record<string, string>;
  spriteCacheKey: string;
  spawnAtBudget: Record<string, boolean>;
}

function captureSnapshot(): RenderSnapshot {
  const instabilityThresholds = [0, 50, 100, 175, 250, 300];
  const instabilityColors: Record<string, string> = {};
  for (const pct of instabilityThresholds) {
    instabilityColors[String(pct)] = instabilityColor(pct);
  }

  const healthRatios = [0.1, 0.3, 0.6, 0.9];
  const healthBarColors: Record<string, string> = {};
  for (const ratio of healthRatios) {
    healthBarColors[String(ratio)] = healthBarColor(ratio);
  }

  const spriteCacheKey = buildSpriteCacheKey('DISC', '#00ccff', 12, 2);

  const budget = 100;
  const priorities = ['CORE', 'PRIMARY', 'SECONDARY', 'AMBIENT'] as const;
  const spawnAtBudget: Record<string, boolean> = {};
  for (const priority of priorities) {
    spawnAtBudget[priority] = canSpawnAtCount(budget, budget, priority);
  }

  return {
    instabilityColors,
    healthBarColors,
    spriteCacheKey,
    spawnAtBudget,
  };
}

function run(): void {
  installMockWindow();
  const snapshot = captureSnapshot();
  const failures: string[] = [];

  if (existsSync(SNAPSHOT_PATH) && !UPDATE_SNAPSHOT) {
    const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as RenderSnapshot;
  const keys: (keyof RenderSnapshot)[] = [
      'instabilityColors',
      'healthBarColors',
      'spriteCacheKey',
      'spawnAtBudget',
    ];
    for (const key of keys) {
      const actual = JSON.stringify(snapshot[key]);
      const exp = JSON.stringify(expected[key]);
      if (actual !== exp) {
        failures.push(`${key}: expected ${exp}, got ${actual}`);
      }
    }
  } else {
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
    if (UPDATE_SNAPSHOT) {
      console.log('test:render  snapshot updated');
      return;
    }
  }

  if (snapshot.spriteCacheKey !== 'DISC|#00ccff|12|2') {
    failures.push(`spriteCacheKey format: got ${snapshot.spriteCacheKey}`);
  }
  if (snapshot.spawnAtBudget.CORE !== true) {
    failures.push('spawnAtBudget CORE should be true at budget boundary');
  }
  if (snapshot.spawnAtBudget.PRIMARY !== true) {
    failures.push('spawnAtBudget PRIMARY should be true at budget boundary');
  }
  if (snapshot.spawnAtBudget.SECONDARY !== false) {
    failures.push('spawnAtBudget SECONDARY should be false at budget boundary');
  }
  if (snapshot.spawnAtBudget.AMBIENT !== false) {
    failures.push('spawnAtBudget AMBIENT should be false at budget boundary');
  }

  const fitZoom = computeArenaFitZoom(1024, 600, 340, 0.3, 2.0, {
    top: 56,
    bottom: 100,
    right: 0,
  });
  if (fitZoom < 0.3 || fitZoom > 1.2) {
    failures.push(`computeArenaFitZoom compact: expected sensible zoom, got ${fitZoom}`);
  }

  const camera = new Camera2D();
  camera.setViewport(1024, 600);
  clearUserZoomOverride();
  fitArenaToSafeView(camera, 340, { top: 56, bottom: 100, right: 0 }, { force: true });
  if (camera.targetZoom < 0.3) {
    failures.push('fitArenaToSafeView: zoom below minZoom');
  }
  const fitted = camera.targetZoom;
  markUserZoomOverride();
  camera.setZoom(fitted + 0.25);
  fitArenaToSafeView(camera, 340, { top: 56, bottom: 100, right: 0 });
  if (Math.abs(camera.targetZoom - (fitted + 0.25)) > 0.01) {
    failures.push('fitArenaToSafeView should preserve user zoom override');
  }
  if (getLastFitZoom() === null) {
    failures.push('fitArenaToSafeView force should record lastFitZoom');
  }

  const shadowBuf = new Float32Array(128);
  const light = { x: 0, y: 0, radius: 200 };
  const occ = { kind: 'CIRCLE' as const, x: 80, y: 0, r: 12 };
  const end = circleShadow(light, occ, shadowBuf, 0);
  if (end !== 12) {
    failures.push(`circleShadow: expected 12 floats, got ${end}`);
  }
  for (let i = 0; i < end; i += 2) {
    const d = Math.hypot(shadowBuf[i], shadowBuf[i + 1]);
    if (d < occ.r - 0.5) {
      failures.push('circleShadow: vertex closer than occluder radius');
      break;
    }
  }
  const inside = circleShadow(light, { kind: 'CIRCLE', x: 0, y: 0, r: 20 }, shadowBuf, 0);
  if (inside !== 0) {
    failures.push('circleShadow: light inside circle should emit 0 floats');
  }
  const far = circleShadow(light, { kind: 'CIRCLE', x: 500, y: 0, r: 10 }, shadowBuf, 0);
  if (far !== 0) {
    failures.push('circleShadow: out-of-range occluder should emit 0 floats');
  }
  const boxEnd = shadowVolumeVerts(
    light,
    { kind: 'BOX', x: 60, y: 10, hw: 20, hh: 10, angle: 0.2 },
    shadowBuf,
    0,
  );
  if (boxEnd <= 0) {
    failures.push('boxShadow: expected non-zero vertex count');
  }
  const lights: Light[] = [
    {
      x: 0,
      y: 0,
      radius: 100,
      r: 1,
      g: 1,
      b: 1,
      intensity: 2,
      born: 0,
      lifeMs: 0,
      falloff: 2,
      fade: 1,
    },
    {
      x: 200,
      y: 200,
      radius: 50,
      r: 1,
      g: 1,
      b: 1,
      intensity: 1,
      born: 0,
      lifeMs: 0,
      falloff: 2,
      fade: 1,
    },
  ];
  const occluders = [{ kind: 'CIRCLE' as const, x: 40, y: 0, r: 8 }];
  const casters = selectShadowCasters(lights, occluders, 4);
  if (casters.length !== 1 || casters[0] !== 0) {
    failures.push('selectShadowCasters: expected only light 0 to cast');
  }
  const castersMax = selectShadowCasters(lights, [], 4);
  if (castersMax.length !== 0) {
    failures.push('selectShadowCasters: expected none without occluders');
  }

  if (failures.length > 0) {
    console.error('test:render  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  const checkCount =
    Object.keys(snapshot.instabilityColors).length +
    Object.keys(snapshot.healthBarColors).length +
    1 +
    Object.keys(snapshot.spawnAtBudget).length +
    6;
  console.log(`test:render  OK  ${checkCount} render helper checks passed`);
}

run();
