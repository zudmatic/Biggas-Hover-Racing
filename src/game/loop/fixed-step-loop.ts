import type {Disposable} from '@/core/disposable';

export interface LoopHandlers {
  /** Fixed simulation tick (always `FixedStepLoop.STEP` seconds). */
  fixedUpdate(dt: number): void;
  /**
   * Once per displayed frame, after the fixed ticks.
   * `dt` is clamped to 0.1 s; `alpha` (0–1) is how far we are into the next tick.
   */
  frame(dt: number, alpha: number, rawDelta: number): void;
  /** Called when a handler throws; the loop has already stopped. */
  onError?(error: unknown): void;
}

interface AnimationHost {
  setAnimationLoop(callback: ((time: number) => void) | null): unknown;
}

/**
 * Deterministic 60 Hz simulation with interpolated rendering. Runs on the
 * renderer's animation loop and never awaits inside a frame, so a slow frame
 * delays the next one instead of silently dropping it.
 */
export class FixedStepLoop implements Disposable {
  static readonly STEP = 1 / 60;
  /** Ticks per frame cap: a long stall can't trigger a catch-up spiral. */
  private static readonly MAX_STEPS = 6;
  private accumulator = 0;
  private last = -1;
  private running = false;
  /** When true, frames render but the simulation doesn't advance. */
  simulationPaused = false;

  constructor(
    private readonly host: AnimationHost,
    private readonly handlers: LoopHandlers,
  ) {}

  get alpha(): number {
    return this.accumulator / FixedStepLoop.STEP;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.host.setAnimationLoop((time) => this.tick(time));
  }

  stop(): void {
    this.running = false;
    this.host.setAnimationLoop(null);
  }

  /** Drops pending simulation time (after a reset/teleport). */
  resetAccumulator(): void {
    this.accumulator = 0;
  }

  dispose(): void {
    this.stop();
  }

  private tick(time: number): void {
    const now = time || performance.now();
    const rawDelta = this.last < 0 ? 0 : (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(rawDelta, 0.1);
    try {
      if (!this.simulationPaused) {
        this.accumulator += dt;
        let steps = 0;
        while (this.accumulator >= FixedStepLoop.STEP && steps < FixedStepLoop.MAX_STEPS) {
          this.handlers.fixedUpdate(FixedStepLoop.STEP);
          this.accumulator -= FixedStepLoop.STEP;
          steps++;
        }
        if (steps === FixedStepLoop.MAX_STEPS) this.accumulator %= FixedStepLoop.STEP;
      }
      this.handlers.frame(dt, this.alpha, rawDelta);
    } catch (error) {
      this.stop();
      if (this.handlers.onError) this.handlers.onError(error);
      else throw error;
    }
  }
}
