import { extractPartialCard } from '../src/ai/synthesizer/partialJson';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run(): void {
  const failures: string[] = [];

  const test = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  test('extracts truncated name mid-string', () => {
    const partial = extractPartialCard('{"name":"Frost L');
    assertEqual(partial.name, 'Frost L', 'partial name');
  });

  test('extracts closed fields before JSON ends', () => {
    const partial = extractPartialCard(
      '{"name":"Rail Burst","tagline":"Kinetic Snap","description":"A fast shot","archetype":"KINETIC","triggers":[',
    );
    assertEqual(partial.name, 'Rail Burst', 'name');
    assertEqual(partial.tagline, 'Kinetic Snap', 'tagline');
    assertEqual(partial.description, 'A fast shot', 'description');
    assertEqual(partial.archetype, 'KINETIC', 'archetype');
  });

  test('detects mechanic tokens before JSON closes', () => {
    const partial = extractPartialCard(
      '{"name":"Vortex","trajectory":{"type":"ORBIT_ANCHOR"},"resourceCost":{"type":"HEAT"}',
    );
    assert(partial.detectedBadges.includes('[ORBIT]'), 'orbit badge');
    assert(partial.detectedBadges.includes('[HEAT]'), 'heat badge');
  });

  test('unescapes quotes and newlines in description', () => {
    const partial = extractPartialCard('{"description":"Line one\\nLine \\"two\\""}');
    assertEqual(partial.description, 'Line one\nLine "two"', 'escaped description');
  });

  test('dedupes badges in encounter order', () => {
    const partial = extractPartialCard(
      '{"triggers":[{"actions":[{"type":"SPAWN_FIELD","field":{"fieldType":"MASS_ATTRACTOR"}}]}],"resourceCost":{"type":"HEAT"}}',
    );
    assertEqual(partial.detectedBadges[0], '[GRAVITY]', 'first badge');
    assertEqual(partial.detectedBadges[1], '[HEAT]', 'second badge');
    assertEqual(partial.detectedBadges.length, 2, 'badge count');
  });

  test('defaults isComplete to false', () => {
    const partial = extractPartialCard('{"name":"Test"}');
    assertEqual(partial.isComplete, false, 'isComplete');
  });

  if (failures.length > 0) {
    console.error('test-partial-json FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('test-partial-json: all checks passed');
}

run();
