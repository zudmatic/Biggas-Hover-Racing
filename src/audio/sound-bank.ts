import {AssetLoader} from '@/core/assets/asset-loader';
import {sounds, type SoundDefinition} from './catalog';

/**
 * Decodes and caches sampled sounds by id. Decoding needs the AudioContext,
 * which only exists after a user gesture, so loads are lazy.
 */
export class SoundBank {
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();

  constructor(private readonly getContext: () => AudioContext | null) {}

  definition(id: string): SoundDefinition {
    return sounds.require(id);
  }

  /** Resolves to null (and warns once) when the file is missing or undecodable. */
  load(id: string): Promise<AudioBuffer | null> {
    const context = this.getContext();
    if (!context) return Promise.resolve(null);
    let request = this.buffers.get(id);
    if (!request) {
      const {file} = this.definition(id);
      request = AssetLoader.shared
        .arrayBuffer(file)
        .then((data) => context.decodeAudioData(data.slice(0)))
        .catch((error: unknown) => {
          console.warn(`No se pudo cargar el sonido "${id}".`, error);
          return null;
        });
      this.buffers.set(id, request);
    }
    return request;
  }

  preload(ids: Iterable<string>): Promise<unknown> {
    return Promise.all([...ids].map((id) => this.load(id)));
  }

  clear(): void {
    this.buffers.clear();
  }
}
