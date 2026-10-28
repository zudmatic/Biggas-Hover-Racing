import type {JumpSettings} from '@/sim/landscape';

// Desert-only jump tuning. Other circuits keep their existing suspension.
export const DESERT_JUMPS: Readonly<JumpSettings> = Object.freeze({
  takeoffDropM: 0.48,
  minimumSpeedMps: 4,
  gravityUp: 19,
  gravityDown: 30,
  maxRiseSpeedMps: 14,
  terminalFallMps: 38,
  landingRestitution: 0.15,
  minimumBounceMps: 0.8,
  maximumBounceMps: 2.6,
  bounceDuration: 0.42,
  landingCompressionM: 0.13,
  landingSpring: 110,
  landingDamping: 16,
});
