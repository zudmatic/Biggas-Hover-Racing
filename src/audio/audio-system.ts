import type {Camera, Vector3} from 'three';
import {DisposableGroup, type Disposable} from '@/core/disposable';
import {settings} from '@/core/settings';
import type {GamePhase} from '@/core/types';
import {AudioBus} from './audio-bus';
import type {SoundBus} from './catalog';
import {MusicPlayer} from './music-player';
import {SoundBank} from './sound-bank';
import {ListenerRig} from './spatial/listener-rig';
import {SpatialEmitter, type SpatialEmitterOptions} from './spatial/spatial-emitter';
import {CueSynth, type CueName} from './synth/cue-synth';
import {EngineSynth, type EngineSoundProfile, type EngineTelemetry} from './synth/engine-synth';
import {createNoiseBuffer} from './synth/noise';
import {VoiceSystem, type BabbleOptions} from './voice-system';

/** Game phases plus the menus. Controls which buses are audible. */
export type AudioPhase = GamePhase | 'lobby';

const RACE_PHASES: readonly AudioPhase[] = ['flying', 'countdown', 'intro'];
const MUSIC_RACE_PHASES: readonly AudioPhase[] = ['flying', 'countdown', 'intro', 'finished'];

/**
 * The mixer:
 *
 *   destination ← master (sound on/off)
 *                   ├─ music   (music volume, ducked under voices)
 *                   ├─ voice   (voice volume)
 *                   └─ compressor ← effects (effects volume)
 *                                     ├─ engine  (procedural hover engine; gated by phase)
 *                                     ├─ world   (3D emitters: train, props…; audible while flying)
 *                                     ├─ cues    (race cues: impacts, countdown…)
 *                                     └─ ui      (menu sounds)
 */
interface Buses {
  master: AudioBus;
  music: AudioBus;
  voice: AudioBus;
  effects: AudioBus;
  engine: AudioBus;
  world: AudioBus;
  cues: AudioBus;
  ui: AudioBus;
}

/** Effects were mixed at 0.55 of the slider value before the compressor. */
const EFFECTS_HEADROOM = 0.55;

/**
 * Owns the single AudioContext (created on the first user gesture), the bus
 * tree, music, sampled sounds, 3D emitters, the procedural engine/cues and
 * character voices. Settings (volumes, mute) are applied automatically.
 */
export class AudioSystem implements Disposable {
  readonly music = new MusicPlayer();
  readonly sounds = new SoundBank(() => this.context);
  readonly voices = new VoiceSystem(
    () => (this.context && this.buses ? {context: this.context, destination: this.buses.voice.input} : null),
    (speaking) => this.music.duck(speaking ? 0.55 : 0),
  );
  readonly listener = new ListenerRig();
  private context: AudioContext | null = null;
  private buses: Buses | null = null;
  private engine: EngineSynth | null = null;
  private cues: CueSynth | null = null;
  private engineProfile: EngineSoundProfile | undefined;
  private phase: AudioPhase = 'loading';
  private disposed = false;
  private readonly events = new DisposableGroup();
  private readonly emitters = new Set<SpatialEmitter>();

  constructor() {
    if (typeof window === 'undefined') return;
    this.events.add(settings.on('change', ({key}) => this.applySetting(key)));
    this.events.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.cues?.stopAll();
      this.applyLevels();
    });
    this.events.listen(window, 'pagehide', () => this.dispose(), {once: true});
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window && !this.disposed;
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  get enabled(): boolean {
    return settings.get('soundEnabled');
  }

  get effectsVolume(): number {
    return settings.get('effectsVolume');
  }

  /** True while 3D world sounds are audible (driving, tab visible, unmuted). */
  get worldActive(): boolean {
    return (
      !!this.context &&
      this.enabled &&
      this.effectsVolume > 0 &&
      this.phase === 'flying' &&
      !document.hidden &&
      this.context.state === 'running'
    );
  }

  /**
   * Creates/resumes the AudioContext. Call synchronously from a click or key
   * handler: browsers only allow audio to start inside a user gesture.
   */
  unlock(): void {
    if (this.disposed || !this.enabled) return;
    this.music.unlock();
    if (!this.supported) return;
    try {
      if (!this.context) this.initialize();
      if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
      this.applyLevels();
    } catch (error) {
      console.warn('No se pudo iniciar el audio.', error);
      this.dispose();
    }
  }

  setEnabled(value: boolean): void {
    settings.set('soundEnabled', value);
  }

  setEffectsVolume(value: number): void {
    if (Number.isFinite(value)) settings.set('effectsVolume', value);
  }

  setPhase(phase: AudioPhase): void {
    this.phase = phase;
    this.music.setScene(phase === 'lobby' ? 'lobby' : MUSIC_RACE_PHASES.includes(phase) ? 'race' : 'none');
    if (!RACE_PHASES.includes(phase)) this.cues?.stopAll();
    if (phase !== 'countdown') this.cues?.resetCountdown();
    this.applyLevels();
  }

  /** Engine character for the current vehicle (undefined = default). */
  setEngineProfile(profile: EngineSoundProfile | undefined): void {
    this.engineProfile = profile;
    if (this.engine && profile) this.engine.setProfile(profile);
  }

  /** Per frame while driving: engine sound follows the vehicle telemetry. */
  updateEngine(state: EngineTelemetry): void {
    if (!this.engine || this.disposed || !RACE_PHASES.includes(this.phase)) return;
    this.engine.update(state);
  }

  /** Per frame: moves the listener with the camera and updates 3D emitters. */
  updateListener(camera: Camera): void {
    if (!this.context || !this.worldActive) return;
    this.listener.update(this.context, camera);
    for (const emitter of this.emitters) emitter.update(this.listener.position);
  }

  cue(name: CueName, intensity = 1): void {
    const {context} = this;
    if (!context || !this.cues || this.disposed || !this.enabled || context.state !== 'running' || document.hidden) return;
    if (!RACE_PHASES.includes(this.phase) && !(name === 'finish' && this.phase === 'finished')) return;
    this.cues.play(name, intensity);
  }

  /** A positional emitter on a bus (default: world). Null until audio is unlocked. */
  createEmitter(position: Vector3, options: SpatialEmitterOptions, bus: SoundBus = 'world'): SpatialEmitter | null {
    if (!this.context || !this.buses) return null;
    const emitter = new SpatialEmitter(this.context, this.buses[bus].input, position, options);
    this.emitters.add(emitter);
    const dispose = emitter.dispose.bind(emitter);
    emitter.dispose = () => {
      dispose();
      this.emitters.delete(emitter);
    };
    return emitter;
  }

  /** Plays a registered, non-positional sample once. */
  async play(id: string, volume = 1): Promise<void> {
    const {context, buses} = this;
    if (!context || !buses || !this.enabled) return;
    const definition = this.sounds.definition(id);
    const buffer = await this.sounds.load(id);
    if (!buffer || this.disposed) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume * (definition.volume ?? 1);
    source.connect(gain).connect(buses[definition.bus].input);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  /** Speaks a line with a character voice (see content/characters voice data). */
  speak(text: string, voice?: BabbleOptions): boolean {
    if (!this.enabled) return false;
    this.unlock();
    return this.voices.speak(text, voice);
  }

  get status() {
    return {
      enabled: this.enabled,
      supported: this.supported,
      phase: this.phase,
      context: this.context?.state ?? 'uninitialized',
      voices: this.cues?.activeVoices ?? 0,
      lastCue: this.cues?.lastCue ?? '',
    };
  }

  /** Output node for 3D sounds plus whether they're currently audible. */
  get worldOutput(): {context: AudioContext; destination: AudioNode; active: boolean} | null {
    if (!this.context || !this.buses || this.disposed) return null;
    return {context: this.context, destination: this.buses.world.input, active: this.worldActive};
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.dispose();
    this.music.dispose();
    this.voices.dispose();
    for (const emitter of [...this.emitters]) emitter.dispose();
    this.cues?.dispose();
    this.engine?.dispose();
    if (this.buses) for (const bus of Object.values(this.buses)) bus.dispose();
    this.context?.close().catch(() => {});
  }

  private initialize(): void {
    const context = new AudioContext({latencyHint: 'interactive'});
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.15;
    const master = new AudioBus(context, 'master', 0).connect(context.destination);
    compressor.connect(master.input);
    const effects = new AudioBus(context, 'effects', 0).connect(compressor);
    const buses: Buses = {
      master,
      effects,
      music: new AudioBus(context, 'music', settings.get('musicVolume')).connect(master),
      voice: new AudioBus(context, 'voice', settings.get('voiceVolume')).connect(master),
      engine: new AudioBus(context, 'engine', 0).connect(effects),
      world: new AudioBus(context, 'world', 0).connect(effects),
      cues: new AudioBus(context, 'cues', 1).connect(effects),
      ui: new AudioBus(context, 'ui', 1).connect(effects),
    };
    this.context = context;
    this.buses = buses;
    const noise = createNoiseBuffer(context);
    this.engine = new EngineSynth(context, buses.engine.input, this.engineProfile, noise);
    this.cues = new CueSynth(context, buses.cues.input, noise);
    this.music.attach(context, buses.music);
  }

  private applySetting(key: string): void {
    if (key === 'soundEnabled') {
      this.music.setEnabled(this.enabled);
      if (!this.enabled) {
        this.cues?.stopAll();
        this.voices.stop();
      } else this.unlock();
    }
    if (key === 'voiceVolume') this.buses?.voice.setVolume(settings.get('voiceVolume'));
    this.applyLevels();
  }

  private applyLevels(): void {
    const {buses, phase} = this;
    if (!buses || this.disposed) return;
    const hidden = document.hidden;
    buses.master.setVolume(this.enabled ? 1 : 0, 0.035);
    buses.effects.setVolume(EFFECTS_HEADROOM * this.effectsVolume, 0.035);
    buses.engine.setVolume(hidden ? 0 : phase === 'flying' || phase === 'intro' ? 0.85 : phase === 'countdown' ? 0.35 : 0, 0.045);
    buses.world.setVolume(!hidden && phase === 'flying' ? 1 : 0, 0.035);
  }
}

/** The game's audio. One context for the whole page. */
export const audio = new AudioSystem();
