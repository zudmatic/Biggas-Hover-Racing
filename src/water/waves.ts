/** Shared by the GPU surface and the boat's handful of buoyancy samples. */
export const WATER_WAVES = [
  { x: 0.85, z: 0.42, speed: 1.3, weight: 0.65 },
  { x: -0.52, z: 1.26, speed: 0.95, weight: 0.35 },
] as const

export function sampleWaterHeight(
  x: number,
  z: number,
  phase: number,
  height: number
) {
  let value = 0
  for (const wave of WATER_WAVES)
    value +=
      Math.sin(x * wave.x + z * wave.z - phase * wave.speed) * wave.weight
  return value * height
}
