import type {Water, WaterUniforms} from './water';

type WaterPreset = {speed: number} & Record<keyof WaterUniforms, number>;

/** Saved application settings from components/waterfront/scene.tsx.
 * These override the more restrained defaults inside Water. */
export const WATERFRONT_PRESET: Readonly<WaterPreset> = {
  speed: 2.85,
  scale: 1.85,
  caustics: 0.77,
  glints: 1.5,
  ripples: 1.46,
  distantBlue: 1,
  blueDistance: 66,
  foam: 1.5,
  foamWidth: 0.88,
  waveHeight: 0.065,
  waterDepth: 1.5,
  clarity: 0.2,
  sunStrength: 9.1 / 7,
};

/** A calmer, wider river. Keep the original waterfront preset available. */
export const DESERT_WATER_PRESET: Readonly<WaterPreset> = {
  speed: 1.25,
  scale: 0.55,
  caustics: 0.32,
  glints: 0.48,
  ripples: 0.55,
  distantBlue: 0.58,
  blueDistance: 180,
  foam: 0.65,
  foamWidth: 1.2,
  waveHeight: 0.38,
  waterDepth: 2.8,
  clarity: 0.26,
  sunStrength: 1,
};

/** Writes a preset into the water uniforms; returns its phase speed. */
export function applyWaterPreset(water: Water, {speed, ...uniforms}: Readonly<WaterPreset>): number {
  for (const key of Object.keys(uniforms) as (keyof WaterUniforms)[]) water[key].value = uniforms[key];
  return speed;
}

export const applyWaterfrontPreset = (water: Water): number => applyWaterPreset(water, WATERFRONT_PRESET);
export const applyDesertWaterPreset = (water: Water): number => applyWaterPreset(water, DESERT_WATER_PRESET);
