import type {Disposable} from '@/core/disposable';
import {createNoiseBuffer, glide} from './noise';

/** Vehicle telemetry the engine sound follows. */
export interface EngineTelemetry {
  speed: number;
  throttle: number;
  boosting: boolean;
  drifting: boolean;
  braking: boolean;
  slip: number;
}

/**
 * Tunable character of a procedural hover engine. Vehicles may ship their own
 * profile; every value has the original Biggas tuning as default.
 */
export interface EngineSoundProfile {
  /** Idle fundamental in Hz. */
  basePitch: number;
  /** Hz added at top speed (72 m/s). */
  speedPitch: number;
  /** Hz added at full throttle. */
  throttlePitch: number;
  /** Hz added while boosting. */
  boostPitch: number;
  topSpeed: number;
  maxThrottle: number;
}

export const DEFAULT_ENGINE_PROFILE: EngineSoundProfile = {
  basePitch: 48,
  speedPitch: 116,
  throttlePitch: 13,
  boostPitch: 22,
  topSpeed: 72,
  maxThrottle: 52,
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

interface ToneLayer {
  source: OscillatorNode;
  level: GainNode;
}

interface NoiseLayer {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  level: GainNode;
}

/**
 * Procedural hovercraft sound: a hum, a filtered turbine and a harmonic, plus
 * noise layers for wind, boost and drift. No downloads.
 */
export class EngineSynth implements Disposable {
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly hum: ToneLayer;
  private readonly turbine: ToneLayer;
  private readonly turbineFilter: BiquadFilterNode;
  private readonly harmonic: ToneLayer;
  private readonly air: NoiseLayer;
  private readonly boost: NoiseLayer;
  private readonly drift: NoiseLayer;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
    private profile: EngineSoundProfile = DEFAULT_ENGINE_PROFILE,
    private readonly noise: AudioBuffer = createNoiseBuffer(context),
  ) {
    this.hum = this.tone('triangle', 48, 0.16, destination);
    this.turbineFilter = this.track(context.createBiquadFilter());
    this.turbineFilter.type = 'lowpass';
    this.turbineFilter.frequency.value = 380;
    this.turbineFilter.Q.value = 0.6;
    this.turbineFilter.connect(destination);
    this.turbine = this.tone('sawtooth', 96, 0.035, this.turbineFilter);
    this.harmonic = this.tone('sine', 144, 0.025, destination);
    this.air = this.noiseLayer('lowpass', 600, 0.4);
    this.boost = this.noiseLayer('bandpass', 1700, 0.7);
    this.drift = this.noiseLayer('bandpass', 850, 2);
  }

  setProfile(profile: EngineSoundProfile): void {
    this.profile = profile;
  }

  update(state: EngineTelemetry): void {
    const {context, profile} = this;
    const speed = clamp(state.speed / profile.topSpeed);
    const throttle = clamp(state.throttle / profile.maxThrottle);
    const boosting = state.boosting ? 1 : 0;
    const pitch = profile.basePitch + speed * profile.speedPitch + throttle * profile.throttlePitch + boosting * profile.boostPitch;
    glide(this.hum.source.frequency, pitch, context);
    glide(this.turbine.source.frequency, pitch * 2.01, context);
    glide(this.harmonic.source.frequency, pitch * 3, context);
    glide(this.turbineFilter.frequency, 350 + speed * 1250 + boosting * 650, context);
    glide(this.hum.level.gain, 0.13 + throttle * 0.035, context);
    glide(this.turbine.level.gain, 0.025 + speed * 0.035, context);
    glide(this.air.level.gain, speed * speed * 0.28, context);
    glide(this.air.filter.frequency, 450 + speed * 2400, context);
    glide(this.boost.level.gain, boosting * 0.19, context, 0.12);
    glide(this.boost.filter.frequency, 1200 + speed * 1900, context);
    const slide = state.drifting ? clamp(Math.abs(state.slip) * 2.2) * clamp(state.speed / 18) : 0;
    glide(this.drift.level.gain, slide * 0.22 + (state.braking ? speed * 0.09 : 0), context, 0.06);
    glide(this.drift.filter.frequency, 600 + slide * 1300 + speed * 350, context);
  }

  dispose(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    for (const node of this.nodes) node.disconnect();
  }

  private track<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  private gain(value: number, destination: AudioNode): GainNode {
    const node = this.track(this.context.createGain());
    node.gain.value = value;
    node.connect(destination);
    return node;
  }

  private tone(type: OscillatorType, frequency: number, volume: number, destination: AudioNode): ToneLayer {
    const source = this.track(this.context.createOscillator());
    const level = this.gain(volume, destination);
    source.type = type;
    source.frequency.value = frequency;
    source.connect(level);
    source.start();
    this.sources.push(source);
    return {source, level};
  }

  private noiseLayer(type: BiquadFilterType, frequency: number, q: number): NoiseLayer {
    const source = this.track(this.context.createBufferSource());
    const filter = this.track(this.context.createBiquadFilter());
    const level = this.gain(0, this.destination);
    source.buffer = this.noise;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter);
    filter.connect(level);
    source.start();
    this.sources.push(source);
    return {source, filter, level};
  }
}
