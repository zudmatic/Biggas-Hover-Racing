import {Color} from 'three';
import {GOLDEN_RATIO, PAD_TRANSITION} from '@/sim/boost-pad-envelope';

export function smoothBoostPower(current: number, target: number, dt: number): number {
  const duration = PAD_TRANSITION * (target > current ? 1 : GOLDEN_RATIO);
  const value = current + (target - current) * (1 - Math.exp((-3 * Math.max(0, dt)) / duration));
  return Math.abs(value - target) < 0.0001 ? target : value;
}

const PAD_GREEN = new Color('#34ff76');
const PAD_LIME = new Color('#90e000');

// Smooth every palette change, including manual nitro and custom studio presets.
export class PadBoostPalette {
  private padActive = false;
  private blend = 0;
  /** The eased colour of each output, keyed by the output itself. */
  private readonly channels = new WeakMap<Color, Color>();
  /** Base colours parsed once: palettes are applied every frame. */
  private readonly bases = new Map<string, Color>();

  update(dt: number, active: boolean): void {
    this.padActive = active;
    this.blend = 1 - Math.exp((-3 * Math.max(0, dt)) / (PAD_TRANSITION * (active ? 1 : GOLDEN_RATIO)));
  }

  /** Eases `out` toward `base`, or toward the pad green (lime for hot cores) while a pad boost is active. */
  apply(out: Color, base: string, core = false): Color {
    let current = this.channels.get(out);
    if (!current) {
      current = new Color(base);
      this.channels.set(out, current);
    }
    const target = this.padActive ? (core ? PAD_LIME : PAD_GREEN) : this.baseColor(base);
    current.lerp(target, this.blend);
    if (Math.max(Math.abs(current.r - target.r), Math.abs(current.g - target.g), Math.abs(current.b - target.b)) < 0.0001)
      current.copy(target);
    return out.copy(current);
  }

  private baseColor(base: string): Color {
    let color = this.bases.get(base);
    if (!color) {
      color = new Color(base);
      this.bases.set(base, color);
    }
    return color;
  }
}
