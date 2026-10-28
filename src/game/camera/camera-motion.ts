import {CIRCUIT_SPEED} from '@/sim/hover-physics';
import type {HoverState} from '@/sim/hover-state';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const smoothstep = (value: number, min: number, max: number) => {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (current: number, target: number, seconds: number, dt: number) =>
  target + (current - target) * Math.exp(-dt / Math.max(0.001, seconds));

export interface CameraMotionSettings {
  distance: number;
  speedDistance: number;
  boostDistance: number;
  brakeDistance: number;
  /** Damping time constants in seconds. */
  turnSmooth: number;
  distanceSmooth: number;
  brakeAttack: number;
  brakeRelease: number;
  /** Maximum heading lag, in radians. */
  maxTurnAngle: number;
  driftFollow: number;
}

export const CAMERA_MOTION: Readonly<CameraMotionSettings> = Object.freeze({
  distance: 8.5,
  speedDistance: 3,
  boostDistance: 0.75,
  brakeDistance: 1.25,
  turnSmooth: 0.16,
  maxTurnAngle: Math.PI / 12,
  driftFollow: 0.25,
  distanceSmooth: 0.35,
  brakeAttack: 0.09,
  brakeRelease: 0.35,
});

export interface CameraMotionUpdate extends Partial<CameraMotionSettings> {
  snap?: boolean;
  reduced?: boolean;
  cameraMode?: number;
}

/** A horizontal virtual arm with independent heading and distance inertia. */
export class CameraMotion {
  private readonly motion = {heading: 0, distance: CAMERA_MOTION.distance, brakeCompression: 0};
  private initialized = false;
  private arm = CAMERA_MOTION.distance;
  private lastImpactSerial: number | undefined;

  update(state: HoverState, dt: number, {snap = false, reduced = false, cameraMode = 0, ...settings}: CameraMotionUpdate = {}) {
    const v = {...CAMERA_MOTION, ...settings};
    const speed = Math.max(0, state.speed ?? 0);
    const scale = cameraMode === 1 ? 2 : 1;
    const {motion} = this;
    dt = Math.max(0, dt);
    const stretch = reduced ? 0 : v.speedDistance * smoothstep(speed, 8, CIRCUIT_SPEED) + (state.boosting ? v.boostDistance : 0);
    const desiredArm = (v.distance + stretch) * scale;
    const impact = state.wallHit || (this.lastImpactSerial !== undefined && state.impactSerial !== this.lastImpactSerial);
    this.lastImpactSerial = state.impactSerial;
    // Only intentional braking compresses the arm. Collisions and a held
    // brake at rest must not produce a braking kick.
    const brake = reduced || impact || !state.braking
      ? 0
      : v.brakeDistance * clamp(-(state.acceleration ?? 0) / 65, 0, 1) * smoothstep(speed, 0, 8);
    if (snap || !this.initialized || reduced) {
      motion.heading = state.yaw;
      this.arm = desiredArm;
      motion.brakeCompression = 0;
      this.initialized = true;
    } else {
      let desiredHeading = state.yaw;
      if (speed > 3 && Math.hypot(state.vx ?? 0, state.vz ?? 0) > 3) {
        const slip = wrap(Math.atan2(state.vx, state.vz) - state.yaw);
        desiredHeading += clamp(slip, -v.maxTurnAngle, v.maxTurnAngle) * v.driftFollow * clamp(state.driftBlend ?? Number(state.drifting ?? false), 0, 1);
      }
      const lag = damp(wrap(desiredHeading - motion.heading), 0, v.turnSmooth, dt);
      motion.heading = state.yaw - clamp(wrap(state.yaw - (desiredHeading - lag)), -v.maxTurnAngle, v.maxTurnAngle);
      this.arm = damp(this.arm, desiredArm, v.distanceSmooth, dt);
      motion.brakeCompression = damp(motion.brakeCompression, brake, brake > motion.brakeCompression ? v.brakeAttack : v.brakeRelease, dt);
    }
    motion.distance = Math.max(4 * scale, this.arm - motion.brakeCompression);
    return motion;
  }
}
