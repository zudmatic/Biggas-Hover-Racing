import type {HoverState, Position3} from './hover-state';

export const PAD_COOLDOWN = 7;
export const PAD_BOOST_DURATION = 2;
export const PAD_PICKUP_FLASH = 0.09;

/** A boost pad's oriented box on the track (forward = nx, nz). */
export interface BoostPadShape extends Position3 {
  nx: number;
  nz: number;
  halfWidth: number;
  halfLength: number;
}

export interface BoostPadEntry extends BoostPadShape {
  /** Seconds until the pad is charged again. */
  remaining: number;
  flash: number;
  occupied: boolean;
  activations: number;
  [extra: string]: unknown;
}

export interface BoostPadSettings {
  cooldown?: number;
  duration?: number;
}

// Swept local box: fast crossings cannot skip a narrow pad between fixed ticks.
export function crossesBoostPad(pad: BoostPadShape, previous: Position3, state: Position3): boolean {
  if (Math.hypot(state.x - previous.x, state.z - previous.z) > 30) return false;
  const local = (p: Position3): [number, number, number] => {
    const x = p.x - pad.x;
    const z = p.z - pad.z;
    return [x * pad.nz - z * pad.nx, p.y - pad.y, x * pad.nx + z * pad.nz];
  };
  const a = local(previous);
  const b = local(state);
  const bounds: [number, number][] = [
    [-pad.halfWidth, pad.halfWidth],
    [0.15, 2.1],
    [-pad.halfLength, pad.halfLength],
  ];
  let enter = 0;
  let exit = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    const [lo, hi] = bounds[i];
    if (Math.abs(d) < 1e-9) {
      if (a[i] < lo || a[i] > hi) return false;
      continue;
    }
    const t0 = (lo - a[i]) / d;
    const t1 = (hi - a[i]) / d;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (enter > exit) return false;
  }
  return true;
}

type Activation = (pad: BoostPadEntry) => void;

/** Boost pads: crossing a charged pad grants a timed boost, then it recharges. */
export class BoostPadSimulation<T extends BoostPadShape = BoostPadShape> {
  readonly entries: (BoostPadEntry & T)[];
  private elapsed = 0;

  constructor(
    pads: T[],
    private readonly settings: BoostPadSettings = {},
  ) {
    this.entries = pads.map((p) => ({...p, remaining: 0, flash: 0, occupied: false, activations: 0}) as BoostPadEntry & T);
  }

  get time(): number {
    return this.elapsed;
  }

  activate(pad: BoostPadEntry, state: Pick<HoverState, 'padBoostRemaining'>, onActivate: Activation = () => {}): boolean {
    if (pad.remaining > 0) return false;
    // Claim synchronously, before particles/callbacks: another car cannot claim
    // the same charge, even while the visual pickup animation is still running.
    pad.remaining = this.settings.cooldown ?? PAD_COOLDOWN;
    pad.flash = PAD_PICKUP_FLASH;
    pad.activations++;
    state.padBoostRemaining = Math.max(state.padBoostRemaining ?? 0, this.settings.duration ?? PAD_BOOST_DURATION);
    onActivate(pad);
    return true;
  }

  reset(): void {
    this.elapsed = 0;
    for (const p of this.entries) Object.assign(p, {remaining: 0, flash: 0, occupied: false, activations: 0});
  }

  step(dt: number, state: HoverState, previous: Position3, onActivate: Activation = () => {}): void {
    this.elapsed += dt;
    for (const p of this.entries) {
      p.remaining = Math.max(0, p.remaining - dt);
      p.flash = Math.max(0, p.flash - dt);
      const inside = crossesBoostPad(p, state, state);
      const crossed = crossesBoostPad(p, previous, state);
      if (!p.occupied && crossed && p.remaining === 0 && state.speed > 1) this.activate(p, state, onActivate);
      p.occupied = inside;
    }
  }
}
