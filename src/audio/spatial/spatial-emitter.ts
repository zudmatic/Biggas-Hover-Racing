import {MathUtils, type Vector3} from 'three';
import type {Disposable} from '@/core/disposable';

export interface SpatialEmitterOptions {
  /** Distance (m) at which the sound plays at full volume. */
  refDistance: number;
  /** Beyond this distance (m) the emitter is silent. */
  maxDistance: number;
  rolloff?: number;
  volume?: number;
  /**
   * Fraction of `maxDistance` over which the sound fades out explicitly.
   * Inverse attenuation alone never reaches silence, so a sound would remain
   * audible across the whole map without this.
   */
  fadeOuter?: number;
}

interface Voice {
  source: AudioBufferSourceNode;
  panner: PannerNode;
  gain: GainNode;
}

/**
 * A positional sound source (HRTF panner + distance fade). Owners move it with
 * `setPosition`, start/stop it, and call `update(listenerPosition)` each frame.
 */
export class SpatialEmitter implements Disposable {
  private voice: Voice | null = null;
  private readonly options: Required<SpatialEmitterOptions>;
  private readonly position: Vector3;

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
    position: Vector3,
    options: SpatialEmitterOptions,
  ) {
    this.options = {rolloff: 1.5, volume: 1, fadeOuter: 0.35, ...options};
    this.position = position.clone();
  }

  get playing(): boolean {
    return this.voice !== null;
  }

  get maxDistance(): number {
    return this.options.maxDistance;
  }

  setVolume(volume: number): void {
    this.options.volume = volume;
  }

  /** Starts `buffer` at the current position, replacing any playing voice. */
  play(buffer: AudioBuffer, {loop = false}: {loop?: boolean} = {}): void {
    this.stop();
    const {context, options} = this;
    const source = context.createBufferSource();
    const panner = context.createPanner();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = options.refDistance;
    panner.maxDistance = options.maxDistance;
    panner.rolloffFactor = options.rolloff;
    gain.gain.value = 0;
    source.connect(panner);
    panner.connect(gain);
    gain.connect(this.destination);
    // Set the initial point immediately so a new voice never sweeps from the origin.
    setPannerPosition(panner, this.position, context, 0);
    const voice: Voice = {source, panner, gain};
    source.onended = () => {
      disconnect(voice);
      if (this.voice === voice) this.voice = null;
    };
    source.start();
    this.voice = voice;
  }

  stop(): void {
    const voice = this.voice;
    if (!voice) return;
    this.voice = null;
    try {
      voice.source.stop();
    } catch {
      // Already stopped.
    }
    disconnect(voice);
  }

  setPosition(position: Vector3): void {
    this.position.copy(position);
  }

  /** Applies position smoothing and the distance fade relative to the listener. */
  update(listener: Vector3): void {
    const voice = this.voice;
    if (!voice) return;
    const {context, options} = this;
    setPannerPosition(voice.panner, this.position, context, 0.025);
    const distance = listener.distanceTo(this.position);
    const fade = MathUtils.clamp((options.maxDistance - distance) / (options.maxDistance * options.fadeOuter), 0, 1);
    voice.gain.gain.setTargetAtTime(options.volume * fade * fade, context.currentTime, 0.055);
  }

  dispose(): void {
    this.stop();
  }
}

function setPannerPosition(panner: PannerNode, p: Vector3, context: BaseAudioContext, smoothing: number): void {
  if (!panner.positionX) {
    panner.setPosition(p.x, p.y, p.z);
    return;
  }
  if (smoothing <= 0) {
    panner.positionX.value = p.x;
    panner.positionY.value = p.y;
    panner.positionZ.value = p.z;
    return;
  }
  const now = context.currentTime;
  panner.positionX.setTargetAtTime(p.x, now, smoothing);
  panner.positionY.setTargetAtTime(p.y, now, smoothing);
  panner.positionZ.setTargetAtTime(p.z, now, smoothing);
}

function disconnect(voice: Voice): void {
  voice.source.disconnect();
  voice.panner.disconnect();
  voice.gain.disconnect();
}
