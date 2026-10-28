import type {Node} from 'three/webgpu';
import {float, floor, mix, mod, screenCoordinate, step, uniform, vec4} from 'three/tsl';

/** DialKit select labels of the screen pattern, in uniform order. */
const MODES: Readonly<Record<string, number>> = {Apagado: 0, Damero: 1, Dither: 2};

/** DialKit-style values: `values[prefix]` is the mode, plus `<prefix> intensidad`, `<prefix> tamaño` and `Niveles escena`. */
export type DitherValues = Readonly<Record<string, unknown>>;

/**
 * Fixed screen-space Bayer 4x4 pattern: no temporal noise or flicker.
 * One instance per effect; its uniforms are shared by every node it builds.
 */
export class Dither {
  /** 0 off, 1 checkerboard, 2 ordered dither. */
  readonly mode = uniform(0);
  readonly amount = uniform(0.6);
  /** Screen pixels per pattern cell. */
  readonly size = uniform(2);
  /** Quantization levels of `scene()`. */
  readonly levels = uniform(6);

  private readonly threshold: Node;
  private readonly checker: Node;
  private readonly enabled: Node;

  constructor() {
    const cell = floor(screenCoordinate.div(this.size));
    const bayer2 = (p: Node) => mod(p.x.add(p.y), 2).mul(2).add(mod(p.y, 2));
    this.threshold = bayer2(mod(cell, 2))
      .mul(4)
      .add(bayer2(mod(floor(cell.div(2)), 2)))
      .add(0.5)
      .div(16);
    this.checker = mod(cell.x.add(cell.y), 2);
    this.enabled = this.mode.greaterThan(0).select(this.amount, float(0));
  }

  /** Patterned alpha: a checkerboard mask or an ordered-dither cutout. */
  alpha(alpha: Node): Node {
    const patterned = this.mode.lessThan(1.5).select(alpha.mul(this.checker), step(this.threshold, alpha));
    return mix(alpha, patterned, this.enabled);
  }

  /** Patterned color: checker shading or perceptual quantization with the Bayer threshold. */
  scene(input: Node): Node {
    const perceptual = input.rgb.max(0).sqrt();
    const quantized = floor(perceptual.mul(this.levels).add(this.threshold)).div(this.levels).pow(2);
    const patterned = this.mode.lessThan(1.5).select(input.rgb.mul(this.checker.mul(0.45).add(0.55)), quantized);
    return vec4(mix(input.rgb, patterned, this.enabled), input.a);
  }

  configure(values: DitherValues, prefix: string): void {
    const mode = values[prefix];
    this.mode.value = (typeof mode === 'string' ? MODES[mode] : undefined) ?? 0;
    this.amount.value = Number(values[`${prefix} intensidad`]);
    this.size.value = Number(values[`${prefix} tamaño`]);
    this.levels.value = Number(values['Niveles escena']);
  }

  get active(): boolean {
    return this.mode.value !== 0 && this.amount.value > 0;
  }
}
