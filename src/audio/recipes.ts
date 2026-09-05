import type { CardRarity } from '../types/cards';
import type { SpellArchetype } from '../types/schema';
import { createLfsrNoiseBuffer } from './noise';
import { SFX_PRIORITY } from './types';
import type { VoicePool } from './VoicePool';

const GAIN_FLOOR = 0.0001;
const LOOKAHEAD_SEC = 0.01;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function debrisClinkPlaybackRate(radius: number): number {
  return clamp(4 / Math.max(radius, 0.1), 0.55, 1.9);
}

export function debrisClinkGain(vz: number, bounceIndex: number): number {
  const base = clamp(Math.abs(vz) / 500, 0.05, 0.5);
  return base * Math.pow(0.6, bounceIndex);
}

export function groundSlamIntensity(vz: number): number {
  return clamp(vz / 300, 0.3, 2.5) / 2.5;
}

export function groundSlamSubStartHz(vz: number): number {
  const k = groundSlamIntensity(vz);
  return 90 + k * 70;
}

export const GROUND_SLAM_SUB_FLOOR_HZ = 42;

export function fmBellNotes(
  rarity: CardRarity,
): { freq: number; staggerSec: number; detuneCents?: number }[] {
  const baseNotes: Record<CardRarity, number[]> = {
    COMMON: [523.25],
    RARE: [523.25, 783.99],
    EPIC: [523.25, 659.25, 783.99],
    CHAOTIC: [523.25, 659.25, 830.61],
  };

  const stagger = [0, 0.06, 0.12];
  return baseNotes[rarity].map((freq, i) => ({
    freq,
    staggerSec: stagger[i] ?? i * 0.06,
    detuneCents: rarity === 'CHAOTIC' ? (i - 1) * 14 : 0,
  }));
}

export function playBufferOneShot(
  ctx: AudioContext,
  buffer: AudioBuffer,
  destination: AudioNode,
  when: number,
  playbackRate: number,
  gain: number,
): void {
  const source = ctx.createBufferSource();
  const gainNode = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  gainNode.gain.setValueAtTime(Math.max(gain, GAIN_FLOOR), when);
  source.connect(gainNode);
  gainNode.connect(destination);
  source.start(when);
  source.stop(when + buffer.duration / Math.max(playbackRate, 0.01) + 0.02);
}

export function playGroundSlam(
  ctx: AudioContext,
  pool: VoicePool,
  when: number,
  vz: number,
  archetype?: SpellArchetype,
): void {
  const k = groundSlamIntensity(vz);
  const duration = 0.35 + k * 0.45;
  const slot = pool.acquire(SFX_PRIORITY.CRITICAL, 'GROUND_SLAM', duration + 0.05);
  if (!slot) return;

  const inverted = archetype === 'VOID';
  const subStart = inverted ? GROUND_SLAM_SUB_FLOOR_HZ : groundSlamSubStartHz(vz);
  const subEnd = inverted ? 130 : GROUND_SLAM_SUB_FLOOR_HZ;

  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(subStart, when);
  sub.frequency.exponentialRampToValueAtTime(Math.max(subEnd, GAIN_FLOOR + 1), when + 0.18);
  subGain.gain.setValueAtTime(GAIN_FLOOR, when);
  subGain.gain.linearRampToValueAtTime(0.9 * k, when + 0.004);
  subGain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + duration);
  sub.connect(subGain);
  subGain.connect(slot.inputGain);

  const body = ctx.createOscillator();
  const bodyLp = ctx.createBiquadFilter();
  const bodyGain = ctx.createGain();
  body.type = 'triangle';
  body.frequency.value = 78;
  bodyLp.type = 'lowpass';
  bodyLp.frequency.value = 400;
  bodyGain.gain.setValueAtTime(GAIN_FLOOR, when);
  bodyGain.gain.linearRampToValueAtTime(0.45 * k, when + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + 0.14);
  body.connect(bodyLp);
  bodyLp.connect(bodyGain);
  bodyGain.connect(slot.inputGain);

  let longest: AudioScheduledSourceNode = sub;
  sub.start(when);
  sub.stop(when + duration + 0.02);
  body.start(when);
  body.stop(when + 0.16);

  if (archetype !== 'FROST') {
    const noise = ctx.createBufferSource();
    noise.buffer = createLfsrNoiseBuffer(ctx, 0.25, 15);
    const noiseLp = ctx.createBiquadFilter();
    const noiseHp = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();
    noiseLp.type = 'lowpass';
    noiseLp.frequency.setValueAtTime(3000, when);
    noiseLp.frequency.exponentialRampToValueAtTime(320, when + 0.16);
    noiseHp.type = 'highpass';
    noiseHp.frequency.value = 90;
    const noiseDur = archetype === 'FIRE' || archetype === 'PLASMA' ? 0.32 : 0.22;
    noiseGain.gain.setValueAtTime(0.5 * k, when);
    noiseGain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + noiseDur);
    noise.connect(noiseLp);
    noiseLp.connect(noiseHp);
    noiseHp.connect(noiseGain);
    noiseGain.connect(slot.inputGain);
    noise.start(when, Math.random() * 1.5);
    noise.stop(when + noiseDur + 0.02);
    longest = noise;
  }

  pool.connectSource(slot, longest, when + duration + 0.05);
}

export function playLaserRailgun(
  ctx: AudioContext,
  pool: VoicePool,
  when: number,
  speed: number,
  size: number,
  archetype?: SpellArchetype,
): void {
  const duration = 0.1 + clamp(size / 40, 0, 0.12);
  const slot = pool.acquire(SFX_PRIORITY.HIGH, 'CAST', duration + 0.05);
  if (!slot) return;

  const wave: OscillatorType =
    archetype === 'KINETIC'
      ? 'square'
      : archetype === 'PLASMA'
        ? 'sawtooth'
        : archetype === 'SONIC'
          ? 'triangle'
          : 'sawtooth';

  const f1 = clamp(900 + speed * 1.6, 900, 2600) * clamp(12 / Math.max(size, 1), 0.6, 1.6);
  const f2 = Math.max(f1 * 0.11, GAIN_FLOOR + 1);

  const osc = ctx.createOscillator();
  const det = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = wave;
  det.type = wave;
  osc.frequency.setValueAtTime(f1, when);
  det.frequency.setValueAtTime(f1, when);
  det.detune.value = 8;
  osc.frequency.exponentialRampToValueAtTime(f2, when + duration);
  det.frequency.exponentialRampToValueAtTime(f2, when + duration);
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(f1 * 3, when);
  lp.frequency.exponentialRampToValueAtTime(f2 * 3, when + duration);
  lp.Q.value = 11;

  gain.gain.setValueAtTime(GAIN_FLOOR, when);
  gain.gain.linearRampToValueAtTime(0.55, when + 0.002);
  gain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, when + duration * 1.15);

  osc.connect(lp);
  det.connect(lp);
  lp.connect(gain);
  gain.connect(slot.inputGain);
  osc.start(when);
  det.start(when);
  osc.stop(when + duration + 0.02);
  det.stop(when + duration + 0.02);

  pool.connectSource(slot, osc, when + duration + 0.05);
}

export function playFmRarityBell(
  ctx: AudioContext,
  destination: AudioNode,
  when: number,
  rarity: CardRarity,
): void {
  const notes = fmBellNotes(rarity);
  for (const note of notes) {
    const noteWhen = when + note.staggerSec;
    const duration = rarity === 'COMMON' ? 0.4 : rarity === 'RARE' ? 0.8 : 1.2;

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modIndex = ctx.createGain();
    const outGain = ctx.createGain();

    const ratio = rarity === 'CHAOTIC' ? 3.5 : 2.0;
    const index = rarity === 'EPIC' || rarity === 'CHAOTIC' ? 420 : 260;

    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.value = note.freq;
    mod.frequency.value = note.freq * ratio;
    if (note.detuneCents) carrier.detune.value = note.detuneCents;

    modIndex.gain.setValueAtTime(index, noteWhen);
    modIndex.gain.exponentialRampToValueAtTime(index * 0.02, noteWhen + duration * 0.25);

    outGain.gain.setValueAtTime(GAIN_FLOOR, noteWhen);
    outGain.gain.linearRampToValueAtTime(0.35, noteWhen + 0.006);
    outGain.gain.exponentialRampToValueAtTime(GAIN_FLOOR, noteWhen + duration);

    mod.connect(modIndex);
    modIndex.connect(carrier.frequency);
    carrier.connect(outGain);
    outGain.connect(destination);

    carrier.start(noteWhen);
    mod.start(noteWhen);
    carrier.stop(noteWhen + duration + 0.02);
    mod.stop(noteWhen + duration + 0.02);
  }
}

export class LavaSizzleLoop {
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly brownNoise: AudioBuffer,
  ) {}

  start(): void {
    if (this.source) return;

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.brownNoise;
    this.source.loop = true;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 420;
    bandpass.Q.value = 0.7;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.source.connect(bandpass);
    bandpass.connect(this.gain);
    this.gain.connect(this.destination);
    this.source.start();
  }

  setImmersion(level: number, now: number): void {
    if (!this.gain) return;
    const clamped = clamp(level, 0, 1);
    this.gain.gain.setTargetAtTime(clamped * 0.35, now, 0.15);
  }

  dispose(): void {
    try {
      this.source?.stop();
    } catch {
      // Already stopped.
    }
    this.source?.disconnect();
    this.gain?.disconnect();
    this.source = null;
    this.gain = null;
  }
}

export function scheduleLookahead(ctx: AudioContext): number {
  return ctx.currentTime + LOOKAHEAD_SEC;
}
