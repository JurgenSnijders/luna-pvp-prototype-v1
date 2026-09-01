import type { DraftCard } from '../../types/cards';

export type StreamBadgeKind = 'trajectory' | 'field' | 'trigger' | 'cast';

export interface PartialCardStream {
  name?: string;
  tagline?: string;
  description?: string;
  archetype?: string;
  detectedBadges: string[];
  rawText: string;
  isComplete: boolean;
  validatedCard?: DraftCard;
}

const STREAM_TOKEN_BADGES: Array<{ token: string; label: string }> = [
  { token: 'ORBIT_ANCHOR', label: '[ORBIT]' },
  { token: 'HOMING_SLERP', label: '[HOMING]' },
  { token: 'RETURN_TO_SOURCE', label: '[BOOMERANG]' },
  { token: 'MASS_ATTRACTOR', label: '[GRAVITY]' },
  { token: 'VORTEX_TANGENT', label: '[VORTEX]' },
  { token: 'RADIAL_IMPULSE', label: '[RADIAL]' },
  { token: 'FRICTION_OVERRIDE', label: '[FRICTION]' },
  { token: 'HEAT', label: '[HEAT]' },
  { token: 'AMMO', label: '[AMMO]' },
  { token: 'HEALTH_PCT', label: '[HEALTH]' },
  { token: 'CHARGE_AND_RELEASE', label: '[CHARGE]' },
  { token: 'CHANNELED', label: '[CHANNEL]' },
  { token: 'COMBO_CHAIN', label: '[COMBO]' },
  { token: 'APPLY_STASIS', label: '[STASIS]' },
  { token: 'SPAWN_OBSTACLE', label: '[OBSTACLE]' },
  { token: 'TELEPORT', label: '[TELEPORT]' },
  { token: 'MORPH_ENTITY', label: '[MORPH]' },
];

export const STREAM_BADGE_KINDS: Record<string, StreamBadgeKind> = {
  '[ORBIT]': 'trajectory',
  '[HOMING]': 'trajectory',
  '[BOOMERANG]': 'trajectory',
  '[GRAVITY]': 'field',
  '[VORTEX]': 'field',
  '[RADIAL]': 'field',
  '[FRICTION]': 'field',
  '[HEAT]': 'cast',
  '[AMMO]': 'cast',
  '[HEALTH]': 'cast',
  '[CHARGE]': 'cast',
  '[CHANNEL]': 'cast',
  '[COMBO]': 'cast',
  '[STASIS]': 'trigger',
  '[OBSTACLE]': 'trigger',
  '[TELEPORT]': 'trigger',
  '[MORPH]': 'trigger',
};

const PARTIAL_STRING_FIELDS: Array<{ key: keyof Pick<PartialCardStream, 'name' | 'tagline' | 'description'>; pattern: RegExp }> = [
  { key: 'name', pattern: /"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/ },
  { key: 'tagline', pattern: /"tagline"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/ },
  { key: 'description', pattern: /"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)/ },
];

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractPartialString(buffer: string, pattern: RegExp): string | undefined {
  const match = buffer.match(pattern);
  if (!match?.[1]) return undefined;
  return unescapeJsonString(match[1]);
}

function extractArchetype(buffer: string): string | undefined {
  const match = buffer.match(/"archetype"\s*:\s*"([A-Z_]+)/);
  return match?.[1];
}

function detectStreamBadges(buffer: string): string[] {
  const badges: string[] = [];
  const seen = new Set<string>();
  for (const { token, label } of STREAM_TOKEN_BADGES) {
    if (buffer.includes(token) && !seen.has(label)) {
      seen.add(label);
      badges.push(label);
    }
  }
  return badges;
}

export function extractPartialCard(buffer: string): PartialCardStream {
  const partial: PartialCardStream = {
    detectedBadges: detectStreamBadges(buffer),
    rawText: buffer,
    isComplete: false,
  };

  for (const { key, pattern } of PARTIAL_STRING_FIELDS) {
    const value = extractPartialString(buffer, pattern);
    if (value !== undefined) partial[key] = value;
  }

  const archetype = extractArchetype(buffer);
  if (archetype) partial.archetype = archetype;

  return partial;
}
