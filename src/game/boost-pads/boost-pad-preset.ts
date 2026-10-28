import {PAD_TRANSITION} from '@/sim/boost-pad-envelope';

/**
 * Every boost-pad tunable. The DialKit lab ('boost-pad-lab') edits the same
 * keys; `BoostPads.configure` applies them to the simulation, shaders and sparks.
 * Dither modes are the DialKit select labels: 'Apagado' | 'Damero' | 'Dither'.
 */
export interface BoostPadSettings {
  /** Envelope attack, seconds (release is attack × golden ratio). */
  transition: number;
  /** Turbo granted per activation, seconds. */
  duration: number;
  /** Recharge time after an activation, seconds. */
  cooldown: number;
  /** Arrow scroll speed. */
  flow: number;
  arrowCount: number;
  brightness: number;
  /** Arrow colour while charged. */
  color: string;
  /** Arrow, field and spark colour on activation. */
  activeColor: string;
  /** LED-screen look: cells, grid and scan line. */
  screen: boolean;
  screenCells: number;
  screenGrid: number;
  screenScan: number;
  /** Sparks per activation (pool of 72). */
  particles: number;
  particleSize: number;
  particleLife: number;
  particleSpeed: number;
  spread: number;
  rise: number;
  gravity: number;
  turbulence: number;
  stretch: number;
  particleOpacity: number;
  dither: string;
  ditherAmount: number;
  ditherSize: number;
  /** Light field rising from the screen. */
  field: boolean;
  fieldHeight: number;
  fieldOpacity: number;
  fieldPulse: number;
  fieldFade: number;
  fieldSpreadX: number;
  fieldSpreadZ: number;
  fieldTurbulence: number;
  fieldNoiseScale: number;
  fieldNoiseSpeed: number;
  fieldDither: string;
  fieldDitherAmount: number;
  fieldDitherSize: number;
  /** Screen-space heat distortion above active pads. */
  distortion: boolean;
  distortionStrength: number;
}

// Approved laboratory preset, also used without DialKit in the game.
export const BOOST_PAD_PRESET: Readonly<BoostPadSettings> = Object.freeze({
  transition: PAD_TRANSITION,
  duration: 2,
  cooldown: 7,
  flow: 2.5,
  arrowCount: 4,
  brightness: 5,
  color: '#34ff76',
  activeColor: '#90e000',
  screen: true,
  screenCells: 42,
  screenGrid: 0.85,
  screenScan: 0.3,
  particles: 72,
  particleSize: 0.06,
  particleLife: 0.65,
  particleSpeed: 5,
  spread: 2.7,
  rise: 2.7,
  gravity: -5,
  turbulence: 6,
  stretch: 1,
  particleOpacity: 0.8,
  dither: 'Dither',
  ditherAmount: 1,
  ditherSize: 2,
  field: true,
  fieldHeight: 2,
  fieldOpacity: 0.3,
  fieldPulse: 0.6,
  fieldFade: 4,
  fieldSpreadX: 1.2,
  fieldSpreadZ: 0.65,
  fieldTurbulence: 0.75,
  fieldNoiseScale: 1.2,
  fieldNoiseSpeed: 0.4,
  fieldDither: 'Dither',
  fieldDitherAmount: 0.45,
  fieldDitherSize: 2,
  distortion: true,
  distortionStrength: 0.6,
});
