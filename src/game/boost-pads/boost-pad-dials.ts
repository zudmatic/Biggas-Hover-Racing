import {createDialKit, type DialConfig, type DialKitController, type ResolvedValues} from '@/core/debug/dials';
import type {Disposable} from '@/core/disposable';
import {PAD_TRANSITION} from '@/sim/boost-pad-envelope';
import type {HoverState} from '@/sim/hover-state';
import type {BoostPadSettings} from './boost-pad-preset';
import type {BoostPads} from './boost-pads';

const DITHER_MODES = ['Apagado', 'Damero', 'Dither'];

const PAD_DIALS = {
  Activar: {type: 'action', label: 'Probar activación'},
  Encuadrar: {type: 'action', label: 'Ver placa de cerca'},
  Reiniciar: {type: 'action', label: 'Rearmar placa'},
  'Repetir automáticamente': false,
  'Tiempo transición': [PAD_TRANSITION, 0.08, 0.6, 0.01],
  'Duración turbo': [2, 0.25, 6, 0.25],
  Cooldown: [7, 1, 15, 0.5],
  'Velocidad flechas': [2.5, 0, 4, 0.1],
  'Cantidad flechas': [4, 1, 6, 1],
  Brillo: [5, 0, 5, 0.1],
  'Color disponible': {type: 'color', default: '#34ff76'},
  'Color activación': {type: 'color', default: '#90e000'},
  'Pantalla LED': true,
  'Celdas pantalla': [42, 16, 96, 2],
  'Trama pantalla': [0.85, 0, 1, 0.05],
  'Barrido pantalla': [0.3, 0, 1, 0.05],
  'Cantidad partículas': [72, 0, 72, 1],
  'Tamaño partículas': [0.06, 0.02, 0.4, 0.01],
  'Duración partículas': [0.65, 0.1, 2, 0.05],
  'Velocidad partículas': [5, 0, 15, 0.25],
  'Dispersión partículas': [2.7, 0, 5, 0.1],
  'Elevación partículas': [2.7, -2, 8, 0.1],
  'Gravedad partículas': [-5, -5, 12, 0.25],
  'Turbulencia partículas': [6, 0, 6, 0.1],
  'Estiramiento partículas': [1, 1, 8, 0.25],
  'Opacidad partículas': [0.8, 0, 1, 0.05],
  'Trama partículas': {type: 'select', options: DITHER_MODES, default: 'Dither'},
  'Intensidad trama': [1, 0, 1, 0.05],
  'Tamaño trama': [2, 1, 6, 1],
  'Campo de luz': true,
  'Altura campo': [2, 0.2, 4, 0.1],
  'Opacidad campo': [0.3, 0, 0.6, 0.01],
  'Pulso campo': [0.6, 0, 4, 0.1],
  'Desvanecimiento campo': [4, 0.5, 4, 0.1],
  'Apertura lateral': [1.2, 0, 2, 0.05],
  'Apertura longitudinal': [0.65, 0, 2, 0.05],
  'Turbulencia campo': [0.75, 0, 1, 0.05],
  'Escala ruido campo': [1.2, 0.5, 8, 0.1],
  'Velocidad ruido campo': [0.4, 0, 4, 0.1],
  'Trama campo': {type: 'select', options: DITHER_MODES, default: 'Dither'},
  'Intensidad trama campo': [0.45, 0, 1, 0.05],
  'Tamaño trama campo': [2, 1, 6, 1],
  'Distorsión campo': true,
  'Intensidad distorsión': [0.6, 0, 1, 0.05],
} satisfies DialConfig;

/** Maps the lab's Spanish labels to `BoostPadSettings`. */
function padSettings(v: ResolvedValues<typeof PAD_DIALS>): BoostPadSettings {
  return {
    transition: v['Tiempo transición'],
    duration: v['Duración turbo'],
    cooldown: v.Cooldown,
    flow: v['Velocidad flechas'],
    arrowCount: v['Cantidad flechas'],
    brightness: v.Brillo,
    color: v['Color disponible'],
    activeColor: v['Color activación'],
    particles: v['Cantidad partículas'],
    screen: v['Pantalla LED'],
    screenCells: v['Celdas pantalla'],
    screenGrid: v['Trama pantalla'],
    screenScan: v['Barrido pantalla'],
    particleSize: v['Tamaño partículas'],
    particleLife: v['Duración partículas'],
    particleSpeed: v['Velocidad partículas'],
    spread: v['Dispersión partículas'],
    rise: v['Elevación partículas'],
    gravity: v['Gravedad partículas'],
    turbulence: v['Turbulencia partículas'],
    stretch: v['Estiramiento partículas'],
    particleOpacity: v['Opacidad partículas'],
    dither: v['Trama partículas'],
    ditherAmount: v['Intensidad trama'],
    ditherSize: v['Tamaño trama'],
    field: v['Campo de luz'],
    fieldHeight: v['Altura campo'],
    fieldOpacity: v['Opacidad campo'],
    fieldPulse: v['Pulso campo'],
    fieldFade: v['Desvanecimiento campo'],
    fieldSpreadX: v['Apertura lateral'],
    fieldSpreadZ: v['Apertura longitudinal'],
    fieldTurbulence: v['Turbulencia campo'],
    fieldNoiseScale: v['Escala ruido campo'],
    fieldNoiseSpeed: v['Velocidad ruido campo'],
    fieldDither: v['Trama campo'],
    fieldDitherAmount: v['Intensidad trama campo'],
    fieldDitherSize: v['Tamaño trama campo'],
    distortion: v['Distorsión campo'],
    distortionStrength: v['Intensidad distorsión'],
  };
}

/** What the lab panel drives. */
export type BoostPadLab = Pick<BoostPads, 'activate' | 'reset' | 'configure'>;

/** 'Placa turbo · laboratorio' DialKit panel used by the lab tools (playground, WebGPU preview). */
export class BoostPadDials implements Disposable {
  private readonly kit: DialKitController<typeof PAD_DIALS>;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly pads: BoostPadLab,
    private readonly state: Pick<HoverState, 'padBoostRemaining'>,
    focus: () => void,
  ) {
    this.kit = createDialKit('Placa turbo · laboratorio', PAD_DIALS, {
      id: 'boost-pad-lab',
      persist: false,
      onAction: (action) => {
        if (action === 'Activar') pads.activate(state);
        if (action === 'Encuadrar') focus();
        if (action === 'Reiniciar') {
          pads.reset();
          state.padBoostRemaining = 0;
        }
      },
    });
    this.unsubscribe = this.kit.subscribe((values) => pads.configure(padSettings(values)));
  }

  /** Call once per simulated frame: re-fires the pad while auto-repeat is on. */
  update(): void {
    if (this.kit.values['Repetir automáticamente']) this.pads.activate(this.state);
  }

  dispose(): void {
    this.unsubscribe();
    this.kit.destroy();
  }
}
