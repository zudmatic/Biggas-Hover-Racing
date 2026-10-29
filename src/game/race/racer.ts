import type {RacerChoice} from '@/core/types';
import {HoverPhysics, crossesCircuitGate} from '@/sim/hover-physics';
import {createHoverState, type HoverInput, type HoverState, type Position3} from '@/sim/hover-state';
import type {Landscape} from '@/sim/landscape';
import {RenderInterpolator} from '@/sim/render-interpolator';
import type {RacerController} from '../controllers/controller';

/** Track-side collision/handling hooks applied after the hover integrator. */
export interface RacerWorld {
  surfaceHeight(x: number, z: number): number | null | undefined;
  step(state: HoverState, dt: number, previous: Position3): void;
}

/**
 * One competitor: simulation state, checkpoint progress, render
 * interpolation and the controller that drives it (player, AI, network…).
 */
export class Racer {
  state: HoverState;
  /** Next gate to cross; recovery returns to the gate before it. */
  gateIndex = 0;
  readonly interpolator = new RenderInterpolator();
  readonly physics: HoverPhysics;
  /** Overrides the controller (cinematics, scripted tests). */
  override: RacerController | null = null;
  lastInput: HoverInput = {};

  constructor(
    readonly id: string,
    readonly choice: RacerChoice,
    readonly landscape: Landscape,
    readonly world: RacerWorld,
    public controller: RacerController,
    private readonly decorate: (state: HoverState) => HoverState = (state) => state,
  ) {
    this.physics = new HoverPhysics(landscape, (x, z) => world.surfaceHeight(x, z));
    this.state = this.fresh();
  }

  /** A new state on the grid, with hull/scale applied by `decorate`. */
  fresh(): HoverState {
    return this.decorate(createHoverState(this.landscape));
  }

  reset(): void {
    this.state = this.fresh();
    this.gateIndex = 0;
    this.interpolator.reset(this.state);
    this.controller.reset?.();
  }

  /**
   * Integrates one fixed step: controller → hover physics → track collision.
   * Returns the pre-step position for sweep tests (pads, oil, gates).
   */
  integrate(dt: number, input: HoverInput = (this.override ?? this.controller).sample(this.state, dt)): Position3 {
    this.lastInput = input;
    const previous = this.physics.step(this.state, input, dt);
    this.world.step(this.state, dt, previous);
    return previous;
  }

  /** Advances checkpoint progress after a step from `previous`. */
  trackProgress(previous: Position3): void {
    const gate = this.landscape.gates[this.gateIndex];
    // Track safe recovery checkpoints silently; free driving has no race progression UI.
    if (gate && crossesCircuitGate(previous, this.state, gate)) {
      this.gateIndex++;
      if (this.gateIndex === this.landscape.gates.length) this.gateIndex = 1;
    }
  }

  /** Returns to the last checkpoint with zero speed. */
  recover(): void {
    const checkpoint = this.physics.recover(this.gateIndex);
    Object.assign(this.state, createHoverState(this.landscape), checkpoint, {
      speed: 0,
      pitch: 0,
      roll: 0,
      throttle: 0,
      boosting: false,
      cooldown: 1.2,
    });
    this.decorate(this.state);
  }

  /** Interpolated pose for rendering between fixed steps. */
  pose(alpha: number): HoverState {
    return this.interpolator.sample(this.state, alpha);
  }
}
