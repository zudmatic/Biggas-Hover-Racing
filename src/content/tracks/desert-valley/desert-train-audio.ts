import {Vector3, type Camera} from 'three';
import {audio} from '@/audio/audio-system';
import type {SpatialEmitter} from '@/audio/spatial/spatial-emitter';
import type {GamePhase} from '@/core/types';
import type {DesertTrain} from './desert-train';

export const TRAIN_AUDIO_SETTINGS = Object.freeze({
  rollingVolume: 0.9,
  rollingRefDistance: 18,
  rollingMaxDistance: 150,
  hornVolume: 1.1,
  hornRefDistance: 28,
  hornMaxDistance: 210,
});

// Two sources for the whole formation. The rolling emitter slides along the
// closest visible wagon; the horn stays on the locomotive in world space.
export class DesertTrainAudio {
  private readonly position = new Vector3();
  private readonly events = new AbortController();
  private disposed = false;
  private buffers: [AudioBuffer | null, AudioBuffer | null] | null = null;
  private loading: Promise<void> | null = null;
  private rolling: SpatialEmitter | null = null;
  private horn: SpatialEmitter | null = null;
  private lastHornPass = -1;

  constructor(private readonly train: DesertTrain) {
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.silence();
      },
      {signal: this.events.signal},
    );
  }

  update(camera: Camera, phase: GamePhase): void {
    if (this.disposed) return;
    if (!audio.worldActive || phase !== 'flying') {
      this.silence();
      return;
    }
    this.loading ??= Promise.all([audio.sounds.load('train.rolling'), audio.sounds.load('train.horn')]).then((buffers) => {
      if (!this.disposed) this.buffers = buffers;
    });
    camera.getWorldPosition(this.position);
    const state = this.train.audioState(this.position);
    const config = TRAIN_AUDIO_SETTINGS;
    if (!state.active || !this.buffers) {
      this.silence();
      return;
    }
    this.rolling ??= audio.createEmitter(state.rolling, {
      refDistance: config.rollingRefDistance,
      maxDistance: config.rollingMaxDistance,
      volume: config.rollingVolume,
    });
    this.horn ??= audio.createEmitter(state.locomotive, {
      refDistance: config.hornRefDistance,
      maxDistance: config.hornMaxDistance,
      volume: config.hornVolume,
    });
    this.rolling?.setPosition(state.rolling);
    this.horn?.setPosition(state.locomotive);
    const [rollingBuffer, hornBuffer] = this.buffers;
    if (this.position.distanceTo(state.rolling) < config.rollingMaxDistance && rollingBuffer) {
      if (!this.rolling?.playing) this.rolling?.play(rollingBuffer, {loop: true});
    } else this.rolling?.stop();
    if (
      hornBuffer &&
      state.locomotiveVisible &&
      this.lastHornPass !== state.passId &&
      this.position.distanceTo(state.locomotive) < config.hornMaxDistance * 0.8
    ) {
      this.horn?.play(hornBuffer);
      this.lastHornPass = state.passId;
    }
    audio.updateListener(camera);
  }

  reset(): void {
    this.silence();
    this.lastHornPass = -1;
  }

  dispose(): void {
    this.disposed = true;
    this.events.abort();
    this.rolling?.dispose();
    this.horn?.dispose();
    this.rolling = this.horn = null;
    this.buffers = null;
  }

  private silence(): void {
    this.rolling?.stop();
    this.horn?.stop();
  }
}
