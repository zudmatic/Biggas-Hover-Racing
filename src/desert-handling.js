// Desert-only jump tuning. Other circuits keep their existing suspension.
export const DESERT_JUMPS=Object.freeze({
  takeoffDropM:.48,minimumSpeedMps:4,
  gravityUp:19,gravityDown:30,maxRiseSpeedMps:14,terminalFallMps:38,
  landingRestitution:.15,minimumBounceMps:.8,maximumBounceMps:2.6,
  bounceDuration:.42,landingCompressionM:.13,
  landingSpring:110,landingDamping:16,
});
