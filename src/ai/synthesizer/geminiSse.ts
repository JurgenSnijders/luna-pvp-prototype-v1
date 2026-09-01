import { coerceMessageContent } from './llmRepair';

export type GeminiSsePayload =
  | { kind: 'delta'; delta: string }
  | { kind: 'skip' }
  | { kind: 'error'; message: string };

export type SseEvent =
  | { kind: 'data'; payload: string }
  | { kind: 'done' }
  | { kind: 'empty' };

/**
 * Append an incoming byte chunk to the SSE carry buffer and return any complete
 * event blocks (text between blank-line delimiters).
 */
export function feedSseBuffer(
  carry: string,
  chunk: string,
): { carry: string; eventBlocks: string[] } {
  const combined = (carry + chunk).replace(/\r\n/g, '\n');
  const parts = combined.split('\n\n');
  const newCarry = parts.pop() ?? '';
  return { carry: newCarry, eventBlocks: parts };
}

/**
 * Parse one SSE event block into its joined `data:` payload, `[DONE]`, or empty.
 */
export function parseSseEventBlock(block: string): SseEvent {
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }
  if (dataLines.length === 0) return { kind: 'empty' };
  const payload = dataLines.join('\n');
  if (payload === '[DONE]') return { kind: 'done' };
  return { kind: 'data', payload };
}

/**
 * Parse one Gemini `data:` JSON payload from an SSE event into a text delta.
 */
export function parseGeminiStreamPayload(data: string): GeminiSsePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : 'SSE JSON parse error',
    };
  }

  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const errObj = (parsed as { error?: { message?: string } }).error;
    return { kind: 'error', message: errObj?.message ?? 'Gemini API error' };
  }

  const parts = (parsed as { candidates?: Array<{ content?: { parts?: unknown } }> })
    ?.candidates?.[0]?.content?.parts;
  const delta = coerceMessageContent(parts);
  if (!delta) return { kind: 'skip' };
  return { kind: 'delta', delta };
}

/** Strip optional markdown JSON fences from the accumulated model text. */
export function stripMarkdownFences(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/**
 * Process any remaining carry buffer at stream end (final event without trailing blank line).
 */
export function flushSseBuffer(carry: string): string[] {
  const trimmed = carry.trim();
  if (!trimmed) return [];
  return [trimmed];
}
