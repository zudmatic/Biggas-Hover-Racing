import type {DialKitValueUpdates} from 'dialkit/vanilla';
import {createDialKit, type DialConfig, type DialKitController} from '@/core/debug/dials';
import type {Disposable} from '@/core/disposable';
import type {OilSettings} from '@/sim/oil-simulation';

const OIL_DIALS = {
  Ancho: [3.5, 0.3, 5, 0.1],
  Vertido: [1, 0, 10, 0.1],
  Duracion: [6, 0, 10, 0.1],
  Ralentizacion: [55, 0, 95, 1],
  VelocidadBot: [40, 8, 40, 1],
  Forma: {
    _collapsed: true,
    AnchoFinal: [0.8, 0.3, 5, 0.1],
    DispersionInicial: [1.1, 0, 2.5, 0.1],
    DispersionFinal: [0.1, 0, 2.5, 0.1],
    Separacion: [1, 0.2, 4, 0.1],
    Variacion: [30, 0, 60, 1],
    Evolucion: [2, 0.3, 3, 0.1],
  },
  Respuesta: {_collapsed: true, Entrada: [0.05, 0.05, 2, 0.05], Recuperacion: [0.5, 0.1, 4, 0.1]},
  Fuerte: {type: 'action', label: 'Probar: fuerte y fina'},
  Salpicado: {type: 'action', label: 'Probar: salpicado'},
  Clasico: {type: 'action', label: 'Volver al clásico'},
} satisfies DialConfig;

type OilDialValues = DialKitValueUpdates<typeof OIL_DIALS>;

/** One-click looks, keyed by their DialKit action. */
const PRESETS: Readonly<Record<string, OilDialValues>> = {
  Fuerte: {
    Ancho: 3.5,
    Ralentizacion: 65,
    Vertido: 2.5,
    Duracion: 5,
    Forma: {AnchoFinal: 0.8, DispersionInicial: 1.1, DispersionFinal: 0.05, Separacion: 0.5, Variacion: 15, Evolucion: 1},
    Respuesta: {Entrada: 0.15, Recuperacion: 1.5},
  },
  Salpicado: {
    Ancho: 1.3,
    Ralentizacion: 75,
    Vertido: 3,
    Duracion: 5,
    Forma: {AnchoFinal: 0.5, DispersionInicial: 1.8, DispersionFinal: 0.1, Separacion: 1.8, Variacion: 35, Evolucion: 0.7},
    Respuesta: {Entrada: 0.1, Recuperacion: 2},
  },
  Clasico: {
    Ancho: 2.6,
    Ralentizacion: 30,
    Vertido: 2,
    Duracion: 5,
    Forma: {AnchoFinal: 2.6, DispersionInicial: 0, DispersionFinal: 0, Separacion: 0.8, Variacion: 0, Evolucion: 1},
    Respuesta: {Entrada: 0.21, Recuperacion: 1},
  },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** 'Aceite · prueba' DialKit panel: writes straight into the oil simulation's settings. */
export class OilDials implements Disposable {
  private readonly kit: DialKitController<typeof OIL_DIALS>;
  private readonly unsubscribe: () => void;

  constructor(config: OilSettings) {
    this.kit = createDialKit('Aceite · prueba', OIL_DIALS, {
      id: 'oil-settings',
      persist: true,
      defaultCollapsed: true,
      onAction: (key) => {
        const preset = PRESETS[key];
        if (preset) this.kit.setValues(preset);
      },
    });
    this.unsubscribe = this.kit.subscribe((v) =>
      Object.assign(config, {
        width: v.Ancho,
        pourDuration: clamp(v.Vertido, 0, 10),
        lifetime: clamp(v.Duracion, 0, 10),
        slowdown: v.Ralentizacion / 100,
        botSpeed: v.VelocidadBot,
        endWidth: v.Forma.AnchoFinal,
        spread: v.Forma.DispersionInicial,
        endSpread: v.Forma.DispersionFinal,
        spacing: v.Forma.Separacion,
        variation: v.Forma.Variacion / 100,
        taper: v.Forma.Evolucion,
        entryTime: v.Respuesta.Entrada,
        recoveryTime: v.Respuesta.Recuperacion,
      } satisfies Partial<OilSettings>),
    );
  }

  dispose(): void {
    this.unsubscribe();
    this.kit.destroy();
  }
}
