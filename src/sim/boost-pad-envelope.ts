export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
export const PAD_TRANSITION = 1 / GOLDEN_RATIO ** 3;

interface Lane {
  value: number;
  from: number;
  target: number;
  elapsed: number;
}

export interface PadEnvelopeInput {
  remaining: number;
  flash: number;
}

export interface PadEnvelopeSettings {
  transition?: number;
  field?: boolean;
  distortion?: boolean;
  distortionStrength?: number;
}

export interface PadEnvelopeValues {
  level: number;
  blue: number;
  pulse: number;
  field: number;
  heat: number;
}

/** Finite smoothstep envelopes: continuous values, exact rest, independent of FPS. */
export class PadEnvelope {
  private readonly lanes = new Map<string, Lane>();

  update(p: PadEnvelopeInput, dt: number, settings: PadEnvelopeSettings = {}): PadEnvelopeValues {
    const attack = settings.transition ?? PAD_TRANSITION;
    const release = attack * GOLDEN_RATIO;
    // Consumption has its own short exit; recharging keeps the softer entrance.
    const pickupExit = Math.min(release, PAD_TRANSITION / GOLDEN_RATIO);
    const pickupEntry = Math.min(attack, PAD_TRANSITION / GOLDEN_RATIO ** 3);
    const active = p.remaining === 0 || p.flash > 0;
    return {
      level: this.tween('level', Number(active), dt, active ? attack : pickupExit),
      // Keep the blue hue while extinguishing; return to green on rearm.
      blue: this.tween('blue', Number(p.remaining > 0 || p.flash > 0), dt, p.remaining > 0 ? pickupEntry : attack),
      pulse: this.tween('pulse', Number(p.flash > 0), dt, p.flash > 0 ? pickupEntry : pickupExit),
      field: this.tween('field', Number(settings.field), dt, settings.field ? attack : release),
      heat: this.tween('heat', settings.distortion ? (settings.distortionStrength ?? 0) : 0, dt, release),
    };
  }

  private tween(name: string, target: number, dt: number, duration: number): number {
    let lane = this.lanes.get(name);
    if (!lane) {
      lane = {value: 0, from: 0, target: 0, elapsed: 0};
      this.lanes.set(name, lane);
    }
    if (target !== lane.target) {
      lane.from = lane.value;
      lane.target = target;
      lane.elapsed = 0;
    }
    lane.elapsed += Math.max(0, dt);
    const t = Math.min(1, lane.elapsed / Math.max(0.001, duration));
    const ease = t * t * t * (t * (t * 6 - 15) + 10);
    lane.value = lane.from + (lane.target - lane.from) * ease;
    return lane.value;
  }
}
