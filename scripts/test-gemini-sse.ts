import {
  feedSseBuffer,
  flushSseBuffer,
  parseGeminiStreamPayload,
  parseSseEventBlock,
  stripMarkdownFences,
} from '../src/ai/synthesizer/geminiSse';

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

  test('feedSseBuffer splits complete events', () => {
    const payload1 = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"cards":' }] } }],
    });
    const payload2 = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '[]}' }] } }],
    });
    const input = `data: ${payload1}\n\ndata: ${payload2}\n\n`;
    const { carry, eventBlocks } = feedSseBuffer('', input);
    assertEqual(eventBlocks.length, 2, 'event count');
    assertEqual(carry, '', 'carry');
    assert(eventBlocks[0].includes('cards'), 'first event payload');
  });

  test('feedSseBuffer retains partial event in carry', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
    });
    const part1 = `data: ${payload}\n`;
    const part2 = '\ndata: [DONE]\n\n';
    const first = feedSseBuffer('', part1);
    assertEqual(first.eventBlocks.length, 0, 'no complete events yet');
    assert(first.carry.length > 0, 'carry holds partial');

    const second = feedSseBuffer(first.carry, part2);
    assertEqual(second.eventBlocks.length, 2, 'two events after completion');
    assertEqual(parseSseEventBlock(second.eventBlocks[1]).kind, 'done', 'second is DONE');
  });

  test('parseSseEventBlock joins multiline data fields', () => {
    const block = 'data: line-one\n' + 'data: line-two\n';
    const event = parseSseEventBlock(block);
    assert(event.kind === 'data', 'data event');
    if (event.kind === 'data') {
      assertEqual(event.payload, 'line-one\nline-two', 'joined payload');
    }
  });

  test('parseSseEventBlock ignores comment lines', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] } }],
    });
    const block = `: keep-alive\ndata: ${payload}\n`;
    const event = parseSseEventBlock(block);
    assert(event.kind === 'data', 'data event');
  });

  test('parseSseEventBlock recognizes [DONE]', () => {
    assertEqual(parseSseEventBlock('data: [DONE]').kind, 'done', 'done sentinel');
  });

  test('parseGeminiStreamPayload extracts text delta', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"cards":' }] } }],
    });
    const parsed = parseGeminiStreamPayload(payload);
    assert(parsed.kind === 'delta', 'delta kind');
    if (parsed.kind === 'delta') {
      assertEqual(parsed.delta, '{"cards":', 'delta text');
    }
  });

  test('parseGeminiStreamPayload skips empty-delta events', () => {
    const payload = JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } });
    assertEqual(parseGeminiStreamPayload(payload).kind, 'skip', 'skip empty');
  });

  test('parseGeminiStreamPayload surfaces API error payload', () => {
    const payload = JSON.stringify({ error: { message: 'quota exceeded' } });
    const parsed = parseGeminiStreamPayload(payload);
    assert(parsed.kind === 'error', 'error kind');
    if (parsed.kind === 'error') {
      assertEqual(parsed.message, 'quota exceeded', 'error message');
    }
  });

  test('parseGeminiStreamPayload rejects invalid JSON', () => {
    const parsed = parseGeminiStreamPayload('not-json');
    assert(parsed.kind === 'error', 'invalid json');
  });

  test('stripMarkdownFences removes json code fences', () => {
    const raw = '```json\n{"id":"x"}\n```';
    assertEqual(stripMarkdownFences(raw), '{"id":"x"}', 'stripped fences');
  });

  test('flushSseBuffer emits trailing block without blank line', () => {
    const payload = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'tail' }] } }],
    });
    const carry = `data: ${payload}`;
    const blocks = flushSseBuffer(carry);
    assertEqual(blocks.length, 1, 'one trailing block');
    const event = parseSseEventBlock(blocks[0]);
    assert(event.kind === 'data', 'trailing data event');
    if (event.kind === 'data') {
      const parsed = parseGeminiStreamPayload(event.payload);
      assert(parsed.kind === 'delta' && parsed.delta === 'tail', 'trailing delta');
    }
  });

  test('end-to-end accumulation across split SSE frames', () => {
    const payload1 = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"a":' }] } }],
    });
    const payload2 = JSON.stringify({
      candidates: [{ content: { parts: [{ text: '1}' }] } }],
    });
    const frames = [
      `data: ${payload1}\n`,
      '\n',
      `data: ${payload2}\n\n`,
      'data: [DONE]\n\n',
    ];
    let carry = '';
    let accumulated = '';
    for (const frame of frames) {
      const fed = feedSseBuffer(carry, frame);
      carry = fed.carry;
      for (const block of fed.eventBlocks) {
        const event = parseSseEventBlock(block);
        if (event.kind === 'done') continue;
        if (event.kind !== 'data') continue;
        const parsed = parseGeminiStreamPayload(event.payload);
        if (parsed.kind === 'delta') accumulated += parsed.delta;
      }
    }
    for (const block of flushSseBuffer(carry)) {
      const event = parseSseEventBlock(block);
      if (event.kind === 'data') {
        const parsed = parseGeminiStreamPayload(event.payload);
        if (parsed.kind === 'delta') accumulated += parsed.delta;
      }
    }
    assertEqual(stripMarkdownFences(accumulated), '{"a":1}', 'assembled json');
  });

  if (failures.length > 0) {
    console.error('test-gemini-sse FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('test-gemini-sse: all checks passed');
}

run();
