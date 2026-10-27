/** Shared by the GPU surface and the boat's handful of buoyancy samples. */
export const WATER_WAVES = [
  { x: 0.12, z: 0.065, speed: 1.05, weight: 0.7 },
  { x: -0.075, z: 0.19, speed: 0.78, weight: 0.3 },
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
