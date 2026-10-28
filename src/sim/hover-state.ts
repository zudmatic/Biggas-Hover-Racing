import type {HullShape} from '@/content/vehicles/vehicle-definition';
import {HOVER_HEIGHT, type Landscape} from './landscape';

/** Player/AI/network intent for one simulation step. */
export interface HoverInput {
  /** -1 (left) … 1 (right). */
  turn?: number;
  /** -1 (slow down) … 1 (accelerate). */
  throttle?: number;
  boost?: boolean;
  brake?: boolean;
  drift?: boolean;
  /** Disables decorative bobbing. */
  reducedMotion?: boolean;
}

export interface Position3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Full kinematic state of one hover vehicle. Plain data so it can be cloned,
 * interpolated, serialised for multiplayer and driven by AI.
 */
export interface HoverState extends Position3 {
  yaw: number;
  pitch: number;
  roll: number;
  pitchRate: number;
  rollRate: number;
  yawRate: number;
  speed: number;
  /** Cruise speed target set by the throttle, m/s. */
  throttle: number;
  /** Manual boost reserve, 0–1. */
  energy: number;
  padBoostRemaining: number;
  boosting: boolean;
  boostLocked: boolean;
  /** Recovery grace period, seconds. */
  cooldown: number;
  hoverTime: number;
  wallHit: boolean;
  vx: number;
  vz: number;
  hover: number;
  hoverVelocity: number;
  airborne: boolean;
  landingTime: number;
  slip: number;
  impact: number;
  impactSerial: number;
  impactX?: number;
  impactZ?: number;
  acceleration: number;
  braking: boolean;
  drifting: boolean;
  driftBlend: number;
  offTrackTime: number;
  recoverNeeded: boolean;
  /** Speed multiplier while in oil (1 = clean). */
  oilFactor: number;
  oilContact: boolean;
  /** Collision hull, scaled to the current model scale. */
  hull?: HullShape;
  modelScale?: number;
}

export function createHoverState(landscape: Landscape): HoverState {
  return {
    ...landscape.spawn,
    yaw: landscape.yaw,
    pitch: 0,
    roll: 0,
    pitchRate: 0,
    rollRate: 0,
    speed: 0,
    throttle: 0,
    energy: 1,
    padBoostRemaining: 0,
    boosting: false,
    boostLocked: false,
    cooldown: 0,
    hoverTime: 0,
    wallHit: false,
    vx: 0,
    vz: 0,
    yawRate: 0,
    hover: HOVER_HEIGHT,
    hoverVelocity: 0,
    airborne: false,
    landingTime: 0,
    slip: 0,
    impact: 0,
    impactSerial: 0,
    acceleration: 0,
    braking: false,
    drifting: false,
    driftBlend: 0,
    offTrackTime: 0,
    recoverNeeded: false,
    oilFactor: 1,
    oilContact: false,
  };
}
