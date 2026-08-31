import { EMITTER_DISTRIBUTIONS } from '../constants';
import type { EmitterConfig, EmitterDistribution } from '../types';
import { isNumber, isObject, isString } from './helpers';

export function validateEmitterConfig(value: unknown): EmitterConfig | null {
  if (!isObject(value)) return null;
  if (!isNumber(value.count) || !isNumber(value.spreadDeg)) return null;
  if (!isString(value.distribution) || !EMITTER_DISTRIBUTIONS.has(value.distribution)) {
    return null;
  }

  const config: EmitterConfig = {
    count: value.count,
    spreadDeg: value.spreadDeg,
    distribution: value.distribution as EmitterDistribution,
  };

  if (value.aimOffsetDeg !== undefined) {
    if (!isNumber(value.aimOffsetDeg)) return null;
    config.aimOffsetDeg = value.aimOffsetDeg;
  }
  if (value.inheritVelocityRatio !== undefined) {
    if (!isNumber(value.inheritVelocityRatio)) return null;
    config.inheritVelocityRatio = value.inheritVelocityRatio;
  }

  return config;
}
