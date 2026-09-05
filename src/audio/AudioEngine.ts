import {
  loadAudioSettings,
  subscribeAudioSettings,
  type AudioSettings,
} from './audioSettings';
import { NULL_SFX, type SfxEvent, type SfxSink } from './types';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export const HAS_WEB_AUDIO = getAudioContextCtor() !== null;

const STUB_TICK_MS = 0.004;
const STUB_TICK_GAIN = 0.02;

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private graphReady = false;
  private blurMuted = false;
  private lastLavaImmersion = 0;

  private masterHp: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private combatBus: GainNode | null = null;
  private debrisBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private uiDelay: DelayNode | null = null;
  private uiDelayFeedback: GainNode | null = null;

  private unsubscribeSettings: (() => void) | null = null;

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  unlockFromUserGesture(): void {
    if (!HAS_WEB_AUDIO) return;

    const AudioCtx = getAudioContextCtor();
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.initGraph();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  emit(event: SfxEvent): void {
    const settings = loadAudioSettings();
    if (!settings.audioEnabled) return;
    if (!this.ctx || this.ctx.state !== 'running' || !this.graphReady) return;

    if (event.kind === 'LAVA_SURFACE') {
      this.lastLavaImmersion = event.immersion;
      return;
    }

    if (event.kind === 'DEBRIS_CLINK' && !settings.debrisSfxEnabled) return;

    const bus = this.resolveBus(event);
    if (!bus) return;

    this.playStubTick(bus);
  }

  setBlurMuted(muted: boolean): void {
    this.blurMuted = muted;
    this.syncMasterGain(loadAudioSettings());
  }

  applySettings(settings: AudioSettings): void {
    if (!this.graphReady) return;

    const now = this.ctx?.currentTime ?? 0;
    const combatGain = settings.audioEnabled
      ? settings.masterVolume * settings.sfxVolume
      : 0.0001;
    const debrisGain = settings.audioEnabled && settings.debrisSfxEnabled
      ? settings.masterVolume * settings.sfxVolume
      : 0.0001;
    const uiGain = settings.audioEnabled
      ? settings.masterVolume * settings.uiVolume
      : 0.0001;

    this.combatBus?.gain.setTargetAtTime(combatGain, now, 0.03);
    this.debrisBus?.gain.setTargetAtTime(debrisGain, now, 0.03);
    this.uiBus?.gain.setTargetAtTime(uiGain, now, 0.03);
    this.syncMasterGain(settings);
  }

  dispose(): void {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;

    if (this.ctx) {
      void this.ctx.close();
    }

    this.ctx = null;
    this.graphReady = false;
    this.masterHp = null;
    this.masterGain = null;
    this.masterCompressor = null;
    this.combatBus = null;
    this.debrisBus = null;
    this.uiBus = null;
    this.uiDelay = null;
    this.uiDelayFeedback = null;
    AudioEngine.instance = null;
  }

  private initGraph(): void {
    if (!this.ctx || this.graphReady) return;

    const ctx = this.ctx;

    this.masterHp = ctx.createBiquadFilter();
    this.masterHp.type = 'highpass';
    this.masterHp.frequency.value = 30;
    this.masterHp.Q.value = 0.707;

    this.masterGain = ctx.createGain();
    this.masterCompressor = ctx.createDynamicsCompressor();
    this.masterCompressor.threshold.value = -8;
    this.masterCompressor.knee.value = 6;
    this.masterCompressor.ratio.value = 12;
    this.masterCompressor.attack.value = 0.003;
    this.masterCompressor.release.value = 0.15;

    this.combatBus = ctx.createGain();
    this.debrisBus = ctx.createGain();
    this.uiBus = ctx.createGain();

    this.uiDelay = ctx.createDelay(0.5);
    this.uiDelay.delayTime.value = 0.12;
    this.uiDelayFeedback = ctx.createGain();
    this.uiDelayFeedback.gain.value = 0.25;

    this.combatBus.connect(this.masterHp);
    this.debrisBus.connect(this.masterHp);
    this.uiBus.connect(this.masterHp);

    this.uiBus.connect(this.uiDelay);
    this.uiDelay.connect(this.uiDelayFeedback);
    this.uiDelayFeedback.connect(this.uiDelay);
    this.uiDelay.connect(this.masterHp);

    this.masterHp.connect(this.masterGain);
    this.masterGain.connect(this.masterCompressor);
    this.masterCompressor.connect(ctx.destination);

    this.graphReady = true;

    if (!this.unsubscribeSettings) {
      this.unsubscribeSettings = subscribeAudioSettings((settings) => {
        this.applySettings(settings);
      });
    }

    this.applySettings(loadAudioSettings());
  }

  private resolveBus(event: SfxEvent): GainNode | null {
    switch (event.kind) {
      case 'IMPACT':
      case 'GROUND_SLAM':
      case 'BOUNCE':
      case 'CAST':
      case 'LAUNCH_VERTICAL':
        return this.combatBus;
      case 'DEBRIS_CLINK':
        return this.debrisBus;
      case 'UI':
        return this.uiBus;
      default:
        return null;
    }
  }

  private syncMasterGain(settings: AudioSettings): void {
    if (!this.masterGain || !this.ctx) return;

    const now = this.ctx.currentTime;
    const target =
      settings.audioEnabled && !this.blurMuted ? settings.masterVolume : 0.0001;
    this.masterGain.gain.setTargetAtTime(target, now, 0.05);
  }

  private playStubTick(bus: GainNode): void {
    if (!this.ctx) return;

    const now = this.ctx.currentTime + 0.01;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(STUB_TICK_GAIN, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + STUB_TICK_MS);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(now);
    osc.stop(now + STUB_TICK_MS + 0.001);
  }
}

export const LIVE_SFX: SfxSink = HAS_WEB_AUDIO
  ? { emit: (event) => AudioEngine.getInstance().emit(event) }
  : NULL_SFX;
