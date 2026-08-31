import type { EmitterConfig, EmitterDistribution } from '../../../types/schema';
import { EMITTER_DISTRIBUTIONS } from '../constants';
import { clamp, ensureFiniteNumber, isObject } from '../helpers';

export function sanitizeEmitter(raw: unknown, countHint = 1): EmitterConfig {
  const obj = isObject(raw) ? raw : {};
  const count = clamp(Math.round(ensureFiniteNumber(obj.count, countHint)), 1, 12);
  const spreadMissing = obj.spreadDeg === undefined || obj.spreadDeg === null;
  const spreadDeg = clamp(
    ensureFiniteNumber(obj.spreadDeg, count > 1 ? 30 : 0),
    0,
    360,
  );
  const distRaw =
    typeof obj.distribution === 'string' ? obj.distribution.toUpperCase() : 'FAN';
  const distribution = (
    EMITTER_DISTRIBUTIONS.has(distRaw) ? distRaw : 'FAN'
  ) as EmitterDistribution;

  const emitter: EmitterConfig = {
    count,
    spreadDeg: spreadMissing && count > 1 ? 30 : spreadDeg,
    distribution,
  };

  if (obj.aimOffsetDeg !== undefined) {
    emitter.aimOffsetDeg = ensureFiniteNumber(obj.aimOffsetDeg, 0);
  }
  if (obj.inheritVelocityRatio !== undefined) {
    emitter.inheritVelocityRatio = clamp(
      ensureFiniteNumber(obj.inheritVelocityRatio, 0),
      0,
      1,
    );
  }

  return emitter;
}
