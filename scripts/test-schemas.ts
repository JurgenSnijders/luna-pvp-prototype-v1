import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeAbilitySchema, scoreAbilitySchema } from '../src/ai/BudgetEngine';
import { PRESETS } from '../src/devtools/Presets';
import { validateAbilitySchema } from '../src/types/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(__dirname, 'schema-scores.snapshot.json');
const UPDATE_SNAPSHOT = process.argv.includes('--update-snapshot');

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

function run(): void {
  const scores: Record<string, number> = {};
  const failures: string[] = [];

  for (const [name, preset] of Object.entries(PRESETS)) {
    const validated = validateAbilitySchema(preset);
    if (!validated) {
      failures.push(`validate failed: ${name}`);
      continue;
    }

    let sanitized;
    try {
      sanitized = sanitizeAbilitySchema(validated, 'SECONDARY');
    } catch (err) {
      failures.push(`sanitize threw for ${name}: ${err}`);
      continue;
    }

    const score = scoreAbilitySchema(sanitized);
    if (!Number.isFinite(score) || score <= 0) {
      failures.push(`invalid score for ${name}: ${score}`);
      continue;
    }

    scores[name] = roundScore(score);
  }

  if (failures.length > 0) {
    console.error('test:schemas  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  const presetCount = Object.keys(scores).length;
  const sortedScores = Object.fromEntries(
    Object.keys(scores)
      .sort()
      .map((key) => [key, scores[key]]),
  );

  if (!existsSync(SNAPSHOT_PATH)) {
    if (!UPDATE_SNAPSHOT) {
      console.error(
        `test:schemas  FAIL  snapshot missing at ${SNAPSHOT_PATH}\n` +
          '  Run: npm run test:schemas -- --update-snapshot',
      );
      process.exit(1);
    }
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortedScores, null, 2)}\n`, 'utf8');
    console.log(`test:schemas  OK  ${presetCount} presets  snapshot created`);
    return;
  }

  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Record<string, number>;

  if (UPDATE_SNAPSHOT) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortedScores, null, 2)}\n`, 'utf8');
    console.log(`test:schemas  OK  ${presetCount} presets  snapshot updated`);
    return;
  }

  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(sortedScores).sort();
  const keyMismatch =
    expectedKeys.length !== actualKeys.length ||
    expectedKeys.some((key, i) => key !== actualKeys[i]);

  if (keyMismatch) {
    console.error('test:schemas  FAIL  preset name mismatch');
    const missing = expectedKeys.filter((k) => !(k in sortedScores));
    const extra = actualKeys.filter((k) => !(k in expected));
    if (missing.length > 0) console.error(`  missing: ${missing.join(', ')}`);
    if (extra.length > 0) console.error(`  extra: ${extra.join(', ')}`);
    process.exit(1);
  }

  const scoreMismatches: string[] = [];
  for (const name of expectedKeys) {
    if (sortedScores[name] !== expected[name]) {
      scoreMismatches.push(`${name}: expected ${expected[name]}, got ${sortedScores[name]}`);
    }
  }

  if (scoreMismatches.length > 0) {
    console.error('test:schemas  FAIL  score mismatch');
    for (const msg of scoreMismatches) console.error(`  ${msg}`);
    process.exit(1);
  }

  console.log(`test:schemas  OK  ${presetCount} presets  scores match snapshot`);
}

run();
