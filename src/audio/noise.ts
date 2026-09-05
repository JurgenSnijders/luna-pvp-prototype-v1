const GAIN_FLOOR = 0.0001;

export function lfsrStep(
  state: number,
  bits: 7 | 15,
): { next: number; sample: number } {
  if (bits === 7) {
    const feedback = ((state >> 6) ^ (state >> 5)) & 1;
    const next = ((state << 1) | feedback) & 0x7f;
    const sample = (next & 1) === 1 ? 1 : -1;
    return { next, sample };
  }

  const feedback = ((state >> 14) ^ (state >> 13)) & 1;
  const next = ((state << 1) | feedback) & 0x7fff;
  const sample = (next & 1) === 1 ? 1 : -1;
  return { next, sample };
}

function normalizePeak(data: Float32Array, targetPeak = 0.95): void {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak <= GAIN_FLOOR) return;
  const scale = targetPeak / peak;
  for (let i = 0; i < data.length; i++) {
    data[i] *= scale;
  }
}

export function createLfsrNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec = 1.0,
  bits: 7 | 15 = 15,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let state = bits === 7 ? 0x7f : 0x7fff;
  for (let i = 0; i < length; i++) {
    const step = lfsrStep(state, bits);
    state = step.next;
    data[i] = step.sample;
  }

  normalizePeak(data);
  return buffer;
}

export function createBrownNoiseBuffer(
  ctx: BaseAudioContext,
  durationSec = 2.0,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut;
  }

  normalizePeak(data);
  return buffer;
}
