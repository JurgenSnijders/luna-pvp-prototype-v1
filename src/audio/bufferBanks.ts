import { createBrownNoiseBuffer, createLfsrNoiseBuffer } from './noise';

const GAIN_FLOOR = 0.0001;

export interface AudioBufferBank {
  pick(): AudioBuffer;
  buffers: AudioBuffer[];
}

export interface PreBakedBanks {
  debrisClinks: AudioBufferBank;
  sparks: AudioBufferBank;
  uiBlips: AudioBufferBank;
  brownNoise: AudioBuffer;
}

function makeBank(buffers: AudioBuffer[]): AudioBufferBank {
  return {
    buffers,
    pick() {
      return buffers[Math.floor(Math.random() * buffers.length)];
    },
  };
}

async function renderOfflineBuffer(
  sampleRate: number,
  durationSec: number,
  render: (ctx: OfflineAudioContext, when: number) => void,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(sampleRate * durationSec));
  const offline = new OfflineAudioContext(1, length, sampleRate);
  render(offline, 0);
  return offline.startRendering();
}

async function renderDebrisClinkVariant(
  sampleRate: number,
  seed: number,
): Promise<AudioBuffer> {
  const durationSec = 0.08;
  return renderOfflineBuffer(sampleRate, durationSec, (ctx, when) => {
    const f0 = 2400;
    const ratios = [1.0, 2.76, 5.4];
    const decays = [0.045, 0.03, 0.018];
    const peakGains = [0.5, 0.35, 0.25];

    ratios.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f0 * ratio;
      gain.gain.setValueAtTime(GAIN_FLOOR, when);
      gain.gain.linearRampToValueAtTime(peakGains[i], when + 0.0012);
      gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + decays[i]);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + decays[i] + 0.01);
    });

    const noise = ctx.createBufferSource();
    noise.buffer = createLfsrNoiseBuffer(ctx, 0.02, 15);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.35, when);
    ng.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + 0.006);
    noise.connect(hp);
    hp.connect(ng);
    ng.connect(ctx.destination);
    noise.start(when, (seed % 97) * 0.001);
    noise.stop(when + 0.01);
  });
}

async function renderSparkVariant(sampleRate: number, seed: number): Promise<AudioBuffer> {
  const durationSec = 0.012;
  return renderOfflineBuffer(sampleRate, durationSec, (ctx, when) => {
    const noise = ctx.createBufferSource();
    noise.buffer = createLfsrNoiseBuffer(ctx, 0.02, 7);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45 + (seed % 5) * 0.02, when);
    gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + 0.01);
    noise.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    noise.start(when, (seed % 31) * 0.0002);
    noise.stop(when + 0.012);
  });
}

async function renderUiBlipVariant(sampleRate: number, seed: number): Promise<AudioBuffer> {
  const durationSec = 0.025;
  return renderOfflineBuffer(sampleRate, durationSec, (ctx, when) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880 + (seed % 4) * 80;
    gain.gain.setValueAtTime(GAIN_FLOOR, when);
    gain.gain.linearRampToValueAtTime(0.35, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + 0.022);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.025);
  });
}

async function renderDebrisClinkBank(ctx: AudioContext, count = 6): Promise<AudioBufferBank> {
  const buffers = await Promise.all(
    Array.from({ length: count }, (_, i) => renderDebrisClinkVariant(ctx.sampleRate, i)),
  );
  return makeBank(buffers);
}

async function renderSparkBank(ctx: AudioContext, count = 4): Promise<AudioBufferBank> {
  const buffers = await Promise.all(
    Array.from({ length: count }, (_, i) => renderSparkVariant(ctx.sampleRate, i)),
  );
  return makeBank(buffers);
}

async function renderUiBlipBank(ctx: AudioContext, count = 4): Promise<AudioBufferBank> {
  const buffers = await Promise.all(
    Array.from({ length: count }, (_, i) => renderUiBlipVariant(ctx.sampleRate, i)),
  );
  return makeBank(buffers);
}

export async function buildPreBakedBanks(ctx: AudioContext): Promise<PreBakedBanks> {
  const [debrisClinks, sparks, uiBlips, brownNoise] = await Promise.all([
    renderDebrisClinkBank(ctx),
    renderSparkBank(ctx),
    renderUiBlipBank(ctx),
    Promise.resolve(createBrownNoiseBuffer(ctx)),
  ]);

  return {
    debrisClinks,
    sparks,
    uiBlips,
    brownNoise,
  };
}
