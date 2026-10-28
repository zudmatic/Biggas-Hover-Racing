import type {HoverState} from './hover-state';

const FIELDS = ['x', 'y', 'z', 'pitch', 'roll'] as const;
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * Physics stays at 60 Hz. Both the ship and camera consume the same pose
 * between ticks, rather than following a target that stops on alternate frames.
 */
export class RenderInterpolator {
  private previous: HoverState | null = null;
  private readonly rendered = {} as HoverState;

  reset(state: HoverState): void {
    this.capture(state);
  }

  /** Call before each physics step with the pre-step state. */
  capture(state: HoverState): void {
    this.previous = Object.assign(this.previous ?? ({} as HoverState), state);
  }

  /** Pose between the captured and current state; `alpha` 0–1 within the tick. */
  sample(state: HoverState, alpha: number): HoverState {
    const {rendered, previous} = this;
    Object.assign(rendered, state);
    if (!previous) return rendered;
    alpha = Math.max(0, Math.min(1, alpha));
    for (const field of FIELDS) rendered[field] = previous[field] + (state[field] - previous[field]) * alpha;
    rendered.yaw = previous.yaw + angleDelta(previous.yaw, state.yaw) * alpha;
    return rendered;
  }
}
