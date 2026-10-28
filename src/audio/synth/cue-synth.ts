import type {Disposable} from '@/core/disposable';
import {createNoiseBuffer} from './noise';

export type CueName = 'impact' | 'countdown' | 'ignition' | 'go' | 'checkpoint' | 'recover' | 'finish';

interface ToneOptions {
  delay?: number;
  end?: number;
  type?: OscillatorType;
  /** Use the noise buffer instead of an oscillator. */
  noise?: boolean;
}

interface Voice {
  source: AudioScheduledSourceNode;
  level: GainNode;
}

const MAX_VOICES = 20;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * Short procedural race cues (impacts, countdown beeps, chimes). Each cue is a
 * few enveloped tones; add a cue by extending `CueName` and `play`.
 */
export class CueSynth implements Disposable {
  private readonly voices = new Set<Voice>();
  private lastImpact = -Infinity;
  private lastCountdown = 0;
  lastCue: CueName | '' = '';

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
    private readonly noise: AudioBuffer = createNoiseBuffer(context),
  ) {}

  get activeVoices(): number {
    return this.voices.size;
  }

  play(name: CueName, intensity = 1): void {
    switch (name) {
      case 'impact': {
        if (this.context.currentTime - this.lastImpact < 0.18) return;
        this.lastImpact = this.context.currentTime;
        const strength = clamp(intensity / 14, 0.15, 1);
        this.tone(100, 0.22, 0.23 * strength, {end: 32, type: 'triangle'});
        this.tone(0, 0.09, 0.11 * strength, {noise: true});
        break;
      }
      case 'countdown':
        if (this.lastCountdown === intensity) return;
        this.lastCountdown = intensity;
        this.tone(520, 0.13, 0.12, {type: 'triangle'});
        break;
      case 'ignition':
        this.tone(42, 0.9, 0.2, {end: 120, type: 'sawtooth'});
        this.tone(0, 0.35, 0.12, {noise: true});
        this.tone(880, 0.12, 0.06, {delay: 0.55, type: 'triangle'});
        break;
      case 'go':
        this.tone(784, 0.15, 0.13, {type: 'triangle'});
        this.tone(1568, 0.32, 0.1, {delay: 0.08});
        break;
      case 'checkpoint':
        this.tone(660, 0.12, 0.1);
        this.tone(990, 0.2, 0.1, {delay: 0.085});
        break;
      case 'recover':
        this.tone(330, 0.16, 0.1, {end: 165, type: 'triangle'});
        this.tone(440, 0.24, 0.08, {delay: 0.14, end: 660});
        break;
      case 'finish':
        [523.25, 659.25, 783.99, 1046.5].forEach((note, i) =>
          this.tone(note, i === 3 ? 0.65 : 0.22, 0.12, {delay: i * 0.13, type: 'triangle'}),
        );
        break;
    }
    this.lastCue = name;
  }

  /** Forget countdown dedupe when a countdown ends. */
  resetCountdown(): void {
    this.lastCountdown = 0;
  }

  stopAll(): void {
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        // Already stopped.
      }
      voice.source.disconnect();
      voice.level.disconnect();
    }
    this.voices.clear();
  }

  dispose(): void {
    this.stopAll();
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    {delay = 0, end = frequency, type = 'sine', noise = false}: ToneOptions = {},
  ): void {
    if (this.voices.size >= MAX_VOICES) return;
    const {context} = this;
    const start = context.currentTime + delay;
    const level = context.createGain();
    level.gain.value = 0;
    level.connect(this.destination);
    let source: AudioScheduledSourceNode;
    if (noise) {
      const buffer = context.createBufferSource();
      buffer.buffer = this.noise;
      source = buffer;
    } else {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
      source = oscillator;
    }
    level.gain.setValueAtTime(0, start);
    level.gain.linearRampToValueAtTime(volume, start + 0.008);
    level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(level);
    const voice: Voice = {source, level};
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      level.disconnect();
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(start + duration + 0.02);
  }
}
