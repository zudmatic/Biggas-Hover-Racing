export interface LensResponse {
  /** Opening rate (per second) when the FOV widens. */
  attack: number;
  /** Closing rate (per second) when it narrows. */
  release: number;
}

// A quick lens opening sells boost; the slower release avoids a zoom snap.
// Exponential damping keeps the response consistent across frame rates.
export function smoothCameraFov(
  current: number,
  target: number,
  dt: number,
  snap = false,
  {attack = 9, release = 3.5}: Partial<LensResponse> = {},
): number {
  if (snap) return target;
  const rate = target > current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) * rate));
}
