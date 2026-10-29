import {Color, Vector3} from 'three';

/** How the singularity's turbulence shows: rim noise around the holes, a wave wake behind them, or both. */
export type TurbulenceMode = 'radial' | 'waves' | 'both';

/** Plasma mesh budget: tongue count, ribbon segments, coil segments, extra noise octave. */
export interface PlasmaQuality {
  tongues: number;
  segments: number;
  coils: number;
  detail: boolean;
}

/** idle → cruise → boost, plus how much a thrust surge adds on top. */
export interface DriveRange {
  idle: number;
  cruise: number;
  boost: number;
  surge: number;
}

// Tuning in the GLB's authoring units. The game scales the ship, not these numbers.
export const THRUST = {idle: 0.2, cruise: 1, rate: 2.5};
export const BOOST_RATIO = 2.5;
export const ENERGY = {surge: {gain: 2.2, attack: 3, decay: 1.4}, drag: {turn: 0.9, slip: 0.06, max: 1.4, rate: 5}};
export const SINGULARITY = {
  offset: -0.31,
  surge: 0.35,
  horizon: {radius: {idle: 0.29, cruise: 0.3}, softness: 0.24, absorption: 1},
  lensing: {strength: 1.7, reach: 1.6, spin: -0.21, cap: 0.26},
  wake: {absorption: 0.2},
  infall: {halo: 2.05, dimming: 0.31, streaks: 0.69, spiral: 0.9},
  glow: {
    width: 0.58,
    turbulence: 0.68,
    hotspots: 2.6,
    speed: 1.9,
    intensity: {idle: 1.85, cruise: 2.65},
    colors: {hot: new Color('#d6ecff')},
  },
  turbulence: {mode: 'both' as TurbulenceMode, waves: {amplitude: 0.1, frequency: 2.8, speed: 2.8, length: 2.5, width: 1.45}},
  instability: {amount: 0.125, speed: 2.05},
  depth: {softness: 0.35, edge: 0.05},
};
export const PLASMA_QUALITY = {
  low: {tongues: 4, segments: 10, coils: 24, detail: false},
  medium: {tongues: 6, segments: 14, coils: 36, detail: true},
  high: {tongues: 8, segments: 20, coils: 48, detail: true},
} satisfies Record<string, PlasmaQuality>;
export type PlasmaQualityLevel = keyof typeof PLASMA_QUALITY;
export const PLASMA = {
  quality: 'high' as PlasmaQualityLevel,
  intensity: 1,
  bloom: 1,
  colors: {
    shard: new Color('#05070d'),
    base: new Color('#2f5bff'),
    hot: new Color('#d6ecff'),
    burst: [new Color('#7a2cff'), new Color('#ff2bd6'), new Color('#22e8ff')],
  },
  flow: {direction: new Vector3(0, 0, -1), scale: 0.55, cycles: 3},
  drive: {
    speed: {idle: 0.25, cruise: 1.1, boost: 3.2, surge: 0.8},
    length: {idle: 0.5, cruise: 1.3, boost: 2.6, surge: 0.5},
    sweep: {idle: 0.15, cruise: 0.85, boost: 1, surge: 0.2},
    turbulence: {idle: 0.3, cruise: 0.5, boost: 1.2, surge: 0.6},
    density: {idle: 1.5, cruise: 2.4, boost: 4, surge: 0.3},
    emission: {idle: 0.7, cruise: 1.3, boost: 2.8, surge: 0.6},
    burst: {idle: 0, cruise: 0, boost: 1, surge: 0.3},
  } satisfies Record<string, DriveRange>,
  filaments: {width: 0.012, coverage: 0.4},
  edge: {emission: 1.4, width: 1.3, reach: 0.04, crease: 0.985},
  hotspots: {gain: 4, sharpness: 6},
  burst: {flicker: 0.6, rate: 23, drift: 0.15, heat: 0.4},
  tongues: {width: 0.22, lift: 0.5, bend: 0.3, spacing: 0.5},
  coils: {strands: 3, turns: 1.75, spin: 2.2, start: -0.45, length: 0.75, radius: 0.42, inner: 0.2, width: 0.035, wobble: 0.5},
  light: {intensity: 1.5, distance: 6, decay: 2, lift: 0.6},
};
