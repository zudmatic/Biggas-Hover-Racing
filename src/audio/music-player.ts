import {publicUrl} from '@/core/assets/asset-loader';
import {DisposableGroup} from '@/core/disposable';
import {settings} from '@/core/settings';
import type {AudioBus} from './audio-bus';
import {musicCues} from './catalog';

export type MusicStatus = 'idle' | 'loading' | 'playing' | 'blocked' | 'unavailable';

export interface MusicState {
  track: string | null;
  status: MusicStatus;
  enabled: boolean;
  volume: number;
}

/** Screen the music follows. `lobby` = menus; driving phases use the track's cue. */
export type MusicScene = 'lobby' | 'race' | 'none';

const FADE = 0.35;

interface Player {
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
}

/**
 * Streams one looping music cue at a time. Elements are created lazily and
 * keep their position across menu steps. Once the AudioSystem has a context
 * the elements route through its music bus (volume, mute, ducking,
 * crossfades); before that their own `volume` is used.
 */
export class MusicPlayer {
  private readonly players = new Map<string, Player>();
  private readonly listeners = new Set<(state: MusicState) => void>();
  private readonly events = new DisposableGroup();
  private scene: MusicScene = 'none';
  private track: string | null = null;
  private raceCue = 'race';
  private enabled = settings.get('soundEnabled');
  private unlocked = false;
  private disposed = false;
  private generation = 0;
  private status: MusicStatus = 'idle';
  private current: Player | null = null;
  private context: AudioContext | null = null;
  private bus: AudioBus | null = null;

  constructor() {
    if (typeof document === 'undefined') return;
    this.events.listen(document, 'visibilitychange', () => this.synchronize());
    this.events.listen(window, 'blur', () => {
      ++this.generation;
      this.pauseAll();
      this.publish('idle');
    });
    this.events.listen(window, 'focus', () => {
      if (this.scene === 'lobby') this.synchronize();
    });
  }

  get state(): MusicState {
    return {track: this.track, status: this.status, enabled: this.enabled, volume: settings.get('musicVolume')};
  }

  subscribe(listener: (state: MusicState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Routes playback through the mixer. Called once by the AudioSystem. */
  attach(context: AudioContext, bus: AudioBus): void {
    this.context = context;
    this.bus = bus;
    bus.setVolume(settings.get('musicVolume'), 0);
    for (const player of this.players.values()) this.route(player);
  }

  /** Must run inside a user gesture (autoplay policy). */
  unlock(): void {
    if (this.disposed) return;
    this.unlocked = true;
    this.synchronize();
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    this.synchronize();
  }

  /** Cue played while driving, e.g. the track's `music` id. */
  setRaceTrack(id: string): void {
    this.raceCue = musicCues.has(id) ? id : 'race';
    this.setScene(this.scene);
  }

  setScene(scene: MusicScene): void {
    this.scene = scene;
    const next = scene === 'lobby' ? 'menu' : scene === 'race' ? this.raceCue : null;
    if (next === this.track) return;
    this.track = next;
    this.synchronize();
  }

  setVolume(value: number): void {
    if (this.disposed || !Number.isFinite(value)) return;
    settings.set('musicVolume', value);
    const volume = settings.get('musicVolume');
    if (this.bus) this.bus.setVolume(volume);
    else for (const player of this.players.values()) player.element.volume = volume;
    this.publish(this.status);
  }

  /** Lowers the music under dialogue; 0 restores it. */
  duck(amount: number): void {
    this.bus?.duck(amount);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    this.events.dispose();
    this.pauseAll();
    for (const player of this.players.values()) {
      player.element.removeAttribute('src');
      player.element.load();
      player.source?.disconnect();
      player.gain?.disconnect();
    }
    this.players.clear();
    this.listeners.clear();
  }

  private publish(status: MusicStatus): void {
    this.status = status;
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }

  private pauseAll(): void {
    this.current = null;
    for (const player of this.players.values()) player.element.pause();
  }

  private player(id: string): Player | null {
    const cue = musicCues.get(id);
    if (!cue) return null;
    let player = this.players.get(id);
    if (!player) {
      const element = new Audio();
      element.preload = 'none';
      element.loop = true;
      element.crossOrigin = 'anonymous';
      element.volume = this.bus ? 1 : settings.get('musicVolume');
      element.src = publicUrl(cue.file);
      const created: Player = {element, source: null, gain: null};
      this.events.listen(element, 'error', () => {
        if (this.current === created) this.publish('unavailable');
      });
      this.route(created);
      this.players.set(id, created);
      player = created;
    }
    return player;
  }

  private route(player: Player): void {
    if (!this.context || !this.bus || player.source) return;
    player.element.volume = 1;
    player.source = this.context.createMediaElementSource(player.element);
    player.gain = this.context.createGain();
    player.source.connect(player.gain);
    player.gain.connect(this.bus.input);
  }

  private fade(player: Player, to: number): void {
    if (!player.gain || !this.context) return;
    player.gain.gain.setTargetAtTime(to, this.context.currentTime, FADE / 3);
  }

  private synchronize(): void {
    if (this.disposed || !this.enabled || !this.unlocked || document.hidden || !this.track) {
      ++this.generation;
      this.pauseAll();
      this.publish('idle');
      return;
    }
    const player = this.player(this.track);
    if (!player) {
      ++this.generation;
      this.pauseAll();
      this.publish('unavailable');
      return;
    }
    if (this.current === player && (this.status === 'playing' || this.status === 'loading')) return;
    const token = ++this.generation;
    const previous = this.current;
    this.current = player;
    for (const other of this.players.values()) {
      if (other === player) continue;
      // Crossfade when routed through the mixer; otherwise stop immediately.
      if (other === previous && other.gain) {
        this.fade(other, 0);
        window.setTimeout(() => {
          if (this.current !== other) other.element.pause();
        }, FADE * 1000);
      } else other.element.pause();
    }
    if (player.gain && this.context) player.gain.gain.setValueAtTime(previous ? 0 : 1, this.context.currentTime);
    this.publish('loading');
    Promise.resolve(player.element.play())
      .then(() => {
        if (this.disposed || token !== this.generation) {
          if (this.disposed || !this.enabled || document.hidden || this.current !== player) player.element.pause();
          return;
        }
        this.fade(player, 1);
        this.publish('playing');
      })
      .catch((error: unknown) => {
        if (token === this.generation && !this.disposed)
          this.publish(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'unavailable');
      });
  }
}
