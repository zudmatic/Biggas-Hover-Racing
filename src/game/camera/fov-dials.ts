import {createDialKit} from '@/core/debug/dials';
import type {Disposable} from '@/core/disposable';

/** Speed-dependent lens settings; filled from the DialKit panel. */
export interface LensSettings {
  base?: number;
  speed?: number;
  boost?: number;
  attack?: number;
  release?: number;
}

/** "Nitro · lente y FOV" panel: tunes the speed/boost field of view. */
export class FovDials implements Disposable {
  readonly settings: LensSettings = {};
  private readonly kit = createDialKit(
    'Nitro · lente y FOV',
    {
      'FOV base': [65, 45, 80, 1],
      'FOV por velocidad': [12, 0, 20, 1],
      'FOV extra nitro': [16, 0, 30, 1],
      'Rapidez entrada': [9, 1, 20, 0.5],
      'Rapidez salida': [3.5, 1, 12, 0.5],
      Restablecer: {type: 'action', label: 'Restablecer lente'},
    },
    {id: 'flight-nitro-lens', persist: false, defaultCollapsed: false, onAction: () => this.kit.resetValues()},
  );
  private readonly unsubscribe = this.kit.subscribe((v) =>
    Object.assign(this.settings, {
      base: v['FOV base'],
      speed: v['FOV por velocidad'],
      boost: v['FOV extra nitro'],
      attack: v['Rapidez entrada'],
      release: v['Rapidez salida'],
    }),
  );

  dispose(): void {
    this.unsubscribe();
    this.kit.destroy();
  }
}
