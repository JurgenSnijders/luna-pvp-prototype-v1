import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthBarColor, instabilityColor } from '../src/render/canvas/colors';
import { buildSpriteCacheKey } from '../src/render/canvas/SpriteCache';
import { canSpawnAtCount } from '../src/render/backends/webgl/spawnPriority';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'render-helpers.snapshot.json');
const UPDATE_SNAPSHOT = process.argv.includes('--update-snapshot');

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

  if (failures.length > 0) {
    console.error('test:render  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  const checkCount =
    Object.keys(snapshot.instabilityColors).length +
    Object.keys(snapshot.healthBarColors).length +
    1 +
    Object.keys(snapshot.spawnAtBudget).length;
  console.log(`test:render  OK  ${checkCount} render helper checks passed`);
}

run();
