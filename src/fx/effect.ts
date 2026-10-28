import type {Camera} from 'three';
import type {Disposable} from '@/core/disposable';
import type {GamePhase} from '@/core/types';
import type {HoverState} from '@/sim/hover-physics';

/** Budget tier an effect may scale its particle counts or shader detail to. */
export type FxQuality = 'low' | 'medium' | 'high';

/** The part of the hover simulation state that effects read. */
export type VehicleFxState = Pick<
  HoverState,
  'x' | 'y' | 'z' | 'yaw' | 'speed' | 'vx' | 'vz' | 'hover' | 'slip' | 'impact' | 'braking' | 'drifting' | 'boosting' | 'hull'
>;

/** Per-frame context shared by every effect. Hosts pass what they have. */
export interface FxFrame {
  /** Effects advance only while flying; any other phase freezes them in place. */
  phase?: GamePhase;
  camera?: Camera | null;
  state?: VehicleFxState | null;
  /** Reduced motion: effects hide and drop their particles. */
  reduced?: boolean;
  /** Vehicle model scale, so emitters follow the ship's game size. */
  scale?: number;
  night?: boolean;
}

/** A visual effect with an explicit lifecycle. */
export interface Effect extends Disposable {
  /** Advances by `dt` seconds and rebuilds what is visible this frame. */
  update(dt: number, frame: FxFrame): void;
  /** Drops every live particle (race restart, teleport). */
  reset(): void;
  setQuality?(level: FxQuality): void;
}

/**
 * Owns a set of effects and fans their lifecycle out. While paused the
 * effects still update with dt = 0, so camera-facing geometry stays correct
 * without anything aging.
 */
export class FxSystem implements Disposable {
  paused = false;
  private readonly effects: Effect[] = [];
  private quality: FxQuality | null = null;

  /** Adds an effect (once) and applies the current quality, if one was set. */
  add<T extends Effect>(effect: T): T {
    if (this.effects.includes(effect)) return effect;
    this.effects.push(effect);
    if (this.quality !== null) effect.setQuality?.(this.quality);
    return effect;
  }

  /** Stops updating the effect and, unless told otherwise, disposes it. */
  remove(effect: Effect, dispose = true): boolean {
    const index = this.effects.indexOf(effect);
    if (index < 0) return false;
    this.effects.splice(index, 1);
    if (dispose) effect.dispose();
    return true;
  }

  has(effect: Effect): boolean {
    return this.effects.includes(effect);
  }

  get size(): number {
    return this.effects.length;
  }

  update(dt: number, frame: FxFrame): void {
    const step = this.paused ? 0 : dt;
    for (const effect of this.effects) effect.update(step, frame);
  }

  reset(): void {
    for (const effect of this.effects) effect.reset();
  }

  setQuality(level: FxQuality): void {
    this.quality = level;
    for (const effect of this.effects) effect.setQuality?.(level);
  }

  /** Disposes every effect, last added first. */
  dispose(): void {
    for (const effect of this.effects.splice(0).reverse()) effect.dispose();
  }
}
