import { buildPreBakedBanks, type PreBakedBanks } from './bufferBanks';
import {
  loadAudioSettings,
  subscribeAudioSettings,
  type AudioSettings,
} from './audioSettings';
import {
  debrisClinkGain,
  debrisClinkPlaybackRate,
  LavaSizzleLoop,
  playBufferOneShot,
  playFmRarityBell,
  playGroundSlam,
  playLaserRailgun,
  scheduleLookahead,
} from './recipes';
import { NULL_SFX, type SfxEvent, type SfxSink } from './types';
import { VoicePool } from './VoicePool';

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export const HAS_WEB_AUDIO = getAudioContextCtor() !== null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private graphReady = false;
  private blurMuted = false;

  private masterHp: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private combatBus: GainNode | null = null;
  private debrisBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private uiDelay: DelayNode | null = null;
  private uiDelayFeedback: GainNode | null = null;

  private banks: PreBakedBanks | null = null;
  private banksReady = false;
  private banksPromise: Promise<void> | null = null;
  private combatPool: VoicePool | null = null;
  private lavaLoop: LavaSizzleLoop | null = null;
  private debrisBusBaseGain = 1;

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

    if (!this.banksPromise) {
      this.banksPromise = this.bootstrapAudioAssets();
    }
  }

  emit(event: SfxEvent): void {
    const settings = loadAudioSettings();
    if (!settings.audioEnabled) return;
    if (!this.ctx || this.ctx.state !== 'running' || !this.graphReady || !this.banksReady) return;

    if (event.kind === 'DEBRIS_CLINK' && !settings.debrisSfxEnabled) return;

    const when = scheduleLookahead(this.ctx);
    const banks = this.banks!;

    switch (event.kind) {
      case 'DEBRIS_CLINK': {
        const playbackRate =
          debrisClinkPlaybackRate(event.radius) * (0.97 + Math.random() * 0.06);
        const gain = debrisClinkGain(event.vz, event.bounceIndex);
        playBufferOneShot(
          this.ctx,
          banks.debrisClinks.pick(),
          this.debrisBus!,
          when,
          playbackRate,
          gain,
        );
        break;
      }
      case 'GROUND_SLAM': {
        this.duckDebrisBus(when);
        playGroundSlam(this.ctx, this.combatPool!, when, event.vz, event.archetype);
        break;
      }
      case 'CAST': {
        playLaserRailgun(
          this.ctx,
          this.combatPool!,
          when,
          event.speed,
          event.size,
          event.archetype,
        );
        break;
      }
      case 'IMPACT':
      case 'BOUNCE': {
        const playbackRate = clamp(event.speed / 400, 0.7, 2.0);
        const gain = event.kind === 'IMPACT' && event.heavy ? 0.55 : 0.35;
        playBufferOneShot(
          this.ctx,
          banks.sparks.pick(),
          this.combatBus!,
          when,
          playbackRate,
          gain,
        );
        break;
      }
      case 'LAUNCH_VERTICAL': {
        const playbackRate = clamp(event.vz / 300, 1.2, 2.5);
        playBufferOneShot(
          this.ctx,
          banks.sparks.pick(),
          this.combatBus!,
          when,
          playbackRate,
          0.4,
        );
        break;
      }
      case 'UI': {
        if (event.action === 'TAB' || event.action === 'SYNTH_DONE') {
          playBufferOneShot(
            this.ctx,
            banks.uiBlips.pick(),
            this.uiBus!,
            when,
            1,
            0.45,
          );
        } else {
          playFmRarityBell(this.ctx, this.uiBus!, when, event.rarity ?? 'COMMON');
        }
        break;
      }
      case 'LAVA_SURFACE': {
        this.lavaLoop?.setImmersion(event.immersion, when);
        break;
      }
    }
  }

  update(nowSec: number): void {
    this.combatPool?.sweep(nowSec);
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
    this.debrisBusBaseGain = debrisGain;
    this.debrisBus?.gain.setTargetAtTime(debrisGain, now, 0.03);
    this.uiBus?.gain.setTargetAtTime(uiGain, now, 0.03);
    this.syncMasterGain(settings);
  }

  dispose(): void {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;

    this.lavaLoop?.dispose();
    this.lavaLoop = null;
    this.combatPool = null;
    this.banks = null;
    this.banksReady = false;
    this.banksPromise = null;

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
    this.ambientBus = null;
    this.uiDelay = null;
    this.uiDelayFeedback = null;
    AudioEngine.instance = null;
  }

  private async bootstrapAudioAssets(): Promise<void> {
    if (!this.ctx || this.banksReady) return;

    const banks = await buildPreBakedBanks(this.ctx);
    this.banks = banks;
    this.combatPool = new VoicePool(this.ctx, this.combatBus!, 16);
    this.lavaLoop = new LavaSizzleLoop(this.ctx, this.ambientBus!, banks.brownNoise);
    this.lavaLoop.start();
    this.banksReady = true;
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
    this.ambientBus = ctx.createGain();

    this.uiDelay = ctx.createDelay(0.5);
    this.uiDelay.delayTime.value = 0.12;
    this.uiDelayFeedback = ctx.createGain();
    this.uiDelayFeedback.gain.value = 0.25;

    this.combatBus.connect(this.masterHp);
    this.debrisBus.connect(this.masterHp);
    this.uiBus.connect(this.masterHp);
    this.ambientBus.connect(this.masterHp);

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

  private duckDebrisBus(now: number): void {
    if (!this.debrisBus) return;
    const base = this.debrisBusBaseGain;
    this.debrisBus.gain.setTargetAtTime(base * 0.35, now, 0.02);
    this.debrisBus.gain.setTargetAtTime(base, now + 0.2, 0.05);
  }

  private syncMasterGain(settings: AudioSettings): void {
    if (!this.masterGain || !this.ctx) return;

    const now = this.ctx.currentTime;
    const target =
      settings.audioEnabled && !this.blurMuted ? settings.masterVolume : 0.0001;
    this.masterGain.gain.setTargetAtTime(target, now, 0.05);
  }
}

export const LIVE_SFX: SfxSink = HAS_WEB_AUDIO
  ? { emit: (event) => AudioEngine.getInstance().emit(event) }
  : NULL_SFX;
