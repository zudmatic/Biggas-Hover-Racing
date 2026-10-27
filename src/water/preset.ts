import type { createWater } from "./water"

/** Saved application settings from components/waterfront/scene.tsx.
 * These override the more restrained defaults inside createWater(). */
export const WATERFRONT_PRESET = {
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
} as const

export function applyWaterfrontPreset(water: ReturnType<typeof createWater>) {
  const { speed, ...uniforms } = WATERFRONT_PRESET
  for (const key of Object.keys(uniforms) as (keyof typeof uniforms)[]) {
    water[key].value = uniforms[key]
  }
  return speed
}

/** A calmer, wider river. Keep the original waterfront preset available. */
export const DESERT_WATER_PRESET = {
  speed: 1.65,
  scale: 0.55,
  caustics: 0.32,
  glints: 0.42,
  ripples: 0.55,
  distantBlue: 0.58,
  blueDistance: 180,
  foam: 0.9,
  foamWidth: 1.65,
  waveHeight: 0.38,
  waterDepth: 2.8,
  clarity: 0.26,
  sunStrength: 1,
} as const

export function applyDesertWaterPreset(water: ReturnType<typeof createWater>) {
  const { speed, ...uniforms } = DESERT_WATER_PRESET
  for (const key of Object.keys(uniforms) as (keyof typeof uniforms)[]) {
    water[key].value = uniforms[key]
  }
  return speed
}
