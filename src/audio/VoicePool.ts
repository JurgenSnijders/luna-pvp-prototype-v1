import type { SfxPriority } from './types';

const STEAL_FADE_SEC = 0.008;

export interface VoiceSlot {
  id: number;
  inputGain: GainNode;
  filter: BiquadFilterNode;
  priority: number;
  classId: string;
  startedAt: number;
  releaseAt: number;
  active: boolean;
  activeSource?: AudioScheduledSourceNode | null;
}

export class VoicePool {
  private readonly slots: VoiceSlot[] = [];

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    maxVoices = 16,
  ) {
    for (let i = 0; i < maxVoices; i++) {
      const inputGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 8000;
      filter.Q.value = 0.7;
      inputGain.connect(filter);
      filter.connect(destination);

      this.slots.push({
        id: i,
        inputGain,
        filter,
        priority: 0,
        classId: '',
        startedAt: 0,
        releaseAt: 0,
        active: false,
        activeSource: null,
      });
    }
  }

  acquire(priority: SfxPriority, classId: string, durationSec: number): VoiceSlot | null {
    const now = this.ctx.currentTime;
    const inactive = this.slots.find((slot) => !slot.active);
    if (inactive) {
      this.activateSlot(inactive, priority, classId, now, durationSec);
      return inactive;
    }

    const stealCandidates = this.slots.filter((slot) => slot.priority < priority);
    if (stealCandidates.length === 0) {
      const sameClass = this.slots.filter(
        (slot) => slot.active && slot.classId === classId && slot.priority === priority,
      );
      const progressed = sameClass.find((slot) => {
        const span = Math.max(slot.releaseAt - slot.startedAt, 0.0001);
        return (now - slot.startedAt) / span > 0.6;
      });
      if (!progressed) return null;
      this.stealSlot(progressed, now);
      this.activateSlot(progressed, priority, classId, now + STEAL_FADE_SEC, durationSec);
      return progressed;
    }

    stealCandidates.sort((a, b) => {
      const releaseDelta = a.releaseAt - b.releaseAt;
      if (Math.abs(releaseDelta) > 0.0001) return releaseDelta;
      return a.startedAt - b.startedAt;
    });

    const victim = stealCandidates[0];
    this.stealSlot(victim, now);
    this.activateSlot(victim, priority, classId, now + STEAL_FADE_SEC, durationSec);
    return victim;
  }

  connectSource(slot: VoiceSlot, source: AudioScheduledSourceNode, releaseAt: number): void {
    slot.activeSource = source;
    slot.releaseAt = releaseAt;
  }

  sweep(now: number): void {
    for (const slot of this.slots) {
      if (!slot.active || now < slot.releaseAt) continue;
      slot.activeSource?.disconnect();
      slot.activeSource = null;
      slot.active = false;
      slot.inputGain.gain.cancelScheduledValues(now);
      slot.inputGain.gain.setValueAtTime(1, now);
    }
  }

  private activateSlot(
    slot: VoiceSlot,
    priority: SfxPriority,
    classId: string,
    when: number,
    durationSec: number,
  ): void {
    slot.active = true;
    slot.priority = priority;
    slot.classId = classId;
    slot.startedAt = when;
    slot.releaseAt = when + durationSec;
    slot.activeSource = null;
    slot.inputGain.gain.cancelScheduledValues(when);
    slot.inputGain.gain.setValueAtTime(1, when);
  }

  private stealSlot(slot: VoiceSlot, now: number): void {
    slot.inputGain.gain.cancelScheduledValues(now);
    slot.inputGain.gain.setValueAtTime(Math.max(slot.inputGain.gain.value, GAIN_FLOOR), now);
    slot.inputGain.gain.linearRampToValueAtTime(GAIN_FLOOR, now + STEAL_FADE_SEC);
    try {
      slot.activeSource?.stop(now + STEAL_FADE_SEC + 0.001);
    } catch {
      // Source may already be stopped.
    }
    slot.activeSource?.disconnect();
    slot.activeSource = null;
  }
}

const GAIN_FLOOR = 0.0001;
