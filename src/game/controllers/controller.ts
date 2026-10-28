import type {HoverInput, HoverState} from '@/sim/hover-state';

/**
 * Decides a racer's input every simulation step. The player, AI rivals,
 * scripted cinematics and (later) network peers are all controllers, so the
 * race loop treats every racer the same way.
 */
export interface RacerController {
  sample(state: HoverState, dt: number): HoverInput;
  reset?(): void;
}

/** No input: coasting / parked. */
export const IDLE_INPUT: Readonly<HoverInput> = Object.freeze({
  reducedMotion: false,
  turn: 0,
  throttle: 0,
  boost: false,
  brake: false,
  drift: false,
});
