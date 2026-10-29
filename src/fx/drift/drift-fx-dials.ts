import type {Disposable} from '@/core/disposable';
import {createDialKit, type DialConfig, type DialKitController} from '@/core/debug/dials';
import type {DriftFx, SmokeStyle} from './drift-fx';

/** The smoke style each comparison button picks, and the notice it shows. */
const STYLE_ACTIONS: Partial<Record<string, readonly [SmokeStyle, string]>> = {
  Procedural: ['procedural', 'Humo A · fragmentos procedurales'],
  Hibrido: ['hybrid', 'Humo B · híbrido'],
  Mixto: ['mixed', 'Humo C · mixto'],
};

const DIALS = {
  Tamaño: [1.3, 0.5, 2.5, 0.05],
  Duración: [1.5, 0.5, 3, 0.05],
  'Color humo': {type: 'color', default: '#bababa'},
  Densidad: [1, 0.15, 1, 0.05],
  Trama: [1.5, 1, 4, 0.25],
  'Cuatro ruedas': false,
  Procedural: {type: 'action', label: 'A · Fragmentos procedurales'},
  Hibrido: {type: 'action', label: 'B · Humo híbrido'},
  Mixto: {type: 'action', label: 'C · Mixto'},
} satisfies DialConfig;

/** "Humo · comparación" dials: live smoke tweaks plus A/B/C style buttons. */
export class DriftFxControls implements Disposable {
  private readonly kit: DialKitController<typeof DIALS>;
  private readonly unsubscribe: () => void;

  constructor(fx: Pick<DriftFx, 'configure' | 'setStyle'>, onChange: (message: string) => void = () => {}) {
    this.kit = createDialKit('Humo · comparación', DIALS, {
      id: 'flight-fx-comparison',
      persist: true,
      defaultCollapsed: false,
      onAction: (key: string) => {
        const option = STYLE_ACTIONS[key];
        if (!option) return;
        fx.setStyle(option[0]);
        onChange(option[1]);
      },
    });
    this.unsubscribe = this.kit.subscribe((v) =>
      fx.configure({
        size: v['Tamaño'],
        lifetime: v['Duración'],
        fourSupports: v['Cuatro ruedas'],
        color: v['Color humo'],
        density: v.Densidad,
        grain: v.Trama,
      }),
    );
  }

  dispose(): void {
    this.unsubscribe();
    this.kit.destroy();
  }
}
