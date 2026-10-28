import type {Disposable} from '@/core/disposable';
import {CharacterHats, type HatState} from '../hats/character-hats';
import {hatDefaults, zudHat} from '../hats/hat-catalog';
import {isMesh} from '../shared/object-guards';
import type {ZudModel} from './zud-model';

/**
 * Zud's hats. One wardrobe per actor: late loads cannot replace a more
 * recent choice. The active hat id is mirrored in `model.root.userData.hat`.
 */
export class ZudWardrobe implements Disposable {
  private readonly hats: CharacterHats;
  private state: HatState = {state: 'ready', active: 'beanie', requested: null, error: null};
  private requested = 'beanie';
  private pending: Promise<void> | null = null;
  private disposed = false;

  /** `onHat` receives the active hat id after every change. */
  constructor(model: ZudModel, onHat: (hat: string) => void = () => {}) {
    this.hats = new CharacterHats(model, {
      onChange: (next) => {
        this.state = next;
        model.root.userData.hat = next.active;
        onHat(next.active);
      },
    });
    model.root.userData.hat = 'beanie';
    onHat('beanie');
  }

  /** Active hat id: a hat from ZUD_HATS, or 'beanie' while another one loads. */
  get hat(): string {
    return this.state.active;
  }

  /** Resolves once `id` is worn; rejects if its model fails to load (the beanie stays on). */
  setHat(id: string): Promise<void> {
    const choice = zudHat(id).id;
    if (this.disposed) return Promise.resolve();
    if (choice === this.requested && this.pending) return this.pending;
    const retry = choice === this.requested && this.state.state === 'error';
    this.requested = choice;
    const loading = retry ? this.hats.retry() : this.hats.update({...hatDefaults(choice), showPompom: true, wireframe: false});
    const pending = loading.then(() => {
      if (!this.disposed && this.requested === choice && this.state.state === 'error') {
        this.pending = null;
        throw this.state.error;
      }
      if (!this.disposed) {
        this.hats.anchor.traverse((mesh) => {
          if (isMesh(mesh)) mesh.userData.system = 'cockpit';
        });
      }
    });
    this.pending = pending;
    return pending;
  }

  dispose(): void {
    this.disposed = true;
    this.hats.dispose();
  }
}

/** A ZudModel wearing a wardrobe (the shape the lobby preview expects). */
export type DressedZud<T extends ZudModel = ZudModel> = T & {setHat(id: string): Promise<void>};
