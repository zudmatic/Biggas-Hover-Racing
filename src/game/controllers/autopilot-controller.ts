import {MathUtils} from 'three';
import type {HoverInput, HoverState} from '@/sim/hover-state';
import type {Landscape} from '@/sim/landscape';
import {IDLE_INPUT, type RacerController} from './controller';

export interface AutopilotOptions {
  /** Metres ahead (plus speed × lookaheadTime) used for steering. */
  lookahead?: number;
  lookaheadTime?: number;
  /** Metres ahead (plus speed × bendTime) used to judge the next bend. */
  bendLookahead?: number;
  bendTime?: number;
  /** Speed cap on straights, m/s. */
  topSpeed?: number;
  /** m/s removed from the cap per radian of bend ahead. */
  bendPenalty?: number;
  /** Extra speed over the cap tolerated before braking, m/s. */
  brakeMargin?: number;
  steeringGain?: number;
  /** Lateral offset from the centreline, metres (positive = right). */
  lane?: number;
  /** Decides when to fire the turbo (default: never). */
  boost?: (state: HoverState) => boolean;
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Follows the route centreline: steers toward a point ahead, caps speed by
 * the bend coming up and brakes before tight corners. Drives the Bulldog
 * cinematic today and is the starting point for AI rivals.
 */
export class AutopilotController implements RacerController {
  enabled = true;
  private readonly options: Required<Omit<AutopilotOptions, 'boost'>> & Pick<AutopilotOptions, 'boost'>;

  constructor(
    private readonly landscape: Landscape,
    options: AutopilotOptions = {},
  ) {
    this.options = {
      lookahead: 8,
      lookaheadTime: 0.3,
      bendLookahead: 20,
      bendTime: 0.8,
      topSpeed: 72,
      bendPenalty: 50,
      brakeMargin: 6,
      steeringGain: 3,
      lane: 0,
      ...options,
    };
  }

  sample(state: HoverState): HoverInput {
    if (!this.enabled) return {...IDLE_INPUT};
    const {landscape, options: o} = this;
    const road = landscape.roadAt(state.x, state.z);
    const ahead = landscape.atDistance(road.distance + o.lookahead + state.speed * o.lookaheadTime);
    const far = landscape.atDistance(road.distance + o.bendLookahead + state.speed * o.bendTime);
    const bend = Math.abs(wrap(Math.atan2(far.nx, far.nz) - Math.atan2(road.nx, road.nz)));
    const limit = o.topSpeed - bend * o.bendPenalty;
    const targetX = ahead.x - ahead.nz * o.lane;
    const targetZ = ahead.z + ahead.nx * o.lane;
    const error = wrap(Math.atan2(targetX - state.x, targetZ - state.z) - state.yaw);
    // Positive turn lowers yaw in HoverPhysics.
    return {
      ...IDLE_INPUT,
      turn: MathUtils.clamp(-error * o.steeringGain, -1, 1),
      throttle: state.speed < limit ? 1 : 0,
      brake: state.speed > limit + o.brakeMargin,
      boost: state.speed < limit && (o.boost?.(state) ?? false),
    };
  }
}
