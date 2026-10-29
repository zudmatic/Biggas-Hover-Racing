import {createBabble, type Babble, type BabbleOptions, type BabbleProgress} from '@gitchad/babble';
import type {Disposable} from '@/core/disposable';
import {Emitter} from '@/core/emitter';

export type {BabbleOptions, BabbleProgress};

/**
 * Character voices with @gitchad/babble. Babble renders into
 * `context.destination`; we hand it a view of the shared context whose
 * destination is the voice bus, so voices obey the mixer (volume, mute,
 * ducking). Remove the view if babble gains a `destination` option.
 */
export class VoiceSystem extends Emitter<{progress: BabbleProgress}> implements Disposable {
  private babble: Babble | null = null;
  private speaking = false;

  constructor(
    private readonly getOutput: () => {context: AudioContext; destination: AudioNode} | null,
    private readonly onSpeaking: (speaking: boolean) => void = () => {},
  ) {
    super();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Speaks `text` with a character's voice. Call from a user gesture the first time. */
  speak(text: string, voice: BabbleOptions = {}): boolean {
    const babble = this.ensure();
    if (!babble) return false;
    babble.speak(text, voice);
    return true;
  }

  stop(): void {
    this.babble?.stop();
  }

  dispose(): void {
    this.babble?.dispose();
    this.babble = null;
    this.clear();
  }

  private ensure(): Babble | null {
    if (this.babble) return this.babble;
    const output = this.getOutput();
    if (!output) return null;
    this.babble = createBabble({
      context: routedContext(output.context, output.destination),
      onProgress: (event) => {
        if (event.type === 'start') this.setSpeaking(true);
        else if (event.type === 'end' || event.type === 'stop') this.setSpeaking(false);
        this.emit('progress', event);
      },
    });
    return this.babble;
  }

  private setSpeaking(value: boolean): void {
    if (this.speaking === value) return;
    this.speaking = value;
    this.onSpeaking(value);
  }
}

/** The shared context with `destination` redirected to `destination`. */
function routedContext(context: AudioContext, destination: AudioNode): AudioContext {
  return new Proxy(context, {
    get(target, property) {
      if (property === 'destination') return destination;
      // Native getters/methods need the real context as `this`.
      const value: unknown = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
